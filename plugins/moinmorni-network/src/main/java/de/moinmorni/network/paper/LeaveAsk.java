package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * „Wirklich zur Lobby?“ – ein kleines Truhen-Fenster mitten im Spiel. Der Hub schickt {@code lobby-ask}, wenn jemand
 * /lobby eingibt oder im Spielmodus auf „Zur Lobby“ klickt, während er gerade eine Runde spielt (der Modus meldet das
 * über {@code MoinMorni#playing}). Truhen-Fenster gehen auf Java und Bedrock (Geyser) gleich; auf Java kommen dazu
 * Knöpfe im Chat (vom Hub). Die Antwort geht an den Hub ({@code lobby-answer}); ohne Hub fragt der Server selbst und
 * „Ja“ geht wie {@code toLobby}.
 */
final class LeaveAsk implements Listener {

    /** Antwort aus dem Fenster: ja = zur Lobby, nein = weiterspielen. */
    interface Answer {
        void answer(Player player, boolean yes);
    }

    /** Drei Reihen; der Mauszeiger steht beim Öffnen in der Mitte – dort ist kein Knopf (nichts aus Versehen). */
    private static final int SIZE = 27;
    private static final int YES_SLOT = 11;
    private static final int NO_SLOT = 15;

    private static final class Holder implements InventoryHolder {
        private Inventory inventory;

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    private final JavaPlugin plugin;
    private final Function<Player, String> langOf;
    private final Answer answer;

    LeaveAsk(JavaPlugin plugin, Function<Player, String> langOf, Answer answer) {
        this.plugin = plugin;
        this.langOf = langOf;
        this.answer = answer;
    }

    void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
    }

    /** Hub-Thread: Fenster öffnen ({@code lobby-ask}, mit dem Namen des Modus in der Sprache des Spielers). */
    void onAsk(JsonObject m) {
        UUID id = UUID.fromString(HubClient.str(m, "uuid"));
        String mode = HubClient.str(m, "mode");
        Bukkit.getScheduler().runTask(plugin, () -> {
            Player p = Bukkit.getPlayer(id);
            if (p != null) {
                open(p, mode);
            }
        });
    }

    /** Hub-Thread: Die Antwort kam über den Chat ({@code lobby-ask-close}) – das Fenster geht zu. */
    void onClose(JsonObject m) {
        UUID id = UUID.fromString(HubClient.str(m, "uuid"));
        Bukkit.getScheduler().runTask(plugin, () -> {
            Player p = Bukkit.getPlayer(id);
            if (p != null && p.getOpenInventory().getTopInventory().getHolder() instanceof Holder) {
                p.closeInventory();
            }
        });
    }

    /** Hauptthread: Fenster zeigen; {@code mode} = Name des Modus oder null (ohne Hub). */
    void open(Player p, String mode) {
        boolean en = "en".equals(langOf.apply(p));
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, SIZE,
                Component.text(en ? "Really go to the lobby?" : "Wirklich zur Lobby?", NamedTextColor.DARK_GREEN));
        holder.inventory = inv;
        ItemStack pane = pane();
        for (int slot = 0; slot < SIZE; slot++) {
            inv.setItem(slot, pane);
        }
        String goes;
        if (mode == null || mode.isEmpty()) {
            goes = en ? "Your round goes on without you." : "Deine Runde läuft ohne dich weiter.";
        } else {
            goes = en ? "Your round of " + mode + " goes on without you." : "Deine Runde in " + mode + " läuft ohne dich weiter.";
        }
        inv.setItem(YES_SLOT, button(Material.OAK_DOOR, en ? "Yes, to the lobby" : "Ja, zur Lobby", NamedTextColor.GOLD, goes));
        inv.setItem(NO_SLOT, button(Material.LIME_CONCRETE, en ? "Keep playing" : "Weiterspielen", NamedTextColor.GREEN,
                en ? "Back to the game – nothing happens." : "Zurück ins Spiel – es passiert nichts."));
        p.openInventory(inv);
        p.playSound(p.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, 0.6f, 1.0f);
    }

    private static ItemStack button(Material material, String name, NamedTextColor colour, String lore) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(Component.text(name, colour, TextDecoration.BOLD).decoration(TextDecoration.ITALIC, false));
        meta.lore(List.of(Component.text(lore, NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false)));
        meta.addItemFlags(ItemFlag.values());
        stack.setItemMeta(meta);
        return stack;
    }

    private static ItemStack pane() {
        ItemStack stack = new ItemStack(Material.GRAY_STAINED_GLASS_PANE);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(Component.empty());
        meta.setHideTooltip(true);
        stack.setItemMeta(meta);
        return stack;
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onClick(InventoryClickEvent event) {
        if (!(event.getInventory().getHolder() instanceof Holder) || !(event.getWhoClicked() instanceof Player p)) {
            return;
        }
        event.setCancelled(true);
        int slot = event.getRawSlot();
        if (slot != YES_SLOT && slot != NO_SLOT) {
            return;
        }
        boolean yes = slot == YES_SLOT;
        // Im Klick-Ereignis selbst nicht schließen (Bukkit) – einen Tick später.
        Bukkit.getScheduler().runTask(plugin, () -> {
            p.closeInventory();
            answer.answer(p, yes);
        });
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onDrag(InventoryDragEvent event) {
        if (event.getInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
