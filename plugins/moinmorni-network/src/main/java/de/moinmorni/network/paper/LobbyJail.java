package de.moinmorni.network.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
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
 */
final class LobbyJail implements Listener {

    private record Cell(Location spawn, int minX, int minY, int minZ, int maxX, int maxY, int maxZ) {
        boolean contains(Location l) {
            return l.getX() >= minX && l.getX() < maxX + 1 && l.getY() >= minY - 1 && l.getY() < maxY + 1
                    && l.getZ() >= minZ && l.getZ() < maxZ + 1;
        }
    }

    private record Entry(Instant until, String reason) {
        boolean over(Instant now) {
            return until != null && !now.isBefore(until);
        }
    }

    /** Befehle, die auch in der Zelle gehen: Nachrichten (der Hub lässt nur das Team zu), Regeln, Hilfe, Sprache. */
    private static final Set<String> ALLOWED = Set.of("msg", "tell", "w", "m", "whisper", "r", "reply", "regeln",
            "rules", "hilfe", "help", "sprache", "language", "lang");
    private static final long TICK = 20L;
    private static final long JOIN_DELAY = 3L;

    private final JavaPlugin plugin;
    private final LobbyFeatures features;
    private final Function<Player, String> langOf;
    private final Map<UUID, Entry> jailed = new ConcurrentHashMap<>();
    private final Map<UUID, BossBar> held = new HashMap<>();
    private volatile Cell cell;

    LobbyJail(JavaPlugin plugin, LobbyFeatures features, Function<Player, String> langOf) {
        this.plugin = plugin;
        this.features = features;
        this.langOf = langOf;
    }

    void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        Bukkit.getScheduler().runTaskTimer(plugin, this::tick, TICK, TICK);
    }

    /** Sitzt gerade im Gefängnis (laut Hub, Zeit noch nicht um)? */
    boolean isJailed(UUID id) {
        Entry e = jailed.get(id);
        return e != null && !e.over(Instant.now()) && cell != null;
    }

    // ---------- Stand vom Hub ----------

    /** Hub-Thread: Liste und Zelle lesen, auf dem Hauptthread anwenden. */
    void onState(JsonObject m) {
        JsonObject c = m.getAsJsonObject("cell");
        Map<UUID, Entry> next = new HashMap<>();
        JsonArray list = m.getAsJsonArray("players");
        if (list != null) {
            for (JsonElement el : list) {
                JsonObject o = el.getAsJsonObject();
                String until = HubClient.str(o, "until");
                next.put(UUID.fromString(HubClient.str(o, "uuid")),
                        new Entry(until == null ? null : Instant.parse(until), HubClient.str(o, "reason")));
            }
        }
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (c != null) {
                cell = parseCell(c);
            }
            jailed.clear();
            jailed.putAll(next);
            Bukkit.getOnlinePlayers().forEach(this::check);
        });
    }

    private static Cell parseCell(JsonObject c) {
        World w = Bukkit.getWorlds().get(0);
        JsonObject s = c.getAsJsonObject("spawn");
        JsonObject min = c.getAsJsonObject("min");
        JsonObject max = c.getAsJsonObject("max");
        Location spawn = new Location(w, s.get("x").getAsDouble(), s.get("y").getAsDouble(), s.get("z").getAsDouble(),
                s.get("yaw").getAsFloat(), s.get("pitch").getAsFloat());
        return new Cell(spawn, min.get("x").getAsInt(), min.get("y").getAsInt(), min.get("z").getAsInt(),
                max.get("x").getAsInt(), max.get("y").getAsInt(), max.get("z").getAsInt());
    }

    /** Einsperren, wer es sein soll; freilassen, wer es nicht mehr ist. */
    private void check(Player p) {
        boolean should = isJailed(p.getUniqueId());
        boolean is = held.containsKey(p.getUniqueId());
        if (should && !is) {
            lock(p);
        } else if (!should && is) {
            free(p, false);
        }
    }

    private void lock(Player p) {
        features.stopActivities(p);
        p.getInventory().clear();
        p.setGameMode(GameMode.ADVENTURE);
        p.teleport(cell.spawn());
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
        if (timeUp) {
            p.sendMessage(text(p, "Deine Zeit im Gefängnis ist um – du bist wieder frei!",
                    "Your time in jail is up – you are free again!", NamedTextColor.GREEN));
        }
        features.welcomeBack(p);
    }

    private void tick() {
        Instant now = Instant.now();
        for (Player p : Bukkit.getOnlinePlayers()) {
            BossBar bar = held.get(p.getUniqueId());
            if (bar == null) {
                continue;
            }
            Entry e = jailed.get(p.getUniqueId());
            if (e == null || e.over(now)) {
                jailed.remove(p.getUniqueId());
                free(p, true);
            } else {
                update(p, bar);
            }
        }
    }

    private void update(Player p, BossBar bar) {
        Entry e = jailed.get(p.getUniqueId());
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
        Cell c = cell;
        if (c == null || !held.containsKey(event.getPlayer().getUniqueId()) || c.contains(event.getTo())) {
            return;
        }
        event.setTo(c.spawn());
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        Cell c = cell;
        if (c != null && held.containsKey(event.getPlayer().getUniqueId()) && !c.contains(event.getTo())) {
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
