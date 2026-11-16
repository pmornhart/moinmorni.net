package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BooleanSupplier;
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
import org.bukkit.attribute.Attribute;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Entity;
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
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerSwapHandItemsEvent;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Die Wartungs-Lobby (nur auf dem Server „wartung“): Hier wartet, wer gerade nicht in die Lobby kann (Neustart,
 * Absturz) oder während der Wartung des Netzwerks nicht hinein darf. Eine Leiste oben sagt, wie es steht („Lobby
 * startet gerade neu …“, „Wartung bis ca. 22:30“, Countdown zurück in die Lobby), der Aushang zeigt den Text aus dem
 * Panel, ein kleiner Sprung-Parcours vertreibt die Zeit. Den Stand schickt der Hub ({@code wartung}); ist er weg,
 * steht das in der Leiste. Zurück in die Lobby schickt der Hub (nach dem Countdown) – oder man klickt den Kompass.
 */
final class WartungLobby implements Listener {

    /** Was der Hub zuletzt gemeldet hat. */
    private record State(boolean lobby, boolean maintenance, String message, String until, boolean returnAuto,
                         long returnAt, Location spawn) {
    }

    private static final String ITEM_KEY = "wartung_item";
    private static final String TO_LOBBY = "lobby";
    private static final int LOBBY_SLOT = 8;
    private static final String TEXT_TAG = "mm_wartung_text";
    /** Recht „Kommt immer rein“ (darf auch während der Wartung überall hin). */
    private static final String ALWAYS_IN = "maintenance-join";
    private static final long TICK = 20L;
    private static final long PARKOUR_TICK = 2L;
    private static final int VOID_Y = 40;
    /** Unter dieser Höhe steht man wieder auf der Wiese (Parcours vorbei). */
    private static final double GROUND_Y = 65.2;
    private static final double START_REACH = 2.5;
    private static final long NANOS_PER_MILLI = 1_000_000L;
    private static final long MILLIS_PER_SECOND = 1000L;
    private static final int RETURN_SECONDS = 10;
    private static final long CLICK_COOLDOWN_MS = 2000;
    private static final Duration FADE_IN = Duration.ofMillis(300);
    private static final Duration STAY = Duration.ofMillis(3500);
    private static final Duration FADE_OUT = Duration.ofMillis(700);
    private static final float FULL = 1f;
    private static final int MAX_FOOD = 20;
    private static final String BEST_FILE = "wartung-parkour.yml";

    private final JavaPlugin plugin;
    private final boolean active;
    private final Function<Player, String> langOf;
    private final Function<Player, Set<String>> rights;
    private final BooleanSupplier hubReady;
    private final NamespacedKey itemKey;
    private final Path bestFile;
    private final Map<UUID, BossBar> bars = new HashMap<>();
    /** Laufender Parcours-Versuch: Spieler → Start (System.nanoTime). */
    private final Map<UUID, Long> runs = new ConcurrentHashMap<>();
    private final Map<UUID, Long> best = new ConcurrentHashMap<>();
    private final Map<UUID, Long> clicked = new ConcurrentHashMap<>();
    private volatile State state = new State(false, false, "", null, true, 0, null);
    private volatile Consumer toLobby;
    private String shownText = "";

    /** Wie der Hub erfährt, dass jemand zurück in die Lobby will. */
    interface Consumer {
        void toLobby(Player p);
    }

    WartungLobby(JavaPlugin plugin, boolean active, Function<Player, String> langOf,
                 Function<Player, Set<String>> rights, BooleanSupplier hubReady) {
        this.plugin = plugin;
        this.active = active;
        this.langOf = langOf;
        this.rights = rights;
        this.hubReady = hubReady;
        this.itemKey = new NamespacedKey(plugin, ITEM_KEY);
        this.bestFile = plugin.getDataFolder().toPath().getParent().resolve("moinmorni").resolve(BEST_FILE);
    }

    void onLobbyRequest(Consumer consumer) {
        this.toLobby = consumer;
    }

    void start() {
        if (!active) {
            return;
        }
        loadBest();
        Bukkit.getPluginManager().registerEvents(this, plugin);
        Bukkit.getScheduler().runTaskTimer(plugin, this::tick, TICK, TICK);
        Bukkit.getScheduler().runTaskTimer(plugin, this::parkourTick, PARKOUR_TICK, PARKOUR_TICK);
        plugin.getLogger().info("Wartungs-Lobby aktiv: Leiste, Aushang und Sprung-Parcours.");
    }

    // ---------- Stand vom Hub ----------

    /** Hub-Thread: Stand merken, auf dem Hauptthread anzeigen. */
    void onState(JsonObject m) {
        if (!active) {
            return;
        }
        Integer returnIn = m.has("returnIn") && !m.get("returnIn").isJsonNull() ? m.get("returnIn").getAsInt() : null;
        long returnAt = returnIn == null ? 0 : System.currentTimeMillis() + returnIn * MILLIS_PER_SECOND;
        JsonObject points = m.getAsJsonObject("points");
        JsonObject spawn = points == null ? null : points.getAsJsonObject("spawn");
        Bukkit.getScheduler().runTask(plugin, () -> {
            Location at = spawn == null ? null : new Location(world(), spawn.get("x").getAsDouble(),
                    spawn.get("y").getAsDouble(), spawn.get("z").getAsDouble(), spawn.get("yaw").getAsFloat(),
                    spawn.get("pitch").getAsFloat());
            state = new State(bool(m, "lobby"), bool(m, "maintenance"), str(m, "message"), HubClient.str(m, "until"),
                    !m.has("returnAuto") || m.get("returnAuto").getAsBoolean(), returnAt, at);
            tick();
        });
    }

    private static boolean bool(JsonObject m, String key) {
        return m.has(key) && !m.get(key).isJsonNull() && m.get(key).getAsBoolean();
    }

    private static String str(JsonObject m, String key) {
        String s = HubClient.str(m, key);
        return s == null ? "" : s;
    }

    private static World world() {
        return Bukkit.getWorlds().get(0);
    }

    // ---------- Leiste und Aushang ----------

    private void tick() {
        Bukkit.getOnlinePlayers().forEach(this::showBar);
        updateBoard();
    }

    private String lang(Player p) {
        String lang = langOf.apply(p);
        if (lang != null && !"de".equals(lang)) {
            return lang;
        }
        // Ohne Profil (Hub weg): Sprache aus dem Client.
        Locale locale = p.locale();
        return locale == null || locale.getLanguage().startsWith("de") || "de".equals(lang) ? "de" : "en";
    }

    private boolean parked(Player p) {
        return state.maintenance() && !rights.apply(p).contains(ALWAYS_IN);
    }

    private void showBar(Player p) {
        boolean en = "en".equals(lang(p));
        State s = state;
        long left = Math.max(0, (s.returnAt() - System.currentTimeMillis() + MILLIS_PER_SECOND - 1) / MILLIS_PER_SECOND);
        Component text;
        BossBar.Color colour;
        float progress = FULL;
        if (!hubReady.getAsBoolean()) {
            text = Component.text(en ? "⚙ The network is restarting – back in a moment"
                    : "⚙ Das Netzwerk startet gerade neu – gleich geht’s weiter", NamedTextColor.YELLOW);
            colour = BossBar.Color.YELLOW;
        } else if (s.returnAt() > 0 && left > 0) {
            text = Component.text(en ? "✔ The lobby is back – returning in " + left + " s"
                    : "✔ Die Lobby ist wieder da – zurück in " + left + " s", NamedTextColor.GREEN);
            colour = BossBar.Color.GREEN;
            progress = Math.min(FULL, left / (float) RETURN_SECONDS);
        } else if (parked(p)) {
            String until = s.until() == null ? "" : (en ? " until approx. " : " bis ca. ") + s.until();
            text = Component.text(en ? "⚒ Maintenance" + until : "⚒ Wartung" + until, NamedTextColor.GOLD)
                    .append(Component.text(s.message().isEmpty() ? "" : " – " + s.message(), NamedTextColor.WHITE));
            colour = BossBar.Color.YELLOW;
        } else if (!s.lobby()) {
            text = Component.text(en ? "⚒ The lobby is restarting – you’ll go back automatically"
                    : "⚒ Die Lobby startet gerade neu – du kommst automatisch zurück", NamedTextColor.GOLD);
            colour = BossBar.Color.RED;
            progress = (System.currentTimeMillis() / MILLIS_PER_SECOND) % 2 == 0 ? FULL : FULL / 2;
        } else {
            text = Component.text(en ? "✔ The lobby is ready – click the compass or type /lobby"
                    : "✔ Die Lobby ist bereit – Kompass anklicken oder /lobby", NamedTextColor.GREEN);
            colour = BossBar.Color.GREEN;
        }
        BossBar bar = bars.computeIfAbsent(p.getUniqueId(), id -> {
            BossBar b = BossBar.bossBar(Component.empty(), FULL, BossBar.Color.YELLOW, BossBar.Overlay.PROGRESS);
            p.showBossBar(b);
            return b;
        });
        bar.name(text);
        bar.color(colour);
        bar.progress(progress);
    }

    /** Text unter dem Aushang: Grund und Uhrzeit aus dem Panel (bei Wartung), sonst „Lobby startet neu“. */
    private void updateBoard() {
        State s = state;
        String text;
        if (s.maintenance()) {
            String until = s.until() == null ? "" : "\n⏰ bis ca. " + s.until() + " Uhr · until approx. " + s.until();
            text = (s.message().isEmpty() ? "Wartungsarbeiten" : s.message()) + until;
        } else if (!s.lobby() || !hubReady.getAsBoolean()) {
            text = "Die Lobby startet gerade neu – gleich geht’s weiter!\nThe lobby is restarting – back in a moment!";
        } else {
            text = "Die Lobby ist wieder da – ab zurück mit /lobby!\nThe lobby is back – /lobby takes you there!";
        }
        if (text.equals(shownText)) {
            return;
        }
        boolean found = false;
        for (Entity e : world().getEntities()) {
            if (e instanceof TextDisplay d && e.getScoreboardTags().contains(TEXT_TAG)) {
                d.text(Component.text(text, NamedTextColor.WHITE));
                found = true;
            }
        }
        if (found) {
            shownText = text;
        }
    }

    // ---------- Ankommen und Gehen ----------

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player p = event.getPlayer();
        Location spawn = state.spawn() != null ? state.spawn() : world().getSpawnLocation();
        p.teleport(spawn);
        if (!p.isOp() && p.getGameMode() != GameMode.SPECTATOR) {
            p.setGameMode(GameMode.ADVENTURE);
        }
        p.getInventory().clear();
        p.getInventory().setItem(LOBBY_SLOT, lobbyItem(p));
        p.setFoodLevel(MAX_FOOD);
        var health = p.getAttribute(Attribute.MAX_HEALTH);
        if (health != null) {
            p.setHealth(health.getValue());
        }
        boolean en = "en".equals(lang(p));
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (!p.isOnline()) {
                return;
            }
            p.showTitle(Title.title(
                    Component.text(en ? "⚒ Maintenance lobby" : "⚒ Wartungs-Lobby", NamedTextColor.GOLD,
                            TextDecoration.BOLD),
                    Component.text(en ? "Back in a moment – try the jump course meanwhile!"
                            : "Gleich geht’s weiter – probier solange den Sprung-Parcours!", NamedTextColor.WHITE),
                    Title.Times.times(FADE_IN, STAY, FADE_OUT)));
            showBar(p);
            p.sendMessage(arrival(p, en));
        }, TICK);
    }

    /** Warum man hier ist – im Chat, sobald man wirklich da ist (beim Serverwechsel ginge eine Nachricht verloren). */
    private Component arrival(Player p, boolean en) {
        State s = state;
        Component tag = Component.text("[", NamedTextColor.DARK_GRAY).append(Component.text("MoinMorni",
                NamedTextColor.GREEN)).append(Component.text("] ", NamedTextColor.DARK_GRAY));
        if (!hubReady.getAsBoolean()) {
            return tag.append(Component.text(en ? "The network is restarting – you’ll wait here for a moment."
                    : "Das Netzwerk startet gerade neu – du wartest kurz hier.", NamedTextColor.GOLD));
        }
        if (parked(p)) {
            String until = s.until() == null ? "" : (en ? " (until approx. " + s.until() + ")" : " (bis ca. "
                    + s.until() + " Uhr)");
            return tag.append(Component.text(en ? "Maintenance" : "Wartungsarbeiten", NamedTextColor.GOLD))
                    .append(Component.text(" – " + (s.message().isEmpty() ? "" : s.message()) + until,
                            NamedTextColor.GRAY));
        }
        if (!s.lobby()) {
            return tag.append(Component.text(en ? "The lobby is restarting" : "Die Lobby startet gerade neu",
                    NamedTextColor.GOLD)).append(Component.text(en
                    ? " – you’ll wait in the maintenance lobby. As soon as it’s back, you’ll return."
                    : " – du wartest so lange in der Wartungs-Lobby. Sobald sie wieder da ist, geht’s zurück.",
                    NamedTextColor.GRAY));
        }
        return tag.append(Component.text(en ? "Welcome to the maintenance lobby – the compass takes you back."
                : "Willkommen in der Wartungs-Lobby – der Kompass bringt dich zurück.", NamedTextColor.GRAY));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        BossBar bar = bars.remove(event.getPlayer().getUniqueId());
        if (bar != null) {
            event.getPlayer().hideBossBar(bar);
        }
        runs.remove(event.getPlayer().getUniqueId());
        clicked.remove(event.getPlayer().getUniqueId());
    }

    private ItemStack lobbyItem(Player p) {
        boolean en = "en".equals(lang(p));
        ItemStack item = new ItemStack(Material.RECOVERY_COMPASS);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text(en ? "Back to the lobby" : "Zurück in die Lobby", NamedTextColor.GREEN)
                .decoration(TextDecoration.ITALIC, false));
        meta.lore(java.util.List.of(Component.text(en ? "Right-click – as soon as it’s there again"
                : "Rechtsklick – sobald sie wieder da ist", NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false)));
        meta.getPersistentDataContainer().set(itemKey, PersistentDataType.STRING, TO_LOBBY);
        item.setItemMeta(meta);
        return item;
    }

    private boolean isLobbyItem(ItemStack item) {
        return item != null && item.hasItemMeta()
                && TO_LOBBY.equals(item.getItemMeta().getPersistentDataContainer().get(itemKey, PersistentDataType.STRING));
    }

    // ---------- Sprung-Parcours und Kompass ----------

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        Player p = event.getPlayer();
        if (event.getAction() == Action.PHYSICAL && event.getClickedBlock() != null) {
            Material plate = event.getClickedBlock().getType();
            if (plate == Material.LIGHT_WEIGHTED_PRESSURE_PLATE) {
                startRun(p);
            } else if (plate == Material.HEAVY_WEIGHTED_PRESSURE_PLATE) {
                finishRun(p);
            } else {
                event.setCancelled(true);
            }
            return;
        }
        if (isLobbyItem(event.getItem()) && event.getAction().isRightClick()) {
            event.setCancelled(true);
            long now = System.currentTimeMillis();
            if (now - clicked.getOrDefault(p.getUniqueId(), 0L) < CLICK_COOLDOWN_MS) {
                return;
            }
            clicked.put(p.getUniqueId(), now);
            Consumer c = toLobby;
            if (c == null || !hubReady.getAsBoolean()) {
                p.sendMessage(Component.text("en".equals(lang(p)) ? "The network is restarting – try /lobby in a moment."
                        : "Das Netzwerk startet gerade neu – versuch es gleich mit /lobby.", NamedTextColor.GOLD));
                return;
            }
            c.toLobby(p);
            return;
        }
        // Werkbänke, Truhen, Öfen sind Deko – nur die Glocke darf man läuten.
        if (event.getAction() == Action.RIGHT_CLICK_BLOCK && event.getClickedBlock() != null
                && event.getClickedBlock().getType() != Material.BELL && !p.isOp()) {
            event.setUseInteractedBlock(org.bukkit.event.Event.Result.DENY);
        }
    }

    private void startRun(Player p) {
        Long running = runs.get(p.getUniqueId());
        long now = System.nanoTime();
        // Nicht bei jedem Schritt auf der Platte neu starten – erst, wenn man sie verlassen hat.
        if (running != null && (now - running) / NANOS_PER_MILLI < MILLIS_PER_SECOND) {
            return;
        }
        boolean fresh = running == null;
        runs.put(p.getUniqueId(), now);
        if (fresh) {
            p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, FULL, FULL);
            p.sendActionBar(Component.text("en".equals(lang(p)) ? "⏱ Go! Up to the bell!" : "⏱ Los! Hinauf zur Glocke!",
                    NamedTextColor.GREEN));
        }
    }

    private void finishRun(Player p) {
        Long started = runs.remove(p.getUniqueId());
        if (started == null) {
            return;
        }
        long ms = (System.nanoTime() - started) / NANOS_PER_MILLI;
        boolean en = "en".equals(lang(p));
        Long before = best.get(p.getUniqueId());
        boolean record = before == null || ms < before;
        if (record) {
            best.put(p.getUniqueId(), ms);
            saveBest();
        }
        p.playSound(p.getLocation(), Sound.BLOCK_BELL_USE, FULL, FULL);
        p.playSound(p.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, FULL, FULL);
        String time = seconds(ms, en);
        Component line = Component.text(en ? "🔔 Made it in " + time : "🔔 Geschafft in " + time, NamedTextColor.GOLD,
                TextDecoration.BOLD);
        if (record) {
            line = line.append(Component.text(en ? " – personal best!" : " – neue Bestzeit!", NamedTextColor.GREEN));
        } else {
            line = line.append(Component.text((en ? " – best: " : " – Bestzeit: ") + seconds(before, en),
                    NamedTextColor.GRAY));
        }
        p.sendMessage(line);
        p.sendActionBar(line);
    }

    private void parkourTick() {
        runs.forEach((id, started) -> {
            Player p = Bukkit.getPlayer(id);
            if (p == null) {
                runs.remove(id);
                return;
            }
            Location l = p.getLocation();
            boolean en = "en".equals(lang(p));
            boolean onGround = ((Entity) p).isOnGround();
            if (onGround && l.getY() < GROUND_Y && !nearPlate(l)) {
                runs.remove(id);
                p.sendActionBar(Component.text(en ? "✖ Fell off – back to the start plate!"
                        : "✖ Runtergefallen – zurück zur Startplatte!", NamedTextColor.RED));
                return;
            }
            long ms = (System.nanoTime() - started) / NANOS_PER_MILLI;
            p.sendActionBar(Component.text("⏱ " + seconds(ms, en), NamedTextColor.YELLOW));
        });
    }

    /** Steht man noch bei der Startplatte (dort zählt der Boden nicht als Absturz)? */
    private static boolean nearPlate(Location l) {
        for (int dx = -2; dx <= 2; dx++) {
            for (int dz = -2; dz <= 2; dz++) {
                if (l.clone().add(dx, 0, dz).getBlock().getType() == Material.LIGHT_WEIGHTED_PRESSURE_PLATE
                        && Math.hypot(dx, dz) <= START_REACH) {
                    return true;
                }
            }
        }
        return false;
    }

    private static String seconds(long ms, boolean en) {
        String text = String.format(Locale.ROOT, "%d.%02d s", ms / MILLIS_PER_SECOND, (ms % MILLIS_PER_SECOND) / 10);
        return en ? text : text.replace('.', ',');
    }

    private void loadBest() {
        if (!Files.isRegularFile(bestFile)) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(bestFile.toFile());
        for (String key : yaml.getKeys(false)) {
            try {
                best.put(UUID.fromString(key), yaml.getLong(key));
            } catch (IllegalArgumentException e) {
                // kaputter Eintrag – weglassen
            }
        }
    }

    private void saveBest() {
        YamlConfiguration yaml = new YamlConfiguration();
        best.forEach((id, ms) -> yaml.set(id.toString(), ms));
        try {
            Files.createDirectories(bestFile.getParent());
            yaml.save(bestFile.toFile());
        } catch (IOException e) {
            plugin.getLogger().warning("Bestzeiten der Wartungs-Lobby nicht gespeichert: " + e.getMessage());
        }
    }

    // ---------- Schutz: nichts kaputt machen, kein Schaden, kein Hunger ----------

    @EventHandler
    public void onMove(PlayerMoveEvent event) {
        if (event.getTo().getY() < VOID_Y) {
            Location spawn = state.spawn() != null ? state.spawn() : world().getSpawnLocation();
            event.getPlayer().teleport(spawn);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        if (!event.getPlayer().isOp()) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        if (!event.getPlayer().isOp()) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onHunger(FoodLevelChangeEvent event) {
        event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onSwap(PlayerSwapHandItemsEvent event) {
        event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onClick(InventoryClickEvent event) {
        if (event.getWhoClicked() instanceof Player p && !p.isOp() && isLobbyItem(event.getCurrentItem())) {
            event.setCancelled(true);
        }
    }

    /** Kisten, Fässer und Öfen der Werkstatt sind Deko. */
    @EventHandler(ignoreCancelled = true)
    public void onOpen(InventoryOpenEvent event) {
        InventoryHolder holder = event.getInventory().getHolder();
        boolean block = holder instanceof org.bukkit.block.BlockState || holder instanceof org.bukkit.block.DoubleChest;
        if (block && event.getPlayer() instanceof Player p && !p.isOp()) {
            event.setCancelled(true);
        }
    }
}
