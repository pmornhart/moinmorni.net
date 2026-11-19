package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.BlockFace;
import org.bukkit.block.data.Bisected;
import org.bukkit.block.data.BlockData;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Türen, Falltüren, Zauntore, Hebel und Knöpfe in der Lobby: Jeder darf sie öffnen und schließen (Schalter im Panel,
 * Lobby → „Türen und Falltüren benutzbar“, {@code /lobby tueren an|aus}). Bauen und Abbauen bleibt gesperrt.
 *
 * <p>Damit die Lobby wieder aussieht wie gebaut, merkt sich das Plugin beim ersten Bewegen den Zustand des Blocks
 * (bei Türen beide Hälften). Ist {@code resetSeconds} lang niemand näher als {@link #NEAR} Blöcke, setzt es ihn ohne
 * Blockupdates zurück – nur, wenn dort noch derselbe Block steht (nach einem Neubau nichts).
 */
final class LobbyDoors implements Listener {

    static final double NEAR = 8;
    private static final long CHECK_TICKS = 40L;

    /** Was jemand in der Lobby bewegen darf (Eisentüren gehen ohnehin nur mit Strom). */
    static boolean movable(Material type) {
        String name = type.name();
        if (name.startsWith("IRON_")) {
            return false;
        }
        return name.endsWith("_DOOR") || name.endsWith("_FENCE_GATE")
                || name.endsWith("_BUTTON") || type == Material.LEVER;
    }

    /** Zurücksetzen fällig? {@code lastNearMs} = zuletzt jemand in der Nähe. */
    static boolean due(long lastNearMs, long nowMs, int resetSeconds) {
        return resetSeconds > 0 && nowMs - lastNearMs >= resetSeconds * 1000L;
    }

    private record Moved(BlockData original, BlockData otherHalf, long lastNear) {
    }

    private final JavaPlugin plugin;
    private final Map<Location, Moved> moved = new HashMap<>();
    /** Erst wenn der Hub Lobby-Einstellungen schickt – sonst ist das nicht die Lobby. */
    private volatile boolean active;
    private volatile boolean on = true;
    private volatile int resetSeconds = 30;
    private BukkitTask task;

    LobbyDoors(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    /** Darf dieser Block gerade benutzt werden? (Für den Schutz in {@link LobbyFeatures}.) */
    boolean allows(Material type) {
        return on && movable(type);
    }

    void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        task = Bukkit.getScheduler().runTaskTimer(plugin, this::tick, CHECK_TICKS, CHECK_TICKS);
    }

    void stop() {
        if (task != null) {
            task.cancel();
        }
        restoreAll();
    }

    /** Hub-Thread: Teil {@code doors} aus {@code lobby-settings}. */
    void onSettings(JsonObject m) {
        JsonObject d = m.getAsJsonObject("doors");
        boolean nextOn = d == null || d.get("on").getAsBoolean();
        int nextReset = d == null ? 30 : Math.max(0, d.get("resetSeconds").getAsInt());
        Bukkit.getScheduler().runTask(plugin, () -> {
            active = true;
            on = nextOn;
            resetSeconds = nextReset;
            if (!on) {
                restoreAll();
            }
        });
    }

    /** Zustand vor dem Bewegen merken (LOWEST: der Block ist noch unverändert). */
    @EventHandler(priority = EventPriority.LOWEST)
    public void onUse(PlayerInteractEvent event) {
        if (!active || event.getAction() != Action.RIGHT_CLICK_BLOCK || event.getHand() != EquipmentSlot.HAND) {
            return;
        }
        Block block = event.getClickedBlock();
        if (block == null || !movable(block.getType()) || event.getPlayer().getGameMode() == GameMode.CREATIVE) {
            return;
        }
        if (!on) {
            event.setCancelled(true);
            return;
        }
        Block base = lowerHalf(block);
        moved.computeIfAbsent(base.getLocation(), k -> {
            Block upper = base.getRelative(BlockFace.UP);
            BlockData other = isDoor(base) && upper.getType() == base.getType() ? upper.getBlockData().clone() : null;
            return new Moved(base.getBlockData().clone(), other, System.currentTimeMillis());
        });
    }

    private static boolean isDoor(Block b) {
        return b.getType().name().endsWith("_DOOR");
    }

    private static Block lowerHalf(Block b) {
        if (isDoor(b) && b.getBlockData() instanceof Bisected half && half.getHalf() == Bisected.Half.TOP) {
            return b.getRelative(BlockFace.DOWN);
        }
        return b;
    }

    private void tick() {
        if (moved.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<Location, Moved>> it = moved.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<Location, Moved> e = it.next();
            Location at = e.getKey();
            World w = at.getWorld();
            if (w == null || !w.isChunkLoaded(at.getBlockX() >> 4, at.getBlockZ() >> 4)) {
                continue;
            }
            Moved m = e.getValue();
            if (someoneNear(w, at)) {
                e.setValue(new Moved(m.original(), m.otherHalf(), now));
                continue;
            }
            if (due(m.lastNear(), now, resetSeconds)) {
                restore(at, m);
                it.remove();
            }
        }
    }

    private static boolean someoneNear(World w, Location at) {
        double max = NEAR * NEAR;
        for (Player p : w.getPlayers()) {
            if (p.getGameMode() != GameMode.SPECTATOR && p.getLocation().distanceSquared(at) <= max) {
                return true;
            }
        }
        return false;
    }

    private static void restore(Location at, Moved m) {
        Block b = at.getBlock();
        if (b.getType() != m.original().getMaterial()) {
            return;
        }
        b.setBlockData(m.original(), false);
        if (m.otherHalf() != null) {
            Block up = b.getRelative(BlockFace.UP);
            if (up.getType() == m.otherHalf().getMaterial()) {
                up.setBlockData(m.otherHalf(), false);
            }
        }
    }

    private void restoreAll() {
        moved.forEach(LobbyDoors::restore);
        moved.clear();
    }
}
