package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import net.kyori.adventure.bossbar.BossBar;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerTeleportEvent;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Gefängnis in der Lobby: Der Hub schickt, wer eingesperrt ist (mit Ende und Grund) und wo die Zelle steht
 * ({@code jail}). Eingesperrte bleiben in der Zelle, sehen eine Leiste mit der Restzeit, dürfen nur dem Team schreiben
 * und kommen nach Ablauf (oder wenn das Team sie freilässt) zurück auf den Dorfplatz.
 *
 * <p>Raus kommt man immer: Wer nicht (mehr) eingesperrt ist und trotzdem in der Zelle steht – nach einem Neustart der
 * Lobby, einer Freilassung, während man weg war, oder wenn ein Teleport nicht geklappt hat –, wird jede Sekunde und
 * beim Betreten an den Dorfplatz gesetzt (nur Zuschauer- und Kreativmodus dürfen hinein, z. B. das Team zum Reden).
 * Der Stand liegt zusätzlich auf der Platte ({@link JailBook}), damit die Lobby ihn nach einem Neustart schon kennt.
 */
final class LobbyJail implements Listener {

    /** Befehle, die auch in der Zelle gehen: Nachrichten (der Hub lässt nur das Team zu), Regeln, Hilfe, Sprache. */
    private static final Set<String> ALLOWED = Set.of("msg", "tell", "w", "m", "whisper", "r", "reply", "regeln",
            "rules", "hilfe", "help", "sprache", "language", "lang");
    private static final long TICK = 20L;
    private static final long JOIN_DELAY = 3L;
    private static final double CENTER = 0.5;

    private final JavaPlugin plugin;
    private final LobbyFeatures features;
    private final Function<Player, String> langOf;
    private final JailBook book;
    private final Map<UUID, BossBar> held = new HashMap<>();

    LobbyJail(JavaPlugin plugin, LobbyFeatures features, Function<Player, String> langOf) {
        this.plugin = plugin;
        this.features = features;
        this.langOf = langOf;
        this.book = new JailBook(plugin.getDataFolder().toPath().getParent().resolve("moinmorni"), plugin.getLogger());
    }

    void start() {
        book.load();
        Bukkit.getPluginManager().registerEvents(this, plugin);
        Bukkit.getScheduler().runTaskTimer(plugin, this::tick, TICK, TICK);
    }

    /** Sitzt gerade im Gefängnis (laut Hub, Zeit noch nicht um)? */
    boolean isJailed(UUID id) {
        return book.isJailed(id, Instant.now());
    }

    // ---------- Stand vom Hub ----------

    /** Hub-Thread: auf dem Hauptthread übernehmen (und merken), dann alle Spieler prüfen. */
    void onState(JsonObject m) {
        Bukkit.getScheduler().runTask(plugin, () -> {
            book.apply(m);
            Bukkit.getOnlinePlayers().forEach(this::check);
        });
    }

    private Location spawnOf(World w, JailBook.Spot s) {
        return new Location(w, s.x(), s.y(), s.z(), s.yaw(), s.pitch());
    }

    private boolean inCell(Player p) {
        JailBook.Cell c = book.cell();
        Location l = p.getLocation();
        return c != null && l.getWorld().equals(Bukkit.getWorlds().get(0)) && c.contains(l.getX(), l.getY(), l.getZ());
    }

    /** Zuschauer und Kreativ (Team, das hinein will) dürfen in der Zelle stehen, ohne eingesperrt zu sein. */
    private static boolean visitor(Player p) {
        return p.getGameMode() == GameMode.SPECTATOR || p.getGameMode() == GameMode.CREATIVE;
    }

    /** Einsperren, wer es sein soll; freilassen, wer es nicht mehr ist; wer frei ist, aber in der Zelle steht, raus. */
    private void check(Player p) {
        boolean should = isJailed(p.getUniqueId());
        boolean is = held.containsKey(p.getUniqueId());
        if (should && !is) {
            lock(p);
        } else if (!should && is) {
            free(p, false);
        } else if (!should && inCell(p) && !visitor(p)) {
            p.sendMessage(text(p, "Du bist nicht im Gefängnis – zurück auf den Dorfplatz.",
                    "You are not in jail – back to the village square.", NamedTextColor.GREEN));
            release(p);
        }
    }

    private void lock(Player p) {
        features.stopActivities(p);
        p.getInventory().clear();
        p.setGameMode(GameMode.ADVENTURE);
        p.teleport(spawnOf(Bukkit.getWorlds().get(0), book.cell().spawn()));
        p.setFallDistance(0);
        BossBar bar = BossBar.bossBar(Component.empty(), 1f, BossBar.Color.RED, BossBar.Overlay.PROGRESS);
        held.put(p.getUniqueId(), bar);
        p.showBossBar(bar);
        update(p, bar);
    }

    private void free(Player p, boolean timeUp) {
        BossBar bar = held.remove(p.getUniqueId());
        if (bar != null) {
            p.hideBossBar(bar);
        }
        p.sendMessage(timeUp
                ? text(p, "Deine Zeit im Gefängnis ist um – du bist wieder frei!",
                        "Your time in jail is up – you are free again!", NamedTextColor.GREEN)
                : text(p, "Du bist wieder frei!", "You are free again!", NamedTextColor.GREEN));
        release(p);
    }

    /**
     * Raus aus der Zelle auf den Dorfplatz. Ohne Lobby-Einstellungen (Hub noch nicht da) an den Spawn der Welt; steht
     * man einen Tick später noch in der Zelle (Teleport abgefangen), noch einmal direkt an den Spawn der Welt.
     */
    private void release(Player p) {
        if (!features.welcomeBack(p)) {
            toWorldSpawn(p);
        }
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (p.isOnline() && !held.containsKey(p.getUniqueId()) && inCell(p)) {
                plugin.getLogger().warning("Gefängnis: " + p.getName() + " stand nach dem Freilassen noch in der Zelle"
                        + " – an den Spawn der Welt gesetzt.");
                toWorldSpawn(p);
            }
        }, 1L);
    }

    private static void toWorldSpawn(Player p) {
        World w = Bukkit.getWorlds().get(0);
        Location s = w.getSpawnLocation();
        p.teleport(new Location(w, s.getBlockX() + CENTER, s.getBlockY(), s.getBlockZ() + CENTER, s.getYaw(), 0f));
        p.setFallDistance(0);
    }

    private void tick() {
        Instant now = Instant.now();
        for (Player p : Bukkit.getOnlinePlayers()) {
            BossBar bar = held.get(p.getUniqueId());
            if (bar == null) {
                // Neu eingesperrt, freigelassen oder trotzdem in der Zelle: dieselbe Prüfung wie beim Stand vom Hub.
                check(p);
                continue;
            }
            JailBook.Entry e = book.entry(p.getUniqueId());
            if (e == null || e.over(now)) {
                book.forget(p.getUniqueId());
                free(p, e != null);
            } else {
                update(p, bar);
            }
        }
    }

    private void update(Player p, BossBar bar) {
        JailBook.Entry e = book.entry(p.getUniqueId());
        if (e == null) {
            return;
        }
        boolean en = en(p);
        String label = en ? "⛓ Jail" : "⛓ Gefängnis";
        if (e.until() == null) {
            bar.name(Component.text(label + (en ? " – until the team lets you out" : " – bis das Team dich freilässt"),
                    NamedTextColor.RED));
            bar.progress(1f);
            return;
        }
        long left = Math.max(0, Duration.between(Instant.now(), e.until()).getSeconds());
        String rest = left >= 3600 ? String.format(Locale.ROOT, "%d:%02d:%02d", left / 3600, left / 60 % 60, left % 60)
                : String.format(Locale.ROOT, "%d:%02d", left / 60, left % 60);
        bar.name(Component.text(label + (en ? " – " + rest + " left" : " – noch " + rest), NamedTextColor.RED));
        // Ohne Anfangszeit: die Leiste zeigt die letzte Stunde als Anteil.
        bar.progress((float) Math.min(1.0, left / 3600.0));
    }

    private boolean en(Player p) {
        return "en".equals(langOf.apply(p));
    }

    private Component text(Player p, String de, String en, NamedTextColor colour) {
        return Component.text(en(p) ? en : de, colour);
    }

    // ---------- In der Zelle halten ----------

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player p = event.getPlayer();
        // Nach dem Ankommen am Dorfplatz (LobbyFeatures) – dann gleich weiter in die Zelle.
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (p.isOnline()) {
                check(p);
            }
        }, JOIN_DELAY);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        held.remove(event.getPlayer().getUniqueId());
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        JailBook.Cell c = book.cell();
        Location to = event.getTo();
        if (c == null || !held.containsKey(event.getPlayer().getUniqueId()) || c.contains(to.getX(), to.getY(), to.getZ())) {
            return;
        }
        event.setTo(spawnOf(to.getWorld(), c.spawn()));
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        JailBook.Cell c = book.cell();
        Location to = event.getTo();
        if (c != null && held.containsKey(event.getPlayer().getUniqueId()) && !c.contains(to.getX(), to.getY(), to.getZ())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        Player p = event.getPlayer();
        if (!held.containsKey(p.getUniqueId())) {
            return;
        }
        String label = event.getMessage().substring(1).split(" ", 2)[0].toLowerCase(Locale.ROOT);
        String plain = label.contains(":") ? label.substring(label.indexOf(':') + 1) : label;
        if (!ALLOWED.contains(plain)) {
            event.setCancelled(true);
            p.sendMessage(text(p, "Im Gefängnis geht das nicht. Erlaubt: /msg an das Team, /regeln, /hilfe.",
                    "Not possible in jail. Allowed: /msg to the team, /rules, /help.", NamedTextColor.RED));
        }
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (held.containsKey(event.getPlayer().getUniqueId())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteractEntity(PlayerInteractEntityEvent event) {
        if (held.containsKey(event.getPlayer().getUniqueId())) {
            event.setCancelled(true);
        }
    }
}
