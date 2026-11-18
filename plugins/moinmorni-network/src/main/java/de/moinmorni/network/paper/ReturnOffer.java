package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.function.Predicate;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * „Zurück ins Spiel“ in der Lobby (nur dorthin schickt der Hub {@code rejoin-offer}): Hat ein Spielmodus den Platz
 * eines Spielers freigehalten – die Verbindung war mitten im Spiel weg ({@code MoinMorni#holdSlot}) –, bekommt er
 * beim Ankommen eine Zeile im Chat (auf Java zum Anklicken), die Restzeit über der Schnellleiste und einen Gegenstand
 * neben der Mitte der Leiste (Platz 3; die Mitte hat die Jump-and-Run-Feder), der bis zum Ablauf bleibt (geht auch auf Bedrock). Ein Klick schickt {@code rejoin} an den
 * Hub, der ihn auf genau diesen Server bringt. Läuft die Zeit ab oder nimmt der Modus das Angebot zurück
 * ({@code rejoin-off}), verschwindet alles.
 */
final class ReturnOffer implements Listener {

    private static final MiniMessage MM = MiniMessage.miniMessage();
    private static final String ITEM_KEY = "rejoin_item";
    /** Mitte der Schnellleiste (Kompass 0, Rundgang 8). */
    private static final int SLOT = 3;
    private static final long TICKS_PER_SECOND = 20L;
    /** Nach dem Betreten erst die Lobby einrichten lassen (sie räumt die Leiste auf), dann anbieten. */
    private static final long SHOW_DELAY = 5L;
    private static final long USE_COOLDOWN_MS = 1_500L;
    private static final long MILLIS_PER_SECOND = 1_000L;
    private static final long SECONDS_PER_MINUTE = 60L;

    /** Angebot: Server, Name des Modus (de/en), Zeile für den Chat (MiniMessage, vom Hub), bis wann (ms). */
    private record Offer(String server, String modeDe, String modeEn, String chat, long until) {
    }

    private final JavaPlugin plugin;
    private final HubClient hub;
    private final Function<Player, String> langOf;
    private final NamespacedKey key;
    private final Map<UUID, Offer> offers = new ConcurrentHashMap<>();
    /** Wer die Zeile im Chat bei diesem Besuch schon bekommen hat (Neu-Senden vom Hub zeigt sie nicht doppelt). */
    private final Set<UUID> shown = ConcurrentHashMap.newKeySet();
    private final Map<UUID, Long> lastUse = new ConcurrentHashMap<>();
    /** Wer im Gefängnis sitzt, bekommt nichts in die Hand (setzt {@link LobbyJail}). */
    private Predicate<UUID> jailed = id -> false;

    ReturnOffer(JavaPlugin plugin, HubClient hub, Function<Player, String> langOf) {
        this.plugin = plugin;
        this.hub = hub;
        this.langOf = langOf;
        this.key = new NamespacedKey(plugin, ITEM_KEY);
    }

    void setJail(Predicate<UUID> jailed) {
        this.jailed = jailed;
    }

    void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        Bukkit.getScheduler().runTaskTimer(plugin, this::tick, TICKS_PER_SECOND, TICKS_PER_SECOND);
    }

    // ---------- Vom Hub (eigener Thread) ----------

    void onOffer(JsonObject m) {
        UUID id = UUID.fromString(HubClient.str(m, "uuid"));
        JsonObject mode = m.getAsJsonObject("mode");
        long until = System.currentTimeMillis() + m.get("seconds").getAsLong() * MILLIS_PER_SECOND;
        Offer offer = new Offer(HubClient.str(m, "server"), HubClient.str(mode, "de"), HubClient.str(mode, "en"),
                HubClient.str(m, "chat"), until);
        Bukkit.getScheduler().runTask(plugin, () -> {
            offers.put(id, offer);
            Player p = Bukkit.getPlayer(id);
            if (p != null) {
                Bukkit.getScheduler().runTaskLater(plugin, () -> show(p), SHOW_DELAY);
            }
        });
    }

    void onOff(JsonObject m) {
        UUID id = UUID.fromString(HubClient.str(m, "uuid"));
        Bukkit.getScheduler().runTask(plugin, () -> withdraw(id));
    }

    // ---------- Anzeigen ----------

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player p = event.getPlayer();
        if (offers.containsKey(p.getUniqueId())) {
            Bukkit.getScheduler().runTaskLater(plugin, () -> show(p), SHOW_DELAY);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        // Kommt er wieder in die Lobby und gilt das Angebot noch, schickt der Hub es neu.
        UUID id = event.getPlayer().getUniqueId();
        offers.remove(id);
        shown.remove(id);
        lastUse.remove(id);
    }

    /** Beim Ankommen: Zeile im Chat, Gegenstand in die Hand, Restzeit über der Leiste. */
    private void show(Player p) {
        Offer offer = offers.get(p.getUniqueId());
        if (offer == null || !p.isOnline()) {
            return;
        }
        if (shown.add(p.getUniqueId())) {
            p.sendMessage(MM.deserialize(offer.chat()));
            p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_BELL, 1f, 1.2f);
            if (equip(p, offer)) {
                p.getInventory().setHeldItemSlot(SLOT);
            }
        }
        update(p, offer);
    }

    /** Jede Sekunde: Restzeit, Gegenstand (die Lobby räumt die Leiste manchmal auf), Ablauf. */
    private void tick() {
        long now = System.currentTimeMillis();
        offers.forEach((id, offer) -> {
            if (offer.until() <= now) {
                withdraw(id);
                return;
            }
            Player p = Bukkit.getPlayer(id);
            if (p != null && shown.contains(id)) {
                update(p, offer);
            }
        });
    }

    private void update(Player p, Offer offer) {
        if (jailed.test(p.getUniqueId())) {
            removeItems(p);
            return;
        }
        boolean item = equip(p, offer);
        boolean en = en(p);
        String time = remaining(offer.until() - System.currentTimeMillis());
        String how;
        if (item) {
            how = en ? "next to the middle of your hotbar: back to the game" : "neben der Mitte der Leiste: zurück ins Spiel";
        } else {
            how = en ? "/rejoin: back to the game" : "/rueckkehr: zurück ins Spiel";
        }
        p.sendActionBar(Component.text("⏳ ", NamedTextColor.GOLD)
                .append(Component.text(en ? "Your spot in " : "Dein Platz in ", NamedTextColor.GRAY))
                .append(Component.text(en ? offer.modeEn() : offer.modeDe(), NamedTextColor.WHITE))
                .append(Component.text(en ? " is free for " : " ist noch ", NamedTextColor.GRAY))
                .append(Component.text(time, NamedTextColor.GOLD))
                .append(Component.text(en ? " more · " + how : " frei · " + how, NamedTextColor.GRAY)));
    }

    /** Restzeit wie auf einer Uhr: 105 000 ms → „1:45“ (angefangene Sekunden zählen nicht, nie unter 0:00). */
    static String remaining(long millis) {
        long left = Math.max(0, millis) / MILLIS_PER_SECOND;
        return String.format("%d:%02d", left / SECONDS_PER_MINUTE, left % SECONDS_PER_MINUTE);
    }

    /** Angebot weg: Gegenstand raus, Leiste leer. */
    private void withdraw(UUID id) {
        offers.remove(id);
        boolean wasShown = shown.remove(id);
        Player p = Bukkit.getPlayer(id);
        if (p == null) {
            return;
        }
        removeItems(p);
        if (wasShown) {
            p.sendActionBar(Component.empty());
        }
    }

    // ---------- Gegenstand ----------

    /** Gegenstand neben die Mitte der Leiste – nicht im Kreativ- oder Zuschauermodus. true = er liegt dort. */
    private boolean equip(Player p, Offer offer) {
        GameMode mode = p.getGameMode();
        if (mode == GameMode.CREATIVE || mode == GameMode.SPECTATOR) {
            return false;
        }
        String tag = langOf.apply(p) + ":" + offer.server();
        if (tag.equals(tagOf(p.getInventory().getItem(SLOT)))) {
            return true;
        }
        removeItems(p);
        p.getInventory().setItem(SLOT, item(offer, en(p), tag));
        return true;
    }

    private ItemStack item(Offer offer, boolean en, String tag) {
        ItemStack stack = new ItemStack(Material.RECOVERY_COMPASS);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(Component.text(en ? "Back to the game" : "Zurück ins Spiel", NamedTextColor.GREEN,
                TextDecoration.BOLD).decoration(TextDecoration.ITALIC, false));
        meta.lore(List.of(
                Component.text(en ? offer.modeEn() : offer.modeDe(), NamedTextColor.GOLD)
                        .decoration(TextDecoration.ITALIC, false),
                Component.text(en ? "Right-click: back to your round" : "Rechtsklick: zurück in deine Runde",
                        NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false)));
        meta.setEnchantmentGlintOverride(true);
        meta.addItemFlags(ItemFlag.values());
        meta.getPersistentDataContainer().set(key, PersistentDataType.STRING, tag);
        stack.setItemMeta(meta);
        return stack;
    }

    private String tagOf(ItemStack stack) {
        if (stack == null || !stack.hasItemMeta()) {
            return null;
        }
        return stack.getItemMeta().getPersistentDataContainer().get(key, PersistentDataType.STRING);
    }

    /** Alle eigenen Gegenstände aus dem Inventar; true = es war einer da. */
    private boolean removeItems(Player p) {
        boolean found = false;
        ItemStack[] contents = p.getInventory().getContents();
        for (int i = 0; i < contents.length; i++) {
            if (tagOf(contents[i]) != null) {
                p.getInventory().setItem(i, null);
                found = true;
            }
        }
        return found;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onUse(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND || event.getAction() == Action.PHYSICAL
                || tagOf(event.getItem()) == null) {
            return;
        }
        event.setCancelled(true);
        Player p = event.getPlayer();
        long now = System.currentTimeMillis();
        Long last = lastUse.get(p.getUniqueId());
        if (last != null && now - last < USE_COOLDOWN_MS) {
            return;
        }
        lastUse.put(p.getUniqueId(), now);
        if (hub == null || !hub.ready()) {
            p.sendMessage(Component.text(en(p)
                    ? "The network can't be reached right now – please try again in a moment."
                    : "Das Netzwerk ist gerade nicht erreichbar – versuch es gleich nochmal.", NamedTextColor.RED));
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "rejoin");
        body.addProperty("uuid", p.getUniqueId().toString());
        hub.send(body);
        p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, 0.6f, 1.4f);
    }

    private boolean en(Player p) {
        return "en".equals(langOf.apply(p));
    }
}
