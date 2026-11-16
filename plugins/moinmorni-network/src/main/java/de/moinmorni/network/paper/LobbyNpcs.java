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
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.Location;
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
import org.bukkit.util.Vector;

/**
 * Lobby: Figuren mit dem Tag {@code mm_mode_<id>} bringen beim Anklicken in ihren Modus. Über ihrem Kopf stehen Name,
 * Spielerzahl und Zustand – je Sprache ein eigenes Schild, jeder Spieler sieht nur seins. Dorfleute mit dem Tag
 * {@code mm_walker} laufen gemütlich um ihren Platz herum, stehende Figuren schauen Spieler in der Nähe an.
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
    private static final double LABEL_UP = 2.15;
    private static final int LABEL_SHADE = 64;
    private static final long CLICK_COOLDOWN_MS = 1500;
    private static final double LOOK_RANGE = 6;
    private static final int LOOK_EVERY_TICKS = 5;
    /** Alle zwei Sekunden nachsehen, ob die Lobby neu gebaut wurde (dann alte Wesen wegräumen). */
    private static final int BUILD_CHECK_TICKS = 40;
    /** Blöcke pro Tick: etwa 1,8 Blöcke pro Sekunde – gemütliches Schlendern. */
    private static final double WALK_SPEED = 0.09;
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
        Location target;
        int pause;

        Walk(Location home, int pause) {
            this.home = home;
            this.pause = pause;
        }
    }

    private final JavaPlugin plugin;
    private final HubClient hub;
    private final Function<Player, String> langOf;
    private final Map<String, ModeInfo> modes = new ConcurrentHashMap<>();
    /** Figur → Sprache → Schild. */
    private final Map<UUID, Map<String, TextDisplay>> labels = new HashMap<>();
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
            byLang.forEach((lang, label) -> {
                if (label.isValid()) {
                    label.text(labelText(id, lang));
                }
            });
        });
    }

    private Component labelText(String id, String lang) {
        boolean en = "en".equals(lang);
        ModeInfo m = id == null ? null : modes.get(id);
        if (m == null) {
            return Component.text(id == null ? "…" : id, NamedTextColor.GOLD, TextDecoration.BOLD);
        }
        Component name = Component.text(en ? m.nameEn() : m.nameDe(), NamedTextColor.GOLD, TextDecoration.BOLD);
        Component state;
        Component hint = null;
        boolean soon = "soon".equals(m.state()) || !m.hasServer();
        if ("off".equals(m.state())) {
            state = Component.text(en ? "● Closed" : "● Geschlossen", NamedTextColor.RED);
        } else if (soon) {
            state = Component.text(en ? "○ Coming soon" : "○ Bald", NamedTextColor.GRAY);
        } else if ("maintenance".equals(m.state())) {
            state = Component.text(en ? "⚒ Maintenance" : "⚒ Wartung", NamedTextColor.GOLD);
        } else if (m.paused()) {
            state = Component.text(en ? "☀ Summer break" : "☀ Sommerpause", NamedTextColor.YELLOW);
        } else if (!m.awake()) {
            state = Component.text(en ? "☾ Asleep – click to wake" : "☾ Schläft – Klick weckt", NamedTextColor.AQUA);
        } else {
            String unit = en ? (m.players() == 1 ? " player" : " players") : " Spieler";
            state = Component.text("● " + m.players() + unit, NamedTextColor.GREEN);
        }
        if (m.paused()) {
            hint = Component.text(en ? "Click to look around the village" : "Klick: Dorf anschauen", NamedTextColor.GRAY,
                    TextDecoration.ITALIC);
        } else if (!"off".equals(m.state()) && !soon) {
            hint = "whitelist".equals(m.access())
                    ? Component.text(en ? "Invitation only" : "Nur auf Einladung", NamedTextColor.LIGHT_PURPLE)
                    : Component.text(en ? "Click to play" : "Klick: Mitspielen", NamedTextColor.GRAY,
                            TextDecoration.ITALIC);
        }
        Component text = name.append(Component.newline()).append(state);
        return hint == null ? text : text.append(Component.newline()).append(hint);
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
            Map<String, TextDisplay> have = labels.get(e.getUniqueId());
            if (have == null || have.values().stream().anyMatch(l -> !l.isValid())) {
                addLabels(e, id);
            }
        });
        if (tags.contains(WALKER_TAG)) {
            walkers.putIfAbsent(e.getUniqueId(), new Walk(e.getLocation(), rnd.nextInt(PAUSE_SPREAD)));
        } else if (!e.isInsideVehicle()) {
            standing.putIfAbsent(e.getUniqueId(), e.getLocation().getYaw());
        }
    }

    private void addLabels(Entity npc, String id) {
        removeLabels(npc.getUniqueId());
        Location at = npc.getLocation().add(0, LABEL_UP, 0);
        Map<String, TextDisplay> byLang = new HashMap<>();
        for (String lang : LANGS) {
            TextDisplay label = npc.getWorld().spawn(at, TextDisplay.class, d -> {
                d.setPersistent(false);
                d.setVisibleByDefault(false);
                d.setBillboard(Display.Billboard.CENTER);
                d.setShadowed(true);
                d.setBackgroundColor(Color.fromARGB(LABEL_SHADE, 0, 0, 0));
                d.addScoreboardTag(LABEL_TAG);
                d.text(labelText(id, lang));
            });
            byLang.put(lang, label);
        }
        labels.put(npc.getUniqueId(), byLang);
        Bukkit.getOnlinePlayers().forEach(this::showLabels);
    }

    private void removeLabels(UUID npc) {
        Map<String, TextDisplay> old = labels.remove(npc);
        if (old != null) {
            old.values().forEach(Entity::remove);
        }
    }

    /** Jeder sieht das Schild in seiner Sprache. */
    void showLabels(Player p) {
        String mine = "en".equals(langOf.apply(p)) ? "en" : "de";
        labels.values().forEach(byLang -> byLang.forEach((lang, label) -> {
            if (lang.equals(mine)) {
                p.showEntity(plugin, label);
            } else {
                p.hideEntity(plugin, label);
            }
        }));
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
            play(event.getPlayer(), id);
        });
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onHit(EntityDamageByEntityEvent event) {
        if (!event.getEntity().getScoreboardTags().contains(NPC_TAG)) {
            return;
        }
        event.setCancelled(true);
        if (event.getDamager() instanceof Player p) {
            modeOf(event.getEntity()).ifPresent(id -> play(p, id));
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


    void play(Player p, String id) {
        long now = System.currentTimeMillis();
        Long last = lastClick.get(p.getUniqueId());
        if (last != null && now - last < CLICK_COOLDOWN_MS) {
            return;
        }
        lastClick.put(p.getUniqueId(), now);
        boolean en = "en".equals(langOf.apply(p));
        if (hub == null || !hub.ready()) {
            p.sendMessage(Component.text(en
                    ? "The network can't be reached right now – please try again in a moment."
                    : "Das Netzwerk ist gerade nicht erreichbar – versuch es gleich nochmal.", NamedTextColor.RED));
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "play");
        body.addProperty("uuid", p.getUniqueId().toString());
        body.addProperty("mode", id);
        hub.send(body);
        p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, 0.6f, 1.4f);
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
        Location next = cur.clone().add(d.clone().normalize().multiply(Math.min(WALK_SPEED, dist)));
        next.setYaw(yawOf(d));
        next.setPitch(0);
        if (!free(next)) {
            walk.target = null;
            walk.pause = PAUSE_SHORT;
            return;
        }
        // Mit der Tracht (Passagier) zusammen weiterziehen und sie in Laufrichtung drehen.
        e.teleport(next, TeleportFlag.EntityState.RETAIN_PASSENGERS);
        turnWith(e, next.getYaw());
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
        if (near == null) {
            if (Math.abs(e.getLocation().getYaw() - homeYaw) > 1) {
                e.setRotation(homeYaw, 0);
                turnWith(e, homeYaw);
            }
            return;
        }
        Vector d = near.getEyeLocation().toVector().subtract(eye.toVector());
        float pitch = (float) -Math.toDegrees(Math.atan2(d.getY(), Math.hypot(d.getX(), d.getZ())));
        float yaw = yawOf(d);
        e.setRotation(yaw, pitch);
        turnWith(e, yaw);
    }

    private static float yawOf(Vector d) {
        return (float) Math.toDegrees(Math.atan2(-d.getX(), d.getZ()));
    }
}
