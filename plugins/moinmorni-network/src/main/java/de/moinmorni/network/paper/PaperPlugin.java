package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import de.moinmorni.network.common.DataFolder;
import de.moinmorni.network.common.HubClient;
import de.moinmorni.network.common.HubConfig;
import de.moinmorni.network.common.StreamerMask;
import io.papermc.paper.event.player.AsyncChatEvent;
import java.nio.file.Files;
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

    /** Was der Hub über einen Spieler sagt (Rang, Sprache, Streamer-Modus). */
    private record Profile(String name, String lang, String roleId, String symbol, String colour, int position,
                           java.util.Set<String> rights, boolean streaming, java.util.Set<String> hides) {
    }

    /** Name dieses Servers im Netzwerk (aus hub.json), z. B. „lobby“ oder „bau“. */
    private String serverName = "";
    /** Rechte aus dem Rang, pro Spieler (wird bei jedem neuen Profil ersetzt). */
    private final Map<UUID, org.bukkit.permissions.PermissionAttachment> attachments = new ConcurrentHashMap<>();
    private static final String BUILD_SERVER = "bau";
    private static final String NO_CREATIVE_DE = "<red>Den Kreativmodus darf dein Rang nicht.</red> "
            + "<gray>Dafür braucht der Rang im Panel das Recht „Kreativmodus“.</gray>";
    private static final String NO_CREATIVE_EN = "<red>Your rank can't use creative mode.</red> "
            + "<gray>The rank needs the right “Creative mode” in the panel.</gray>";

    private final Map<UUID, Profile> profiles = new ConcurrentHashMap<>();
    /** Streamer-Modus: IP-Adressen und eigene Adressen für Streamer als „•••“ (Adressen schickt der Hub). */
    private final StreamerMask streamerMask = new StreamerMask();
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
    /** Lobbymusik – nur aktiv, wenn der Hub die Stücke schickt ({@code lobby-music}). */
    private LobbyMusic music;

    /** Einstellungen des Spielmodus auf diesem Server (aus dem Panel) – trägt sie in seine config.yml ein. */
    private ModeSettings modes;

    /** Schnittstelle für Spielmodi (de.moinmorni.api.MoinMorni). */
    private ModeApi modeApi;
    /** „Wirklich zur Lobby?“ mitten im Spiel. */
    private LeaveAsk leaveAsk;
    /** „Zurück ins Spiel“ – nur in der Lobby aktiv (nur sie bekommt Angebote vom Hub). */
    private ReturnOffer returnOffer;
    /** Wer gerade spielt, alle 30 s noch einmal an den Hub (nach einem Neustart des Hubs kennt er es sonst nicht). */
    private static final long PLAYING_RESEND_TICKS = 600;

    /**
     * Vor allen anderen Plugins: Datenordner vom Zwischen-Namen zurückholen, dann gemerkte Einstellungen des Modus
     * eintragen, bevor er seine config.yml liest.
     */
    @Override
    public void onLoad() {
        Path plugins = getDataFolder().toPath().getParent();
        DataFolder.adoptInterim(plugins, getLogger());
        modes = new ModeSettings(plugins, plugins.resolve(HUB_DIR), getName(), getLogger());
        modes.applySaved();
    }

    @Override
    public void onEnable() {
        Path dir = getDataFolder().toPath().getParent().resolve(HUB_DIR);
        try {
            HubConfig hubConfig = HubConfig.load(dir);
            serverName = hubConfig.server();
            // Neu verbunden: MorniCraft-Spieler-Daten alle noch einmal schicken.
            hub = new HubClient(hubConfig, getLogger(), this::onHub, morniCraftSent::clear);
            startVoice();
        } catch (Exception e) {
            getLogger().warning("MoinMorni ist nicht eingerichtet (" + e.getMessage() + ") – der Server läuft ohne Netzwerk-Chat.");
        }
        // Erst wenn alle Plugins laufen: ein Netzwerk-Plugin unter dem Zwischen-Namen abschalten (nie zwei).
        getServer().getScheduler().runTask(this, this::retireInterimPlugin);
        getServer().getPluginManager().registerEvents(this, this);
        getServer().getScheduler().runTaskTimerAsynchronously(this, this::morniCraftPlayers, SUMMARY_TICKS, SUMMARY_TICKS);
        // Schnittstelle für Spielmodi (de.moinmorni.api.MoinMorni) – auch ohne Hub, dann läuft der Modus allein.
        leaveAsk = new LeaveAsk(this, this::langOf, this::answerLobby);
        leaveAsk.start();
        modeApi = new ModeApi(hub, serverName, this::langOfUuid, this::rankOf,
                uuid -> Optional.ofNullable(profiles.get(uuid)).map(Profile::rights).orElse(null),
                p -> leaveAsk.open(p, null));
        getServer().getServicesManager().register(de.moinmorni.api.MoinMorni.class, modeApi,
                this, org.bukkit.plugin.ServicePriority.Normal);
        getServer().getScheduler().runTaskTimerAsynchronously(this, modeApi::resendPlaying,
                PLAYING_RESEND_TICKS, PLAYING_RESEND_TICKS);
        lobby = new LobbyNpcs(this, hub, this::langOf);
        lobby.start();
        features = new LobbyFeatures(this, lobby, this::langOf);
        jail = new LobbyJail(this, features, this::langOf);
        clock = new LobbyClock(this);
        new LobbyFountain(this).start();
        features.setJail(jail::isJailed);
        // Lobbymusik: im Parkour, beim Rundgang und im Gefängnis leiser.
        music = new LobbyMusic(this, this::langOf,
                id -> features.inParkour(id) || features.inTour(id) || jail.isJailed(id));
        // In der Lobby bauen (im Kreativmodus): wer das Recht „Lobby bearbeiten“ hat – oder OP ist.
        features.setEditors(p -> Rights.mayEditLobby(rankRights(p)));
        getServer().getScheduler().runTask(this, this::logModeAdmins);
        jail.start();
        features.start();
        returnOffer = new ReturnOffer(this, hub, this::langOf);
        returnOffer.setJail(jail::isJailed);
        returnOffer.start();
        // Ruhezustand: ist der Server eine Weile leer, gründlich aufräumen und Arbeitsspeicher zurückgeben.
        new IdleTidy(this).start();
        // Erst verbinden, wenn alles steht – die ersten Nachrichten des Hubs gehen sonst ins Leere.
        if (hub != null) {
            try {
                hub.start();
            } catch (Exception e) {
                getLogger().warning("Hub nicht erreichbar (" + e.getMessage() + ") – der Server läuft ohne Netzwerk-Chat.");
            }
        }
    }

    /**
     * Liegt die Jar des Netzwerk-Plugins unter dem Zwischen-Namen noch da (eigentlich räumt MoinMorni sie vor dem
     * Neustart weg), laufen zwei Netzwerk-Plugins: das andere wird abgeschaltet und seine Jar gelöscht. Dieses lädt vor
     * ihm (plugin.yml: loadbefore) und ist darum zuerst dran. Hat es beim Laden den Datenordner wieder an sich gezogen,
     * kommt er zurück; ohne hub.json beim Start läuft der Server bis zum nächsten Neustart ohne Hub (macht MoinMorni,
     * sobald niemand drauf ist).
     */
    private void retireInterimPlugin() {
        org.bukkit.plugin.Plugin other = getServer().getPluginManager().getPlugin(DataFolder.INTERIM_PLUGIN);
        if (other == null || other == this) {
            return;
        }
        getLogger().warning("Das Netzwerk-Plugin unter dem Zwischen-Namen " + DataFolder.INTERIM_PLUGIN
                + " lief noch – es ist jetzt aus und seine Jar gelöscht (ab dem nächsten Start läuft nur noch "
                + getName() + ").");
        getServer().getPluginManager().disablePlugin(other);
        try {
            Path jar = Path.of(other.getClass().getProtectionDomain().getCodeSource().getLocation().toURI());
            if (Files.isRegularFile(jar)) {
                Files.delete(jar);
            }
        } catch (Exception e) {
            getLogger().warning("Die Jar ließ sich nicht löschen (" + e.getMessage() + ") – bitte von Hand.");
        }
        DataFolder.adoptInterim(getDataFolder().toPath().getParent(), getLogger());
        if (hub == null) {
            getLogger().warning("Ohne Hub bis zum nächsten Neustart – MoinMorni startet den Server neu, sobald niemand drauf ist.");
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
                        rightsOf(m),
                        streamingOf(m),
                        streamerPartsOf(m)));
                if (m.has("music") && m.get("music").isJsonObject()) {
                    music.onProfile(uuid, m.getAsJsonObject("music"));
                }
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
                        p.sendMessage(forViewer(p, "en".equals(langOf(p)) ? en : de));
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
            case "lobby-music" -> music.onSettings(m);
            case "lobby-ask" -> leaveAsk.onAsk(m);
            case "lobby-ask-close" -> leaveAsk.onClose(m);
            case "rejoin-offer" -> returnOffer.onOffer(m);
            case "rejoin-off" -> returnOffer.onOff(m);
            case "mornicraft-settings" -> morniCraftSettings(m);
            case "mode-settings" -> modeSettings(m);
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
                    Component text = MM.deserialize(HubClient.str(m, "text"));
                    boolean mask = m.has("mask") && m.get("mask").getAsBoolean();
                    p.sendMessage(mask ? streamerMask.apply(text) : forViewer(p, text));
                }
            });
            case "streamer-config" -> streamerMask.hosts(m.getAsJsonArray("hosts"));
            default -> {
            }
        }
    }

    /** Antwort aus dem Fenster „Wirklich zur Lobby?“ – an den Hub; ohne Hub geht „Ja“ wie toLobby. */
    private void answerLobby(Player p, boolean yes) {
        JsonObject body = new JsonObject();
        body.addProperty("t", "lobby-answer");
        body.addProperty("uuid", p.getUniqueId().toString());
        body.addProperty("yes", yes);
        if ((hub == null || !hub.send(body)) && yes) {
            modeApi.toLobby(p);
        }
    }

    // ---------- Einstellungen der Spielmodi (Duels, Morni Party …) ----------

    /**
     * Einstellungen aus dem Panel: in die config.yml des Modus-Plugins (Kommentare bleiben), nur wenn sich etwas
     * ändert. Gelten nach dem nächsten Neustart des Modus – ob einer nötig ist, erfährt der Hub; MoinMorni startet den
     * Server dann neu, sobald gerade niemand spielt.
     */
    private void modeSettings(JsonObject m) {
        ModeSettings.Settings settings;
        try {
            settings = modes.parse(m);
        } catch (IllegalArgumentException e) {
            getLogger().warning("Einstellungen des Modus abgelehnt: " + e.getMessage());
            return;
        }
        Bukkit.getScheduler().runTask(this, () -> {
            try {
                boolean present = getServer().getPluginManager().getPlugin(settings.plugin()) != null;
                ModeSettings.Result result = modes.apply(settings, present);
                JsonObject body = new JsonObject();
                body.addProperty("t", "mode-settings-state");
                body.addProperty("mode", settings.mode());
                body.addProperty("restart", result.restart());
                body.addProperty("changed", result.changed());
                if (hub != null) {
                    hub.send(body);
                }
            } catch (java.io.IOException | RuntimeException e) {
                getLogger().warning("Einstellungen des Modus nicht eingetragen: " + e.getMessage());
            }
        });
    }

    // ---------- MorniCraft (pmornhart/MorniCraft) ----------

    /** MorniCraft legt diese Datei über seine config.yml (nur im Netzwerk). */
    private static final String MORNICRAFT = "MorniCraft";
    private static final String MORNICRAFT_FILE = "network.json";
    /** Clan-Kürzel, das MorniCraft an den Spieler hängt (Metadaten) – kommt im Netzwerk-Chat vor den Namen. */
    private static final String TAG = "moinmorni:tag";
    private static final String TAG_COLOUR = "moinmorni:tag-colour";

    /** Ist MorniCraft hier? Dann malt MorniCraft Rang und Clan in Tab-Liste und über den Kopf (eigene Leisten). */
    private boolean morniCraft() {
        return getServer().getPluginManager().isPluginEnabled(MORNICRAFT);
    }

    /**
     * Einstellungen aus dem Panel (Einstellungen → MorniCraft): als Datei in den Ordner von MorniCraft, dann lädt
     * MorniCraft neu – sofort, ohne Neustart. Ohne MorniCraft bleibt nur die Datei liegen (für später).
     */
    private void morniCraftSettings(JsonObject m) {
        JsonObject config = m.getAsJsonObject("config");
        if (config == null) {
            return;
        }
        Path dir = getDataFolder().toPath().getParent().resolve(MORNICRAFT);
        try {
            java.nio.file.Files.createDirectories(dir);
            Path tmp = java.nio.file.Files.createTempFile(dir, "network", ".tmp");
            java.nio.file.Files.writeString(tmp, config.toString(), java.nio.charset.StandardCharsets.UTF_8);
            java.nio.file.Files.move(tmp, dir.resolve(MORNICRAFT_FILE), java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (java.io.IOException e) {
            getLogger().warning("MorniCraft-Einstellungen nicht gespeichert: " + e.getMessage());
            return;
        }
        Bukkit.getScheduler().runTask(this, () -> {
            if (morniCraft()) {
                Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "mornicraft reload");
            }
        });
    }

    /** Zusammenfassungen von MorniCraft (Zuhause, Clan, Gräber) – Datei → zuletzt geschickter Stand. */
    private final Map<String, Long> morniCraftSent = new ConcurrentHashMap<>();
    private static final long SUMMARY_TICKS = 100;
    private static final int SUMMARY_MAX_BYTES = 16_384;

    /**
     * MorniCraft schreibt pro Spieler plugins/MorniCraft/summary/<uuid>.json; was sich geändert hat, geht als
     * `mode-player` an den Hub (das Panel zeigt es auf der Spieler-Seite, nur lesen).
     */
    private void morniCraftPlayers() {
        if (hub == null || !hub.ready()) {
            return;
        }
        Path dir = getDataFolder().toPath().getParent().resolve(MORNICRAFT).resolve("summary");
        if (!java.nio.file.Files.isDirectory(dir)) {
            return;
        }
        try (java.util.stream.Stream<Path> files = java.nio.file.Files.list(dir)) {
            files.filter(f -> f.getFileName().toString().endsWith(".json")).forEach(f -> {
                try {
                    String name = f.getFileName().toString();
                    long changed = java.nio.file.Files.getLastModifiedTime(f).toMillis();
                    if (Long.valueOf(changed).equals(morniCraftSent.get(name))
                            || java.nio.file.Files.size(f) > SUMMARY_MAX_BYTES) {
                        return;
                    }
                    UUID uuid = UUID.fromString(name.substring(0, name.length() - ".json".length()));
                    JsonObject body = new JsonObject();
                    body.addProperty("t", "mode-player");
                    body.addProperty("mode", "mornicraft");
                    body.addProperty("uuid", uuid.toString());
                    body.add("data", com.google.gson.JsonParser.parseString(
                            java.nio.file.Files.readString(f, java.nio.charset.StandardCharsets.UTF_8)));
                    if (hub.send(body)) {
                        morniCraftSent.put(name, changed);
                    }
                } catch (java.io.IOException | RuntimeException e) {
                    // Halb geschrieben oder kaputt: beim nächsten Mal wieder.
                }
            });
        } catch (java.io.IOException e) {
            getLogger().warning("MorniCraft-Spieler-Daten nicht gelesen: " + e.getMessage());
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
        String tag = meta(event.getPlayer(), TAG);
        String colour = meta(event.getPlayer(), TAG_COLOUR);
        if (!tag.isEmpty() && !colour.isEmpty()) {
            JsonObject t = new JsonObject();
            t.addProperty("text", tag);
            t.addProperty("colour", colour);
            body.add("tag", t);
        }
        if (hub.send(body)) {
            event.setCancelled(true);
        }
    }

    private static String meta(Player p, String key) {
        List<org.bukkit.metadata.MetadataValue> values = p.getMetadata(key);
        return values.isEmpty() ? "" : values.get(0).asString();
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

    // ---------- Streamer-Modus ----------

    /** Metadaten für Spielmodi wie MorniCraft: an = Teile mit Komma („ip,coords,msg,live“), aus = nicht da. */
    private static final String STREAMER = "moinmorni:streamer";
    private static final String LIVE_MARK = "L";
    private static final int LIVE_ID_CHARS = 8;
    private static final String LIVE_SUFFIX = " ● LIVE";

    private static boolean streamingOf(JsonObject m) {
        JsonObject s = m.has("streamer") && m.get("streamer").isJsonObject() ? m.getAsJsonObject("streamer") : null;
        return s != null && s.has("on") && s.get("on").getAsBoolean();
    }

    private static java.util.Set<String> streamerPartsOf(JsonObject m) {
        java.util.Set<String> parts = new java.util.LinkedHashSet<>();
        JsonObject s = m.has("streamer") && m.get("streamer").isJsonObject() ? m.getAsJsonObject("streamer") : null;
        if (s != null && s.has("parts") && s.get("parts").isJsonArray()) {
            s.getAsJsonArray("parts").forEach(e -> parts.add(e.getAsString()));
        }
        return parts;
    }

    /** Verdeckt dieser Spieler gerade diesen Teil (ip, coords, msg, live)? */
    private boolean hides(Player p, String part) {
        Profile profile = profiles.get(p.getUniqueId());
        return profile != null && profile.streaming() && profile.hides().contains(part);
    }

    /** Text, wie ihn dieser Spieler sehen darf (Streamer: IP-Adressen und eigene Adressen als „•••“). */
    private Component forViewer(Player p, Component text) {
        return hides(p, "ip") ? streamerMask.apply(text) : text;
    }

    /** Zustand an den Spieler hängen – Spielmodi (MorniCraft) lesen ihn dort. */
    private void streamerMeta(Player p, Profile profile) {
        if (profile.streaming()) {
            p.setMetadata(STREAMER, new org.bukkit.metadata.FixedMetadataValue(this, String.join(",", profile.hides())));
        } else {
            p.removeMetadata(STREAMER, this);
        }
    }

    /** Rang-Rechte eines Spielers (leer, solange der Hub noch kein Profil geschickt hat). */
    private java.util.Set<String> rankRights(Player p) {
        Profile profile = profiles.get(p.getUniqueId());
        return profile == null ? java.util.Set.of() : profile.rights();
    }

    /**
     * Was dieser Server an Rechten kennt (für „Spielmodi verwalten“ und „Alles“): alle angemeldeten Rechte, die Rechte
     * der Befehle (auch Minecrafts eigene) und welche davon Spielmodi gehören. Jedes Mal neu – Plugins melden manche
     * Rechte und Befehle erst unterwegs an.
     */
    private java.util.List<Rights.Known> knownRights() {
        org.bukkit.plugin.PluginManager pm = getServer().getPluginManager();
        java.util.Set<org.bukkit.plugin.Plugin> modePlugins = new java.util.HashSet<>();
        java.util.Set<String> modeNodes = new java.util.HashSet<>();
        for (org.bukkit.plugin.Plugin plugin : pm.getPlugins()) {
            io.papermc.paper.plugin.configuration.PluginMeta meta = plugin.getPluginMeta();
            if (Rights.isMode(meta.getName(), meta.getPluginDependencies(), meta.getPluginSoftDependencies())) {
                modePlugins.add(plugin);
                meta.getPermissions().forEach(perm -> modeNodes.add(perm.getName().toLowerCase(java.util.Locale.ROOT)));
            }
        }
        java.util.List<Rights.Known> known = new java.util.ArrayList<>();
        for (org.bukkit.permissions.Permission perm : pm.getPermissions()) {
            org.bukkit.permissions.PermissionDefault def = perm.getDefault();
            String node = perm.getName().toLowerCase(java.util.Locale.ROOT);
            known.add(new Rights.Known(node,
                    def == org.bukkit.permissions.PermissionDefault.OP || def == org.bukkit.permissions.PermissionDefault.TRUE,
                    modeNodes.contains(node)));
        }
        try {
            for (org.bukkit.command.Command command
                    : new java.util.HashSet<>(getServer().getCommandMap().getKnownCommands().values())) {
                boolean mode = command instanceof org.bukkit.command.PluginCommand pc && modePlugins.contains(pc.getPlugin());
                Rights.split(command.getPermission()).forEach(node ->
                        known.add(new Rights.Known(node.toLowerCase(java.util.Locale.ROOT), true, mode)));
            }
        } catch (RuntimeException e) {
            getLogger().warning("Befehle des Servers nicht gelesen (" + e.getMessage() + ") – Rechte nur aus den Plugins.");
        }
        // Im Modus nur als Recht seines Befehls angegeben, nirgends angemeldet: zählt trotzdem.
        modeNodes.forEach(node -> known.add(new Rights.Known(node, true, true)));
        return known;
    }

    /** Einmal nach dem Start: was „Spielmodi verwalten“ hier bedeutet (fürs Protokoll). */
    private void logModeAdmins() {
        java.util.Set<String> admins = Rights.modeAdmins(knownRights());
        if (!admins.isEmpty()) {
            getLogger().info("„Spielmodi verwalten“ gibt hier: " + String.join(", ", admins));
        }
    }

    /**
     * Rechte aus dem Rang (siehe {@link Rights}): Teleport, Zuschauen, Spielmodus, Verwaltung der Spielmodi und „Alles“
     * – jedes Mal komplett neu, ein entzogenes Recht ist sofort weg. Auf dem Bau-Server: wer bauen darf, ist im
     * Kreativmodus; wer WorldEdit darf, ist dort OP (WorldEdit fragt viele einzelne Rechte ab, die nirgends angemeldet
     * sind). Alle anderen sind dort Gast im Abenteuermodus ohne OP.
     */
    private void applyRights(Player p, Profile profile) {
        org.bukkit.permissions.PermissionAttachment old = attachments.remove(p.getUniqueId());
        if (old != null) {
            p.removeAttachment(old);
        }
        org.bukkit.permissions.PermissionAttachment attachment = p.addAttachment(this);
        Rights.nodes(profile.rights(), knownRights()).forEach(node -> attachment.setPermission(node, true));
        attachments.put(p.getUniqueId(), attachment);
        // Befehlsliste des Spiels neu schicken: was jetzt erlaubt ist, schlägt die Tab-Taste vor (und steht nicht rot da).
        p.updateCommands();
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

    /**
     * Minecraft kennt für /gamemode nur ein Recht: Wer zuschauen oder den Spielmodus wechseln darf, käme damit auch in
     * den Kreativmodus. Den gibt es nur mit dem Recht „Kreativmodus“ (oder „Alles“, oder als OP).
     */
    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onCommand(org.bukkit.event.player.PlayerCommandPreprocessEvent event) {
        Player p = event.getPlayer();
        if (p.isOp() || !Rights.asksCreative(event.getMessage()) || Rights.mayCreative(rankRights(p))) {
            return;
        }
        event.setCancelled(true);
        p.sendMessage(MM.deserialize("en".equals(langOf(p)) ? NO_CREATIVE_EN : NO_CREATIVE_DE));
    }

    /**
     * Der Spielmodus-Umschalter (F3+F4) läuft an {@link #onCommand} vorbei: Paper erlaubt ihn mit dem Recht für
     * /gamemode. Kreativ darüber nur mit „Kreativmodus“ oder „Alles“ (oder als OP) – wie beim Befehl.
     */
    @EventHandler(priority = EventPriority.LOW, ignoreCancelled = true)
    public void onGameModeSwitcher(org.bukkit.event.player.PlayerGameModeChangeEvent event) {
        Player p = event.getPlayer();
        boolean toCreative = event.getNewGameMode() == org.bukkit.GameMode.CREATIVE;
        if (p.isOp() || !Rights.blocksSwitcher(event.getCause().name(), toCreative, rankRights(p))) {
            return;
        }
        event.setCancelled(true);
        p.sendMessage(MM.deserialize("en".equals(langOf(p)) ? NO_CREATIVE_EN : NO_CREATIVE_DE));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Player p = event.getPlayer();
        profiles.remove(p.getUniqueId());
        modeApi.forget(p.getUniqueId());
        org.bukkit.permissions.PermissionAttachment attachment = attachments.remove(p.getUniqueId());
        if (attachment != null) {
            p.removeAttachment(attachment);
        }
        Team team = Bukkit.getScoreboardManager().getMainScoreboard().getEntryTeam(p.getName());
        if (team != null && team.getName().startsWith(TEAM_PREFIX)) {
            leaveTeam(team, p.getName());
        }
        p.removeMetadata(STREAMER, this);
    }

    /** Aus dem Team; das eigene Team eines Streamers geht danach ganz weg. */
    private static void leaveTeam(Team team, String entry) {
        team.removeEntry(entry);
        boolean own = team.getName().length() > TEAM_PREFIX.length() + 2
                && team.getName().startsWith(LIVE_MARK, TEAM_PREFIX.length() + 2);
        if (own && team.getEntries().isEmpty()) {
            team.unregister();
        }
    }

    /** Hauptthread: Rang-Symbol und Farbe an den Spieler hängen. */
    private void apply(Player p) {
        Profile profile = profiles.get(p.getUniqueId());
        if (profile == null) {
            return;
        }
        applyRights(p, profile);
        streamerMeta(p, profile);
        if (morniCraft()) {
            // MorniCraft zeigt den Rang des Netzwerks selbst (mit Clan-Kürzel, auf den Leisten jedes Spielers).
            return;
        }
        TextColor colour = TextColor.fromHexString(profile.colour());
        Component prefix = profile.symbol() == null || profile.symbol().isEmpty()
                ? Component.empty()
                : Component.text(profile.symbol() + " ", colour);
        // Streamer-Modus: die anderen sehen „● LIVE“ hinter dem Namen (wie in MorniCraft).
        boolean live = hides(p, "live");
        Component suffix = live ? Component.text(LIVE_SUFFIX, net.kyori.adventure.text.format.NamedTextColor.RED)
                : Component.empty();
        p.playerListName(prefix.append(Component.text(p.getName(), colour)).append(suffix));

        Scoreboard board = Bukkit.getScoreboardManager().getMainScoreboard();
        // Teams sortieren die Tab-Liste nach Namen: mm00owner vor mm06player; Streamer ein eigenes daneben
        // („mm06L1a2b3c4d“), damit nur ihr Name „● LIVE“ bekommt.
        String name = live
                ? String.format("%s%02d%s%s", TEAM_PREFIX, profile.position(), LIVE_MARK,
                        p.getUniqueId().toString().substring(0, LIVE_ID_CHARS))
                : String.format("%s%02d%s", TEAM_PREFIX, profile.position(), profile.roleId());
        String teamName = name.length() > TEAM_NAME_MAX ? name.substring(0, TEAM_NAME_MAX) : name;
        Team team = board.getTeam(teamName);
        if (team == null) {
            team = board.registerNewTeam(teamName);
        }
        team.prefix(prefix);
        team.suffix(suffix);
        if (colour != null) {
            team.color(net.kyori.adventure.text.format.NamedTextColor.nearestTo(colour));
        }
        Team old = board.getEntryTeam(p.getName());
        if (old != null && old != team && old.getName().startsWith(TEAM_PREFIX)) {
            leaveTeam(old, p.getName());
        }
        team.addEntry(p.getName());
    }
}
