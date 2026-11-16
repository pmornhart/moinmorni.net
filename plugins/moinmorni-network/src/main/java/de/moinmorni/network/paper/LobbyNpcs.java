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
import org.bukkit.Color;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.BlockFace;
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
    private static final float STATE_SCALE = 0.72f;
    private static final float HINT_SCALE = 0.55f;
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
    /** Alle zwei Sekunden nachsehen, ob die Lobby neu gebaut wurde (dann alte Wesen wegräumen). */
    private static final int BUILD_CHECK_TICKS = 40;
    /** Blöcke pro Tick: etwa 1,8 Blöcke pro Sekunde – gemütliches Schlendern (im Rock 1,2). */
    private static final double WALK_SPEED = 0.09;
    private static final double WALK_SPEED_ROCK = 0.06;
    /** So schnell folgt der Körper der Laufrichtung (wie Minecraft selbst: 30 % je Tick, höchstens 50° hinter dem Kopf). */
    private static final float BODY_FOLLOW = 0.3f;
    private static final float BODY_MAX_BEHIND = 50;
    private static final double WANDER_MIN = 2;
    private static final double WANDER_MAX = 8;
    private static final int TARGET_TRIES = 6;
    private static final double PATH_STEP = 0.5;
    private static final double BODY = 0.3;
    private static final double ARRIVED = 0.15;
    private static final int PAUSE_SHORT = 20;
    private static final int PAUSE_MIN = 60;
    private static final int PAUSE_SPREAD = 160;

    /**
     * Ein Modus, wie die Lobby ihn zeigt. {@code phase} = was der Modus selbst zuletzt gemeldet hat; „closed“ heißt
     * Pause (Wintersport im Sommer): man darf trotzdem hin und sich umschauen.
     */
    record ModeInfo(String id, String nameDe, String nameEn, String state, String access, int players,
                    boolean hasServer, boolean awake, String icon, String phase) {
        boolean paused() {
            return "on".equals(state) && hasServer && "closed".equals(phase);
        }
    }

    private static final class Walk {
        final Location home;
        final double speed;
        Location target;
        int pause;
        /** Wohin der Körper schaut (Minecraft dreht ihn beim Laufen langsam nach) – die Tracht folgt ihm. */
        float body;

        Walk(Location home, double speed, int pause) {
            this.home = home;
            this.speed = speed;
            this.pause = pause;
            this.body = home.getYaw();
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
    private final HubClient hub;
    private final Function<Player, String> langOf;
    private final Map<String, ModeInfo> modes = new ConcurrentHashMap<>();
    /** Figur → Sprache → Schild (drei Zeilen). */
    private final Map<UUID, Map<String, Label>> labels = new HashMap<>();
    /** Figur → Farbe ihres Modus (aus dem Tag {@code mm_tint_<rrggbb>}). */
    private final Map<UUID, TextColor> tints = new HashMap<>();
    private final Map<UUID, Walk> walkers = new HashMap<>();
    /** Stehende Figuren und ihre Blickrichtung aus dem Bau. */
    private final Map<UUID, Float> standing = new HashMap<>();
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

    LobbyNpcs(JavaPlugin plugin, HubClient hub, Function<Player, String> langOf) {
        this.plugin = plugin;
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
                    HubClient.str(o, "phase")));
        }
        modes.clear();
        modes.putAll(fresh);
        order = list.asList().stream().map(el -> HubClient.str(el.getAsJsonObject(), "id")).toList();
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
        } else if (m.paused()) {
            state = Component.text(en ? "☀ Summer break" : "☀ Sommerpause", NamedTextColor.YELLOW);
        } else if (!m.awake()) {
            state = Component.text(en ? "☾ Asleep – click to wake" : "☾ schläft – Klick weckt", NamedTextColor.AQUA);
        } else {
            state = Component.text("● " + m.players() + playing(m.players(), en), NamedTextColor.GREEN);
        }
        if (m.paused()) {
            hint = Component.text(en ? "Right-click to look around" : "Rechtsklick: Dorf anschauen", HINT_GREY);
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
        return tags.contains(LOBBY_TAG) || OLD_LOBBY_TAGS.stream().anyMatch(tags::contains);
    }

    /** Wesen aus einem älteren Lobby-Bau? (Ohne Bau-Version gilt alles.) */
    private boolean outdated(java.util.Set<String> tags) {
        String current = currentBuild();
        return current != null && fromLobbyBuild(tags) && !tags.contains(BUILD_PREFIX + current);
    }

    private void adopt(Entity e) {
        var tags = e.getScoreboardTags();
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
            double speed = tags.contains(ROCK_TAG) ? WALK_SPEED_ROCK : WALK_SPEED;
            walkers.putIfAbsent(e.getUniqueId(), new Walk(e.getLocation(), speed, rnd.nextInt(PAUSE_SPREAD)));
        } else if (!e.isInsideVehicle() && !standing.containsKey(e.getUniqueId())) {
            // Der Körper bleibt, wie er gebaut wurde; nur der Kopf schaut sich um (die Tracht sitzt so immer).
            float yaw = e.getLocation().getYaw();
            standing.put(e.getUniqueId(), yaw);
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
        if (!fromLobbyBuild(tags) && !tags.contains(WORLD_LABEL_TAG) && !tags.contains("mm_season")) {
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

    /** Modi mit Zahlen in der Reihenfolge des Panels (für das Kompass-Menü). */
    List<ModeInfo> orderedModes() {
        return order.stream().map(modes::get).filter(java.util.Objects::nonNull).toList();
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
        int limit = walkerLimit;
        walkers.keySet().stream().sorted().limit(limit).forEach(uuid -> {
            Entity e = Bukkit.getEntity(uuid);
            if (e != null && e.isValid()) {
                step(e, walkers.get(uuid));
            }
        });
        if (ticks % LOOK_EVERY_TICKS == 0) {
            standing.forEach(this::lookAround);
        }
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

    private void step(Entity e, Walk walk) {
        if (walk.pause > 0) {
            walk.pause--;
            return;
        }
        Location cur = e.getLocation();
        if (walk.target == null) {
            walk.target = pickTarget(walk.home, cur);
            if (walk.target == null) {
                walk.pause = PAUSE_SHORT;
                return;
            }
        }
        Vector d = walk.target.toVector().subtract(cur.toVector()).setY(0);
        double dist = d.length();
        if (dist < ARRIVED) {
            walk.target = null;
            walk.pause = PAUSE_MIN + rnd.nextInt(PAUSE_SPREAD);
            return;
        }
        Location next = cur.clone().add(d.clone().normalize().multiply(Math.min(walk.speed, dist)));
        float yaw = yawOf(d);
        next.setYaw(yaw);
        next.setPitch(0);
        if (!free(next)) {
            walk.target = null;
            walk.pause = PAUSE_SHORT;
            return;
        }
        // Mit der Tracht (Passagier) zusammen weiterziehen. Den Körper dreht Minecraft langsam in die Laufrichtung –
        // die Tracht folgt ihm genauso (nicht dem Kopf), damit Rock und Zöpfe am Körper bleiben.
        e.teleport(next, TeleportFlag.EntityState.RETAIN_PASSENGERS);
        walk.body = followBody(walk.body, yaw);
        turnWith(e, walk.body);
    }

    /** Wie Minecraft den Körper beim Laufen nachdreht: 30 % je Tick, nie mehr als 50° hinter der Blickrichtung. */
    static float followBody(float body, float yaw) {
        float next = body + wrap(yaw - body) * BODY_FOLLOW;
        float behind = wrap(yaw - next);
        if (Math.abs(behind) > BODY_MAX_BEHIND) {
            next = yaw - Math.signum(behind) * BODY_MAX_BEHIND;
        }
        return next;
    }

    private static float wrap(float degrees) {
        float d = degrees % 360;
        if (d >= 180) {
            return d - 360;
        }
        return d < -180 ? d + 360 : d;
    }

    /** Körper und Tracht (Anzeige-Objekt auf der Figur) schauen in dieselbe Richtung wie der Kopf. */
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

    /** Ziel in der Nähe des Platzes, zu dem ein freier, ebener Weg führt. */
    private Location pickTarget(Location home, Location from) {
        for (int i = 0; i < TARGET_TRIES; i++) {
            double angle = rnd.nextDouble() * Math.PI * 2;
            double r = WANDER_MIN + rnd.nextDouble() * (WANDER_MAX - WANDER_MIN);
            Location to = home.clone().add(Math.cos(angle) * r, 0, Math.sin(angle) * r);
            if (clearPath(from, to)) {
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

    /** Platz für einen Menschen: Füße und Kopf frei, fester Boden darunter – auch an den Rändern des Körpers. */
    private static boolean free(Location at) {
        double[][] corners = {{0, 0}, {BODY, BODY}, {-BODY, BODY}, {BODY, -BODY}, {-BODY, -BODY}};
        for (double[] c : corners) {
            Block feet = at.clone().add(c[0], 0, c[1]).getBlock();
            Block below = feet.getRelative(BlockFace.DOWN);
            if (!feet.isPassable() || !feet.getRelative(BlockFace.UP).isPassable()
                    || below.isPassable() || below.isLiquid()) {
                return false;
            }
        }
        return true;
    }

    /**
     * Stehende Figuren schauen den nächsten Spieler an – nur mit dem Kopf (höchstens 60° zur Seite, wer dahinter
     * steht, wird nicht angeschaut). Der Körper bleibt, wie er gebaut wurde: so sitzt die Tracht (Rock, Zöpfe) immer.
     */
    private void lookAround(UUID uuid, float homeYaw) {
        Entity e = Bukkit.getEntity(uuid);
        if (e == null || !e.isValid() || e.isInsideVehicle()) {
            return;
        }
        Location eye = e.getLocation().add(0, 1.62, 0);
        Player near = null;
        double best = LOOK_RANGE * LOOK_RANGE;
        for (Player p : e.getWorld().getPlayers()) {
            double dd = p.getLocation().distanceSquared(e.getLocation());
            if (dd < best) {
                best = dd;
                near = p;
            }
        }
        float head = homeYaw;
        float pitch = 0;
        if (near != null) {
            Vector d = near.getEyeLocation().toVector().subtract(eye.toVector());
            float turn = wrap(yawOf(d) - homeYaw);
            if (Math.abs(turn) <= HEAD_TURN) {
                head = homeYaw + turn;
                float up = (float) -Math.toDegrees(Math.atan2(d.getY(), Math.hypot(d.getX(), d.getZ())));
                pitch = Math.max(-HEAD_PITCH, Math.min(HEAD_PITCH, up));
            }
        }
        Location at = e.getLocation();
        if (Math.abs(wrap(at.getYaw() - homeYaw)) > 0.5f || Math.abs(at.getPitch() - pitch) > 0.5f) {
            e.setRotation(homeYaw, pitch);
        }
        HeadTurn.set(e, head, plugin);
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
