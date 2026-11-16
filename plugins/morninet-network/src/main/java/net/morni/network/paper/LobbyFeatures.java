package net.morni.network.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.morni.network.common.DataFolder;
import net.morni.network.common.HubClient;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import net.kyori.adventure.bossbar.BossBar;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Display;
import org.bukkit.entity.Player;
import org.bukkit.entity.TextDisplay;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.entity.FoodLevelChangeEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerSwapHandItemsEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Vector;

/**
 * Die Lobby selbst (nur auf dem Server, dem der Hub {@code lobby-settings} schickt): Ankunft am Dorfplatz mit
 * Begrüßung, Ankündigungs-Leiste, Kompass-Menü mit allen Modi, Launchpads, Parkour mit Zeitmessung und Bestenliste,
 * Rundgang für neue Spieler, Schutz (nichts abbauen, kein Schaden, kein Hunger, aus der Leere zurück zum Platz).
 * Alles kommt aus dem Panel (Lobby-Einstellungen) bzw. aus dem Bauplan der Lobby (feste Punkte).
 */
final class LobbyFeatures implements Listener {

    record Point(int x, int y, int z) {
    }

    record View(double x, double y, double z, float yaw, float pitch) {
    }

    record Pad(int x, int y, int z, Vector push) {
    }

    record Stop(View view, String titleDe, String titleEn, String textDe, String textEn) {
    }

    record Settings(String title, String subtitle, boolean tour, List<String> announcements, int announcementSeconds,
                    String season, boolean launchpads, boolean parkour, int walkers, View spawn, List<Pad> pads,
                    List<Point> course, Set<Integer> checkpoints, List<Stop> stops) {
    }

    /** Laufender Parkour-Versuch. */
    private static final class Run {
        final long startNanos = System.nanoTime();
        int checkpoint;
    }

    private static final String ITEM_KEY = "lobby_item";
    private static final String MENU = "menu";
    private static final String TOUR_ITEM = "tour";
    private static final int MENU_SLOT = 0;
    private static final int TOUR_SLOT = 8;
    /** Kompass-Menü: Rand oben und unten, je Reihe bis zu sieben Modi in der Mitte (Spalten 1 … 7). */
    private static final int MENU_COLUMNS = 9;
    private static final int MENU_PER_ROW = 7;
    private static final int MENU_MAX_ROWS = 6;
    private static final long TICKS_PER_SECOND = 20L;
    private static final long WELCOME_DELAY = 20L;
    private static final long TOUR_DELAY = 60L;
    private static final long TOUR_STEP = 140L;
    private static final Duration FADE_IN = Duration.ofMillis(500);
    private static final Duration STAY = Duration.ofMillis(5500);
    private static final Duration FADE_OUT = Duration.ofMillis(1000);
    private static final long PAD_COOLDOWN_MS = 1500;
    private static final double PAD_REACH = 1.6;
    private static final int VOID_Y = 20;
    private static final int FALL_BELOW_CHECKPOINT = 4;
    private static final double COURSE_LEAVE = 30;
    private static final double HOLO_UP = 3.4;
    private static final int TOP_HOLO = 5;
    private static final long HOLO_CHECK = 200L;
    private static final int TOP_LIST = 10;
    private static final long NANOS_PER_MILLI = 1_000_000L;
    private static final long MILLIS_PER_SECOND = 1000L;
    private static final long SECONDS_PER_MINUTE = 60L;
    private static final int MAX_FOOD = 20;
    private static final float FULL = 1f;

    private final JavaPlugin plugin;
    private final LobbyNpcs npcs;
    private final Function<Player, String> langOf;
    private final NamespacedKey itemKey;
    private final Path dataDir;
    private volatile Settings settings;
    private boolean commandsRegistered;

    private final BossBar bar = BossBar.bossBar(Component.empty(), FULL, BossBar.Color.GREEN, BossBar.Overlay.PROGRESS);
    private BukkitTask barTask;
    private int barIndex;
    private int barSecond;

    private final Map<UUID, Run> runs = new HashMap<>();
    private final Map<UUID, Long> padUsed = new HashMap<>();
    private final Map<UUID, BukkitTask> tours = new HashMap<>();
    private final Set<UUID> seen = ConcurrentHashMap.newKeySet();
    private final Map<Long, Integer> courseIndex = new HashMap<>();
    private YamlConfiguration parkourData;
    private TextDisplay holo;

    /** Sitzt jemand im Gefängnis? Dann gibt es kein Menü, keinen Rundgang, keinen Parkour (setzt {@link LobbyJail}). */
    private java.util.function.Predicate<UUID> jailed = id -> false;

    LobbyFeatures(JavaPlugin plugin, LobbyNpcs npcs, Function<Player, String> langOf) {
        this.plugin = plugin;
        this.npcs = npcs;
        this.langOf = langOf;
        this.itemKey = new NamespacedKey(plugin, ITEM_KEY);
        this.dataDir = DataFolder.in(plugin.getDataFolder().toPath().getParent());
    }

    void setJail(java.util.function.Predicate<UUID> jailed) {
        this.jailed = jailed;
    }

    /** Fürs Einsperren: Rundgang und Parkour-Lauf beenden. */
    void stopActivities(Player p) {
        BukkitTask task = tours.remove(p.getUniqueId());
        if (task != null) {
            task.cancel();
        }
        runs.remove(p.getUniqueId());
        p.hideBossBar(bar);
    }

    /** Nach dem Gefängnis: zurück auf den Dorfplatz, Kompass und Buch wieder in die Hand. */
    void welcomeBack(Player p) {
        if (!p.isOnline()) {
            return;
        }
        p.setGameMode(GameMode.ADVENTURE);
        if (!active()) {
            return;
        }
        toSpawn(p);
        equip(p);
        if (!settings.announcements().isEmpty()) {
            p.showBossBar(bar);
        }
    }

    void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        loadSeen();
        parkourData = YamlConfiguration.loadConfiguration(dataDir.resolve("parkour.yml").toFile());
        Bukkit.getScheduler().runTaskTimer(plugin, this::tickRuns, 2L, 2L);
        // Die Bestenliste kommt, sobald der Start geladen ist (nicht persistent – nach Neustart/Entladen neu).
        Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            if (active() && settings.parkour() && (holo == null || !holo.isValid())) {
                refreshHolo();
            }
        }, HOLO_CHECK, HOLO_CHECK);
    }

    private boolean active() {
        return settings != null;
    }

    private boolean en(Player p) {
        return "en".equals(langOf.apply(p));
    }

    private Component text(Player p, String de, String enText, NamedTextColor colour) {
        return Component.text(en(p) ? enText : de, colour);
    }

    // ---------- Einstellungen vom Hub ----------

    /** Hub-Thread: Einstellungen lesen, auf dem Hauptthread anwenden. */
    void onSettings(JsonObject m) {
        JsonObject welcome = m.getAsJsonObject("welcome");
        JsonObject features = m.getAsJsonObject("features");
        JsonObject spawn = features.getAsJsonObject("spawn");
        List<Pad> pads = new ArrayList<>();
        for (JsonElement el : features.getAsJsonArray("launchpads")) {
            JsonObject o = el.getAsJsonObject();
            JsonArray push = o.getAsJsonArray("push");
            pads.add(new Pad(o.get("x").getAsInt(), o.get("y").getAsInt(), o.get("z").getAsInt(),
                    new Vector(push.get(0).getAsDouble(), push.get(1).getAsDouble(), push.get(2).getAsDouble())));
        }
        JsonObject parkour = features.getAsJsonObject("parkour");
        List<Point> course = new ArrayList<>();
        for (JsonElement el : parkour.getAsJsonArray("blocks")) {
            JsonObject o = el.getAsJsonObject();
            course.add(new Point(o.get("x").getAsInt(), o.get("y").getAsInt(), o.get("z").getAsInt()));
        }
        Set<Integer> checkpoints = new HashSet<>();
        for (JsonElement el : parkour.getAsJsonArray("checkpoints")) {
            checkpoints.add(el.getAsInt());
        }
        List<Stop> stops = new ArrayList<>();
        for (JsonElement el : features.getAsJsonArray("tour")) {
            JsonObject o = el.getAsJsonObject();
            stops.add(new Stop(view(o), HubClient.str(o.getAsJsonObject("title"), "de"),
                    HubClient.str(o.getAsJsonObject("title"), "en"), HubClient.str(o.getAsJsonObject("text"), "de"),
                    HubClient.str(o.getAsJsonObject("text"), "en")));
        }
        List<String> announcements = new ArrayList<>();
        for (JsonElement el : m.getAsJsonArray("announcements")) {
            announcements.add(el.getAsString());
        }
        Settings next = new Settings(HubClient.str(welcome, "title"), HubClient.str(welcome, "subtitle"),
                m.get("tour").getAsBoolean(), announcements, Math.max(1, m.get("announcementSeconds").getAsInt()),
                HubClient.str(m, "season"), m.get("launchpads").getAsBoolean(), m.get("parkour").getAsBoolean(),
                m.get("walkers").getAsInt(), view(spawn), pads, course, checkpoints, stops);
        Bukkit.getScheduler().runTask(plugin, () -> apply(next));
    }

    private static View view(JsonObject o) {
        return new View(o.get("x").getAsDouble(), o.get("y").getAsDouble(), o.get("z").getAsDouble(),
                o.get("yaw").getAsFloat(), o.get("pitch").getAsFloat());
    }

    private void apply(Settings next) {
        boolean first = settings == null;
        settings = next;
        courseIndex.clear();
        for (int i = 0; i < next.course().size(); i++) {
            Point b = next.course().get(i);
            courseIndex.put(key(b.x(), b.y(), b.z()), i);
        }
        npcs.configure(next.season(), next.walkers());
        restartBar();
        refreshHolo();
        if (first) {
            registerCommands();
            Bukkit.getOnlinePlayers().forEach(this::equip);
        }
    }

    private static long key(int x, int y, int z) {
        return ((long) x & 0x3FFFFFFL) << 38 | ((long) z & 0x3FFFFFFL) << 12 | ((long) y & 0xFFFL);
    }

    // ---------- Ankündigungen ----------

    private void restartBar() {
        if (barTask != null) {
            barTask.cancel();
        }
        Settings s = settings;
        if (s == null || s.announcements().isEmpty()) {
            Bukkit.getOnlinePlayers().forEach(p -> p.hideBossBar(bar));
            return;
        }
        barIndex = 0;
        barSecond = 0;
        updateBar();
        Bukkit.getOnlinePlayers().forEach(p -> p.showBossBar(bar));
        barTask = Bukkit.getScheduler().runTaskTimer(plugin, this::stepBar, TICKS_PER_SECOND, TICKS_PER_SECOND);
    }

    private void stepBar() {
        Settings s = settings;
        if (s == null || s.announcements().isEmpty()) {
            return;
        }
        barSecond++;
        if (barSecond >= s.announcementSeconds()) {
            barSecond = 0;
            barIndex = (barIndex + 1) % s.announcements().size();
        }
        updateBar();
    }

    private void updateBar() {
        Settings s = settings;
        String line = s.announcements().get(barIndex % s.announcements().size());
        bar.name(Component.text(line, NamedTextColor.WHITE));
        bar.progress(Math.max(0f, FULL - (float) barSecond / s.announcementSeconds()));
    }

    // ---------- Ankunft ----------

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        if (!active()) {
            return;
        }
        Player p = event.getPlayer();
        if (jailed.test(p.getUniqueId())) {
            return;
        }
        Bukkit.getScheduler().runTask(plugin, () -> {
            toSpawn(p);
            equip(p);
            if (!settings.announcements().isEmpty()) {
                p.showBossBar(bar);
            }
        });
        Bukkit.getScheduler().runTaskLater(plugin, () -> welcome(p), WELCOME_DELAY);
        boolean newcomer = seen.add(p.getUniqueId());
        if (newcomer) {
            saveSeen(p.getUniqueId());
            if (settings.tour()) {
                Bukkit.getScheduler().runTaskLater(plugin, () -> startTour(p), TOUR_DELAY);
            }
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        runs.remove(id);
        padUsed.remove(id);
        BukkitTask tour = tours.remove(id);
        if (tour != null) {
            tour.cancel();
        }
    }

    private void toSpawn(Player p) {
        View v = settings.spawn();
        World w = Bukkit.getWorlds().get(0);
        p.teleport(new Location(w, v.x(), v.y(), v.z(), v.yaw(), v.pitch()));
        p.setFallDistance(0);
    }

    private void welcome(Player p) {
        if (!p.isOnline() || !active() || tours.containsKey(p.getUniqueId())) {
            return;
        }
        p.showTitle(Title.title(Component.text(settings.title(), NamedTextColor.GOLD, TextDecoration.BOLD),
                Component.text(settings.subtitle(), NamedTextColor.YELLOW),
                Title.Times.times(FADE_IN, STAY, FADE_OUT)));
    }

    /** Kompass (Spielmodi) und Buch (Rundgang) in die Leiste. */
    private void equip(Player p) {
        if (!active() || p.getGameMode() == GameMode.CREATIVE) {
            return;
        }
        p.getInventory().clear();
        p.getInventory().setItem(MENU_SLOT, item(Material.COMPASS, MENU,
                text(p, "Spielmodi", "Game modes", NamedTextColor.GOLD),
                text(p, "Rechtsklick: alle Modi auf einen Blick", "Right-click: all modes at a glance", NamedTextColor.GRAY)));
        p.getInventory().setItem(TOUR_SLOT, item(Material.WRITABLE_BOOK, TOUR_ITEM,
                text(p, "Rundgang", "Tour", NamedTextColor.AQUA),
                text(p, "Rechtsklick: kurze Führung durchs Dorf", "Right-click: a short tour of the village", NamedTextColor.GRAY)));
    }

    private ItemStack item(Material material, String id, Component name, Component lore) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(name.decoration(TextDecoration.ITALIC, false));
        meta.lore(List.of(lore.decoration(TextDecoration.ITALIC, false)));
        meta.getPersistentDataContainer().set(itemKey, PersistentDataType.STRING, id);
        stack.setItemMeta(meta);
        return stack;
    }

    private String lobbyItem(ItemStack stack) {
        if (stack == null || !stack.hasItemMeta()) {
            return null;
        }
        return stack.getItemMeta().getPersistentDataContainer().get(itemKey, PersistentDataType.STRING);
    }

    // ---------- Kompass-Menü ----------

    private static final class MenuHolder implements InventoryHolder {
        /** Platz im Fenster → Modus. */
        final java.util.Map<Integer, String> ids = new java.util.HashMap<>();
        Inventory inventory;

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    private void openMenu(Player p) {
        MenuHolder holder = new MenuHolder();
        List<LobbyNpcs.ModeInfo> modes = npcs.orderedModes();
        int rows = Math.max(1, Math.min(MENU_MAX_ROWS - 2, (modes.size() + MENU_PER_ROW - 1) / MENU_PER_ROW));
        Inventory inv = Bukkit.createInventory(holder, (rows + 2) * MENU_COLUMNS,
                text(p, "Spielmodi", "Game modes", NamedTextColor.DARK_GREEN));
        holder.inventory = inv;
        for (int i = 0; i < modes.size() && i < rows * MENU_PER_ROW; i++) {
            int row = i / MENU_PER_ROW;
            int inRow = Math.min(MENU_PER_ROW, modes.size() - row * MENU_PER_ROW);
            // Jede Reihe mittig: eine kurze letzte Reihe rückt zur Mitte.
            int column = 1 + (MENU_PER_ROW - inRow) / 2 + i % MENU_PER_ROW;
            int slot = (row + 1) * MENU_COLUMNS + column;
            holder.ids.put(slot, modes.get(i).id());
            inv.setItem(slot, modeItem(p, modes.get(i)));
        }
        // Freie Plätze: grüne und graue Scheiben als Rahmen (ohne Namen, ohne Wirkung).
        ItemStack frame = pane(Material.GREEN_STAINED_GLASS_PANE);
        ItemStack inside = pane(Material.GRAY_STAINED_GLASS_PANE);
        for (int slot = 0; slot < inv.getSize(); slot++) {
            if (inv.getItem(slot) == null) {
                boolean edge = slot < MENU_COLUMNS || slot >= inv.getSize() - MENU_COLUMNS
                        || slot % MENU_COLUMNS == 0 || slot % MENU_COLUMNS == MENU_COLUMNS - 1;
                inv.setItem(slot, edge ? frame : inside);
            }
        }
        p.openInventory(inv);
    }

    private static ItemStack pane(Material material) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(Component.empty());
        meta.setHideTooltip(true);
        stack.setItemMeta(meta);
        return stack;
    }

    private ItemStack modeItem(Player p, LobbyNpcs.ModeInfo m) {
        boolean english = en(p);
        boolean soon = "soon".equals(m.state()) || !m.hasServer();
        boolean open = !"off".equals(m.state()) && !soon && !"maintenance".equals(m.state());
        Component state;
        if (m.paused()) {
            state = Component.text(english ? "Summer break – the village is open to look around"
                    : "Sommerpause – das Dorf ist zum Anschauen offen", NamedTextColor.YELLOW);
        } else if ("off".equals(m.state())) {
            state = Component.text(english ? "Closed" : "Geschlossen", NamedTextColor.RED);
        } else if (soon) {
            state = Component.text(english ? "Coming soon" : "Bald", NamedTextColor.GRAY);
        } else if ("maintenance".equals(m.state())) {
            state = Component.text(english ? "Maintenance" : "Wartung", NamedTextColor.GOLD);
        } else if (!m.awake()) {
            state = Component.text(english ? "Asleep – click to wake" : "Schläft – Klick weckt", NamedTextColor.AQUA);
        } else {
            state = Component.text("● " + m.players() + (english ? " playing" : " spielen gerade"), NamedTextColor.GREEN);
        }
        // Eigenes Symbol pro Modus (vom Hub); geschlossene Modi grau.
        Material icon = m.icon() == null ? null : Material.matchMaterial(m.icon());
        Material material = !open ? Material.GRAY_DYE : icon != null && icon.isItem() ? icon : Material.COMPASS;
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(Component.text(english ? m.nameEn() : m.nameDe(), open ? NamedTextColor.GOLD : NamedTextColor.GRAY,
                TextDecoration.BOLD).decoration(TextDecoration.ITALIC, false));
        List<Component> lore = new ArrayList<>();
        lore.add(state.decoration(TextDecoration.ITALIC, false));
        if ("whitelist".equals(m.access())) {
            lore.add(Component.text(english ? "Invitation only" : "Nur auf Einladung", NamedTextColor.LIGHT_PURPLE)
                    .decoration(TextDecoration.ITALIC, false));
        }
        if (open) {
            lore.add(Component.empty());
            lore.add(Component.text(m.paused() ? (english ? "▶ Click to look around" : "▶ Klick: Dorf anschauen")
                            : english ? "▶ Click to play" : "▶ Klick: Mitspielen", NamedTextColor.YELLOW)
                    .decoration(TextDecoration.ITALIC, false));
        }
        meta.lore(lore);
        // Wo gerade jemand spielt, glänzt das Symbol.
        meta.setEnchantmentGlintOverride(open && m.awake() && m.players() > 0);
        meta.addItemFlags(ItemFlag.values());
        stack.setItemMeta(meta);
        return stack;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onMenuClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player p)) {
            return;
        }
        if (event.getInventory().getHolder() instanceof MenuHolder holder) {
            event.setCancelled(true);
            String id = holder.ids.get(event.getRawSlot());
            if (id != null) {
                p.closeInventory();
                npcs.play(p, id);
            }
            return;
        }
        if (active() && p.getGameMode() != GameMode.CREATIVE) {
            event.setCancelled(true);
        }
    }

    // ---------- Gegenstände benutzen, Launchpads, Schutz ----------

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (!active()) {
            return;
        }
        Player p = event.getPlayer();
        Block block = event.getClickedBlock();
        if (event.getAction() == Action.PHYSICAL) {
            if (block != null && block.getType() == Material.LIGHT_WEIGHTED_PRESSURE_PLATE) {
                launch(p, block);
            }
            return;
        }
        if (event.getHand() != EquipmentSlot.HAND) {
            return;
        }
        String id = lobbyItem(event.getItem());
        if (MENU.equals(id)) {
            event.setCancelled(true);
            openMenu(p);
            return;
        }
        if (TOUR_ITEM.equals(id)) {
            event.setCancelled(true);
            startTour(p);
            return;
        }
        if (event.getAction() == Action.RIGHT_CLICK_BLOCK && block != null && !allowedUse(block.getType())
                && p.getGameMode() != GameMode.CREATIVE) {
            event.setCancelled(true);
        }
    }

    /** Türen, Falltüren, Tore und Knöpfe darf jeder benutzen; Kisten, Öfen, Betten, Kuchen usw. nicht. */
    private static boolean allowedUse(Material type) {
        String name = type.name();
        return !type.isInteractable() || name.endsWith("_DOOR") || name.endsWith("_TRAPDOOR")
                || name.endsWith("_FENCE_GATE") || name.endsWith("_BUTTON");
    }

    private void launch(Player p, Block plate) {
        Settings s = settings;
        if (!s.launchpads() || jailed.test(p.getUniqueId())) {
            return;
        }
        long now = System.currentTimeMillis();
        Long last = padUsed.get(p.getUniqueId());
        if (last != null && now - last < PAD_COOLDOWN_MS) {
            return;
        }
        for (Pad pad : s.pads()) {
            boolean near = Math.abs(plate.getX() - pad.x()) <= PAD_REACH && Math.abs(plate.getZ() - pad.z()) <= PAD_REACH
                    && plate.getY() == pad.y() + 1;
            if (near) {
                padUsed.put(p.getUniqueId(), now);
                p.setVelocity(pad.push());
                p.playSound(p.getLocation(), Sound.ENTITY_FIREWORK_ROCKET_LAUNCH, 1f, 1f);
                return;
            }
        }
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onBreak(BlockBreakEvent event) {
        if (active() && !builder(event.getPlayer())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onPlace(BlockPlaceEvent event) {
        if (active() && !builder(event.getPlayer())) {
            event.setCancelled(true);
        }
    }

    /** Wer in der Lobby bauen darf: nur das Team im Kreativmodus mit Rechten des Servers. */
    private static boolean builder(Player p) {
        return p.getGameMode() == GameMode.CREATIVE && p.isOp();
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onDamage(EntityDamageEvent event) {
        if (!active() || !(event.getEntity() instanceof Player p)) {
            return;
        }
        event.setCancelled(true);
        if (event.getCause() == EntityDamageEvent.DamageCause.VOID) {
            Bukkit.getScheduler().runTask(plugin, () -> toSpawn(p));
        }
    }

    @EventHandler
    public void onHunger(FoodLevelChangeEvent event) {
        if (active()) {
            event.setCancelled(true);
            event.getEntity().setFoodLevel(MAX_FOOD);
        }
    }

    @EventHandler
    public void onDrop(PlayerDropItemEvent event) {
        if (active() && event.getPlayer().getGameMode() != GameMode.CREATIVE) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onPickup(EntityPickupItemEvent event) {
        if (active() && event.getEntity() instanceof Player p && p.getGameMode() != GameMode.CREATIVE) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onSwap(PlayerSwapHandItemsEvent event) {
        if (active() && event.getPlayer().getGameMode() != GameMode.CREATIVE) {
            event.setCancelled(true);
        }
    }

    // ---------- Parkour ----------

    @EventHandler(ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        if (!active()) {
            return;
        }
        Location to = event.getTo();
        Player p = event.getPlayer();
        if (jailed.test(p.getUniqueId())) {
            return;
        }
        if (to.getY() < VOID_Y) {
            toSpawn(p);
            return;
        }
        if (!settings.parkour() || tours.containsKey(p.getUniqueId())) {
            return;
        }
        Location from = event.getFrom();
        boolean sameBlock = from.getBlockX() == to.getBlockX() && from.getBlockY() == to.getBlockY()
                && from.getBlockZ() == to.getBlockZ();
        Run run = runs.get(p.getUniqueId());
        if (run != null && fellOff(p, to, run)) {
            return;
        }
        if (sameBlock || !p.isOnGround()) {
            return;
        }
        Block under = to.clone().subtract(0, 0.2, 0).getBlock();
        Integer index = courseIndex.get(key(under.getX(), under.getY(), under.getZ()));
        if (index == null) {
            return;
        }
        int goal = settings.course().size() - 1;
        if (index == 0) {
            if (run == null) {
                p.sendActionBar(text(p, "Los geht's!", "Go!", NamedTextColor.GREEN));
                p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, 1f, 1.5f);
            }
            runs.put(p.getUniqueId(), new Run());
            return;
        }
        if (run == null) {
            return;
        }
        if (index == goal) {
            finish(p, run);
            return;
        }
        if (settings.checkpoints().contains(index) && index > run.checkpoint) {
            run.checkpoint = index;
            int number = new ArrayList<>(settings.checkpoints()).stream().sorted().toList().indexOf(index) + 1;
            p.sendMessage(text(p, "Kontrollpunkt " + number + " – " + clock(elapsed(run)),
                    "Checkpoint " + number + " – " + clock(elapsed(run)), NamedTextColor.GOLD));
            p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_BELL, 1f, 1.2f);
        }
    }

    /** Runtergefallen: zurück auf den letzten Kontrollpunkt; zu weit weg: Versuch vorbei. */
    private boolean fellOff(Player p, Location to, Run run) {
        Point back = settings.course().get(run.checkpoint);
        if (to.getY() < back.y() - FALL_BELOW_CHECKPOINT) {
            Location spot = new Location(to.getWorld(), back.x() + 0.5, back.y() + 1, back.z() + 0.5, to.getYaw(), to.getPitch());
            Bukkit.getScheduler().runTask(plugin, () -> {
                p.teleport(spot);
                p.setFallDistance(0);
            });
            p.sendActionBar(text(p, "Zurück zum Kontrollpunkt", "Back to the checkpoint", NamedTextColor.YELLOW));
            return true;
        }
        Point start = settings.course().get(0);
        if (to.toVector().distance(new Vector(start.x(), start.y(), start.z())) > COURSE_LEAVE) {
            runs.remove(p.getUniqueId());
            p.sendActionBar(text(p, "Parkour abgebrochen", "Parkour cancelled", NamedTextColor.GRAY));
            return true;
        }
        return false;
    }

    private static long elapsed(Run run) {
        return (System.nanoTime() - run.startNanos) / NANOS_PER_MILLI;
    }

    private static String clock(long ms) {
        long seconds = ms / MILLIS_PER_SECOND;
        return String.format("%d:%02d,%02d", seconds / SECONDS_PER_MINUTE, seconds % SECONDS_PER_MINUTE,
                (ms % MILLIS_PER_SECOND) / 10);
    }

    private void tickRuns() {
        runs.forEach((id, run) -> {
            Player p = Bukkit.getPlayer(id);
            if (p != null) {
                p.sendActionBar(Component.text("⏱ " + clock(elapsed(run)), NamedTextColor.AQUA));
            }
        });
    }

    private void finish(Player p, Run run) {
        long ms = elapsed(run);
        runs.remove(p.getUniqueId());
        String path = "best." + p.getUniqueId();
        long before = parkourData.getLong(path + ".ms", Long.MAX_VALUE);
        boolean best = ms < before;
        long record = bestOverall();
        if (best) {
            parkourData.set(path + ".ms", ms);
            parkourData.set(path + ".name", p.getName());
            try {
                Files.createDirectories(dataDir);
                parkourData.save(dataDir.resolve("parkour.yml").toFile());
            } catch (IOException ex) {
                plugin.getLogger().warning("Parkour-Bestenliste ließ sich nicht speichern: " + ex.getMessage());
            }
            refreshHolo();
        }
        p.showTitle(Title.title(text(p, "Geschafft!", "Done!", NamedTextColor.GOLD),
                Component.text(clock(ms), NamedTextColor.AQUA), Title.Times.times(FADE_IN, STAY, FADE_OUT)));
        p.playSound(p.getLocation(), Sound.UI_TOAST_CHALLENGE_COMPLETE, 1f, 1f);
        if (best) {
            p.sendMessage(text(p, "Neue persönliche Bestzeit: " + clock(ms), "New personal best: " + clock(ms), NamedTextColor.GREEN));
        }
        if (ms < record) {
            Bukkit.getOnlinePlayers().forEach(o -> o.sendMessage(text(o,
                    "★ " + p.getName() + " hat den Parkour-Rekord geknackt: " + clock(ms),
                    "★ " + p.getName() + " set a new parkour record: " + clock(ms), NamedTextColor.GOLD)));
        }
    }

    private long bestOverall() {
        return top().stream().mapToLong(Map.Entry::getValue).min().orElse(Long.MAX_VALUE);
    }

    /** Bestenliste: Name → Bestzeit (ms), schnellste zuerst. */
    private List<Map.Entry<String, Long>> top() {
        var section = parkourData.getConfigurationSection("best");
        if (section == null) {
            return List.of();
        }
        return section.getKeys(false).stream()
                .map(k -> Map.entry(section.getString(k + ".name", "?"), section.getLong(k + ".ms")))
                .sorted(Comparator.comparingLong(Map.Entry::getValue))
                .toList();
    }

    /** Bestenliste schwebt über dem Start. */
    private void refreshHolo() {
        Settings s = settings;
        if (holo != null && holo.isValid()) {
            holo.remove();
        }
        holo = null;
        if (s == null || !s.parkour() || s.course().isEmpty()) {
            return;
        }
        Point start = s.course().get(0);
        World w = Bukkit.getWorlds().get(0);
        Location at = new Location(w, start.x() + 0.5, start.y() + HOLO_UP, start.z() + 0.5);
        if (!at.isChunkLoaded()) {
            return;
        }
        Component text = Component.text("Parkour · Top " + TOP_HOLO + "\n", NamedTextColor.GOLD, TextDecoration.BOLD);
        List<Map.Entry<String, Long>> list = top();
        for (int i = 0; i < Math.min(TOP_HOLO, list.size()); i++) {
            text = text.append(Component.text((i + 1) + ". " + list.get(i).getKey() + "  " + clock(list.get(i).getValue()) + "\n",
                    NamedTextColor.WHITE).decoration(TextDecoration.BOLD, false));
        }
        Component content = text;
        holo = w.spawn(at, TextDisplay.class, d -> {
            d.setPersistent(false);
            d.setBillboard(Display.Billboard.CENTER);
            d.setShadowed(true);
            d.text(content);
        });
    }

    // ---------- Rundgang ----------

    private void startTour(Player p) {
        Settings s = settings;
        if (s == null || s.stops().isEmpty() || tours.containsKey(p.getUniqueId()) || jailed.test(p.getUniqueId())) {
            return;
        }
        runs.remove(p.getUniqueId());
        p.setGameMode(GameMode.SPECTATOR);
        int[] step = {0};
        BukkitTask task = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            if (!p.isOnline()) {
                stopTour(p, false);
                return;
            }
            if (step[0] >= s.stops().size()) {
                stopTour(p, true);
                return;
            }
            Stop stop = s.stops().get(step[0]++);
            View v = stop.view();
            p.teleport(new Location(p.getWorld(), v.x(), v.y(), v.z(), v.yaw(), v.pitch()));
            boolean english = en(p);
            p.showTitle(Title.title(Component.text(english ? stop.titleEn() : stop.titleDe(), NamedTextColor.GOLD),
                    Component.text(english ? stop.textEn() : stop.textDe(), NamedTextColor.WHITE),
                    Title.Times.times(FADE_IN, STAY, FADE_OUT)));
            p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_CHIME, 0.7f, 1.2f);
        }, 0L, TOUR_STEP);
        tours.put(p.getUniqueId(), task);
    }

    private void stopTour(Player p, boolean done) {
        BukkitTask task = tours.remove(p.getUniqueId());
        if (task != null) {
            task.cancel();
        }
        if (!p.isOnline()) {
            return;
        }
        p.setGameMode(GameMode.ADVENTURE);
        toSpawn(p);
        equip(p);
        if (done) {
            p.sendMessage(text(p, "Das war der Rundgang – viel Spaß! Mit dem Buch oder /rundgang kannst du ihn wiederholen.",
                    "That was the tour – have fun! Use the book or /tour to watch it again.", NamedTextColor.GREEN));
        }
    }

    // ---------- Befehle (nur in der Lobby angemeldet) ----------

    private void registerCommands() {
        if (commandsRegistered) {
            return;
        }
        commandsRegistered = true;
        Bukkit.getCommandMap().register(DataFolder.NAME, new Command("rundgang", "Rundgang durchs Dorf", "/rundgang [stop]", List.of("tour")) {
            @Override
            public boolean execute(CommandSender sender, String label, String[] args) {
                if (sender instanceof Player p) {
                    if (args.length > 0 && "stop".equalsIgnoreCase(args[0])) {
                        stopTour(p, false);
                    } else {
                        startTour(p);
                    }
                }
                return true;
            }

            @Override
            public List<String> tabComplete(CommandSender sender, String alias, String[] args) {
                return args.length == 1 ? List.of("stop") : List.of();
            }
        });
        Bukkit.getCommandMap().register(DataFolder.NAME, new Command("parkour", "Parkour-Bestenliste", "/parkour [start]", List.of()) {
            @Override
            public boolean execute(CommandSender sender, String label, String[] args) {
                if (!(sender instanceof Player p) || !active()) {
                    return true;
                }
                if (args.length > 0 && ("start".equalsIgnoreCase(args[0]) || "neu".equalsIgnoreCase(args[0]))) {
                    Point start = settings.course().get(0);
                    runs.remove(p.getUniqueId());
                    p.teleport(new Location(p.getWorld(), start.x() + 0.5, start.y() + 1, start.z() + 0.5));
                    return true;
                }
                List<Map.Entry<String, Long>> list = top();
                p.sendMessage(text(p, "Parkour – Bestenliste", "Parkour – leaderboard", NamedTextColor.GOLD));
                for (int i = 0; i < Math.min(TOP_LIST, list.size()); i++) {
                    p.sendMessage(Component.text((i + 1) + ". " + list.get(i).getKey() + " – " + clock(list.get(i).getValue()),
                            NamedTextColor.WHITE));
                }
                long mine = parkourData.getLong("best." + p.getUniqueId() + ".ms", -1);
                p.sendMessage(mine < 0
                        ? text(p, "Du hast noch keine Zeit – /parkour start", "No time yet – /parkour start", NamedTextColor.GRAY)
                        : text(p, "Deine Bestzeit: " + clock(mine), "Your best: " + clock(mine), NamedTextColor.AQUA));
                return true;
            }

            @Override
            public List<String> tabComplete(CommandSender sender, String alias, String[] args) {
                return args.length == 1 ? List.of("start") : List.of();
            }
        });
        Bukkit.getOnlinePlayers().forEach(Player::updateCommands);
    }

    // ---------- Wer schon da war (für den Rundgang) ----------

    private void loadSeen() {
        Path file = dataDir.resolve("lobby-seen.txt");
        try {
            if (Files.isRegularFile(file)) {
                Files.readAllLines(file).stream().map(String::trim).filter(l -> !l.isEmpty())
                        .forEach(l -> seen.add(UUID.fromString(l)));
            }
        } catch (IOException | IllegalArgumentException ex) {
            plugin.getLogger().warning("Liste der Besucher ließ sich nicht lesen: " + ex.getMessage());
        }
    }

    private void saveSeen(UUID id) {
        try {
            Files.createDirectories(dataDir);
            Files.writeString(dataDir.resolve("lobby-seen.txt"), id + "\n", StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException ex) {
            plugin.getLogger().warning("Besucher ließ sich nicht merken: " + ex.getMessage());
        }
    }
}
