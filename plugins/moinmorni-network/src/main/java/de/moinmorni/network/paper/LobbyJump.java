package de.moinmorni.network.paper;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import de.moinmorni.network.paper.JumpCourse.Kind;
import de.moinmorni.network.paper.JumpCourse.Step;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Predicate;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.block.data.BlockData;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.BlockDisplay;
import org.bukkit.entity.Display;
import org.bukkit.entity.Player;
import org.bukkit.entity.TextDisplay;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerGameModeChangeEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerTeleportEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Transformation;
import org.joml.AxisAngle4f;
import org.joml.Vector3f;

/**
 * Jump and Run der Lobby (statt der Parkour-Spirale). Am Startplatz auf den Smaragd treten (oder {@code /jnr}): Man
 * steht hoch über dem Dorf in einer eigenen Bahn, vor einem erscheint ein Block nach dem anderen. Die Blöcke gibt es
 * nur beim Läufer ({@code sendBlockChange}) – der Server kennt sie nicht, niemand sonst sieht sie oder steht darauf.
 * Welcher Block wo kommt und wie schwer, rechnet {@link JumpCourse} (ohne Server, mit Tests).
 *
 * <p>Lag-sicher: Gelandet ist, wer nach seinen eigenen Bewegungen (vom Spiel gemeldet) auf der Fläche des nächsten
 * Blocks steht – nicht nach der Zeit und nicht nach „steht auf dem Boden“ des Servers (der kennt den Block nicht). Jeder Block wird regelmäßig neu geschickt (ein Klick auf einen Block lässt das
 * Spiel sonst den echten Block zeigen). Bedrock (Geyser) bekommt dieselben Blöcke; nur das Aufploppen (Anzeige-Wesen)
 * sieht man dort nicht.
 *
 * <p>Jeder geschaffte Sprung ein Punkt; wer fällt, ist raus und steht wieder am Startplatz. Rekord je Spieler in
 * {@code plugins/moinmorni/jumpandrun.yml}, Top 10 auf der Tafel am Start, Werte an den Hub (Statistik „lobby“:
 * {@code jump_best}, {@code jump_runs}, {@code jumps}).
 */
final class LobbyJump implements Listener {

    record Settings(boolean on, int harderFrom, boolean item, int startX, int startY, int startZ, LobbyFeatures.View back,
                    LobbyFeatures.View board, List<JumpCourse.Box> lanes) {
    }

    /** Warum ein Lauf endet: gefallen, selbst beendet, anderswohin (Teleport, Modus), weg, Gefängnis/Rundgang. */
    private enum End { FALL, STOP, LEFT, QUIT, QUIET }

    /** Ein laufender Versuch. */
    private static final class Run {
        final int lane;
        final JumpCourse course;
        final int best;
        Step current;
        Step next;
        int score;
        int level;
        /** Block-Stellen, an denen der Läufer gerade einen Block (oder Licht) von uns sieht. */
        final Map<Long, Location> shown = new HashMap<>();
        /** Was er dort sieht. */
        final Map<Long, BlockData> looks = new HashMap<>();
        BlockDisplay pop;
        BukkitTask popTask;
        BukkitTask meltTask;
        /** Eigener Teleport (Start) – kein Grund, den Lauf zu beenden. */
        boolean moving;
        /**
         * Wohin es nach dem Lauf zurückgeht: dorthin, wo man losgelegt hat (Gegenstand, Kompass, /jnr); null = an den
         * Startplatz (wer über den Smaragd kam – zurück auf den Smaragd hieße sofort der nächste Lauf).
         */
        final Location origin;

        Run(int lane, JumpCourse course, int best, Location origin) {
            this.lane = lane;
            this.course = course;
            this.best = best;
            this.origin = origin;
        }
    }

    /** Volle Blöcke je Stufe (abwechselnd), dazu die übrigen Arten je Stufe – Farben von weiß-blau bis rot. */
    private static final String[][] FULL = {
        {"white_concrete", "light_blue_concrete"},
        {"light_blue_concrete", "cyan_concrete"},
        {"lime_concrete", "yellow_concrete"},
        {"orange_concrete", "yellow_concrete"},
        {"red_concrete", "magenta_concrete"},
    };
    private static final String[] SLABS = {"quartz_slab", "prismarine_slab", "smooth_sandstone_slab",
        "smooth_red_sandstone_slab", "purpur_slab"};
    private static final String[] FENCES = {"birch_fence", "warped_fence", "bamboo_fence", "acacia_fence",
        "crimson_fence"};
    private static final String[] WALLS = {"diorite_wall", "prismarine_wall", "sandstone_wall", "red_sandstone_wall",
        "red_nether_brick_wall"};
    private static final String[] TRAPDOORS = {"birch_trapdoor", "warped_trapdoor", "bamboo_trapdoor",
        "acacia_trapdoor", "crimson_trapdoor"};
    private static final String[] FACING = {"north", "east", "south", "west"};
    /** Unsichtbares Licht über jedem Block – nachts sieht man die Blöcke sonst kaum. */
    private static final String LIGHT = "minecraft:light[level=13]";
    /** Farben der Stufen (Aktionsleiste, Titel). */
    private static final TextColor[] LEVEL_COLOURS = {NamedTextColor.AQUA, NamedTextColor.DARK_AQUA,
        NamedTextColor.GREEN, NamedTextColor.GOLD, NamedTextColor.RED};

    /** So genau muss man auf der Fläche stehen (Höhe); auf Schleim prallt man nur einen Augenblick auf. */
    private static final double LAND_TOLERANCE = 0.1;
    private static final double SLIME_TOLERANCE = 0.45;
    /** Wer so wenig steigt, steht (oder fällt) – Rundungen des Spiels. */
    private static final double RISE_TOLERANCE = 0.001;
    /** So weit unter dem tieferen der beiden Blöcke ist man gefallen. */
    private static final double FALL_DEPTH = 3;
    /** Aufploppen: von dieser Größe auf ganz, in so vielen Ticks; danach steht der Block wirklich da. */
    private static final float POP_FROM = 0.25f;
    private static final int POP_TICKS = 3;
    private static final long POP_DONE = 5L;
    /** Eis schmilzt nach so vielen Ticks auf ihm (Risse vorher in drei Stufen). */
    private static final long MELT_TICKS = 40L;
    private static final int MELT_STEPS = 4;
    /** Blöcke neu schicken und Aktionsleiste: alle so viele Ticks. */
    private static final long REFRESH = 10L;
    private static final long BOARD_CHECK = 200L;
    /** Kennung der Tafel: ältere Tafeln (etwa aus einer Zeit, als die Gegend nur halb geladen war) räumen wir weg. */
    private static final String BOARD_TAG = "mm_jnr_board";
    private static final long RESTART_PAUSE_MS = 1500;
    private static final int TOP = 10;
    /** Ab so vielen Punkten erfahren alle vom neuen Rekord. */
    private static final int ANNOUNCE_FROM = 10;
    /** Schrift der Tafel: elf Zeilen füllen die vier Blöcke hohe Bretterwand. */
    private static final float BOARD_SCALE = 1.15f;
    private static final int BOARD_WIDTH = 220;
    private static final int BOARD_BACKGROUND = 0xCC1E1408;
    private static final float PLING_LOW = 0.7f;
    private static final float PLING_STEP = 0.04f;
    private static final int PLING_STEPS = 30;
    private static final double LOOK_DOWN = 18;

    private final JavaPlugin plugin;
    private final Function<Player, String> langOf;
    private final Predicate<UUID> busy;
    private final Path file;
    private Consumer<JsonObject> toHub = body -> { };
    /** Lauf fängt an oder endet, Einstellungen ändern sich – die Lobby tauscht den Gegenstand in der Schnellleiste. */
    private Consumer<Player> changed = p -> { };
    private volatile Settings settings;
    private boolean commandsRegistered;

    private final Map<UUID, Run> runs = new HashMap<>();
    private final Map<UUID, Long> lastEnd = new HashMap<>();
    private int[] laneUse = new int[0];
    private YamlConfiguration records;
    private TextDisplay board;

    /**
     * @param busy wer gerade nicht anfangen darf (Gefängnis, Rundgang)
     */
    LobbyJump(JavaPlugin plugin, Function<Player, String> langOf, Predicate<UUID> busy, Path dataDir) {
        this.plugin = plugin;
        this.langOf = langOf;
        this.busy = busy;
        this.file = dataDir.resolve("jumpandrun.yml");
    }

    /** Werte an den Hub (Statistik „lobby“). */
    void setHub(Consumer<JsonObject> toHub) {
        this.toHub = toHub;
    }

    void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        records = YamlConfiguration.loadConfiguration(file.toFile());
        Bukkit.getScheduler().runTaskTimer(plugin, this::refresh, REFRESH, REFRESH);
        // Die Tafel kommt, sobald der Startplatz geladen ist (nicht dauerhaft – nach Neustart/Entladen neu).
        Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            if (settings != null && (board == null || !board.isValid())) {
                refreshBoard();
            } else if (settings != null) {
                removeOtherBoards();
            }
        }, BOARD_CHECK, BOARD_CHECK);
    }

    void setChanged(Consumer<Player> changed) {
        this.changed = changed;
    }

    /** Sind die Einstellungen schon da? */
    boolean ready() {
        return settings != null;
    }

    /** Darf man gerade loslegen (Panel-Schalter)? */
    boolean open() {
        Settings s = settings;
        return s != null && s.on();
    }

    /** Gehört der Gegenstand „Jump and Run“ in die Schnellleiste (Panel-Schalter)? */
    boolean itemOn() {
        Settings s = settings;
        return s != null && s.item();
    }

    /** Läuft gerade ein Versuch? (Dann kein Doppelsprung.) */
    boolean running(UUID id) {
        return runs.containsKey(id);
    }

    private boolean en(Player p) {
        return "en".equals(langOf.apply(p));
    }

    private Component text(Player p, String de, String enText, TextColor colour) {
        return Component.text(en(p) ? enText : de, colour);
    }

    // ---------- Einstellungen vom Hub ----------

    /** Hub-Thread: {@code jumpAndRun} und {@code features.jump} aus den Lobby-Einstellungen. */
    void onSettings(JsonObject m) {
        JsonObject features = m.getAsJsonObject("features");
        JsonObject jump = features == null ? null : features.getAsJsonObject("jump");
        if (jump == null) {
            return;
        }
        JsonObject switches = m.getAsJsonObject("jumpAndRun");
        boolean on = switches != null && switches.get("on").getAsBoolean();
        int harderFrom = switches == null ? 1 : Math.max(1, switches.get("harderFrom").getAsInt());
        // Ältere Hubs schicken den Schalter nicht – dann gibt es den Gegenstand (Standard).
        boolean item = switches == null || !switches.has("item") || switches.get("item").getAsBoolean();
        JsonObject start = jump.getAsJsonObject("start");
        List<JumpCourse.Box> lanes = new ArrayList<>();
        for (JsonElement el : jump.getAsJsonArray("lanes")) {
            JsonObject o = el.getAsJsonObject();
            lanes.add(new JumpCourse.Box(o.get("x1").getAsInt(), o.get("y1").getAsInt(), o.get("z1").getAsInt(),
                    o.get("x2").getAsInt(), o.get("y2").getAsInt(), o.get("z2").getAsInt()));
        }
        Settings next = new Settings(on, harderFrom, item, start.get("x").getAsInt(), start.get("y").getAsInt(),
                start.get("z").getAsInt(), view(jump.getAsJsonObject("back")), view(jump.getAsJsonObject("board")),
                List.copyOf(lanes));
        Bukkit.getScheduler().runTask(plugin, () -> apply(next));
    }

    private static LobbyFeatures.View view(JsonObject o) {
        return new LobbyFeatures.View(o.get("x").getAsDouble(), o.get("y").getAsDouble(), o.get("z").getAsDouble(),
                o.get("yaw").getAsFloat(), o.get("pitch").getAsFloat());
    }

    private void apply(Settings next) {
        Settings before = settings;
        settings = next;
        if (before == null || before.lanes().size() != next.lanes().size()) {
            laneUse = new int[next.lanes().size()];
            runs.values().stream().filter(r -> r.lane < laneUse.length).forEach(r -> laneUse[r.lane]++);
        }
        if (!next.on()) {
            List.copyOf(runs.keySet()).forEach(id -> {
                Player p = Bukkit.getPlayer(id);
                if (p != null) {
                    end(p, runs.get(id), End.STOP);
                }
            });
        }
        refreshBoard();
        if (!commandsRegistered) {
            registerCommands();
        }
        Bukkit.getOnlinePlayers().forEach(changed);
    }

    // ---------- Start ----------

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        Settings s = settings;
        if (s == null) {
            return;
        }
        Player p = event.getPlayer();
        Run run = runs.get(p.getUniqueId());
        Location to = event.getTo();
        if (run != null) {
            follow(p, run, event.getFrom(), to);
            return;
        }
        if (!s.on() || !p.isOnGround() || to.getBlockX() != s.startX() || to.getBlockZ() != s.startZ()
                || Math.abs(to.getY() - (s.startY() + 1)) > LAND_TOLERANCE) {
            return;
        }
        Long ended = lastEnd.get(p.getUniqueId());
        if (ended != null && System.currentTimeMillis() - ended < RESTART_PAUSE_MS) {
            return;
        }
        lastEnd.put(p.getUniqueId(), System.currentTimeMillis());
        Bukkit.getScheduler().runTask(plugin, () -> begin(p, false));
    }

    /**
     * Ein neuer Versuch: eigene Bahn, Startblock, erster Block davor. Man „spawnt in der Luft“: sofort oben auf dem
     * Startblock, ohne Schwung, Blick zum nächsten Block.
     *
     * @param here true = vom Gegenstand, Kompass oder /jnr – nach dem Lauf zurück an diese Stelle; false = über den
     *     Smaragd – zurück an den Startplatz
     */
    void begin(Player p, boolean here) {
        Settings s = settings;
        if (s == null || !p.isOnline() || runs.containsKey(p.getUniqueId())) {
            return;
        }
        if (!s.on()) {
            p.sendMessage(text(p, "Das Jump and Run ist gerade geschlossen.", "The jump and run is closed right now.",
                    NamedTextColor.GRAY));
            return;
        }
        if (busy.test(p.getUniqueId()) || p.getGameMode() == GameMode.CREATIVE
                || p.getGameMode() == GameMode.SPECTATOR || s.lanes().isEmpty()) {
            p.sendMessage(text(p, "Gerade geht das Jump and Run nicht.", "You can't start the jump and run right now.",
                    NamedTextColor.GRAY));
            return;
        }
        int lane = freeLane();
        laneUse[lane]++;
        JumpCourse course = new JumpCourse(s.lanes().get(lane), ThreadLocalRandom.current().nextLong(), s.harderFrom());
        Run run = new Run(lane, course, records.getInt("best." + p.getUniqueId() + ".score", 0),
                here ? p.getLocation().clone() : null);
        run.current = course.start();
        run.next = course.next(0);
        runs.put(p.getUniqueId(), run);
        World w = Bukkit.getWorlds().get(0);
        Step c = run.current;
        float yaw = yawTo(c, run.next);
        run.moving = true;
        p.setFlying(false);
        p.teleport(new Location(w, c.x() + 0.5, c.top(), c.z() + 0.5, yaw, (float) LOOK_DOWN));
        run.moving = false;
        // Kein Schwung von vorher (Doppelsprung, Launchpad) – man steht still auf dem Startblock.
        p.setVelocity(new org.bukkit.util.Vector());
        p.setFallDistance(0);
        show(p, run, run.current, 0);
        pop(p, run, run.next, 1);
        // Liegen die Blöcke in einem Stück Welt, das das Spiel noch nicht hatte, kommen sie mit dem nächsten Schicken.
        Bukkit.getScheduler().runTaskLater(plugin, () -> resend(p, run), 2L);
        p.showTitle(Title.title(Component.text("Jump and Run", NamedTextColor.GOLD, TextDecoration.BOLD),
                text(p, "Spring von Block zu Block – nicht fallen!", "Jump from block to block – don't fall!",
                        NamedTextColor.YELLOW),
                Title.Times.times(java.time.Duration.ofMillis(200), java.time.Duration.ofMillis(2000),
                        java.time.Duration.ofMillis(500))));
        p.playSound(p.getLocation(), Sound.ENTITY_ENDERMAN_TELEPORT, 0.6f, 1.4f);
        p.spawnParticle(Particle.CLOUD, p.getLocation().add(0, 0.2, 0), 12, 0.4, 0.1, 0.4, 0.02);
        bar(p, run);
        changed.accept(p);
    }

    /** Vom Gegenstand „Lauf beenden“: wie /jnr stop. */
    void stopByItem(Player p) {
        Run run = runs.get(p.getUniqueId());
        if (run != null) {
            end(p, run, End.STOP);
        }
    }

    private int freeLane() {
        int best = 0;
        for (int i = 1; i < laneUse.length; i++) {
            if (laneUse[i] < laneUse[best]) {
                best = i;
            }
        }
        return best;
    }

    private static float yawTo(Step from, Step to) {
        double dx = to.centerX() - from.centerX();
        double dz = to.centerZ() - from.centerZ();
        return (float) Math.toDegrees(Math.atan2(-dx, dz));
    }

    // ---------- Unterwegs ----------

    /**
     * Gelandet? Nur nach Lage: auf der Fläche des nächsten Blocks, genau auf Höhe der Oberkante und nicht im Aufsteigen.
     * „Steht auf dem Boden“ des Servers hilft hier nicht – der Server kennt den Block nicht und hält den Läufer für
     * schwebend (Minecraft 26.x rechnet das selbst nach, egal was das Spiel meldet).
     */
    private void follow(Player p, Run run, Location from, Location to) {
        double lowest = Math.min(run.current.top(), run.next.top());
        if (to.getY() < lowest - FALL_DEPTH) {
            Bukkit.getScheduler().runTask(plugin, () -> {
                if (runs.get(p.getUniqueId()) == run) {
                    end(p, run, End.FALL);
                }
            });
            return;
        }
        Step n = run.next;
        boolean notRising = to.getY() <= from.getY() + RISE_TOLERANCE;
        boolean landed = n.kind() == Kind.SLIME
                ? n.holds(to.getX(), to.getY(), to.getZ(), SLIME_TOLERANCE) && to.getY() <= n.top() + LAND_TOLERANCE
                : notRising && n.holds(to.getX(), to.getY(), to.getZ(), LAND_TOLERANCE);
        if (landed) {
            advance(p, run);
        }
    }

    private void advance(Player p, Run run) {
        Step old = run.current;
        hide(p, run, old);
        if (run.meltTask != null) {
            run.meltTask.cancel();
            run.meltTask = null;
        }
        run.score++;
        run.current = run.next;
        int levelBefore = run.level;
        run.next = run.course.next(run.score);
        run.level = run.next.level();
        // Steht der Block noch im Aufploppen, jetzt sofort hinstellen.
        finishPop(p, run);
        show(p, run, run.current, run.score);
        pop(p, run, run.next, run.score + 1);
        if (run.current.kind() == Kind.ICE) {
            melt(p, run, run.current);
        }
        float pitch = PLING_LOW + PLING_STEP * (run.score % PLING_STEPS);
        p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, 0.8f, Math.min(2f, pitch));
        if (run.score == run.best + 1 && run.best > 0) {
            p.playSound(p.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 0.7f, 1.6f);
            p.sendActionBar(text(p, "★ Neuer Rekord!", "★ New record!", NamedTextColor.GOLD));
        } else {
            bar(p, run);
        }
        if (run.level > levelBefore) {
            levelUp(p, run.level);
        }
    }

    private void levelUp(Player p, int level) {
        String[][] hints = {
            {"", ""},
            {"Weiter springen – jetzt mit Sprinten", "Longer jumps – sprint now"},
            {"Zäune, Mauern und Falltüren", "Fences, walls and trapdoors"},
            {"Eis schmilzt schnell, Schleim federt", "Ice melts fast, slime bounces"},
            {"Alles auf einmal – viel Glück!", "Everything at once – good luck!"},
        };
        String[] hint = hints[Math.min(level, hints.length - 1)];
        p.showTitle(Title.title(text(p, "Stufe " + (level + 1), "Level " + (level + 1), colour(level)),
                text(p, hint[0], hint[1], NamedTextColor.WHITE),
                Title.Times.times(java.time.Duration.ofMillis(150), java.time.Duration.ofMillis(1500),
                        java.time.Duration.ofMillis(400))));
        p.playSound(p.getLocation(), Sound.BLOCK_AMETHYST_BLOCK_CHIME, 1f, 0.8f);
    }

    private static TextColor colour(int level) {
        return LEVEL_COLOURS[Math.max(0, Math.min(level, LEVEL_COLOURS.length - 1))];
    }

    private void bar(Player p, Run run) {
        int record = Math.max(run.best, run.score);
        p.sendActionBar(Component.text("★ " + run.score, colour(run.level), TextDecoration.BOLD)
                .append(Component.text("   " + (en(p) ? "Record " : "Rekord ") + record, NamedTextColor.GRAY)
                        .decoration(TextDecoration.BOLD, false))
                .append(Component.text("   " + (en(p) ? "Level " : "Stufe ") + (run.level + 1), colour(run.level))
                        .decoration(TextDecoration.BOLD, false)));
    }

    /** Eis: Risse, dann ist es weg – wer noch darauf steht, fällt. */
    private void melt(Player p, Run run, Step ice) {
        Location at = location(ice);
        int[] step = {0};
        run.meltTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            if (runs.get(p.getUniqueId()) != run || run.current != ice || !p.isOnline()) {
                return;
            }
            step[0]++;
            if (step[0] < MELT_STEPS) {
                p.sendBlockDamage(at, (float) step[0] / MELT_STEPS, p.getEntityId());
                p.playSound(at, Sound.BLOCK_GLASS_HIT, 0.5f, 1.4f);
                return;
            }
            hide(p, run, ice);
            p.playSound(at, Sound.BLOCK_GLASS_BREAK, 0.8f, 1.2f);
            p.spawnParticle(Particle.SNOWFLAKE, at.clone().add(0.5, 0.8, 0.5), 12, 0.3, 0.2, 0.3, 0.01);
            run.meltTask.cancel();
            run.meltTask = null;
        }, MELT_TICKS / MELT_STEPS, MELT_TICKS / MELT_STEPS);
    }

    // ---------- Blöcke nur für den Läufer ----------

    private static long key(int x, int y, int z) {
        return ((long) x & 0x3FFFFFFL) << 38 | ((long) z & 0x3FFFFFFL) << 12 | ((long) y & 0xFFFL);
    }

    private static Location location(Step s) {
        return new Location(Bukkit.getWorlds().get(0), s.x(), s.y(), s.z());
    }

    static String material(Step s, int index) {
        int lv = Math.max(0, Math.min(s.level(), FULL.length - 1));
        return "minecraft:" + switch (s.kind()) {
            case START -> "emerald_block";
            case FULL -> FULL[lv][index % 2];
            case SLAB -> SLABS[lv] + "[type=bottom]";
            case FENCE -> FENCES[lv];
            case WALL -> WALLS[lv];
            case TRAPDOOR -> TRAPDOORS[lv] + "[open=true,half=bottom,facing=" + FACING[s.facing()] + "]";
            case SLIME -> "slime_block";
            case ICE -> "ice";
        };
    }

    /** Block (und Licht darüber) für den Läufer hinstellen. */
    private void show(Player p, Run run, Step s, int index) {
        put(p, run, s.x(), s.y(), s.z(), Bukkit.createBlockData(material(s, index)));
        if (s.kind() != Kind.SLIME) {
            put(p, run, s.x(), s.y() + 1, s.z(), Bukkit.createBlockData(LIGHT));
        }
    }

    private void put(Player p, Run run, int x, int y, int z, BlockData data) {
        Location at = new Location(Bukkit.getWorlds().get(0), x, y, z);
        long k = key(x, y, z);
        run.shown.put(k, at);
        run.looks.put(k, data);
        p.sendBlockChange(at, data);
    }

    /** Block (und Licht) wieder wegnehmen – der Läufer sieht wieder, was wirklich dort ist (Luft). */
    private void hide(Player p, Run run, Step s) {
        restore(p, run, s.x(), s.y(), s.z());
        restore(p, run, s.x(), s.y() + 1, s.z());
    }

    private void restore(Player p, Run run, int x, int y, int z) {
        long k = key(x, y, z);
        Location at = run.shown.remove(k);
        run.looks.remove(k);
        if (at != null && p.isOnline()) {
            p.sendBlockChange(at, at.getBlock().getBlockData());
        }
    }

    /** Nächster Block ploppt auf (Anzeige-Wesen nur für ihn), ein paar Ticks später steht er wirklich da. */
    private void pop(Player p, Run run, Step s, int index) {
        BlockData data = Bukkit.createBlockData(material(s, index));
        Location at = location(s);
        Location centre = at.clone().add(0.5, 0.6, 0.5);
        p.spawnParticle(Particle.END_ROD, centre, 8, 0.3, 0.3, 0.3, 0.01);
        p.playSound(centre, Sound.BLOCK_AMETHYST_BLOCK_PLACE, 0.7f, 1.5f);
        if (!at.isChunkLoaded()) {
            show(p, run, s, index);
            return;
        }
        float off = (1 - POP_FROM) / 2;
        BlockDisplay display = at.getWorld().spawn(at, BlockDisplay.class, d -> {
            d.setPersistent(false);
            d.setVisibleByDefault(false);
            d.setBlock(data);
            d.setBrightness(new Display.Brightness(15, 15));
            d.setGlowing(true);
            d.setGlowColorOverride(Color.fromRGB(0xFFD54A));
            d.setTransformation(new Transformation(new Vector3f(off, off, off), new AxisAngle4f(),
                    new Vector3f(POP_FROM, POP_FROM, POP_FROM), new AxisAngle4f()));
        });
        p.showEntity(plugin, display);
        run.pop = display;
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (display.isValid()) {
                display.setInterpolationDelay(0);
                display.setInterpolationDuration(POP_TICKS);
                display.setTransformation(new Transformation(new Vector3f(), new AxisAngle4f(), new Vector3f(1, 1, 1),
                        new AxisAngle4f()));
            }
        }, 1L);
        run.popTask = Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (runs.get(p.getUniqueId()) == run && run.next == s) {
                show(p, run, s, index);
            }
            display.remove();
            if (run.pop == display) {
                run.pop = null;
                run.popTask = null;
            }
        }, POP_DONE);
    }

    private void finishPop(Player p, Run run) {
        if (run.popTask != null) {
            run.popTask.cancel();
            run.popTask = null;
        }
        if (run.pop != null) {
            run.pop.remove();
            run.pop = null;
        }
        if (!run.shown.containsKey(key(run.current.x(), run.current.y(), run.current.z()))) {
            show(p, run, run.current, run.score);
        }
    }

    /** Alles, was der Läufer von uns sieht, noch einmal schicken (geschmolzenes Eis bleibt weg). */
    private void resend(Player p, Run run) {
        if (runs.get(p.getUniqueId()) != run || !p.isOnline()) {
            return;
        }
        run.shown.forEach((k, at) -> p.sendBlockChange(at, run.looks.get(k)));
    }

    private void refresh() {
        List.copyOf(runs.entrySet()).forEach(e -> {
            Player p = Bukkit.getPlayer(e.getKey());
            if (p != null) {
                resend(p, e.getValue());
                bar(p, e.getValue());
            }
        });
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInteract(PlayerInteractEvent event) {
        Run run = runs.get(event.getPlayer().getUniqueId());
        if (run != null) {
            // Ein Klick auf einen Block lässt den Server dort den echten Block (Luft) schicken – gleich wieder hin.
            Bukkit.getScheduler().runTask(plugin, () -> resend(event.getPlayer(), run));
        }
    }

    // ---------- Ende ----------

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        Run run = runs.get(event.getPlayer().getUniqueId());
        if (run != null && !run.moving) {
            end(event.getPlayer(), run, End.LEFT);
        }
    }

    @EventHandler
    public void onGameMode(PlayerGameModeChangeEvent event) {
        Run run = runs.get(event.getPlayer().getUniqueId());
        GameMode mode = event.getNewGameMode();
        if (run != null && (mode == GameMode.CREATIVE || mode == GameMode.SPECTATOR)) {
            end(event.getPlayer(), run, End.LEFT);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Run run = runs.get(event.getPlayer().getUniqueId());
        if (run != null) {
            end(event.getPlayer(), run, End.QUIT);
        }
        lastEnd.remove(event.getPlayer().getUniqueId());
    }

    /** Fürs Gefängnis und den Rundgang: Lauf still beenden (ohne zurück zum Start). */
    void stop(Player p) {
        Run run = runs.get(p.getUniqueId());
        if (run != null) {
            end(p, run, End.QUIET);
        }
    }

    private void end(Player p, Run run, End how) {
        if (runs.remove(p.getUniqueId()) != run) {
            return;
        }
        lastEnd.put(p.getUniqueId(), System.currentTimeMillis());
        if (run.lane < laneUse.length) {
            laneUse[run.lane] = Math.max(0, laneUse[run.lane] - 1);
        }
        if (run.meltTask != null) {
            run.meltTask.cancel();
        }
        if (run.popTask != null) {
            run.popTask.cancel();
        }
        if (run.pop != null) {
            run.pop.remove();
        }
        if (p.isOnline()) {
            run.shown.forEach((k, at) -> p.sendBlockChange(at, at.getBlock().getBlockData()));
        }
        run.shown.clear();
        int score = run.score;
        boolean record = save(p, score);
        report(p, score);
        if (how == End.FALL || how == End.STOP) {
            Settings s = settings;
            if (p.isOnline() && run.origin != null) {
                p.teleport(run.origin);
                p.setVelocity(new org.bukkit.util.Vector());
                p.setFallDistance(0);
            } else if (s != null && p.isOnline()) {
                LobbyFeatures.View v = s.back();
                p.teleport(new Location(Bukkit.getWorlds().get(0), v.x(), v.y(), v.z(), v.yaw(), v.pitch()));
                p.setFallDistance(0);
            }
            if (p.isOnline()) {
                tell(p, score, record, run.best, how == End.FALL);
            }
        }
        if (p.isOnline() && how != End.QUIT) {
            changed.accept(p);
        }
    }

    private void tell(Player p, int score, boolean record, int before, boolean fell) {
        Component title = fell ? text(p, "Gefallen!", "You fell!", NamedTextColor.RED)
                : text(p, "Jump and Run beendet", "Jump and run over", NamedTextColor.GOLD);
        String pointsDe = score == 1 ? "1 Punkt" : score + " Punkte";
        String pointsEn = score == 1 ? "1 point" : score + " points";
        Component sub = record && score > 0
                ? text(p, "★ Neuer Rekord: " + pointsDe, "★ New record: " + pointsEn, NamedTextColor.GOLD)
                : text(p, pointsDe + " · Rekord " + Math.max(before, score), pointsEn + " · record "
                        + Math.max(before, score), NamedTextColor.YELLOW);
        p.showTitle(Title.title(title, sub, Title.Times.times(java.time.Duration.ofMillis(200),
                java.time.Duration.ofMillis(2500), java.time.Duration.ofMillis(600))));
        p.sendMessage(text(p, "Jump and Run: " + pointsDe + (record && score > 0 ? " – neuer Rekord!" : "")
                        + " Nochmal? Feder in der Schnellleiste, Smaragd am Startplatz oder /jnr.",
                "Jump and run: " + pointsEn + (record && score > 0 ? " – new record!" : "")
                        + " Again? Feather in the hotbar, emerald at the start or /jnr.", NamedTextColor.AQUA));
        p.playSound(p.getLocation(), record && score > 0 ? Sound.UI_TOAST_CHALLENGE_COMPLETE : Sound.BLOCK_NOTE_BLOCK_BASS,
                0.8f, 1f);
    }

    /** Rekord merken; true = neuer persönlicher Rekord. */
    private boolean save(Player p, int score) {
        String path = "best." + p.getUniqueId();
        int before = records.getInt(path + ".score", 0);
        if (score <= before) {
            return false;
        }
        int overall = top().stream().mapToInt(Map.Entry::getValue).max().orElse(0);
        records.set(path + ".score", score);
        records.set(path + ".name", p.getName());
        try {
            Files.createDirectories(file.getParent());
            records.save(file.toFile());
        } catch (IOException ex) {
            plugin.getLogger().warning("Jump-and-Run-Rekorde ließen sich nicht speichern: " + ex.getMessage());
        }
        refreshBoard();
        if (score > overall && score >= ANNOUNCE_FROM) {
            Bukkit.getOnlinePlayers().forEach(o -> o.sendMessage(text(o,
                    "★ " + p.getName() + " hat den Jump-and-Run-Rekord geknackt: " + score + " Punkte!",
                    "★ " + p.getName() + " set a new jump and run record: " + score + " points!", NamedTextColor.GOLD)));
        }
        return true;
    }

    /** Statistik ans Netzwerk (Profil, Bestenliste der Webseite). */
    private void report(Player p, int score) {
        JsonObject body = new JsonObject();
        body.addProperty("t", "stats");
        body.addProperty("mode", "lobby");
        body.addProperty("uuid", p.getUniqueId().toString());
        JsonObject add = new JsonObject();
        add.addProperty("jump_runs", 1);
        add.addProperty("jumps", score);
        body.add("add", add);
        JsonObject max = new JsonObject();
        max.addProperty("jump_best", score);
        body.add("max", max);
        toHub.accept(body);
    }

    // ---------- Bestenliste ----------

    /** Name → Rekord, beste zuerst. */
    private List<Map.Entry<String, Integer>> top() {
        var section = records.getConfigurationSection("best");
        if (section == null) {
            return List.of();
        }
        return section.getKeys(false).stream()
                .map(k -> Map.entry(section.getString(k + ".name", "?"), section.getInt(k + ".score")))
                .filter(e -> e.getValue() > 0)
                .sorted(Comparator.comparing(Map.Entry<String, Integer>::getValue).reversed())
                .toList();
    }

    /** Alle Tafeln am Start außer der aktuellen entfernen. */
    private void removeOtherBoards() {
        Settings s = settings;
        if (s == null) {
            return;
        }
        LobbyFeatures.View v = s.board();
        Location at = new Location(Bukkit.getWorlds().get(0), v.x(), v.y(), v.z());
        if (!at.isChunkLoaded()) {
            return;
        }
        at.getWorld().getNearbyEntities(at, 2, 2, 2, e -> e instanceof TextDisplay && e != board
                && (e.getScoreboardTags().contains(BOARD_TAG) || e.getScoreboardTags().isEmpty()
                        && !e.isPersistent())).forEach(org.bukkit.entity.Entity::remove);
    }

    /** Die Tafel am Start: Top 10 (Namen und Zahlen – gleich für beide Sprachen). */
    private void refreshBoard() {
        Settings s = settings;
        if (board != null && board.isValid()) {
            board.remove();
        }
        board = null;
        if (s == null) {
            return;
        }
        LobbyFeatures.View v = s.board();
        Location at = new Location(Bukkit.getWorlds().get(0), v.x(), v.y(), v.z(), v.yaw(), 0);
        if (!at.isChunkLoaded() || !at.getChunk().isEntitiesLoaded()) {
            return;
        }
        // Nie zwei Tafeln übereinander: war die alte gerade nicht erreichbar (Gegend halb geladen), stand sie sonst
        // weiter da, und jede Änderung stellte eine neue davor.
        removeOtherBoards();
        TextColor[] places = {NamedTextColor.GOLD, TextColor.color(0xD8D8D8), TextColor.color(0xCD8A4B)};
        Component content = Component.text("Top " + TOP, NamedTextColor.YELLOW, TextDecoration.BOLD);
        List<Map.Entry<String, Integer>> list = top();
        // Immer zehn Zeilen – freie Plätze als Punkte, dann sieht die Tafel auch am Anfang voll aus.
        for (int i = 0; i < TOP; i++) {
            Component line;
            if (i < list.size()) {
                TextColor c = i < places.length ? places[i] : NamedTextColor.WHITE;
                line = Component.text((i + 1) + ". " + list.get(i).getKey() + "  ", c)
                        .append(Component.text("★ " + list.get(i).getValue(), NamedTextColor.AQUA));
            } else if (i == list.size() && list.isEmpty()) {
                line = Component.text("Sei der Erste! · Be the first!", NamedTextColor.WHITE);
            } else {
                line = Component.text((i + 1) + ".  · · ·", NamedTextColor.DARK_GRAY);
            }
            content = content.append(Component.newline()).append(line.decoration(TextDecoration.BOLD, false));
        }
        if (!s.on()) {
            content = content.append(Component.newline()).append(Component.text("✖ geschlossen · closed",
                    NamedTextColor.RED).decoration(TextDecoration.BOLD, false));
        }
        Component text = content;
        board = at.getWorld().spawn(at, TextDisplay.class, d -> {
            d.setPersistent(false);
            d.addScoreboardTag(BOARD_TAG);
            d.setBillboard(Display.Billboard.FIXED);
            d.setRotation(v.yaw(), 0);
            d.setShadowed(true);
            d.setLineWidth(BOARD_WIDTH);
            d.setBackgroundColor(Color.fromARGB(BOARD_BACKGROUND));
            d.setTransformation(new Transformation(new Vector3f(), new AxisAngle4f(),
                    new Vector3f(BOARD_SCALE, BOARD_SCALE, BOARD_SCALE), new AxisAngle4f()));
            d.text(text);
            // Keine Hitbox mit F3+B (Anzeige bleibt sichtbar), wie bei der Deko aus dem Datenpaket
            d.setInvisible(true);
        });
    }

    // ---------- Befehle ----------

    private void registerCommands() {
        commandsRegistered = true;
        Bukkit.getCommandMap().register("moinmorni",
                new Command("jumpandrun", "Jump and Run der Lobby", "/jnr [top|stop]", List.of("jnr")) {
                    @Override
                    public boolean execute(CommandSender sender, String label, String[] args) {
                        if (sender instanceof Player p) {
                            command(p, args);
                        }
                        return true;
                    }

                    @Override
                    public List<String> tabComplete(CommandSender sender, String alias, String[] args) {
                        return args.length == 1 ? List.of("top", "stop") : List.of();
                    }
                });
        // Der alte Befehl leitet um.
        Bukkit.getCommandMap().register("moinmorni",
                new Command("parkour", "Jetzt: Jump and Run (/jnr)", "/jnr [top|stop]", List.of()) {
                    @Override
                    public boolean execute(CommandSender sender, String label, String[] args) {
                        if (sender instanceof Player p) {
                            p.sendMessage(text(p, "Aus dem Parkour ist ein Jump and Run geworden – ab jetzt /jnr.",
                                    "The parkour is now a jump and run – from now on /jnr.", NamedTextColor.GRAY));
                            command(p, args);
                        }
                        return true;
                    }

                    @Override
                    public List<String> tabComplete(CommandSender sender, String alias, String[] args) {
                        return args.length == 1 ? List.of("top", "stop") : List.of();
                    }
                });
        Bukkit.getOnlinePlayers().forEach(Player::updateCommands);
    }

    private void command(Player p, String[] args) {
        String what = args.length > 0 ? args[0].toLowerCase(java.util.Locale.ROOT) : "";
        Run run = runs.get(p.getUniqueId());
        if ("top".equals(what) || "bestenliste".equals(what)) {
            p.sendMessage(text(p, "Jump and Run – Bestenliste", "Jump and run – leaderboard", NamedTextColor.GOLD));
            List<Map.Entry<String, Integer>> list = top();
            for (int i = 0; i < Math.min(TOP, list.size()); i++) {
                p.sendMessage(Component.text((i + 1) + ". " + list.get(i).getKey() + " – " + list.get(i).getValue(),
                        NamedTextColor.WHITE));
            }
            int mine = records.getInt("best." + p.getUniqueId() + ".score", 0);
            p.sendMessage(mine <= 0
                    ? text(p, "Du hast noch keinen Rekord – /jnr", "No record yet – /jnr", NamedTextColor.GRAY)
                    : text(p, "Dein Rekord: " + mine, "Your record: " + mine, NamedTextColor.AQUA));
            return;
        }
        if ("stop".equals(what) || "aus".equals(what)) {
            if (run != null) {
                end(p, run, End.STOP);
            }
            return;
        }
        if (run != null) {
            bar(p, run);
            return;
        }
        begin(p, true);
    }
}
