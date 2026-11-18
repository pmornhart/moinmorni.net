package de.moinmorni.network.paper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.bukkit.Bukkit;
import org.bukkit.Chunk;
import org.bukkit.HeightMap;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.world.ChunkLoadEvent;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Hinter dem Bergkranz der Lobby ist nichts (Philip, 18.11.). Neue Lobby-Welten sind ohnehin leer (flache Welt ohne
 * Schichten, `LOBBY_GENERATOR` im Baukasten); ältere wurden mit dem normalen Minecraft-Gelände erzeugt.
 *
 * Darum: Entsteht außerhalb des gebauten Geländes ein neues Stück Welt, wird es sofort geleert. Und einmal (Merker
 * {@code lobby-leer.done}) werden alle schon erzeugten Stücke außerhalb leer geräumt – Stück für Stück, mit einem
 * Zeitbudget je Tick, damit der Server flüssig bleibt. Gelände = Stücke −14 … 13 in beide Richtungen (Radius 216 des
 * Bauplans, `datapack.ts`). Nur in der Lobby (der Hub schickt nur ihr die Lobby-Einstellungen).
 */
final class LobbyVoid implements Listener {
    /** Erstes und letztes Stück (Chunk) des gebauten Geländes: floor(−216 / 16) und floor(216 / 16). */
    static final int FIRST = -14;
    static final int LAST = 13;
    private static final String DONE = "lobby-leer.done";
    /** So viele Millisekunden je Tick höchstens räumen. */
    private static final long BUDGET_MS = 15L;
    /** Region-Dateien: "r.-1.0.mca" → -1, 0. */
    private static final Pattern REGION = Pattern.compile("^r\\.(-?\\d+)\\.(-?\\d+)\\.mca$");
    private static final int REGION_CHUNKS = 32;

    private final JavaPlugin plugin;
    private final Path dir;
    private final Deque<long[]> queue = new ArrayDeque<>();
    private boolean started;
    private boolean sweeping;
    private int cleared;

    LobbyVoid(JavaPlugin plugin) {
        this.plugin = plugin;
        this.dir = plugin.getDataFolder().toPath().getParent().resolve("moinmorni");
    }

    /** Liegt das Stück außerhalb des gebauten Geländes? */
    static boolean outside(int cx, int cz) {
        return cx < FIRST || cx > LAST || cz < FIRST || cz > LAST;
    }

    /** Beim ersten Mal Lobby-Einstellungen (Hauptthread): einschalten. */
    void start() {
        if (started) {
            return;
        }
        started = true;
        Bukkit.getPluginManager().registerEvents(this, plugin);
        World world = world();
        if (world == null || Files.exists(dir.resolve(DONE))) {
            return;
        }
        regionsOf(world).forEach(r -> {
            for (int x = 0; x < REGION_CHUNKS; x++) {
                for (int z = 0; z < REGION_CHUNKS; z++) {
                    int cx = r[0] * REGION_CHUNKS + x;
                    int cz = r[1] * REGION_CHUNKS + z;
                    if (outside(cx, cz) && world.isChunkGenerated(cx, cz)) {
                        queue.add(new long[] {cx, cz});
                    }
                }
            }
        });
        plugin.getLogger().info("Lobby: " + queue.size() + " Stücke Gelände hinter dem Bergkranz werden leer geräumt.");
        sweeping = true;
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            long end = System.currentTimeMillis() + BUDGET_MS;
            while (!queue.isEmpty() && System.currentTimeMillis() < end) {
                long[] c = queue.poll();
                Chunk chunk = world.getChunkAt((int) c[0], (int) c[1]);
                clear(chunk);
            }
            if (queue.isEmpty()) {
                task.cancel();
                sweeping = false;
                try {
                    Files.createDirectories(dir);
                    Files.writeString(dir.resolve(DONE), cleared + "\n", StandardCharsets.UTF_8);
                } catch (IOException ex) {
                    plugin.getLogger().warning("Lobby: Merker " + DONE + " nicht geschrieben: " + ex.getMessage());
                }
                plugin.getLogger().info("Lobby: hinter dem Bergkranz ist jetzt nichts mehr (" + cleared + " Stücke geleert).");
            }
        }, 1L, 1L);
    }

    /** Neu erzeugtes Stück außerhalb des Geländes (ältere Welt mit normalem Gelände): gleich leeren. */
    @EventHandler
    public void onLoad(ChunkLoadEvent e) {
        if (!e.isNewChunk() || !e.getWorld().equals(world())) {
            return;
        }
        Chunk c = e.getChunk();
        if (outside(c.getX(), c.getZ())) {
            Bukkit.getScheduler().runTask(plugin, () -> clear(c));
        }
    }

    boolean sweeping() {
        return sweeping;
    }

    private void clear(Chunk chunk) {
        World w = chunk.getWorld();
        int min = w.getMinHeight();
        int bx = chunk.getX() << 4;
        int bz = chunk.getZ() << 4;
        for (Entity e : chunk.getEntities()) {
            if (!(e instanceof Player)) {
                e.remove();
            }
        }
        for (int x = 0; x < 16; x++) {
            for (int z = 0; z < 16; z++) {
                int top = w.getHighestBlockYAt(bx + x, bz + z, HeightMap.WORLD_SURFACE);
                for (int y = min; y <= top; y++) {
                    org.bukkit.block.Block b = chunk.getBlock(x, y, z);
                    if (!b.getType().isAir()) {
                        b.setType(Material.AIR, false);
                    }
                }
            }
        }
        cleared++;
    }

    /** Region-Dateien der Oberwelt (Paper 26.x: dimensions/minecraft/overworld/region, älter: region). */
    private static List<int[]> regionsOf(World world) {
        Path base = world.getWorldFolder().toPath();
        Path[] tries = {base.resolve("region"), base.resolve("dimensions/minecraft/overworld/region")};
        for (Path r : tries) {
            if (Files.isDirectory(r)) {
                try (Stream<Path> files = Files.list(r)) {
                    return files.map(p -> REGION.matcher(p.getFileName().toString()))
                            .filter(Matcher::matches)
                            .map(m -> new int[] {Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))})
                            .toList();
                } catch (IOException ex) {
                    return List.of();
                }
            }
        }
        return List.of();
    }

    private static World world() {
        List<World> worlds = Bukkit.getWorlds();
        return worlds.isEmpty() ? null : worlds.get(0);
    }
}
