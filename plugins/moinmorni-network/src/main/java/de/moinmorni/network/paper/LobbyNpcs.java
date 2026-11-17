package de.moinmorni.network.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Color;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Tag;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.BlockFace;
import org.bukkit.entity.ArmorStand;
import org.bukkit.entity.Display;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.TextDisplay;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.world.EntitiesLoadEvent;
import org.bukkit.event.world.EntitiesUnloadEvent;
import com.destroystokyo.paper.event.entity.EntityAddToWorldEvent;
import io.papermc.paper.entity.TeleportFlag;
import com.destroystokyo.paper.event.entity.EntityRemoveFromWorldEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Transformation;
import org.bukkit.util.Vector;
import org.joml.AxisAngle4f;
import org.joml.Vector3f;

/**
 * Lobby: Figuren mit dem Tag {@code mm_mode_<id>} bringen beim Anklicken in ihren Modus (kurzer Klang, ein paar
 * Funken, die Figur winkt). Über ihrem Kopf stehen drei Zeilen – Name groß in der Farbe des Modus (Tag
 * {@code mm_tint_<rrggbb>}), Zustand, klein der Hinweis –, je Sprache eigene Schilder, jeder Spieler sieht nur seine.
 * Stehende Figuren drehen nur den Kopf zum nächsten Spieler (der Körper und die 3D-Tracht bleiben, wie sie stehen);
 * Dorfleute mit dem Tag {@code mm_walker} laufen gemütlich um ihren Platz herum, die Tracht dreht mit dem Körper.
 * Alle Figuren (Tag {@code mm_npc}) nehmen keinen Schaden. Die Figuren selbst setzt der Lobby-Bau in die Welt.
 */
final class LobbyNpcs implements Listener {

    private static final String NPC_TAG = "mm_npc";
    /** Wesen am Sport-Stand (`mm_sport_<modus>`), siehe {@link LobbySportStand}. */
    private static final String SPORT_TAG = "mm_sport";
    private static final String MODE_TAG = "mm_mode_";
    private static final String MODE_NPC_TAG = "mm_mode_npc";
    private static final String WORLD_LABEL_TAG = "mm_mode_label";
    private static final String LABEL_TAG = "mm_live_label";
    private static final String WALKER_TAG = "mm_walker";
    /** Alles, was der Lobby-Bau setzt; dazu `mm_build_<version>`. */
    private static final String LOBBY_TAG = "mm_lobby";
    private static final String BUILD_PREFIX = "mm_build_";
    /** Ältere Bauten hatten nur diese Tags. */
    private static final List<String> OLD_LOBBY_TAGS = List.of("mm_npc", "mm_seat", "mm_sign", "mm_npc_label");
    /** Version, die gerade gebaut wird bzw. zuletzt gebaut wurde (schreibt MoinMorni beim Bauen). */
    private static final String TARGET_FILE = "moinmorni/lobby-world.target";
    private static final List<String> LANGS = List.of("de", "en");
    /**
     * Schild über der Figur (wie {@code LABEL_LAYOUT} im Baukasten, village.ts): je Zeile ein eigenes Schild, die
     * unterste über jedem Hut, darüber Zustand und Name. Eine Zeile ist 10 Schrift-Pixel hoch (1/40 Block mal Größe).
     */
    private static final double LABEL_BOTTOM = 2.38;
    private static final double LABEL_GAP = 0.03;
    private static final double LABEL_LINE = 0.25;
    private static final float NAME_SCALE = 0.9f;
    private static final float STATE_SCALE = 0.75f;
    private static final float HINT_SCALE = 0.6f;
    /** Dunkler, durchscheinender Grund (Alpha 0 … 255); ohne Hinweis ganz durchsichtig. */
    private static final int LABEL_SHADE = 88;
    private static final int HINT_SHADE = 64;
    /** Immer hell – nachts so gut lesbar wie am Tag. */
    private static final Display.Brightness FULL_BRIGHT = new Display.Brightness(15, 15);
    private static final TextColor HINT_GREY = TextColor.color(0xC8C8C8);
    private static final String TINT_TAG = "mm_tint_";
    /** Figuren im Rock gehen kleinere Schritte (die Beine bleiben im 3D-Rock). */
    private static final String ROCK_TAG = "mm_rock";
    private static final long CLICK_COOLDOWN_MS = 1500;
    private static final double LOOK_RANGE = 6;
    private static final int LOOK_EVERY_TICKS = 5;
    /** So weit dreht eine stehende Figur den Kopf (Grad links/rechts); wer weiter hinten steht, wird nicht angeschaut. */
    private static final float HEAD_TURN = 60;
    private static final float HEAD_PITCH = 35;
    /** Der Kopf dreht sich weich (höchstens so viele Grad je Tick, zum Ende langsamer) statt in Sprüngen. */
    private static final float HEAD_STEP = 9;
    private static final float HEAD_EASE = 0.35f;
    /** Alle zwei Sekunden nachsehen, ob die Lobby neu gebaut wurde (dann alte Wesen wegräumen). */
    private static final int BUILD_CHECK_TICKS = 40;
    /** Blöcke pro Tick: etwa 1,8 Blöcke pro Sekunde – gemütliches Schlendern (im Rock 1,2). */
    private static final double WALK_SPEED = 0.09;
    private static final double WALK_SPEED_ROCK = 0.06;
    /** So schnell folgt der Körper der Laufrichtung (wie Minecraft selbst: 30 % je Tick, höchstens 50° hinter dem Kopf). */
    private static final float BODY_FOLLOW = 0.3f;
    private static final float BODY_MAX_BEHIND = 50;
    /** Ab so viel Weg je Tick dreht Minecraft den Körper in die Laufrichtung (0,05 Blöcke). */
    private static final double MOVING = 0.05;
    /**
     * So viele Grad dreht sich eine Figur je Tick auf der Stelle, bevor sie losgeht – wie ein Mensch, nicht mit einem
     * Ruck herum (ein Ruck ließ Minecraft den Körper kurz rückwärts drehen, die Tracht sprang hinterher).
     */
    private static final float TURN_STEP = 12;
    /** So nah (Mitte zu Mitte) läuft niemand an eine andere Figur oder einen Spieler heran. */
    private static final double KEEP_APART = 0.8;
    /** Ein Ziel, an dem schon jemand steht, wird nicht angesteuert. */
    private static final double TARGET_APART = 1.2;
    private static final int BLOCKED_WAIT = 12;
    private static final int BLOCKED_GIVE_UP = 3;
    private static final double WANDER_MIN = 2;
    private static final double WANDER_MAX = 8;
    private static final int TARGET_TRIES = 6;
    private static final double PATH_STEP = 0.5;
    private static final double BODY = 0.3;
    private static final double ARRIVED = 0.15;
    /** Trampelpfad und Ackerboden sind 15/16 hoch – das sieht niemand. */
    private static final double GROUND_MIN = 0.9;
    private static final int PAUSE_SHORT = 20;
    private static final int PAUSE_MIN = 60;
    private static final int PAUSE_SPREAD = 160;

    /**
     * Ein Modus, wie die Lobby ihn zeigt. {@code pause} sagt der Hub: „summer“ = Sommerpause (Wintersport außerhalb
     * der Saison – man darf trotzdem hin und sich umschauen), „closed“ = gerade geschlossen (z. B. während der Server
     * beendet wird), sonst null. Ein schlafender Modus ist nie geschlossen – er wacht auf, sobald jemand kommt.
     */
    record ModeInfo(String id, String nameDe, String nameEn, String state, String access, int players,
                    boolean hasServer, boolean awake, String icon, String phase, String pause) {
        boolean summerBreak() {
            return "on".equals(state) && hasServer && "summer".equals(pause);
        }

        /** Winterpause (Sommerspiele außerhalb der Saison – das Dorf am Bergsee ist trotzdem offen). */
        boolean winterBreak() {
            return "on".equals(state) && hasServer && "winter".equals(pause);
        }

        /** Saison-Pause, ob Sommer oder Winter: hinein darf man trotzdem, zum Anschauen. */
        boolean seasonBreak() {
            return summerBreak() || winterBreak();
        }

        boolean closedNow() {
            return "on".equals(state) && hasServer && "closed".equals(pause);
        }
    }

    private static final class Walk {
        final Location home;
        final double speed;
        Location target;
        int pause;
        /** So oft hintereinander stand jemand im Weg. */
        int blocked;
        /** Wohin der Körper schaut (Minecraft dreht ihn beim Laufen langsam nach) – die Tracht folgt ihm. */
        float body;
        /** Kopf beim Stehenbleiben (schaut sich nach Spielern um). */
        final Gaze gaze;

        Walk(Location home, double speed, int pause, float body) {
            this.home = home;
            this.speed = speed;
            this.pause = pause;
            this.body = body;
            this.gaze = new Gaze(body, 0);
        }
    }

    /** Wohin der Kopf einer stehenden Figur schaut und wohin er will. Der Körper (und die Tracht) bleibt bei {@code home}. */
    static final class Gaze {
        float home;
        float yaw;
        float pitch;
        float wantYaw;
        float wantPitch;

        Gaze(float home, float pitch) {
            this.home = home;
            this.yaw = home;
            this.wantYaw = home;
            this.pitch = pitch;
            this.wantPitch = 0;
        }

        void reset(float facing) {
            home = facing;
            yaw = facing;
            wantYaw = facing;
            pitch = 0;
            wantPitch = 0;
        }
    }

    /** Die drei Zeilen über einer Figur in einer Sprache. */
    private record Label(TextDisplay name, TextDisplay state, TextDisplay hint) {
        List<TextDisplay> all() {
            return List.of(name, state, hint);
        }

        boolean valid() {
            return all().stream().allMatch(Entity::isValid);
        }
    }

    /** Was in den drei Zeilen steht (Hinweis kann fehlen). */
    record LabelText(Component name, Component state, Component hint) {
    }

    private final JavaPlugin plugin;
    /** Platz eines Dorfbewohners aus dem Bau (bleibt am Wesen, auch nach Neustart und Nachladen). */
    private final NamespacedKey homeKey;
    private final HubClient hub;
    private final Function<Player, String> langOf;
    private final Map<String, ModeInfo> modes = new ConcurrentHashMap<>();
    /** Figur → Sprache → Schild (drei Zeilen). */
    private final Map<UUID, Map<String, Label>> labels = new HashMap<>();
    /** Figur → Farbe ihres Modus (aus dem Tag {@code mm_tint_<rrggbb>}). */
    private final Map<UUID, TextColor> tints = new HashMap<>();
    private final Map<UUID, Walk> walkers = new HashMap<>();
    /** Stehende Figuren und ihre Blickrichtung aus dem Bau. */
    private final Map<UUID, Gaze> standing = new HashMap<>();
    private final Map<UUID, Long> lastClick = new HashMap<>();
    private final Random rnd = new Random();
    private int ticks;
    private long buildCheckedAt = -1;
    private String build;
    /** Bau-Version, nach der zuletzt aufgeräumt wurde. */
    private String sweptBuild;
    /** Saison-Deko, die gerade gilt (vom Hub); Deko anderer Saisons wird beim Laden entfernt. */
    private volatile String season = null;
    /** So viele Dorfbewohner laufen herum (die übrigen stehen). */
    private volatile int walkerLimit = Integer.MAX_VALUE;
    /** Reihenfolge der Modi wie im Panel. */
    private volatile List<String> order = List.of();
    /** Wer gerade am Sport-Stand steht (vom Hub); der andere Sport-Modus fehlt im Kompass. */
    private volatile String sport;
    /** Die beiden Modi, die sich den Sport-Stand teilen. */
    static final java.util.Set<String> SPORT_MODES = java.util.Set.of("wintersport", "sommerspiele");

    LobbyNpcs(JavaPlugin plugin, HubClient hub, Function<Player, String> langOf) {
        this.plugin = plugin;
        this.homeKey = new NamespacedKey(plugin, "home");
        this.hub = hub;
        this.langOf = langOf;
    }

    void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        for (World w : Bukkit.getWorlds()) {
            w.getEntities().forEach(this::adopt);
        }
        sweptBuild = currentBuild();
        Bukkit.getScheduler().runTaskTimer(plugin, this::tick, 1L, 1L);
    }

    // ---------- Zahlen vom Hub ----------

    /** Hub-Thread: neue Zahlen merken, Schilder auf dem Hauptthread neu schreiben. */
    void onModes(JsonObject m) {
        JsonArray list = m.getAsJsonArray("modes");
        if (list == null) {
            return;
        }
        Map<String, ModeInfo> fresh = new HashMap<>();
        for (JsonElement el : list) {
            JsonObject o = el.getAsJsonObject();
            JsonObject name = o.getAsJsonObject("name");
            String id = HubClient.str(o, "id");
            fresh.put(id, new ModeInfo(id, HubClient.str(name, "de"), HubClient.str(name, "en"),
                    HubClient.str(o, "state"), HubClient.str(o, "access"), o.get("players").getAsInt(),
                    o.get("hasServer").getAsBoolean(), o.get("awake").getAsBoolean(), HubClient.str(o, "icon"),
                    HubClient.str(o, "phase"), HubClient.str(o, "pause")));
        }
        modes.clear();
        modes.putAll(fresh);
        order = list.asList().stream().map(el -> HubClient.str(el.getAsJsonObject(), "id")).toList();
        String next = HubClient.str(m, "sport");
        if (next != null && !next.isEmpty() && !next.equals(sport)) {
            sport = next;
            Bukkit.getScheduler().runTask(plugin, () -> Bukkit.getWorlds().forEach(w -> w.getEntities().stream()
                    .filter(e -> e.getScoreboardTags().contains(SPORT_TAG)).forEach(this::adopt)));
        }
        Bukkit.getScheduler().runTask(plugin, this::refreshLabels);
    }

    private void refreshLabels() {
        labels.forEach((npc, byLang) -> {
            Entity e = Bukkit.getEntity(npc);
            String id = e == null ? null : modeOf(e).orElse(null);
            TextColor tint = tints.getOrDefault(npc, NamedTextColor.GOLD);
            byLang.forEach((lang, label) -> {
                if (label.valid()) {
                    show(label, labelText(id, lang, tint));
                }
            });
        });
    }

    /** Text in die drei Zeilen; ohne Hinweis bleibt die unterste leer und durchsichtig. */
    private static void show(Label label, LabelText text) {
        label.name().text(text.name());
        label.state().text(text.state());
        label.hint().text(text.hint() == null ? Component.empty() : text.hint());
        label.hint().setBackgroundColor(Color.fromARGB(text.hint() == null ? 0 : HINT_SHADE, 0, 0, 0));
    }

    private LabelText labelText(String id, String lang, TextColor tint) {
        return labelText(id == null ? null : modes.get(id), id, lang, tint);
    }

    /** Die drei Zeilen über einer Modus-Figur: Name, Zustand (Spielerzahl, schläft, Pause …), Hinweis. */
    static LabelText labelText(ModeInfo m, String id, String lang, TextColor tint) {
        boolean en = "en".equals(lang);
        if (m == null) {
            return new LabelText(Component.text(id == null ? "…" : id, tint, TextDecoration.BOLD), Component.empty(),
                    null);
        }
        Component name = Component.text(en ? m.nameEn() : m.nameDe(), tint, TextDecoration.BOLD);
        Component state;
        Component hint = null;
        boolean soon = "soon".equals(m.state()) || !m.hasServer();
        if ("off".equals(m.state())) {
            state = Component.text(en ? "● Closed" : "● geschlossen", NamedTextColor.RED);
        } else if (soon) {
            state = Component.text(en ? "○ Coming soon" : "○ bald", NamedTextColor.GRAY);
        } else if ("maintenance".equals(m.state())) {
            state = Component.text(en ? "⚒ Maintenance" : "⚒ Wartung", NamedTextColor.GOLD);
        } else if (m.summerBreak()) {
            state = Component.text(en ? "☀ Summer break" : "☀ Sommerpause", NamedTextColor.YELLOW);
        } else if (m.winterBreak()) {
            state = Component.text(en ? "❄ Winter break" : "❄ Winterpause", NamedTextColor.AQUA);
        } else if (m.closedNow()) {
            state = Component.text(en ? "● Closed right now" : "● Gerade geschlossen", NamedTextColor.GOLD);
        } else if (!m.awake()) {
            state = Component.text(en ? "☾ Asleep – click to wake" : "☾ schläft – Klick weckt", NamedTextColor.AQUA);
        } else {
            state = Component.text("● " + m.players() + playing(m.players(), en), NamedTextColor.GREEN);
        }
        if (m.seasonBreak()) {
            hint = Component.text(en ? "Right-click to look around" : "Rechtsklick: Dorf anschauen", HINT_GREY);
        } else if (m.closedNow()) {
            hint = Component.text(en ? "Back in a moment" : "Gleich wieder offen", HINT_GREY);
        } else if (!"off".equals(m.state()) && !soon) {
            hint = "whitelist".equals(m.access())
                    ? Component.text(en ? "Invitation only" : "Nur auf Einladung", NamedTextColor.LIGHT_PURPLE)
                    : Component.text(en ? "Right-click to play" : "Rechtsklick: Mitspielen", HINT_GREY);
        }
        return new LabelText(name, state, hint);
    }

    /** „● 1 spielt“, „● 12 spielen“, „● 3 playing“. */
    private static String playing(int players, boolean en) {
        if (en) {
            return " playing";
        }
        return players == 1 ? " spielt" : " spielen";
    }

    // ---------- Figuren finden ----------

    private static Optional<String> modeOf(Entity e) {
        if (!e.getScoreboardTags().contains(NPC_TAG)) {
            return Optional.empty();
        }
        return e.getScoreboardTags().stream()
                .filter(t -> t.startsWith(MODE_TAG) && !t.equals(MODE_NPC_TAG) && !t.equals(WORLD_LABEL_TAG))
                .map(t -> t.substring(MODE_TAG.length()))
                .findFirst();
    }

    /** Aktuelle Bau-Version (Datei wird nur neu gelesen, wenn sie sich geändert hat). */
    private String currentBuild() {
        java.io.File file = new java.io.File(plugin.getDataFolder().getParentFile(), TARGET_FILE);
        long modified = file.lastModified();
        if (modified != buildCheckedAt) {
            buildCheckedAt = modified;
            try {
                build = file.isFile() ? java.nio.file.Files.readString(file.toPath()).trim() : null;
            } catch (java.io.IOException ex) {
                build = null;
            }
        }
        return build == null || build.isEmpty() ? null : build;
    }

    private static boolean fromLobbyBuild(java.util.Set<String> tags) {
        // Der Sport-Stand setzt seine Figur selbst (ohne Bau-Version) – sie gehört nicht zu einem älteren Bau
        if (tags.contains(SPORT_TAG)) {
            return false;
        }
        return tags.contains(LOBBY_TAG) || OLD_LOBBY_TAGS.stream().anyMatch(tags::contains);
    }

    /** Wesen aus einem älteren Lobby-Bau? (Ohne Bau-Version gilt alles.) */
    private boolean outdated(java.util.Set<String> tags) {
        String current = currentBuild();
        return current != null && fromLobbyBuild(tags) && !tags.contains(BUILD_PREFIX + current);
    }

    private void adopt(Entity e) {
        var tags = e.getScoreboardTags();
        // Sport-Stand: Wesen des anderen Modus (Figur, Schild, Deko) weg
        String atStand = sport;
        if (atStand != null && tags.contains(SPORT_TAG) && !tags.contains(SPORT_TAG + "_" + atStand)) {
            e.getPassengers().forEach(Entity::remove);
            e.remove();
            return;
        }
        String current = season;
        if (current != null && tags.contains("mm_season") && !tags.contains("mm_season_" + current)) {
            e.remove();
            return;
        }
        if (outdated(tags)) {
            e.getPassengers().forEach(Entity::remove);
            e.remove();
            return;
        }
        // Feste Schilder aus dem Bau ersetzen wir durch eigene (mit Live-Zahlen, je Sprache).
        if (tags.contains(WORLD_LABEL_TAG) || tags.contains(LABEL_TAG)) {
            e.remove();
            return;
        }
        if (!tags.contains(NPC_TAG)) {
            return;
        }
        modeOf(e).ifPresent(id -> {
            Map<String, Label> have = labels.get(e.getUniqueId());
            if (have == null || have.values().stream().anyMatch(l -> !l.valid())) {
                addLabels(e, id);
            }
        });
        if (tags.contains(WALKER_TAG)) {
            if (!walkers.containsKey(e.getUniqueId())) {
                double speed = tags.contains(ROCK_TAG) ? WALK_SPEED_ROCK : WALK_SPEED;
                // Nach dem Laden schaut der Körper dorthin, wohin die Figur schaut (so setzt ihn Minecraft beim
                // Erscheinen) – die Tracht dreht gleich mit, statt bis zum ersten Schritt schief zu sitzen.
                float yaw = e.getLocation().getYaw();
                walkers.put(e.getUniqueId(), new Walk(homeOf(e), speed, rnd.nextInt(PAUSE_SPREAD), yaw));
                turnWith(e, yaw);
            }
        } else if (!e.isInsideVehicle() && !standing.containsKey(e.getUniqueId())) {
            // Der Körper bleibt, wie er gebaut wurde; nur der Kopf schaut sich um (die Tracht sitzt so immer).
            float yaw = e.getLocation().getYaw();
            standing.put(e.getUniqueId(), new Gaze(yaw, e.getLocation().getPitch()));
            turnWith(e, yaw);
        }
    }

    private void addLabels(Entity npc, String id) {
        removeLabels(npc.getUniqueId());
        TextColor tint = tintOf(npc);
        tints.put(npc.getUniqueId(), tint);
        Location feet = npc.getLocation();
        double hintAt = LABEL_BOTTOM;
        double stateAt = hintAt + LABEL_LINE * HINT_SCALE + LABEL_GAP;
        double nameAt = stateAt + LABEL_LINE * STATE_SCALE + LABEL_GAP;
        Map<String, Label> byLang = new HashMap<>();
        for (String lang : LANGS) {
            Label label = new Label(line(feet, nameAt, NAME_SCALE, LABEL_SHADE),
                    line(feet, stateAt, STATE_SCALE, LABEL_SHADE), line(feet, hintAt, HINT_SCALE, HINT_SHADE));
            show(label, labelText(id, lang, tint));
            byLang.put(lang, label);
        }
        labels.put(npc.getUniqueId(), byLang);
        Bukkit.getOnlinePlayers().forEach(this::showLabels);
    }

    /** Eine Zeile über der Figur: dreht sich nur seitlich zum Betrachter, immer hell, eigene Größe. */
    private static TextDisplay line(Location feet, double up, float scale, int shade) {
        Location at = feet.clone().add(0, up, 0);
        at.setYaw(0);
        at.setPitch(0);
        return feet.getWorld().spawn(at, TextDisplay.class, d -> {
            d.setPersistent(false);
            d.setVisibleByDefault(false);
            // Keine Hitbox mit F3+B (Anzeige bleibt sichtbar), wie bei der Deko aus dem Datenpaket
            d.setInvisible(true);
            d.setBillboard(Display.Billboard.VERTICAL);
            d.setShadowed(true);
            d.setBrightness(FULL_BRIGHT);
            d.setBackgroundColor(Color.fromARGB(shade, 0, 0, 0));
            d.setTransformation(new Transformation(new Vector3f(), new AxisAngle4f(),
                    new Vector3f(scale, scale, scale), new AxisAngle4f()));
            d.addScoreboardTag(LABEL_TAG);
        });
    }

    /** Farbe des Modus aus dem Tag {@code mm_tint_<rrggbb>} (ältere Bauten ohne Tag: Gold). */
    private static TextColor tintOf(Entity npc) {
        return npc.getScoreboardTags().stream()
                .filter(t -> t.startsWith(TINT_TAG))
                .map(t -> TextColor.fromHexString("#" + t.substring(TINT_TAG.length())))
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElse(NamedTextColor.GOLD);
    }

    private void removeLabels(UUID npc) {
        tints.remove(npc);
        Map<String, Label> old = labels.remove(npc);
        if (old != null) {
            old.values().forEach(label -> label.all().forEach(Entity::remove));
        }
    }

    /** Jeder sieht das Schild in seiner Sprache. */
    void showLabels(Player p) {
        String mine = "en".equals(langOf.apply(p)) ? "en" : "de";
        labels.values().forEach(byLang -> byLang.forEach((lang, label) -> label.all().forEach(line -> {
            if (lang.equals(mine)) {
                p.showEntity(plugin, line);
            } else {
                p.hideEntity(plugin, line);
            }
        })));
    }

    @EventHandler
    public void onLoad(EntitiesLoadEvent event) {
        // Erst im nächsten Tick: während des Ladens keine neuen Wesen (Schilder) in die Welt setzen.
        List<Entity> loaded = List.copyOf(event.getEntities());
        Bukkit.getScheduler().runTask(plugin, () -> loaded.stream().filter(Entity::isValid).forEach(this::adopt));
    }

    /** Figuren, die neu in die Welt kommen (z. B. beim Neubau der Lobby während des Betriebs). */
    @EventHandler
    public void onAdd(EntityAddToWorldEvent event) {
        Entity e = event.getEntity();
        var tags = e.getScoreboardTags();
        if (!fromLobbyBuild(tags) && !tags.contains(WORLD_LABEL_TAG) && !tags.contains("mm_season")
                && !tags.contains(SPORT_TAG)) {
            return;
        }
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (e.isValid()) {
                adopt(e);
            }
        });
    }

    /** Figur weg (z. B. beim Neubau entfernt): ihre Schilder auch. */
    @EventHandler
    public void onRemove(EntityRemoveFromWorldEvent event) {
        UUID id = event.getEntity().getUniqueId();
        if (!labels.containsKey(id) && !walkers.containsKey(id) && !standing.containsKey(id)) {
            return;
        }
        Bukkit.getScheduler().runTask(plugin, () -> {
            Entity still = Bukkit.getEntity(id);
            if (still != null && still.isValid()) {
                return;
            }
            removeLabels(id);
            walkers.remove(id);
            standing.remove(id);
        });
    }

    @EventHandler
    public void onUnload(EntitiesUnloadEvent event) {
        event.getEntities().forEach(e -> {
            removeLabels(e.getUniqueId());
            walkers.remove(e.getUniqueId());
            standing.remove(e.getUniqueId());
        });
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        showLabels(event.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        lastClick.remove(event.getPlayer().getUniqueId());
    }

    // ---------- Anklicken ----------

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEntityEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) {
            return;
        }
        modeOf(event.getRightClicked()).ifPresent(id -> {
            event.setCancelled(true);
            if (play(event.getPlayer(), id)) {
                cheer(event.getRightClicked());
            }
        });
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onHit(EntityDamageByEntityEvent event) {
        if (!event.getEntity().getScoreboardTags().contains(NPC_TAG)) {
            return;
        }
        event.setCancelled(true);
        if (event.getDamager() instanceof Player p) {
            modeOf(event.getEntity()).ifPresent(id -> {
                if (play(p, id)) {
                    cheer(event.getEntity());
                }
            });
        }
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onDamage(EntityDamageEvent event) {
        // /kill (z. B. beim Neubau der Lobby) darf die Figuren entfernen, sonst nichts.
        if (event.getCause() != EntityDamageEvent.DamageCause.KILL
                && event.getEntity().getScoreboardTags().contains(NPC_TAG)) {
            event.setCancelled(true);
        }
    }

    /** Lobby-Einstellungen: Saison (für das Aufräumen) und wie viele Dorfbewohner laufen. */
    void configure(String season, int walkers) {
        this.season = season;
        this.walkerLimit = Math.max(0, walkers);
        Bukkit.getScheduler().runTask(plugin, () -> {
            for (World w : Bukkit.getWorlds()) {
                w.getEntities().stream().filter(e -> e.getScoreboardTags().contains("mm_season")).forEach(this::adopt);
            }
        });
    }

    /** Modi mit Zahlen in der Reihenfolge des Panels (für das Kompass-Menü) – vom Sport-Stand nur, wer dort steht. */
    List<ModeInfo> orderedModes() {
        return compassModes(order.stream().map(modes::get).filter(java.util.Objects::nonNull).toList(), sport);
    }

    /** Kompass: von Wintersport und Sommerspielen nur, wer am Sport-Stand steht (ohne Angabe beide). */
    static List<ModeInfo> compassModes(List<ModeInfo> all, String sport) {
        if (sport == null || sport.isEmpty()) {
            return all;
        }
        return all.stream().filter(m -> !SPORT_MODES.contains(m.id()) || sport.equals(m.id())).toList();
    }


    /** Ab in den Modus (bzw. wecken); true, wenn die Anfrage an den Hub ging. */
    boolean play(Player p, String id) {
        long now = System.currentTimeMillis();
        Long last = lastClick.get(p.getUniqueId());
        if (last != null && now - last < CLICK_COOLDOWN_MS) {
            return false;
        }
        lastClick.put(p.getUniqueId(), now);
        boolean en = "en".equals(langOf.apply(p));
        if (hub == null || !hub.ready()) {
            p.sendMessage(Component.text(en
                    ? "The network can't be reached right now – please try again in a moment."
                    : "Das Netzwerk ist gerade nicht erreichbar – versuch es gleich nochmal.", NamedTextColor.RED));
            return false;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "play");
        body.addProperty("uuid", p.getUniqueId().toString());
        body.addProperty("mode", id);
        hub.send(body);
        p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, 0.6f, 1.4f);
        return true;
    }

    /** Kleine Freude beim Anklicken: ein paar Funken in der Farbe des Modus, die Figur winkt. */
    private void cheer(Entity npc) {
        Location at = npc.getLocation().add(0, 1.3, 0);
        TextColor tint = tints.getOrDefault(npc.getUniqueId(), NamedTextColor.GOLD);
        World w = npc.getWorld();
        w.spawnParticle(Particle.DUST, at, 14, 0.35, 0.45, 0.35, 0,
                new Particle.DustOptions(Color.fromRGB(tint.value()), 1.1f));
        w.spawnParticle(Particle.FIREWORK, at.clone().add(0, 0.7, 0), 6, 0.25, 0.2, 0.25, 0.02);
        if (npc instanceof LivingEntity living) {
            living.swingMainHand();
        }
    }

    // ---------- Leben im Dorf ----------

    private void tick() {
        ticks++;
        boolean look = ticks % LOOK_EVERY_TICKS == 0;
        int limit = walkerLimit;
        List<UUID> order = walkers.keySet().stream().sorted().toList();
        for (int i = 0; i < order.size(); i++) {
            UUID uuid = order.get(i);
            Entity e = Bukkit.getEntity(uuid);
            // Nur, wo die Welt gerade läuft (am Rand der geladenen Gegend bleiben sie stehen).
            if (e == null || !e.isValid() || !e.isTicking()) {
                continue;
            }
            Walk walk = walkers.get(uuid);
            if (i < limit) {
                step(e, walk, look);
            } else {
                // Mehr Dorfleute als eingestellt: die übrigen stehen und schauen sich um wie die anderen Figuren.
                walk.gaze.home = e.getLocation().getYaw();
                gazeAround(e, walk.gaze, look);
            }
        }
        standing.forEach((uuid, gaze) -> {
            Entity e = Bukkit.getEntity(uuid);
            if (e != null && e.isValid() && e.isTicking()) {
                gazeAround(e, gaze, look);
            }
        });
        if (ticks % BUILD_CHECK_TICKS == 0) {
            sweepIfRebuilt();
        }
    }

    /**
     * Neu gebaut, während Figuren geladen waren? Dann die alten jetzt entfernen – die Figuren sind gegen Schaden
     * geschützt, und Minecrafts /kill erreicht nur, was gerade geladen ist.
     */
    private void sweepIfRebuilt() {
        String now = currentBuild();
        if (now == null || now.equals(sweptBuild)) {
            return;
        }
        sweptBuild = now;
        for (World w : Bukkit.getWorlds()) {
            w.getEntities().stream().filter(e -> outdated(e.getScoreboardTags())).forEach(this::adopt);
        }
    }

    /**
     * Ein Tick eines Dorfbewohners: stehen und schauen, sich auf der Stelle zum Ziel drehen oder einen Schritt gehen.
     * Gegangen wird nur geradeaus in Blickrichtung – so dreht Minecraft den Körper genau so, wie wir es für die Tracht
     * nachrechnen ({@link #bodyAfter}).
     */
    private void step(Entity e, Walk walk, boolean look) {
        Location cur = e.getLocation();
        if (walk.pause > 0) {
            walk.pause--;
            walk.gaze.home = cur.getYaw();
            gazeAround(e, walk.gaze, look);
            return;
        }
        if (walk.target == null) {
            walk.target = pickTarget(e, walk.home, cur);
            if (walk.target == null) {
                walk.pause = PAUSE_SHORT;
                return;
            }
        }
        Vector d = walk.target.toVector().subtract(cur.toVector()).setY(0);
        double dist = d.length();
        if (dist < ARRIVED) {
            arrive(walk);
            return;
        }
        float want = yawOf(d);
        float turn = wrap(want - cur.getYaw());
        if (Math.abs(turn) > TURN_STEP) {
            face(e, walk, cur.getYaw() + Math.signum(turn) * TURN_STEP);
            return;
        }
        double len = Math.min(walk.speed, dist);
        Location next = cur.clone().add(d.clone().normalize().multiply(len));
        next.setYaw(want);
        next.setPitch(0);
        if (!free(next)) {
            walk.target = null;
            walk.pause = PAUSE_SHORT;
            return;
        }
        if (crowded(e, cur, next)) {
            // Jemand steht im Weg: kurz warten (und ihn anschauen), nach ein paar Versuchen woanders hin.
            face(e, walk, want);
            walk.pause = BLOCKED_WAIT;
            if (++walk.blocked >= BLOCKED_GIVE_UP) {
                walk.target = null;
                walk.blocked = 0;
            }
            return;
        }
        walk.blocked = 0;
        // Mit der Tracht (Passagier) zusammen weiterziehen; Kopf und Blick gehen mit (Paper setzt beim Teleport auch
        // die Kopfdrehung). Die Tracht folgt dem Körper, nicht dem Kopf, damit Rock und Zöpfe am Körper bleiben.
        e.teleport(next, TeleportFlag.EntityState.RETAIN_PASSENGERS);
        HeadTurn.set(e, want, plugin);
        walk.gaze.reset(want);
        walk.body = bodyAfter(walk.body, want, len > MOVING);
        turnWith(e, walk.body);
    }

    private void arrive(Walk walk) {
        walk.target = null;
        walk.blocked = 0;
        walk.pause = PAUSE_MIN + rnd.nextInt(PAUSE_SPREAD);
    }

    /** Auf der Stelle drehen: Blick und Kopf sofort, der Körper erst, wenn der Kopf mehr als 50° voraus ist. */
    private void face(Entity e, Walk walk, float yaw) {
        e.setRotation(yaw, 0);
        HeadTurn.set(e, yaw, plugin);
        walk.gaze.reset(yaw);
        walk.body = bodyAfter(walk.body, yaw, false);
        turnWith(e, walk.body);
    }

    /** Wie Minecraft den Körper beim Laufen nachdreht: 30 % je Tick, nie mehr als 50° hinter der Blickrichtung. */
    static float followBody(float body, float yaw) {
        return bodyAfter(body, yaw, true);
    }

    /**
     * Körperdrehung nach einem Tick, wie Minecraft sie auf dem Bildschirm des Spielers rechnet: Wer sich bewegt
     * (mehr als 0,05 Blöcke), dreht den Körper um 30 % in die Laufrichtung; wer steht, behält ihn – außer der Kopf ist
     * mehr als 50° voraus, dann wird er mitgezogen.
     */
    static float bodyAfter(float body, float yaw, boolean moving) {
        float next = moving ? body + wrap(yaw - body) * BODY_FOLLOW : body;
        float behind = wrap(yaw - next);
        if (Math.abs(behind) > BODY_MAX_BEHIND) {
            next = yaw - Math.signum(behind) * BODY_MAX_BEHIND;
        }
        return wrap(next);
    }

    static float wrap(float degrees) {
        float d = degrees % 360;
        if (d >= 180) {
            return d - 360;
        }
        return d < -180 ? d + 360 : d;
    }

    /** Körper und Tracht (Anzeige-Objekt auf der Figur) schauen in dieselbe Richtung. */
    private static void turnWith(Entity e, float yaw) {
        if (e instanceof LivingEntity living) {
            living.setBodyYaw(yaw);
        }
        for (Entity passenger : e.getPassengers()) {
            if (passenger instanceof Display) {
                passenger.setRotation(yaw, 0);
            }
        }
    }

    /**
     * Platz aus dem Bau: beim ersten Mal am Wesen gemerkt. Ohne das zog jeder Neustart und jedes Nachladen der Gegend
     * den Platz dorthin, wo die Figur gerade stand – mit der Zeit wanderten sie aus ihrer Gasse.
     */
    private Location homeOf(Entity e) {
        var data = e.getPersistentDataContainer();
        Location now = e.getLocation();
        double[] saved = parseHome(data.get(homeKey, PersistentDataType.STRING));
        if (saved != null) {
            return new Location(now.getWorld(), saved[0], saved[1], saved[2], now.getYaw(), 0);
        }
        data.set(homeKey, PersistentDataType.STRING, now.getX() + ";" + now.getY() + ";" + now.getZ());
        return now.clone();
    }

    static double[] parseHome(String text) {
        if (text == null) {
            return null;
        }
        String[] parts = text.split(";");
        if (parts.length != 3) {
            return null;
        }
        try {
            return new double[] {Double.parseDouble(parts[0]), Double.parseDouble(parts[1]),
                    Double.parseDouble(parts[2])};
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    /** Ziel in der Nähe des Platzes, zu dem ein freier, ebener Weg führt und an dem niemand steht. */
    private Location pickTarget(Entity self, Location home, Location from) {
        for (int i = 0; i < TARGET_TRIES; i++) {
            double angle = rnd.nextDouble() * Math.PI * 2;
            double r = WANDER_MIN + rnd.nextDouble() * (WANDER_MAX - WANDER_MIN);
            Location to = home.clone().add(Math.cos(angle) * r, 0, Math.sin(angle) * r);
            to.setY(from.getY());
            if (clearPath(from, to) && !occupied(self, to)) {
                return to;
            }
        }
        return null;
    }

    private boolean clearPath(Location from, Location to) {
        Vector d = to.toVector().subtract(from.toVector()).setY(0);
        int steps = (int) Math.ceil(d.length() / PATH_STEP);
        for (int i = 1; i <= steps; i++) {
            if (!free(from.clone().add(d.clone().multiply((double) i / steps)))) {
                return false;
            }
        }
        return true;
    }

    /** Steht dort, wo wir hinwollen, schon jemand (eine Figur oder ein Spieler)? */
    private static boolean occupied(Entity self, Location to) {
        return !to.getWorld().getNearbyEntities(to, TARGET_APART, 1.5, TARGET_APART,
                o -> blocks(self, o) && flat(o.getLocation(), to) < TARGET_APART).isEmpty();
    }

    /** Käme der nächste Schritt jemandem zu nah? Wer schon zu nah steht, darf sich entfernen. */
    private static boolean crowded(Entity self, Location from, Location next) {
        return !next.getWorld().getNearbyEntities(next, KEEP_APART, 1.5, KEEP_APART, o -> {
            if (!blocks(self, o)) {
                return false;
            }
            double then = flat(o.getLocation(), next);
            return then < KEEP_APART && then < flat(o.getLocation(), from);
        }).isEmpty();
    }

    /** Figuren (auch sitzende) und Spieler stehen im Weg; Zuschauer, Sitze und Anzeigen nicht. */
    private static boolean blocks(Entity self, Entity o) {
        if (o == self || !(o instanceof LivingEntity) || o instanceof ArmorStand) {
            return false;
        }
        return !(o instanceof Player p) || p.getGameMode() != GameMode.SPECTATOR;
    }

    private static double flat(Location a, Location b) {
        return Math.hypot(a.getX() - b.getX(), a.getZ() - b.getZ());
    }

    /**
     * Platz für einen Menschen: Füße und Kopf frei (kein Wasser, kein Schild, keine Fahne, keine Fackel), fester Boden
     * darunter – auch an den Rändern des Körpers. Ungeladene Gegend gilt als zu (sonst würde sie nachgeladen).
     */
    private static boolean free(Location at) {
        double[][] corners = {{0, 0}, {BODY, BODY}, {-BODY, BODY}, {BODY, -BODY}, {-BODY, -BODY}};
        World w = at.getWorld();
        for (double[] c : corners) {
            double x = at.getX() + c[0];
            double z = at.getZ() + c[1];
            if (!w.isChunkLoaded((int) Math.floor(x) >> 4, (int) Math.floor(z) >> 4)) {
                return false;
            }
            Block feet = w.getBlockAt((int) Math.floor(x), (int) Math.floor(at.getY()), (int) Math.floor(z));
            Block below = feet.getRelative(BlockFace.DOWN);
            // Nicht unter tief hängende Zweige (z. B. unter den Christbaum im Winter) – der Kopf steckte darin.
            if (!walkable(feet) || !walkable(feet.getRelative(BlockFace.UP))
                    || Tag.LEAVES.isTagged(feet.getRelative(BlockFace.UP, 2).getType()) || !ground(below)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Fester, ebener Boden: ein (fast) voller Block oben bündig – auf einer halben Stufe, einem Zaun oder einer
     * Mauer stünde die Figur in der Luft bzw. obendrauf.
     */
    private static boolean ground(Block below) {
        if (below.isPassable() || below.isLiquid() || fenceLike(below.getType())) {
            return false;
        }
        double top = below.getBoundingBox().getMaxY() - below.getY();
        return top >= GROUND_MIN && top <= 1.0 + 1e-6;
    }

    static boolean fenceLike(Material m) {
        String name = m.name();
        return name.endsWith("_FENCE") || name.endsWith("_WALL") || name.endsWith("_FENCE_GATE");
    }

    private static boolean walkable(Block b) {
        if (!b.isPassable() || b.isLiquid()) {
            return false;
        }
        return !inTheWay(b.getType());
    }

    /** Ohne Kollision, aber man läuft trotzdem nicht hindurch (Schilder, Fahnen, Fackeln, hohe Pflanzen). */
    private static final java.util.Set<Material> IN_THE_WAY = java.util.EnumSet.of(Material.COBWEB,
            Material.SUGAR_CANE, Material.SWEET_BERRY_BUSH, Material.ROSE_BUSH, Material.LILAC, Material.PEONY,
            Material.SUNFLOWER);

    static boolean inTheWay(Material m) {
        String name = m.name();
        return IN_THE_WAY.contains(m) || name.endsWith("SIGN") || name.endsWith("BANNER") || name.endsWith("TORCH");
    }

    /**
     * Figuren schauen den nächsten Spieler an – nur mit dem Kopf (höchstens 60° zur Seite, wer dahinter steht, wird
     * nicht angeschaut). Der Körper bleibt, wie er steht: so sitzt die Tracht (Rock, Zöpfe) immer. Wohin, wird alle
     * paar Ticks neu bestimmt; gedreht wird jeden Tick ein Stück – so wandert der Kopf weich statt in Sprüngen.
     */
    private void gazeAround(Entity e, Gaze gaze, boolean aim) {
        if (e.isInsideVehicle()) {
            return;
        }
        if (aim) {
            aim(e, gaze);
        }
        float yaw = ease(gaze.yaw, gaze.wantYaw);
        float pitch = ease(gaze.pitch, gaze.wantPitch);
        boolean pitchChanged = Math.abs(pitch - gaze.pitch) > 0.01f;
        boolean yawChanged = Math.abs(wrap(yaw - gaze.yaw)) > 0.01f;
        Location at = e.getLocation();
        if (pitchChanged || Math.abs(wrap(at.getYaw() - gaze.home)) > 0.5f) {
            e.setRotation(gaze.home, pitch);
            yawChanged = true;
        }
        gaze.yaw = yaw;
        gaze.pitch = pitch;
        if (yawChanged) {
            HeadTurn.set(e, yaw, plugin);
        }
    }

    private static void aim(Entity e, Gaze gaze) {
        Location eye = e.getLocation().add(0, 1.62, 0);
        Player near = null;
        double best = LOOK_RANGE * LOOK_RANGE;
        for (Player p : e.getWorld().getPlayers()) {
            if (p.getGameMode() == GameMode.SPECTATOR) {
                continue;
            }
            double dd = p.getLocation().distanceSquared(e.getLocation());
            if (dd < best) {
                best = dd;
                near = p;
            }
        }
        gaze.wantYaw = gaze.home;
        gaze.wantPitch = 0;
        if (near != null) {
            Vector d = near.getEyeLocation().toVector().subtract(eye.toVector());
            float turn = wrap(yawOf(d) - gaze.home);
            if (Math.abs(turn) <= HEAD_TURN) {
                gaze.wantYaw = gaze.home + turn;
                float up = (float) -Math.toDegrees(Math.atan2(d.getY(), Math.hypot(d.getX(), d.getZ())));
                gaze.wantPitch = Math.max(-HEAD_PITCH, Math.min(HEAD_PITCH, up));
            }
        }
    }

    /** Ein Stück auf das Ziel zu: höchstens {@link #HEAD_STEP} Grad, zum Ende hin langsamer. */
    static float ease(float now, float want) {
        float d = wrap(want - now);
        if (Math.abs(d) < 0.5f) {
            return want;
        }
        float step = Math.min(HEAD_STEP, Math.max(0.5f, Math.abs(d) * HEAD_EASE));
        return now + Math.signum(d) * step;
    }

    private static float yawOf(Vector d) {
        return (float) Math.toDegrees(Math.atan2(-d.getX(), d.getZ()));
    }

    /**
     * Nur den Kopf einer Figur drehen. Die Bukkit-Schnittstelle dreht immer Körper und Kopf zusammen
     * ({@code setRotation}); Minecraft selbst kennt die Kopfdrehung getrennt ({@code setYHeadRot}). Klappt das nicht
     * (andere Server-Fassung), schauen die Figuren eben geradeaus – die Tracht sitzt trotzdem.
     */
    static final class HeadTurn {
        private static volatile boolean works = true;
        private static Class<?> forClass;
        private static java.lang.reflect.Method handle;
        private static java.lang.reflect.Method headRot;

        private HeadTurn() {
        }

        static synchronized void set(Entity e, float yaw, JavaPlugin plugin) {
            if (!works) {
                return;
            }
            try {
                if (forClass != e.getClass()) {
                    handle = e.getClass().getMethod("getHandle");
                    Object nms = handle.invoke(e);
                    headRot = nms.getClass().getMethod("setYHeadRot", float.class);
                    forClass = e.getClass();
                }
                headRot.invoke(handle.invoke(e), yaw);
            } catch (ReflectiveOperationException | RuntimeException ex) {
                works = false;
                plugin.getLogger().warning("Lobby: Figuren können den Kopf nicht allein drehen (" + ex
                        + ") – sie schauen geradeaus.");
            }
        }
    }
}
