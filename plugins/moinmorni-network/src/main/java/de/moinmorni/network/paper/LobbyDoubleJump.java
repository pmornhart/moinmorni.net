package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerGameModeChangeEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerToggleFlightEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Vector;

/**
 * Doppelsprung in der Lobby, wie man ihn aus großen Netzwerken kennt: springen, in der Luft noch einmal die
 * Sprungtaste – und ein kräftiger Schub wirft einen in Blickrichtung in hohem Bogen davon (bei Stärke 1 etwa
 * 15 Blöcke weit und 7 hoch). Nach der Landung geht es sofort wieder; so hüpft man quer durchs Dorf und auf Dächer.
 * Funken, Wolke und Klang; Fallschaden gibt es nicht.
 *
 * <p><b>Fliegen ab VIP</b> (Recht „In der Lobby fliegen“, {@code lobby-fly}): Wer es hat, fliegt statt des
 * Doppelsprungs – zweimal Leertaste schaltet das Fliegen an und aus wie im Kreativmodus. {@code /fly} (auch
 * {@code /fliegen}) wechselt zwischen Fliegen und Doppelsprung; wer den Doppelsprung wählt, steht in
 * {@code plugins/moinmorni/lobby-fly.txt} (eine UUID pro Zeile), sonst ist Fliegen der Standard. Fliegen gilt wie der
 * Doppelsprung nicht im Jump and Run, im Gefängnis und beim Rundgang – wer dort hineinkommt, landet.
 *
 * <p>So geht es ohne Mod: Wer darf, bekommt „Fliegen erlaubt“. Zweimal Springen will dann das Fliegen einschalten –
 * das fängt das Plugin ab ({@link PlayerToggleFlightEvent}), schaltet Fliegen gleich wieder aus und gibt stattdessen
 * den Schwung. Bis zur nächsten Landung ist „Fliegen erlaubt“ aus, also nur ein Doppelsprung pro Sprung. Bedrock
 * (Geyser) meldet das Fliegen genauso – zweimal springen geht dort ebenfalls.
 *
 * <p>Nicht im Jump and Run ({@code jumping}), nicht im Gefängnis und nicht beim Rundgang ({@code blocked}); Kreativ-
 * und Zuschauermodus fasst das Plugin nicht an. Im Jump and Run steht man auf Blöcken, die nur der eigene Client
 * kennt – erlaubt die Lobby kein Fliegen ({@code allow-flight}, MoinMorni schaltet es für die Lobby ein), bleibt
 * „Fliegen erlaubt“ dort an, damit Minecraft niemanden wegen Schwebens hinauswirft; Zweimal-Springen bewirkt dann
 * nichts.
 */
final class LobbyDoubleJump implements Listener {

    /**
     * Schub bei Stärke 1 (Blöcke pro Tick): Blickrichtung × 1,6, nach oben fest 1,0 – der klassische Lobby-Doppelsprung.
     * Nach oben wächst er mit der Stärke langsamer als nach vorn (bei 2: 3,2 nach vorn, 1,4 nach oben).
     */
    static final double FORWARD = 1.6;
    static final double UP_BASE = 0.6;
    static final double UP_PER_STRENGTH = 0.4;
    static final double MIN_STRENGTH = 0.5;
    static final double MAX_STRENGTH = 2;
    private static final long CHECK = 10L;
    /** So viele Ticks nach dem Schub zählt „am Boden“ noch nicht als Landung. */
    private static final int AIRBORNE = 4;
    private static final int SPARKS = 36;
    private static final int PUFFS = 8;

    /** Was jemand in der Lobby gerade hat. */
    enum Mode { FLY, JUMP, NONE }

    private static final String FILE = "lobby-fly.txt";

    private final JavaPlugin plugin;
    private final Predicate<Player> blocked;
    private final Predicate<Player> jumping;
    private final Function<Player, String> langOf;
    private final Path file;
    /** Wer das Recht „In der Lobby fliegen“ hat (setzt das Netzwerk-Plugin aus dem Rang). */
    private volatile Predicate<Player> flyers = p -> false;
    /** Hat das Recht, will aber den Doppelsprung (/fly aus). */
    private final Set<UUID> prefersJump = ConcurrentHashMap.newKeySet();
    private boolean commandsRegistered;
    private volatile boolean active;
    private volatile boolean on;
    private volatile double strength = 1;
    /** Schon doppelt gesprungen, noch nicht gelandet: Server-Tick des Schubs. */
    private final Map<UUID, Integer> used = new ConcurrentHashMap<>();

    LobbyDoubleJump(JavaPlugin plugin, Predicate<Player> blocked, Predicate<Player> jumping,
            Function<Player, String> langOf, Path dataDir) {
        this.plugin = plugin;
        this.blocked = blocked;
        this.jumping = jumping;
        this.langOf = langOf;
        this.file = dataDir.resolve(FILE);
    }

    void setFlyers(Predicate<Player> flyers) {
        this.flyers = flyers;
    }

    /**
     * Was gilt: Fliegen, wer das Recht hat und nicht den Doppelsprung gewählt hat; sonst der Doppelsprung, wenn er im
     * Panel an ist. {@code here} = hier überhaupt (nicht im Jump and Run, Gefängnis, Rundgang, Kreativ/Zuschauer).
     */
    static Mode mode(boolean here, boolean mayFly, boolean prefersJump, boolean doubleJumpOn) {
        if (!here) {
            return Mode.NONE;
        }
        if (mayFly && !prefersJump) {
            return Mode.FLY;
        }
        return doubleJumpOn ? Mode.JUMP : Mode.NONE;
    }

    /** {@code /fly [an|aus]}: true = fliegen, false = Doppelsprung, null = unbekanntes Wort. Ohne Wort: umschalten. */
    static Boolean wantFly(String arg, boolean fliesNow) {
        String a = arg == null ? "" : arg.trim().toLowerCase(Locale.ROOT);
        return switch (a) {
            case "" -> !fliesNow;
            case "an", "on", "ein" -> true;
            case "aus", "off" -> false;
            default -> null;
        };
    }

    void start() {
        load();
        Bukkit.getPluginManager().registerEvents(this, plugin);
        // Jump and Run, Gefängnis, Rundgang, Spielmodus: alle halbe Sekunde nachziehen.
        Bukkit.getScheduler().runTaskTimer(plugin, () -> Bukkit.getOnlinePlayers().forEach(this::refresh), CHECK, CHECK);
    }

    /** Hub-Thread: {@code doubleJump} aus den Lobby-Einstellungen. */
    void onSettings(JsonObject m) {
        JsonObject d = m.getAsJsonObject("doubleJump");
        boolean nextOn = d != null && d.get("on").getAsBoolean();
        double nextStrength = d == null ? 1 : d.get("strength").getAsDouble();
        Bukkit.getScheduler().runTask(plugin, () -> {
            active = true;
            on = nextOn;
            strength = Math.max(MIN_STRENGTH, Math.min(MAX_STRENGTH, nextStrength));
            registerCommands();
            Bukkit.getOnlinePlayers().forEach(this::refresh);
        });
    }

    private static boolean handsOff(Player p) {
        return p.getGameMode() == GameMode.CREATIVE || p.getGameMode() == GameMode.SPECTATOR;
    }

    private boolean here(Player p) {
        return active && !handsOff(p) && !blocked.test(p) && !jumping.test(p);
    }

    private Mode modeOf(Player p) {
        return mode(here(p), flyers.test(p), prefersJump.contains(p.getUniqueId()), on);
    }

    private boolean allowed(Player p) {
        return modeOf(p) == Mode.JUMP;
    }

    /** „Fliegen erlaubt“ passend setzen: an, wer darf und noch einen Doppelsprung hat; sonst aus. */
    private void refresh(Player p) {
        if (!active || handsOff(p)) {
            return;
        }
        if (jumping.test(p) && !Bukkit.getAllowFlight()) {
            // Schwebe-Schutz im Jump and Run (siehe oben) – Doppelsprung und Fliegen gibt es trotzdem nicht.
            if (p.isFlying()) {
                p.setFlying(false);
            }
            if (!p.getAllowFlight()) {
                p.setAllowFlight(true);
            }
            return;
        }
        Mode mode = modeOf(p);
        if (mode == Mode.FLY) {
            used.remove(p.getUniqueId());
            if (!p.getAllowFlight()) {
                p.setAllowFlight(true);
            }
            return;
        }
        if (p.isFlying()) {
            // Fliegen gilt hier nicht (mehr): Jump and Run, Gefängnis, Rundgang, Recht weg oder /fly aus – landen.
            p.setFlying(false);
        }
        if (mode != Mode.JUMP) {
            used.remove(p.getUniqueId());
            if (p.getAllowFlight()) {
                p.setFlying(false);
                p.setAllowFlight(false);
            }
            return;
        }
        if (landed(p)) {
            used.remove(p.getUniqueId());
        }
        boolean want = !used.containsKey(p.getUniqueId());
        if (p.getAllowFlight() != want) {
            p.setAllowFlight(want);
        }
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onToggle(PlayerToggleFlightEvent event) {
        Player p = event.getPlayer();
        if (!active || handsOff(p) || !event.isFlying()) {
            return;
        }
        if (modeOf(p) == Mode.FLY) {
            // Ab VIP: richtig fliegen wie im Kreativmodus.
            return;
        }
        event.setCancelled(true);
        p.setFlying(false);
        if (!allowed(p) || used.putIfAbsent(p.getUniqueId(), Bukkit.getCurrentTick()) != null) {
            refresh(p);
            return;
        }
        p.setAllowFlight(false);
        boost(p);
    }

    /**
     * Der Schub (Blöcke pro Tick) für eine Blickrichtung und Stärke: die ganze Blickrichtung × {@link #FORWARD} × Stärke
     * – wer nach oben oder unten schaut, kommt weniger weit nach vorn –, nach oben immer
     * {@link #UP_BASE} + {@link #UP_PER_STRENGTH} × Stärke. Stärke wird auf 0,5–2 begrenzt.
     */
    static Vector push(Vector look, double strength) {
        double s = Math.max(MIN_STRENGTH, Math.min(MAX_STRENGTH, strength));
        Vector push = look.clone().multiply(FORWARD * s);
        push.setY(UP_BASE + UP_PER_STRENGTH * s);
        return push;
    }

    private void boost(Player p) {
        p.setVelocity(push(p.getLocation().getDirection(), strength));
        p.setFallDistance(0);
        Location feet = p.getLocation();
        p.getWorld().spawnParticle(Particle.FIREWORK, feet, SPARKS, 0.3, 0.05, 0.3, 0.12);
        p.getWorld().spawnParticle(Particle.CLOUD, feet, PUFFS, 0.4, 0.02, 0.4, 0.01);
        p.getWorld().playSound(feet, Sound.ENTITY_BREEZE_JUMP, 0.9f, 1.1f);
        p.getWorld().playSound(feet, Sound.ENTITY_FIREWORK_ROCKET_LAUNCH, 0.5f, 1.4f);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        Player p = event.getPlayer();
        // Gelandet: der nächste Doppelsprung ist wieder da.
        if (used.containsKey(p.getUniqueId()) && landed(p)) {
            refresh(p);
        }
    }

    /**
     * Wieder gelandet? Erst ein paar Ticks nach dem Schub – sonst zählte die Bewegung, die der Client gleich danach
     * noch „am Boden“ meldet, schon als Landung und es gäbe in der Luft einen dritten Sprung.
     */
    private boolean landed(Player p) {
        Integer at = used.get(p.getUniqueId());
        return p.isOnGround() && (at == null || Bukkit.getCurrentTick() - at >= AIRBORNE);
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player p = event.getPlayer();
        Bukkit.getScheduler().runTaskLater(plugin, () -> refresh(p), CHECK);
    }

    @EventHandler
    public void onGameMode(PlayerGameModeChangeEvent event) {
        Player p = event.getPlayer();
        // Minecraft setzt „Fliegen erlaubt“ beim Wechsel selbst – danach wieder passend.
        Bukkit.getScheduler().runTask(plugin, () -> refresh(p));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        used.remove(event.getPlayer().getUniqueId());
    }

    // ---------- /fly ----------

    private boolean en(Player p) {
        return "en".equals(langOf.apply(p));
    }

    private void say(Player p, String de, String enText, NamedTextColor colour) {
        p.sendMessage(Component.text(en(p) ? enText : de, colour));
    }

    private void registerCommands() {
        if (commandsRegistered) {
            return;
        }
        commandsRegistered = true;
        Bukkit.getCommandMap().register("moinmorni",
                new Command("fliegen", "In der Lobby fliegen oder doppelt springen", "/fliegen [an|aus]", List.of("fly")) {
                    @Override
                    public boolean execute(CommandSender sender, String label, String[] args) {
                        if (sender instanceof Player p) {
                            command(p, args.length > 0 ? args[0] : "");
                        }
                        return true;
                    }

                    @Override
                    public List<String> tabComplete(CommandSender sender, String alias, String[] args) {
                        return args.length == 1 && sender instanceof Player p ? (en(p) ? List.of("on", "off") : List.of("an", "aus")) : List.of();
                    }
                });
        Bukkit.getOnlinePlayers().forEach(Player::updateCommands);
    }

    private void command(Player p, String arg) {
        if (!flyers.test(p)) {
            say(p, "Fliegen in der Lobby gibt es ab VIP. Für alle: springen und in der Luft noch einmal springen.",
                    "Flying in the lobby comes with VIP and up. For everyone: jump and jump again in mid-air.",
                    NamedTextColor.GRAY);
            return;
        }
        Boolean fly = wantFly(arg, !prefersJump.contains(p.getUniqueId()));
        if (fly == null) {
            say(p, "/fliegen an|aus – Fliegen oder Doppelsprung.", "/fly on|off – flying or double jump.",
                    NamedTextColor.GRAY);
            return;
        }
        if (fly) {
            prefersJump.remove(p.getUniqueId());
        } else {
            prefersJump.add(p.getUniqueId());
        }
        save();
        refresh(p);
        if (fly) {
            say(p, "✈ Fliegen an – zweimal Leertaste hebt ab und landet wieder. /fliegen aus: Doppelsprung.",
                    "✈ Flying on – press space twice to take off and to land. /fly off: double jump.",
                    NamedTextColor.GREEN);
        } else {
            say(p, "⤴ Doppelsprung an – in der Luft noch einmal springen. /fliegen an: wieder fliegen.",
                    "⤴ Double jump on – jump again in mid-air. /fly on: fly again.", NamedTextColor.GREEN);
        }
        if (fly && !here(p)) {
            say(p, "Hier gerade nicht (Jump and Run, Gefängnis oder Rundgang) – danach geht es.",
                    "Not right here (jump and run, jail or tour) – afterwards it works.", NamedTextColor.GRAY);
        }
    }

    private void load() {
        try {
            if (Files.exists(file)) {
                Files.readAllLines(file, StandardCharsets.UTF_8).stream().map(String::trim).filter(l -> !l.isEmpty())
                        .forEach(l -> {
                            try {
                                prefersJump.add(UUID.fromString(l));
                            } catch (IllegalArgumentException ignored) {
                                // kaputte Zeile überspringen
                            }
                        });
            }
        } catch (IOException e) {
            plugin.getLogger().warning("lobby-fly.txt nicht lesbar: " + e.getMessage());
        }
    }

    private void save() {
        String content = prefersJump.stream().map(UUID::toString).sorted().collect(Collectors.joining("\n"));
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                Files.createDirectories(file.getParent());
                Path tmp = file.resolveSibling(FILE + ".tmp");
                Files.writeString(tmp, content, StandardCharsets.UTF_8);
                Files.move(tmp, file, java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                        java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException e) {
                plugin.getLogger().warning("lobby-fly.txt nicht gespeichert: " + e.getMessage());
            }
        });
    }
}
