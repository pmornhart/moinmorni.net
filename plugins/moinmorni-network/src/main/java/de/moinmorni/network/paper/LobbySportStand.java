package de.moinmorni.network.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.bukkit.Bukkit;
import org.bukkit.Chunk;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.entity.Entity;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Sport-Stand am Schlossmarkt: Wintersport und Sommerspiele teilen sich einen Stand – im Winter eine verschneite
 * Skihütte mit der Skifahrerin, im Sommer ein Bootshaus mit der Ruderin. Wer dort steht, sagt der Hub ({@code sport} in
 * der Nachricht {@code lobby}: fest eingestellt im Panel oder wer gerade Saison hat).
 *
 * <p>Welcher Stand gerade gebaut ist, sagt ein Merker-Block unter dem Boden (Packeis bzw. Sandstein). Der Umbau läuft
 * über Funktionen im Saison-Datenpaket ({@code sport/sommerspiele_on} bzw. {@code _off}) – je eine ganze Funktion in
 * einem Tick, genau die alten Blöcke an genau den geänderten Stellen. Ein Absturz trifft darum nie einen halben Stand:
 * Nach dem Neustart liest das Plugin den Merker und baut weiter. Figur, Schild und Deko (Tag {@code mm_sport_<modus>})
 * setzt {@code sport/<modus>}; fehlt die Figur des richtigen Modus oder stehen Wesen des anderen herum, wird
 * aufgeräumt und neu gesetzt. Die zwei Stücke des Stands bleiben geladen (Ticket des Plugins).</p>
 */
final class LobbySportStand {

    private static final String NAMESPACE = "moinmorni_season";
    private static final String TAG = "mm_sport";
    private static final String FIGURE_TAG = "mm_sport_figure";
    private static final long CHECK_TICKS = 100;
    private static final int CHUNK_SHIFT = 4;

    /** Was der Hub über den Stand sagt (lobby-settings → features.sport). */
    record Spot(String host, int[] sentinel, Map<String, Material> blocks, double[] center, double radius,
                String on, String off, Map<String, String> show) {
    }

    private final JavaPlugin plugin;
    private volatile Spot spot;
    private volatile String wanted;
    /** Für diesen Stand kam schon eine Warnung (nicht alle 5 Sekunden wieder). */
    private String failed;
    /** Nach dem Start einmal ganz gesetzt (siehe {@link #check()}). */
    private boolean verified;
    private final java.util.Set<Long> tickets = new java.util.HashSet<>();

    LobbySportStand(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    void start() {
        Bukkit.getScheduler().runTaskTimer(plugin, this::check, CHECK_TICKS, CHECK_TICKS);
    }

    /** Wer steht da (Nachricht {@code lobby} vom Hub). */
    void onModes(JsonObject m) {
        String sport = HubClient.str(m, "sport");
        if (sport == null || sport.isEmpty() || sport.equals(wanted)) {
            return;
        }
        wanted = sport;
        Bukkit.getScheduler().runTask(plugin, this::check);
    }

    /** Lage des Stands (nur die Lobby bekommt sie). */
    void onSettings(JsonObject m) {
        JsonObject features = m.getAsJsonObject("features");
        JsonObject s = features == null ? null : features.getAsJsonObject("sport");
        if (s == null) {
            return;
        }
        spot = parse(s);
        Bukkit.getScheduler().runTask(plugin, this::check);
    }

    static Spot parse(JsonObject s) {
        JsonArray sen = s.getAsJsonArray("sentinel");
        JsonArray c = s.getAsJsonArray("center");
        Map<String, Material> blocks = new HashMap<>();
        s.getAsJsonObject("blocks").entrySet().forEach(e ->
                blocks.put(e.getKey(), Material.matchMaterial(e.getValue().getAsString())));
        JsonObject fn = s.getAsJsonObject("functions");
        Map<String, String> show = new HashMap<>();
        fn.getAsJsonObject("show").entrySet().forEach(e -> show.put(e.getKey(), e.getValue().getAsString()));
        return new Spot(HubClient.str(s, "host"), new int[] {sen.get(0).getAsInt(), sen.get(1).getAsInt(), sen.get(2).getAsInt()}, blocks,
                new double[] {c.get(0).getAsDouble(), c.get(1).getAsDouble(), c.get(2).getAsDouble()},
                s.get("radius").getAsDouble(), HubClient.str(fn, "on"), HubClient.str(fn, "off"), show);
    }

    /** Welcher Stand laut Merker gebaut ist – null, wenn der Merker etwas anderes zeigt (Lobby noch nicht gebaut). */
    static String builtLook(Spot spot, Material at) {
        return spot.blocks().entrySet().stream().filter(e -> e.getValue() == at).map(Map.Entry::getKey)
                .findFirst().orElse(null);
    }

    /** Was zu tun ist: Blöcke umbauen (Funktion), oder nichts. */
    static String blockStep(Spot spot, String built, String wanted) {
        if (built == null || wanted == null || built.equals(wanted) || !spot.blocks().containsKey(wanted)) {
            return null;
        }
        // Im Bauplan steht der Stand des Gastgebers (Skihütte); der Gast (Bootshaus) kommt darüber und geht wieder.
        return wanted.equals(spot.host()) ? spot.off() : spot.on();
    }

    private void check() {
        Spot s = spot;
        String want = wanted;
        World world = Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
        if (s == null || want == null || world == null || !s.show().containsKey(want)) {
            return;
        }
        if (building()) {
            verified = false;
            return; // Während die Lobby neu gebaut wird, setzt der Bau die Skihütte – danach wird umgebaut
        }
        List<Chunk> chunks = chunks(world, s);
        if (chunks.stream().anyMatch(ch -> !ch.isEntitiesLoaded())) {
            return; // Wesen laden nach den Blöcken – erst wenn sie da sind, ist klar, ob die Figur fehlt
        }
        String built = builtLook(s, world.getBlockAt(s.sentinel()[0], s.sentinel()[1], s.sentinel()[2]).getType());
        if (built == null) {
            return;
        }
        boolean first = !verified;
        String step = blockStep(s, built, want);
        if (step == null && first) {
            // Einmal nach dem Start (und nach einem Neubau) den Stand noch einmal ganz setzen: Er liegt in zwei
            // Stücken der Welt – nach einem Absturz mitten im Speichern könnte eines alt sein. Doppelt setzen schadet
            // nicht (gleiche Blöcke).
            step = want.equals(s.host()) ? s.off() : s.on();
        }
        if (step != null) {
            run(step);
            String now = builtLook(s, world.getBlockAt(s.sentinel()[0], s.sentinel()[1], s.sentinel()[2]).getType());
            if (!want.equals(now)) {
                if (!want.equals(failed)) {
                    plugin.getLogger().warning("Sport-Stand: Umbau zu " + want + " hat nicht geklappt (" + step
                            + ") – fehlt das Saison-Datenpaket? Die Lobby baut sich beim nächsten Update neu.");
                }
                failed = want;
                return;
            }
            failed = null;
            if (!want.equals(built)) {
                plugin.getLogger().info("Sport-Stand: jetzt " + want);
            }
        }
        verified = true;
        Location center = new Location(world, s.center()[0], s.center()[1], s.center()[2]);
        List<Entity> mine = world.getNearbyEntities(center, s.radius(), s.radius(), s.radius()).stream()
                .filter(e -> e.getScoreboardTags().contains(TAG)).toList();
        boolean stale = mine.stream().anyMatch(e -> !e.getScoreboardTags().contains(TAG + "_" + want));
        boolean figure = mine.stream().anyMatch(e -> e.getScoreboardTags().contains(FIGURE_TAG));
        if (stale || !figure || first) {
            // Die Funktion räumt erst alle Wesen des Stands ab, dann setzt sie Figur, Schild und Deko (nach dem Start
            // einmal sicher: ein halb gespeicherter Stand hätte sonst nur einen Teil seiner Deko)
            run(s.show().get(want));
        }
    }

    /** Die Stücke rund um den Stand, mit Ticket des Plugins (bleiben geladen). */
    private List<Chunk> chunks(World world, Spot s) {
        int r = (int) Math.ceil(s.radius());
        int cx = (int) Math.floor(s.center()[0]);
        int cz = (int) Math.floor(s.center()[2]);
        java.util.Set<Long> keys = new java.util.LinkedHashSet<>();
        for (int dx = -r; dx <= r; dx += r) {
            for (int dz = -r; dz <= r; dz += r) {
                int x = (cx + dx) >> CHUNK_SHIFT;
                int z = (cz + dz) >> CHUNK_SHIFT;
                keys.add(((long) x << 32) | (z & 0xffffffffL));
            }
        }
        return keys.stream().map(k -> {
            int x = (int) (k >> 32);
            int z = (int) (long) k;
            if (tickets.add(k)) {
                world.addPluginChunkTicket(x, z, plugin);
            }
            return world.getChunkAt(x, z);
        }).toList();
    }

    /**
     * Baut MoinMorni die Lobby gerade neu? Dann steht in {@code lobby-world.target} schon die neue Version, in
     * {@code lobby-world.version} noch die alte (sie kommt erst, wenn alles steht).
     */
    private boolean building() {
        java.nio.file.Path dir = plugin.getDataFolder().toPath().getParent().resolve("moinmorni");
        return !same(read(dir.resolve("lobby-world.target")), read(dir.resolve("lobby-world.version")));
    }

    static boolean same(String target, String built) {
        return target == null || target.equals(built);
    }

    private static String read(java.nio.file.Path file) {
        try {
            return java.nio.file.Files.isRegularFile(file) ? java.nio.file.Files.readString(file).trim() : null;
        } catch (java.io.IOException e) {
            return null;
        }
    }

    private static void run(String function) {
        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "minecraft:function " + NAMESPACE + ":" + function);
    }
}
