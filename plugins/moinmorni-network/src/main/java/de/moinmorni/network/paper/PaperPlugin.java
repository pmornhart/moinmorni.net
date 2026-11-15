package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import de.moinmorni.network.common.HubConfig;
import io.papermc.paper.event.player.AsyncChatEvent;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
    private record Profile(String name, String lang, String roleId, String symbol, String colour, int position,
                           java.util.Set<String> rights) {
    }

    /** Name dieses Servers im Netzwerk (aus hub.json), z. B. „lobby“ oder „bau“. */
    private String serverName = "";
    /** Rechte aus dem Rang, pro Spieler (wird bei jedem neuen Profil ersetzt). */
    private final Map<UUID, org.bukkit.permissions.PermissionAttachment> attachments = new ConcurrentHashMap<>();
    private static final String BUILD_SERVER = "bau";
    /** Rang-Recht → Minecraft-Befehle (auf allen Spielservern). */
    private static final Map<String, List<String>> RIGHT_PERMISSIONS = Map.of(
            "teleport", List.of("minecraft.command.teleport", "minecraft.command.tp"),
            "spectate", List.of("minecraft.command.spectate", "minecraft.command.gamemode"));

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
    /** Tageszeit der Lobby (wie in echt) – nur aktiv, wenn der Hub Lobby-Einstellungen schickt. */
    private LobbyClock clock;

    @Override
    public void onEnable() {
        Path dir = getDataFolder().toPath().getParent().resolve(HUB_DIR);
        try {
            HubConfig hubConfig = HubConfig.load(dir);
            serverName = hubConfig.server();
            hub = new HubClient(hubConfig, getLogger(), this::onHub, () -> { });
            startVoice();
        } catch (Exception e) {
            getLogger().warning("MoinMorni ist nicht eingerichtet (" + e.getMessage() + ") – der Server läuft ohne Netzwerk-Chat.");
        }
        getServer().getPluginManager().registerEvents(this, this);
        // Schnittstelle für Spielmodi (de.moinmorni.api.MoinMorni) – auch ohne Hub, dann läuft der Modus allein.
        getServer().getServicesManager().register(de.moinmorni.api.MoinMorni.class,
                new ModeApi(hub, serverName, this::langOfUuid, this::rankOf,
                        uuid -> Optional.ofNullable(profiles.get(uuid)).map(Profile::rights).orElse(null)),
                this, org.bukkit.plugin.ServicePriority.Normal);
        lobby = new LobbyNpcs(this, hub, this::langOf);
        lobby.start();
        features = new LobbyFeatures(this, lobby, this::langOf);
        jail = new LobbyJail(this, features, this::langOf);
        clock = new LobbyClock(this);
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

    /** Sprache nach UUID (Modus-Schnittstelle): aus dem Profil, sonst Deutsch. */
    private String langOfUuid(UUID uuid) {
        Profile p = profiles.get(uuid);
        return p == null || p.lang() == null ? "de" : p.lang();
    }

    /** Rang für die Modus-Schnittstelle (null, solange der Hub noch kein Profil geschickt hat). */
    private de.moinmorni.api.MoinMorni.Rank rankOf(UUID uuid) {
        Profile p = profiles.get(uuid);
        return p == null ? null : new de.moinmorni.api.MoinMorni.Rank(p.roleId(), p.symbol(), p.colour(), p.position());
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
        if (clock != null) {
            clock.stop();
        }
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
                        role.get("position").getAsInt(),
                        rightsOf(m)));
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
            case "lobby-settings" -> {
                features.onSettings(m);
                clock.onSettings(m);
            }
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

    private static java.util.Set<String> rightsOf(JsonObject m) {
        java.util.Set<String> rights = new java.util.HashSet<>();
        if (m.has("rights") && m.get("rights").isJsonArray()) {
            m.getAsJsonArray("rights").forEach(r -> rights.add(r.getAsString()));
        }
        return rights;
    }

    /**
     * Rechte aus dem Rang: Teleport/Zuschauen überall fürs Team. Auf dem Bau-Server: wer bauen darf, ist im
     * Kreativmodus; wer WorldEdit darf, ist dort OP (WorldEdit fragt viele einzelne Rechte ab). Alle anderen sind
     * dort Gast im Abenteuermodus ohne OP.
     */
    private void applyRights(Player p, Profile profile) {
        org.bukkit.permissions.PermissionAttachment old = attachments.remove(p.getUniqueId());
        if (old != null) {
            p.removeAttachment(old);
        }
        org.bukkit.permissions.PermissionAttachment attachment = p.addAttachment(this);
        profile.rights().forEach(r -> RIGHT_PERMISSIONS.getOrDefault(r, List.of())
                .forEach(node -> attachment.setPermission(node, true)));
        attachments.put(p.getUniqueId(), attachment);
        if (!BUILD_SERVER.equals(serverName)) {
            return;
        }
        boolean build = profile.rights().contains("build");
        p.setOp(build && profile.rights().contains("worldedit"));
        org.bukkit.GameMode wanted = build ? org.bukkit.GameMode.CREATIVE : org.bukkit.GameMode.ADVENTURE;
        if (p.getGameMode() != wanted && p.getGameMode() != org.bukkit.GameMode.SPECTATOR) {
            p.setGameMode(wanted);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Player p = event.getPlayer();
        profiles.remove(p.getUniqueId());
        org.bukkit.permissions.PermissionAttachment attachment = attachments.remove(p.getUniqueId());
        if (attachment != null) {
            p.removeAttachment(attachment);
        }
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
        applyRights(p, profile);
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
