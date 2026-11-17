package de.moinmorni.network.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
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
import org.bukkit.entity.Player;
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
 * Begrüßung, Ankündigungs-Leiste, Kompass-Menü mit allen Modi, Launchpads, Jump and Run ({@link LobbyJump}),
 * Doppelsprung ({@link LobbyDoubleJump}), Rundgang für neue Spieler, Schutz (nichts abbauen, kein Schaden, kein Hunger,
 * aus der Leere zurück zum Platz). Alles kommt aus dem Panel (Lobby-Einstellungen) bzw. aus dem Bauplan der Lobby
 * (feste Punkte).
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
                    String season, boolean launchpads, int walkers, View spawn, List<Pad> pads, List<Stop> stops) {
    }

    private static final String ITEM_KEY = "lobby_item";
    private static final String MENU = "menu";
    private static final String TOUR_ITEM = "tour";
    /** Feder „Jump and Run“ – im Lauf „Lauf beenden“, bei geschlossenem Jump and Run grau. */
    static final String JUMP_ITEM = "jumpandrun";
    /** Eintrag im Kompass-Menü (keine Modus-Kennung beginnt mit #). */
    private static final String MENU_JUMP = "#jumpandrun";
    private static final int MENU_SLOT = 0;
    /** Gleich neben dem Kompass (Platz 4 hat das Angebot „Zurück ins Spiel“, Platz 8 das Buch). */
    static final int JUMP_SLOT = 1;
    /** Ein Rechtsklick gilt nur einmal (Java schickt bei manchen Klicks zwei Ereignisse). */
    private static final long ITEM_PAUSE_MS = 400;
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

    private final Map<UUID, Long> padUsed = new HashMap<>();
    private final Map<UUID, Long> itemUsed = new HashMap<>();
    private final Map<UUID, BukkitTask> tours = new HashMap<>();
    private final Set<UUID> seen = ConcurrentHashMap.newKeySet();
    /** Jump and Run hoch über dem Dorf und Doppelsprung überall. */
    private final LobbyJump jump;
    private final LobbyDoubleJump doubleJump;

    /** Sitzt jemand im Gefängnis? Dann kein Menü, kein Rundgang, kein Jump and Run (setzt {@link LobbyJail}). */
    private java.util.function.Predicate<UUID> jailed = id -> false;
    /** Wer in der Lobby bauen darf (Rang-Recht „Lobby bearbeiten“) – OPs immer. */
    private java.util.function.Predicate<Player> editors = p -> false;

    LobbyFeatures(JavaPlugin plugin, LobbyNpcs npcs, Function<Player, String> langOf) {
        this.plugin = plugin;
        this.npcs = npcs;
        this.langOf = langOf;
        this.itemKey = new NamespacedKey(plugin, ITEM_KEY);
        this.dataDir = plugin.getDataFolder().toPath().getParent().resolve("moinmorni");
        this.jump = new LobbyJump(plugin, langOf, id -> jailed.test(id) || tours.containsKey(id), dataDir);
        this.doubleJump = new LobbyDoubleJump(plugin,
                p -> jailed.test(p.getUniqueId()) || tours.containsKey(p.getUniqueId()),
                p -> jump.running(p.getUniqueId()), langOf, dataDir);
        this.jump.setChanged(this::equipJump);
    }

    /** Wer in der Lobby fliegen darf (Rang-Recht „In der Lobby fliegen“, ab VIP). */
    void setFlyers(java.util.function.Predicate<Player> flyers) {
        doubleJump.setFlyers(flyers);
    }

    /** Werte des Jump and Run an den Hub (Statistik „lobby“). */
    void setHub(java.util.function.Consumer<JsonObject> toHub) {
        jump.setHub(toHub);
    }

    void setEditors(java.util.function.Predicate<Player> editors) {
        this.editors = editors;
    }

    void setJail(java.util.function.Predicate<UUID> jailed) {
        this.jailed = jailed;
    }

    /** Macht diese Person gerade den Rundgang? (Die Lobbymusik spielt dann leiser.) */
    boolean inTour(UUID id) {
        return tours.containsKey(id);
    }

    /** Ist diese Person gerade im Jump and Run? (Die Lobbymusik spielt dann leiser.) */
    boolean inJumpRun(UUID id) {
        return jump.running(id);
    }

    /** Fürs Einsperren: Rundgang und Jump and Run beenden. */
    void stopActivities(Player p) {
        BukkitTask task = tours.remove(p.getUniqueId());
        if (task != null) {
            task.cancel();
        }
        jump.stop(p);
        p.hideBossBar(bar);
    }

    /**
     * Nach dem Gefängnis: zurück auf den Dorfplatz, Kompass und Buch wieder in die Hand. false = die Lobby-Einstellungen
     * sind noch nicht da (dann bringt das Gefängnis selbst den Spieler an den Spawn der Welt).
     */
    boolean welcomeBack(Player p) {
        if (!p.isOnline()) {
            return true;
        }
        p.setGameMode(GameMode.ADVENTURE);
        if (!active()) {
            return false;
        }
        toSpawn(p);
        equip(p);
        if (!settings.announcements().isEmpty()) {
            p.showBossBar(bar);
        }
        return true;
    }

    void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        loadSeen();
        jump.start();
        doubleJump.start();
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
                HubClient.str(m, "season"), m.get("launchpads").getAsBoolean(), m.get("walkers").getAsInt(),
                view(spawn), pads, stops);
        Bukkit.getScheduler().runTask(plugin, () -> apply(next));
        jump.onSettings(m);
        doubleJump.onSettings(m);
    }

    private static View view(JsonObject o) {
        return new View(o.get("x").getAsDouble(), o.get("y").getAsDouble(), o.get("z").getAsDouble(),
                o.get("yaw").getAsFloat(), o.get("pitch").getAsFloat());
    }

    private void apply(Settings next) {
        boolean first = settings == null;
        settings = next;
        npcs.configure(next.season(), next.walkers());
        restartBar();
        if (first) {
            registerCommands();
            Bukkit.getOnlinePlayers().forEach(this::equip);
        }
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
        padUsed.remove(id);
        itemUsed.remove(id);
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
        equipJump(p);
    }

    /** Was der Gegenstand „Jump and Run“ gerade ist. */
    enum JumpLook { NONE, START, STOP, CLOSED }

    /** Rein (ohne Server, getestet): Panel-Schalter und Lauf → Aussehen des Gegenstands. */
    static JumpLook jumpLook(boolean ready, boolean itemOn, boolean open, boolean running) {
        if (running) {
            return JumpLook.STOP;
        }
        if (!ready || !itemOn) {
            return JumpLook.NONE;
        }
        return open ? JumpLook.START : JumpLook.CLOSED;
    }

    /** Nur den Platz des Jump-and-Run-Gegenstands neu belegen (Lauf fängt an/endet, Panel ändert sich). */
    private void equipJump(Player p) {
        if (!active() || !p.isOnline() || p.getGameMode() == GameMode.CREATIVE || p.getGameMode() == GameMode.SPECTATOR
                || jailed.test(p.getUniqueId())) {
            return;
        }
        JumpLook look = jumpLook(jump.ready(), jump.itemOn(), jump.open(), jump.running(p.getUniqueId()));
        ItemStack stack = switch (look) {
            case NONE -> null;
            case START -> item(Material.FEATHER, JUMP_ITEM,
                    text(p, "Jump and Run", "Jump and run", NamedTextColor.GOLD).decorate(TextDecoration.BOLD),
                    text(p, "Rechtsklick: sofort hoch über dem Dorf loslegen", "Right-click: start high above the village",
                            NamedTextColor.GRAY));
            case STOP -> item(Material.BARRIER, JUMP_ITEM,
                    text(p, "Lauf beenden", "End run", NamedTextColor.RED).decorate(TextDecoration.BOLD),
                    text(p, "Rechtsklick: zurück dorthin, wo du losgelegt hast", "Right-click: back to where you started",
                            NamedTextColor.GRAY));
            case CLOSED -> item(Material.GRAY_DYE, JUMP_ITEM,
                    text(p, "Jump and Run – geschlossen", "Jump and run – closed", NamedTextColor.GRAY),
                    text(p, "Das Team hat es gerade ausgeschaltet", "The team has switched it off for now",
                            NamedTextColor.DARK_GRAY));
        };
        ItemStack before = p.getInventory().getItem(JUMP_SLOT);
        // Nur unseren Platz anfassen – liegt dort etwas anderes (sollte nicht vorkommen), bleibt es.
        if (before != null && !before.getType().isAir() && !JUMP_ITEM.equals(lobbyItem(before))) {
            return;
        }
        p.getInventory().setItem(JUMP_SLOT, stack);
    }

    /** Gegenstand oder Kompass-Menü: Lauf starten bzw. beenden. */
    private void useJump(Player p) {
        long now = System.currentTimeMillis();
        Long last = itemUsed.get(p.getUniqueId());
        if (last != null && now - last < ITEM_PAUSE_MS) {
            return;
        }
        itemUsed.put(p.getUniqueId(), now);
        // Erst im nächsten Tick: Ein Teleport mitten im Klick auf einen Block ließ den echten Client sofort fallen
        // (der Server verarbeitete danach noch Bewegungen von unten) – mit dem Befehl /jnr geschah das nie.
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (!p.isOnline()) {
                return;
            }
            if (jump.running(p.getUniqueId())) {
                jump.stopByItem(p);
            } else {
                jump.begin(p, true);
            }
        });
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
        // Unten in der Mitte des Rahmens: Jump and Run (sofort hoch über dem Dorf).
        if (jump.ready()) {
            int slot = inv.getSize() - MENU_COLUMNS / 2 - 1;
            holder.ids.put(slot, MENU_JUMP);
            inv.setItem(slot, jumpMenuItem(p));
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

    private ItemStack jumpMenuItem(Player p) {
        boolean open = jump.open();
        ItemStack stack = new ItemStack(open ? Material.FEATHER : Material.GRAY_DYE);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(text(p, "Jump and Run", "Jump and run", open ? NamedTextColor.GOLD : NamedTextColor.GRAY)
                .decorate(TextDecoration.BOLD).decoration(TextDecoration.ITALIC, false));
        List<Component> lore = new ArrayList<>();
        lore.add(text(p, "Hoch über dem Dorf von Block zu Block", "High above the village, from block to block",
                NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false));
        lore.add(Component.empty());
        lore.add((open ? text(p, "▶ Klick: sofort loslegen", "▶ Click to start right away", NamedTextColor.YELLOW)
                : text(p, "Gerade geschlossen", "Closed right now", NamedTextColor.RED)).decoration(TextDecoration.ITALIC, false));
        meta.lore(lore);
        meta.addItemFlags(ItemFlag.values());
        stack.setItemMeta(meta);
        return stack;
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
        boolean open = !"off".equals(m.state()) && !soon && !"maintenance".equals(m.state()) && !m.closedNow();
        Component state;
        if ("off".equals(m.state())) {
            state = Component.text(english ? "Closed" : "Geschlossen", NamedTextColor.RED);
        } else if (soon) {
            state = Component.text(english ? "Coming soon" : "Bald", NamedTextColor.GRAY);
        } else if ("maintenance".equals(m.state())) {
            state = Component.text(english ? "Maintenance" : "Wartung", NamedTextColor.GOLD);
        } else if (m.summerBreak()) {
            state = Component.text(english ? "Summer break – the village is open to look around"
                    : "Sommerpause – das Dorf ist zum Anschauen offen", NamedTextColor.YELLOW);
        } else if (m.winterBreak()) {
            state = Component.text(english ? "Winter break – the village is open to look around"
                    : "Winterpause – das Dorf ist zum Anschauen offen", NamedTextColor.AQUA);
        } else if (m.closedNow()) {
            state = Component.text(english ? "Closed right now – back in a moment" : "Gerade geschlossen – gleich wieder offen",
                    NamedTextColor.GOLD);
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
            lore.add(Component.text(m.seasonBreak() ? (english ? "▶ Click to look around" : "▶ Klick: Dorf anschauen")
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
            if (MENU_JUMP.equals(id)) {
                p.closeInventory();
                useJump(p);
            } else if (id != null) {
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


    /** Blöcke, die ein Rechtsklick mit der Hand öffnet (Türen, Tore, Falltüren außer Eisen). */
    static boolean opensByHand(Block block) {
        if (block == null) {
            return false;
        }
        String name = block.getType().name();
        return !name.startsWith("IRON_")
                && (name.endsWith("_DOOR") || name.endsWith("_FENCE_GATE") || name.endsWith("_TRAPDOOR"));
    }

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
        // Rechtsklick auf eine Tür, ein Tor oder eine Falltür öffnet sie – auch mit Kompass oder Rundgang in der Hand.
        if (id != null && event.getAction() == Action.RIGHT_CLICK_BLOCK && opensByHand(block)) {
            return;
        }
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
        if (JUMP_ITEM.equals(id)) {
            event.setCancelled(true);
            if (event.getAction() == Action.RIGHT_CLICK_AIR || event.getAction() == Action.RIGHT_CLICK_BLOCK) {
                useJump(p);
            }
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

    /** Wer in der Lobby bauen darf: nur im Kreativmodus, mit dem Rang-Recht „Lobby bearbeiten“ (oder als OP). */
    private boolean builder(Player p) {
        return p.getGameMode() == GameMode.CREATIVE && (p.isOp() || editors.test(p));
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

    // ---------- Aus der Welt gefallen ----------

    @EventHandler(ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        if (!active()) {
            return;
        }
        Player p = event.getPlayer();
        if (!jailed.test(p.getUniqueId()) && event.getTo().getY() < VOID_Y) {
            toSpawn(p);
        }
    }

    // ---------- Rundgang ----------

    private void startTour(Player p) {
        Settings s = settings;
        if (s == null || s.stops().isEmpty() || tours.containsKey(p.getUniqueId()) || jailed.test(p.getUniqueId())) {
            return;
        }
        jump.stop(p);
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
        Bukkit.getCommandMap().register("moinmorni", new Command("rundgang", "Rundgang durchs Dorf", "/rundgang [stop]", List.of("tour")) {
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
