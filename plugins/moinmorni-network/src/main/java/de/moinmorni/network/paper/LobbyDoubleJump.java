package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;
import org.bukkit.Bukkit;
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
 * Doppelsprung in der Lobby: in der Luft noch einmal springen gibt einen zweiten Schwung nach vorn und oben, mit
 * Funken und Klang.
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

    /** Schwung bei Stärke 1: so viel nach vorn und nach oben (Blöcke pro Tick); nach oben wächst er langsamer. */
    private static final double FORWARD = 0.45;
    private static final double UP_BASE = 0.42;
    private static final double UP_PER_STRENGTH = 0.3;
    private static final double MIN_STRENGTH = 0.5;
    private static final double MAX_STRENGTH = 2;
    /** Ohne Blickrichtung (gerade nach oben/unten geschaut): nur nach oben. */
    private static final double FLAT = 1e-4;
    private static final long CHECK = 10L;
    private static final int SPARKS = 24;
    private static final int PUFFS = 10;

    private final JavaPlugin plugin;
    private final Predicate<Player> blocked;
    private final Predicate<Player> jumping;
    private volatile boolean active;
    private volatile boolean on;
    private volatile double strength = 1;
    /** Schon doppelt gesprungen, noch nicht gelandet. */
    private final Set<UUID> used = ConcurrentHashMap.newKeySet();

    LobbyDoubleJump(JavaPlugin plugin, Predicate<Player> blocked, Predicate<Player> jumping) {
        this.plugin = plugin;
        this.blocked = blocked;
        this.jumping = jumping;
    }

    void start() {
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
            Bukkit.getOnlinePlayers().forEach(this::refresh);
        });
    }

    private static boolean handsOff(Player p) {
        return p.getGameMode() == GameMode.CREATIVE || p.getGameMode() == GameMode.SPECTATOR;
    }

    private boolean allowed(Player p) {
        return active && on && !handsOff(p) && !blocked.test(p) && !jumping.test(p);
    }

    /** „Fliegen erlaubt“ passend setzen: an, wer darf und noch einen Doppelsprung hat; sonst aus. */
    private void refresh(Player p) {
        if (!active || handsOff(p)) {
            return;
        }
        if (jumping.test(p) && !Bukkit.getAllowFlight()) {
            // Schwebe-Schutz im Jump and Run (siehe oben) – Doppelsprung gibt es trotzdem nicht.
            if (!p.getAllowFlight()) {
                p.setAllowFlight(true);
            }
            return;
        }
        if (!allowed(p)) {
            used.remove(p.getUniqueId());
            if (p.getAllowFlight()) {
                p.setFlying(false);
                p.setAllowFlight(false);
            }
            return;
        }
        if (p.isOnGround()) {
            used.remove(p.getUniqueId());
        }
        boolean want = !used.contains(p.getUniqueId());
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
        event.setCancelled(true);
        p.setFlying(false);
        if (!allowed(p) || !used.add(p.getUniqueId())) {
            refresh(p);
            return;
        }
        p.setAllowFlight(false);
        boost(p);
    }

    private void boost(Player p) {
        double s = strength;
        Vector look = p.getLocation().getDirection().setY(0);
        Vector push = look.lengthSquared() < FLAT ? new Vector() : look.normalize().multiply(FORWARD * s);
        push.setY(UP_BASE + UP_PER_STRENGTH * s);
        p.setVelocity(push);
        p.setFallDistance(0);
        Location feet = p.getLocation();
        p.getWorld().spawnParticle(Particle.FIREWORK, feet, SPARKS, 0.25, 0.05, 0.25, 0.08);
        p.getWorld().spawnParticle(Particle.CLOUD, feet, PUFFS, 0.3, 0.05, 0.3, 0.02);
        p.getWorld().playSound(feet, Sound.ENTITY_BREEZE_JUMP, 0.8f, 1.3f);
        p.getWorld().playSound(feet, Sound.ENTITY_FIREWORK_ROCKET_LAUNCH, 0.35f, 1.6f);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        Player p = event.getPlayer();
        // Gelandet: der nächste Doppelsprung ist wieder da.
        if (p.isOnGround() && used.contains(p.getUniqueId())) {
            refresh(p);
        }
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
}
