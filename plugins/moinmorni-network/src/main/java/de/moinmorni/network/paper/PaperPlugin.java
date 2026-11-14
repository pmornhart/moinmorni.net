package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import de.moinmorni.network.common.HubConfig;
import io.papermc.paper.event.player.AsyncChatEvent;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.Team;

/**
 * Der Spielserver-Teil: Chat geht an den Hub (der prüft und verteilt), Ränge erscheinen im Chat, in der Tab-Liste
 * und über dem Kopf. Ist der Hub weg, bleibt der Chat einfach auf diesem Server.
 */
public final class PaperPlugin extends JavaPlugin implements Listener {

    private static final MiniMessage MM = MiniMessage.miniMessage();
    private static final String HUB_DIR = "moinmorni";
    private static final String TEAM_PREFIX = "mm";
    private static final int TEAM_NAME_MAX = 16;

    /** Was der Hub über einen Spieler sagt (Rang, Sprache). */
    private record Profile(String name, String lang, String roleId, String symbol, String colour, int position) {
    }

    private final Map<UUID, Profile> profiles = new ConcurrentHashMap<>();
    private HubClient hub;
    /** Sprachchat-Brücke, nur mit Simple Voice Chat (sonst null). */
    private Object voice;
    /** Figuren der Lobby (anklicken, Live-Zahlen, Dorfleute) – tut nur etwas, wo es Figuren gibt. */
    private LobbyNpcs lobby;
    /** Lobby-Funktionen (Begrüßung, Menü, Parkour …) – nur aktiv, wenn der Hub Lobby-Einstellungen schickt. */
    private LobbyFeatures features;
    /** Gefängnis-Zelle der Lobby – nur aktiv, wenn der Hub die Zelle schickt. */
    private LobbyJail jail;

    @Override
    public void onEnable() {
        Path dir = getDataFolder().toPath().getParent().resolve(HUB_DIR);
        try {
            hub = new HubClient(HubConfig.load(dir), getLogger(), this::onHub, () -> { });
            startVoice();
        } catch (Exception e) {
            getLogger().warning("MoinMorni ist nicht eingerichtet (" + e.getMessage() + ") – der Server läuft ohne Netzwerk-Chat.");
        }
        getServer().getPluginManager().registerEvents(this, this);
        lobby = new LobbyNpcs(this, hub, this::langOf);
        lobby.start();
        features = new LobbyFeatures(this, lobby, this::langOf);
        jail = new LobbyJail(this, features, this::langOf);
        features.setJail(jail::isJailed);
        jail.start();
        features.start();
        // Erst verbinden, wenn alles steht – die ersten Nachrichten des Hubs gehen sonst ins Leere.
        if (hub != null) {
            try {
                hub.start();
            } catch (Exception e) {
                getLogger().warning("Hub nicht erreichbar (" + e.getMessage() + ") – der Server läuft ohne Netzwerk-Chat.");
            }
        }
    }

    /** Brücke anmelden, wenn Simple Voice Chat da ist – die Klasse wird sonst nie geladen. */
    private void startVoice() {
        if (getServer().getPluginManager().getPlugin("voicechat") == null) {
            return;
        }
        try {
            voice = VoiceSetup.register(this, hub);
        } catch (LinkageError | RuntimeException e) {
            getLogger().warning("Sprachchat-Brücke nicht gestartet: " + e.getMessage());
        }
    }

    @Override
    public void onDisable() {
        if (hub != null) {
            hub.stop();
        }
    }

    // ---------- Meldungen vom Hub (kommen auf einem eigenen Thread) ----------

    private void onHub(JsonObject m) {
        String type = HubClient.str(m, "t");
        if (type == null) {
            return;
        }
        switch (type) {
            case "profile" -> {
                JsonObject role = m.getAsJsonObject("role");
                UUID uuid = UUID.fromString(HubClient.str(m, "uuid"));
                profiles.put(uuid, new Profile(
                        HubClient.str(m, "name"),
                        HubClient.str(m, "lang"),
                        HubClient.str(role, "id"),
                        HubClient.str(role, "symbol"),
                        HubClient.str(role, "colour"),
                        role.get("position").getAsInt()));
                Bukkit.getScheduler().runTask(this, () -> {
                    Player p = Bukkit.getPlayer(uuid);
                    if (p != null) {
                        apply(p);
                        lobby.showLabels(p);
                    }
                });
            }
            case "chat" -> {
                JsonObject text = m.getAsJsonObject("text");
                Component de = MM.deserialize(HubClient.str(text, "de"));
                Component en = MM.deserialize(HubClient.str(text, "en"));
                Bukkit.getScheduler().runTask(this, () -> {
                    for (Player p : Bukkit.getOnlinePlayers()) {
                        p.sendMessage("en".equals(langOf(p)) ? en : de);
                    }
                    Bukkit.getConsoleSender().sendMessage(de);
                });
            }
            case "lobby" -> lobby.onModes(m);
            case "lobby-settings" -> features.onSettings(m);
            case "jail" -> jail.onState(m);
            case "voice" -> {
                if (voice != null) {
                    VoiceSetup.apply(voice, m);
                }
            }
            case "voice-join" -> {
                if (voice != null) {
                    Bukkit.getScheduler().runTask(this, () -> VoiceSetup.join(voice, m));
                }
            }
            case "msg" -> Bukkit.getScheduler().runTask(this, () -> {
                Player p = Bukkit.getPlayer(UUID.fromString(HubClient.str(m, "uuid")));
                if (p != null) {
                    p.sendMessage(MM.deserialize(HubClient.str(m, "text")));
                }
            });
            default -> {
            }
        }
    }

    private String langOf(Player p) {
        Profile profile = profiles.get(p.getUniqueId());
        return profile == null ? "de" : profile.lang();
    }

    // ---------- Chat ----------

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        if (hub == null || !hub.ready()) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "chat");
        body.addProperty("uuid", event.getPlayer().getUniqueId().toString());
        body.addProperty("text", PlainTextComponentSerializer.plainText().serialize(event.message()));
        if (hub.send(body)) {
            event.setCancelled(true);
        }
    }

    // ---------- Rang in Tab-Liste und über dem Kopf ----------

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        apply(event.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Player p = event.getPlayer();
        profiles.remove(p.getUniqueId());
        Team team = Bukkit.getScoreboardManager().getMainScoreboard().getEntryTeam(p.getName());
        if (team != null && team.getName().startsWith(TEAM_PREFIX)) {
            team.removeEntry(p.getName());
        }
    }

    /** Hauptthread: Rang-Symbol und Farbe an den Spieler hängen. */
    private void apply(Player p) {
        Profile profile = profiles.get(p.getUniqueId());
        if (profile == null) {
            return;
        }
        TextColor colour = TextColor.fromHexString(profile.colour());
        Component prefix = profile.symbol() == null || profile.symbol().isEmpty()
                ? Component.empty()
                : Component.text(profile.symbol() + " ", colour);
        p.playerListName(prefix.append(Component.text(p.getName(), colour)));

        Scoreboard board = Bukkit.getScoreboardManager().getMainScoreboard();
        // Teams sortieren die Tab-Liste nach Namen: mm00owner vor mm06player.
        String name = String.format("%s%02d%s", TEAM_PREFIX, profile.position(), profile.roleId());
        String teamName = name.length() > TEAM_NAME_MAX ? name.substring(0, TEAM_NAME_MAX) : name;
        Team team = board.getTeam(teamName);
        if (team == null) {
            team = board.registerNewTeam(teamName);
        }
        team.prefix(prefix);
        if (colour != null) {
            team.color(net.kyori.adventure.text.format.NamedTextColor.nearestTo(colour));
        }
        Team old = board.getEntryTeam(p.getName());
        if (old != null && old != team && old.getName().startsWith(TEAM_PREFIX)) {
            old.removeEntry(p.getName());
        }
        team.addEntry(p.getName());
    }
}
