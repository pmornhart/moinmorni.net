package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CompletableFuture;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.NamespacedKey;
import org.bukkit.Particle;
import org.bukkit.Registry;
import org.bukkit.WeatherType;
import org.bukkit.World;
import org.bukkit.block.Biome;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Welt der Saison in der Lobby (Saison aus dem Panel). Winter: Schnee, der wirklich fällt; Ostern: Kirschblütenhain
 * (helles Grün, fallende Blüten); Halloween: blasser Garten (grauer Himmel und Nebel, Asche in der Luft):
 * <ul>
 * <li>Biom: Minecraft lässt Schnee nur in kalten Biomen fallen. Bevor die Lobby „Verschneite Ebene“ wird, merkt sich
 * das Plugin jedes Biom des Lobby-Geländes (einmal, für alle Saisons mit eigenem Biom) (Zellen zu 4×4×4 Blöcken, {@code plugins/moinmorni/winter-biome.txt}); bei
 * jeder anderen Saison kommen genau diese Biome zurück, dann ist die Datei weg.</li>
 * <li>Wetter: bleibt klar – echter Schneefall macht den Himmel grau und dunkel, die Lobby soll hell und freundlich
 * sein. Wer aus einer älteren Fassung noch Spieler-Schneefall hat, bekommt wieder das Wetter der Welt.</li>
 * <li>Flocken: leichtes Gestöber um jeden Spieler (Schneeflocken-Partikel, der Himmel bleibt blau).</li>
 * </ul>
 * Blöcke (Schneedecke, Christbaum, Eisbahn) und Deko setzt MoinMorni über das Saison-Datenpaket.
 */
final class LobbyWinter implements Listener {

    /** Gelände der Lobby wie beim Bau (−224 … 223 in x und z). */
    private static final int FROM = -224;
    private static final int TO = 223;
    private static final int Y_FROM = 48;
    private static final int Y_TO = 255;
    private static final int CELL = 4;
    private static final int CHUNK_SHIFT = 4;
    private static final int CHUNK = 16;
    private static final String SNAPSHOT = "winter-biome.txt";
    private static final String DONE = "winter-biome.done";
    /** Biom je Saison: Winter verschneit, Ostern Kirschblütenhain (helles Grün), Halloween blasser Garten (grauer Nebel). */
    private static final java.util.Map<String, Biome> BIOMES = java.util.Map.of(
            "winter", Biome.SNOWY_PLAINS,
            "easter", Biome.CHERRY_GROVE,
            "halloween", Biome.PALE_GARDEN);
    /** Teilchen je Saison um jeden Spieler: Art, Anzahl, Streuung, Höhe, wie weit über dem Kopf. */
    private record Drift(Particle particle, int count, double spread, double height, double above) { }
    private static final java.util.Map<String, Drift> DRIFTS = java.util.Map.of(
            "winter", new Drift(Particle.SNOWFLAKE, 3, 7, 1.5, 4),
            "easter", new Drift(Particle.CHERRY_LEAVES, 1, 6, 1.5, 4),
            "halloween", new Drift(Particle.WHITE_ASH, 14, 8, 2.5, 2));
    /** So viele Stücke je Tick umstellen (das Gelände hat 28 × 28). */
    private static final int CHUNKS_PER_TICK = 12;
    /** Leichtes Gestöber: drei Flocken alle 5 Ticks um jeden Spieler. */
    private static final long FLAKE_TICKS = 5L;
    /** Alle 30 s nachsehen, ob ein Neubau der Lobby das Biom zurückgesetzt hat. */
    private static final long RECHECK_TICKS = 600L;
    /** Dort wird nachgesehen: Mitte des Dorfplatzes, über dem Pflaster. */
    private static final int PROBE_Y = 70;

    private final JavaPlugin plugin;
    private final Path dir;
    private final Random rnd = new Random();
    private volatile String season;
    /** Läuft gerade ein Umstellen? Neue Wünsche warten darauf. */
    private boolean busy;
    private boolean pending;
    /** Nach einem Neubau: die gemerkten Biome dort erneuern, wo der Neubau sie gesetzt hat (nicht mehr kalt). */
    private boolean refresh;
    private BukkitTask flakes;
    private BukkitTask recheck;

    LobbyWinter(JavaPlugin plugin) {
        this.plugin = plugin;
        this.dir = plugin.getDataFolder().toPath().getParent().resolve("moinmorni");
    }

    void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        flakes = Bukkit.getScheduler().runTaskTimer(plugin, this::snowflakes, FLAKE_TICKS, FLAKE_TICKS);
        recheck = Bukkit.getScheduler().runTaskTimer(plugin, this::recheck, RECHECK_TICKS, RECHECK_TICKS);
    }

    void stop() {
        if (flakes != null) {
            flakes.cancel();
        }
        if (recheck != null) {
            recheck.cancel();
        }
        World world = lobbyWorld();
        if (world != null) {
            world.removePluginChunkTickets(plugin);
        }
    }

    /** Hub-Thread: Lobby-Einstellungen – auf dem Hauptthread umstellen. */
    void onSettings(JsonObject m) {
        String next = HubClient.str(m, "season");
        Bukkit.getScheduler().runTask(plugin, () -> configure(next));
    }

    /** Biom der laufenden Saison (null = Biome des Bauplans). */
    private Biome target() {
        return season == null ? null : BIOMES.get(season);
    }

    /** Für welche Saison das Biom gerade gesetzt ist (Merker-Datei), sonst null. */
    private String applied() {
        try {
            Path done = dir.resolve(DONE);
            return Files.exists(done) ? Files.readString(done, StandardCharsets.UTF_8).trim() : null;
        } catch (IOException ex) {
            return null;
        }
    }

    private void configure(String next) {
        season = next;
        Bukkit.getOnlinePlayers().forEach(this::weather);
        if (busy) {
            pending = true;
            return;
        }
        if (target() != null && !season.equals(applied())) {
            change(true);
        } else if (target() == null && Files.exists(dir.resolve(SNAPSHOT))) {
            change(false);
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        weather(event.getPlayer());
    }

    /** Klares Wetter (hell); Spieler-Wetter aus einer älteren Fassung wieder auf das der Welt. */
    private void weather(Player p) {
        if (p.getPlayerWeather() != null) {
            // Nur zurücksetzen lässt den Regen auf dem Bildschirm stehen – erst klares Wetter, dann wieder die Welt.
            p.setPlayerWeather(WeatherType.CLEAR);
            p.resetPlayerWeather();
        }
    }

    /**
     * Ein Neubau der Lobby setzt im Datenpaket das Biom des Dorfs (fillbiome) – im Winter danach wieder kalt machen.
     * Gemerkt bleibt, was vor dem Winter war (die Datei der Biome bleibt), nur nicht geladene Stücke werden nicht
     * geprüft.
     */
    private void recheck() {
        World world = lobbyWorld();
        Biome target = target();
        if (target == null || busy || world == null || !season.equals(applied()) || !world.isChunkLoaded(0, 0)) {
            return;
        }
        if (world.getBiome(0, PROBE_Y, 0) == target) {
            return;
        }
        plugin.getLogger().info("Saison: Die Lobby wurde neu gebaut – das Biom der Saison kommt wieder.");
        refresh = true;
        try {
            Files.deleteIfExists(dir.resolve(DONE));
        } catch (IOException ex) {
            plugin.getLogger().warning("Winter: Merker ließ sich nicht löschen – " + ex.getMessage());
            return;
        }
        configure(season);
    }

    private void snowflakes() {
        Drift drift = season == null ? null : DRIFTS.get(season);
        if (drift == null) {
            return;
        }
        World world = lobbyWorld();
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!p.getWorld().equals(world) || p.getGameMode() == GameMode.SPECTATOR) {
                continue;
            }
            var at = p.getLocation().add(rnd.nextGaussian(), drift.above(), rnd.nextGaussian());
            p.spawnParticle(drift.particle(), at, drift.count(), drift.spread(), drift.height(), drift.spread(), 0);
        }
    }

    private static World lobbyWorld() {
        List<World> worlds = Bukkit.getWorlds();
        return worlds.isEmpty() ? null : worlds.get(0);
    }

    // ---------- Biome merken, umstellen, zurück ----------

    /** Alle Stücke des Geländes laden (festhalten), dann Stück für Stück umstellen. */
    private void change(boolean toWinter) {
        World world = lobbyWorld();
        if (world == null) {
            return;
        }
        busy = true;
        List<long[]> chunks = new ArrayList<>();
        for (int cx = FROM >> CHUNK_SHIFT; cx <= TO >> CHUNK_SHIFT; cx++) {
            for (int cz = FROM >> CHUNK_SHIFT; cz <= TO >> CHUNK_SHIFT; cz++) {
                world.addPluginChunkTicket(cx, cz, plugin);
                chunks.add(new long[] {cx, cz});
            }
        }
        List<CompletableFuture<?>> loads = new ArrayList<>();
        chunks.forEach(c -> loads.add(world.getChunkAtAsync((int) c[0], (int) c[1])));
        CompletableFuture.allOf(loads.toArray(new CompletableFuture[0])).whenComplete((ok, err) ->
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (err != null) {
                        plugin.getLogger().warning("Winter: Gelände ließ sich nicht laden – " + err.getMessage());
                        finish(world);
                        return;
                    }
                    if (toWinter) {
                        snow(world, chunks);
                    } else {
                        thaw(world);
                    }
                }));
    }

    private void finish(World world) {
        world.removePluginChunkTickets(plugin);
        busy = false;
        Bukkit.getOnlinePlayers().forEach(this::weather);
        if (pending) {
            pending = false;
            configure(season);
        }
    }

    /** Winter: erst jedes Biom merken (nur einmal – die Datei bleibt bis zum Rückweg), dann alles kalt. */
    private void snow(World world, List<long[]> chunks) {
        Path snapshot = dir.resolve(SNAPSHOT);
        String name = season;
        Biome target = target();
        if (target == null) {
            finish(world);
            return;
        }
        Runnable freeze = () -> step(world, new ArrayDeque<>(chunks), chunk -> {
            int x0 = (int) chunk[0] << CHUNK_SHIFT;
            int z0 = (int) chunk[1] << CHUNK_SHIFT;
            for (int x = x0; x < x0 + CHUNK; x += CELL) {
                for (int z = z0; z < z0 + CHUNK; z += CELL) {
                    for (int y = Y_FROM; y <= Y_TO; y += CELL) {
                        world.setBiome(x, y, z, target);
                    }
                }
            }
        }, true, () -> {
            try {
                Files.writeString(dir.resolve(DONE), name + "\n", StandardCharsets.UTF_8);
            } catch (IOException ex) {
                plugin.getLogger().warning("Winter: Merker ließ sich nicht schreiben – " + ex.getMessage());
            }
            plugin.getLogger().info("Saison " + name + ": Biom " + target.getKey().asString() + " gesetzt.");
            finish(world);
        });
        boolean renew = refresh;
        refresh = false;
        if (Files.exists(snapshot) && !renew) {
            freeze.run();
            return;
        }
        // Nach einem Neubau: Säulen, die der Neubau neu gesetzt hat (nicht mehr kalt), neu merken – die übrigen
        // behalten, was vor dem Winter war.
        java.util.Map<String, List<String>> before = new java.util.HashMap<>();
        if (renew && Files.exists(snapshot)) {
            try {
                Files.readAllLines(snapshot, StandardCharsets.UTF_8).forEach(line -> {
                    String[] p = line.trim().split(" ");
                    if (p.length == 5) {
                        before.computeIfAbsent(p[0] + " " + p[1], k -> new ArrayList<>()).add(line.trim());
                    }
                });
            } catch (IOException ex) {
                plugin.getLogger().warning("Winter: gemerkte Biome nicht lesbar – " + ex.getMessage());
            }
        }
        String cold = target.getKey().asString();
        List<String> lines = new ArrayList<>();
        step(world, new ArrayDeque<>(chunks), chunk -> {
            List<String> fresh = new ArrayList<>();
            remember(world, chunk, fresh);
            java.util.Map<String, List<String>> columns = new java.util.LinkedHashMap<>();
            fresh.forEach(line -> {
                String[] p = line.split(" ");
                columns.computeIfAbsent(p[0] + " " + p[1], k -> new ArrayList<>()).add(line);
            });
            columns.forEach((column, rows) -> {
                boolean stillCold = rows.stream().allMatch(line -> line.endsWith(" " + cold));
                List<String> old = before.get(column);
                lines.addAll(stillCold && old != null ? old : rows);
            });
        }, false, () -> {
            try {
                Files.createDirectories(dir);
                Path tmp = dir.resolve(SNAPSHOT + ".tmp");
                Files.write(tmp, lines, StandardCharsets.UTF_8);
                Files.move(tmp, snapshot, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException ex) {
                plugin.getLogger().warning("Winter: Biome ließen sich nicht merken – kein Schneefall. " + ex.getMessage());
                finish(world);
                return;
            }
            freeze.run();
        });
    }

    /** Biome eines Stücks: je Säule (4×4) übereinander gleiche Zellen als eine Zeile „x z y1 y2 biom“. */
    private static void remember(World world, long[] chunk, List<String> lines) {
        int x0 = (int) chunk[0] << CHUNK_SHIFT;
        int z0 = (int) chunk[1] << CHUNK_SHIFT;
        for (int x = x0; x < x0 + CHUNK; x += CELL) {
            for (int z = z0; z < z0 + CHUNK; z += CELL) {
                String run = null;
                int from = Y_FROM;
                for (int y = Y_FROM; y <= Y_TO; y += CELL) {
                    String key = world.getBiome(x, y, z).getKey().asString();
                    if (!key.equals(run)) {
                        if (run != null) {
                            lines.add(x + " " + z + " " + from + " " + (y - CELL) + " " + run);
                        }
                        run = key;
                        from = y;
                    }
                }
                lines.add(x + " " + z + " " + from + " " + (Y_TO - Y_TO % CELL) + " " + run);
            }
        }
    }

    /** Rückweg: genau die gemerkten Biome wieder hin (Stück für Stück), dann die Dateien weg. */
    private void thaw(World world) {
        Path snapshot = dir.resolve(SNAPSHOT);
        List<String> lines;
        try {
            lines = Files.readAllLines(snapshot, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            plugin.getLogger().warning("Winter: gemerkte Biome nicht lesbar – " + ex.getMessage());
            finish(world);
            return;
        }
        java.util.Map<Long, List<String[]>> byChunk = new java.util.LinkedHashMap<>();
        for (String line : lines) {
            String[] p = line.trim().split(" ");
            if (p.length == 5) {
                int cx = Integer.parseInt(p[0]) >> CHUNK_SHIFT;
                int cz = Integer.parseInt(p[1]) >> CHUNK_SHIFT;
                byChunk.computeIfAbsent(((long) cx << 32) ^ (cz & 0xffffffffL), k -> new ArrayList<>()).add(p);
            }
        }
        Deque<long[]> todo = new ArrayDeque<>();
        java.util.Map<long[], List<String[]>> work = new java.util.IdentityHashMap<>();
        byChunk.forEach((key, rows) -> {
            long[] chunk = {key >> 32, (int) (long) key};
            todo.add(chunk);
            work.put(chunk, rows);
        });
        step(world, todo, chunk -> work.get(chunk).forEach(p -> {
            Biome biome = Registry.BIOME.get(NamespacedKey.fromString(p[4]));
            if (biome == null) {
                return;
            }
            int x = Integer.parseInt(p[0]);
            int z = Integer.parseInt(p[1]);
            for (int y = Integer.parseInt(p[2]); y <= Integer.parseInt(p[3]); y += CELL) {
                world.setBiome(x, y, z, biome);
            }
        }), true, () -> {
            try {
                Files.deleteIfExists(dir.resolve(DONE));
                Files.deleteIfExists(snapshot);
            } catch (IOException ex) {
                plugin.getLogger().warning("Winter: Dateien ließen sich nicht löschen – " + ex.getMessage());
            }
            plugin.getLogger().info("Winter: alte Biome wieder da.");
            finish(world);
        });
    }

    /** Je Tick ein paar Stücke: Arbeit tun (und, wenn `send`, neu an die Spieler schicken); zum Schluss `done`. */
    private void step(World world, Deque<long[]> todo, java.util.function.Consumer<long[]> work, boolean send,
                      Runnable done) {
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            for (int i = 0; i < CHUNKS_PER_TICK && !todo.isEmpty(); i++) {
                long[] chunk = todo.poll();
                work.accept(chunk);
                if (send) {
                    world.refreshChunk((int) chunk[0], (int) chunk[1]);
                }
            }
            if (todo.isEmpty()) {
                task.cancel();
                done.run();
            }
        }, 1L, 1L);
    }
}
