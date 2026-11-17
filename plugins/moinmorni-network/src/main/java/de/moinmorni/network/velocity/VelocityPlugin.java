package de.moinmorni.network.velocity;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.inject.Inject;
import com.velocitypowered.api.command.CommandMeta;
import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.event.EventTask;
import com.velocitypowered.api.event.PostOrder;
import com.velocitypowered.api.event.ResultedEvent;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.DisconnectEvent;
import com.velocitypowered.api.event.connection.LoginEvent;
import com.velocitypowered.api.event.player.KickedFromServerEvent;
import com.velocitypowered.api.event.player.PlayerChooseInitialServerEvent;
import com.velocitypowered.api.event.player.PlayerResourcePackStatusEvent;
import com.velocitypowered.api.event.player.PlayerSettingsChangedEvent;
import com.velocitypowered.api.event.player.ServerPreConnectEvent;
import com.velocitypowered.api.event.player.ServerResourcePackSendEvent;
import com.velocitypowered.api.event.player.ServerConnectedEvent;
import com.velocitypowered.api.event.player.ServerPostConnectEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.event.proxy.ProxyPingEvent;
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.PluginContainer;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.proxy.player.ResourcePackInfo;
import com.velocitypowered.api.proxy.server.RegisteredServer;
import com.velocitypowered.api.proxy.server.ServerPing;
import de.moinmorni.network.common.DataFolder;
import de.moinmorni.network.common.HubClient;
import de.moinmorni.network.common.HubConfig;
import de.moinmorni.network.common.StreamerMask;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;

/**
 * Der Proxy-Teil: meldet dem Hub, wer kommt, wechselt und geht, lässt den Hub über die Anmeldung entscheiden
 * (Bann, Wartung, voll), zeigt MOTD und Spielerzahl aus dem Panel und reicht Netzwerk-Befehle an den Hub weiter.
 * Wer ankommt oder von einem Server fliegt, landet in der Lobby, sonst in der Wartungs-Lobby – nie geht es weiter
 * durch die {@code try}-Liste (Bau-Server, Spielmodi), siehe {@link Fallback}.
 */
@Plugin(
        id = "moinmorni",
        name = "MoinMorni",
        version = "0.2.2",
        description = "Verbindet den Proxy mit dem MoinMorni-Netzwerk",
        url = "https://moinmorni.net",
        authors = {"MoinMorni"})
public final class VelocityPlugin {

    private static final MiniMessage MM = MiniMessage.miniMessage();
    private static final LegacyComponentSerializer LEGACY = LegacyComponentSerializer.legacySection();
    private static final String HUB_DIR = "moinmorni";
    private static final String LOBBY = Fallback.LOBBY;
    private static final String WARTUNG = Fallback.WARTUNG;
    /** Ohne Hub: so oft nachsehen, ob die Lobby wieder antwortet (dann die Wartenden zurück). */
    private static final long LOCAL_RETURN_SECONDS = 5;
    private static final String LOST_SERVER =
            "<gold>Hoppla – <white><server></white> ist gerade weg, du bist zurück im Dorf.</gold> "
            + "<gray>(<server> went away for a moment – you're back in the village.)</gray>";
    private static final String LOCAL_BYE =
            "<gold><bold>Die Lobby startet gerade neu</bold></gold>\n\n<gray>Gleich wieder da – versuch es in ein paar Sekunden nochmal.</gray>\n"
            + "<gray>The lobby is restarting – back in a moment, try again in a few seconds.</gray>";
    private static final String LOCAL_BACK =
            "<green>Die Lobby ist wieder da!</green> <gray>/ The lobby is back!</gray>";
    /** So lange nach dem Start bekommt die eigene Jar notfalls ihre Datei zurück (siehe retireInterimPlugin). */
    private static final long KEEP_JAR_SECONDS = 10;
    private static final String HUB_AWAY =
            "<gold>MoinMorni startet gerade neu</gold> <gray>– versuch es in ein paar Sekunden nochmal.</gray>\n"
            + "<gray>MoinMorni is restarting – try again in a few seconds.</gray>";

    private final ProxyServer proxy;
    private final Logger log;
    private final Path dataDir;
    private final List<String> commands = new ArrayList<>();
    /** Banns aus der letzten Liste des Hubs: gelten auch, wenn der Hub kurz weg ist. */
    private final Map<UUID, Instant> bans = new ConcurrentHashMap<>();
    /** Erster Server je Spieler, wie der Hub ihn bei der Anmeldung sagt (Lobby oder Wartungs-Lobby). */
    private final Map<UUID, String> firstServer = new ConcurrentHashMap<>();
    /** Wohin der Proxy einen Spieler gerade schickt (Ankunft, Rauswurf) – der Hub erfährt es beim Verbinden. */
    private final Map<UUID, String> sending = new ConcurrentHashMap<>();
    /** Server, die bei diesem Spieler gerade gescheitert sind (bis er wieder irgendwo ist). */
    private final Map<UUID, Set<String>> failed = new ConcurrentHashMap<>();
    private volatile JsonObject network;
    /** Streamer-Modus: was der Hub an Streamer schickt, mit „•••“ statt IP-Adressen und eigenen Adressen. */
    private final StreamerMask streamerMask = new StreamerMask();
    private HubClient hub;
    /** Rang-Abzeichen: was der Hub sagt, und wem der Proxy das Paket geschickt hat (BadgePack). */
    private volatile BadgePack.Config badges = BadgePack.Config.OFF;
    private final Map<UUID, BadgePack.Sent> badgeSent = new ConcurrentHashMap<>();
    /** Netzwerk-Paket (Möbel, Brunnen, Fische, Kleidung, Musik): gleiche Regeln wie die Abzeichen, an jeden Java-Client. */
    private volatile BadgePack.Config netz = BadgePack.Config.OFF;
    private final Map<UUID, BadgePack.Sent> netzSent = new ConcurrentHashMap<>();
    /** Leiste mit Countdown vor einem Neustart (Hub: „countdown“). */
    private final Countdown countdown;

    @Inject
    public VelocityPlugin(ProxyServer proxy, @DataDirectory Path dataDir) {
        this.proxy = proxy;
        this.log = Logger.getLogger("MoinMorni");
        this.dataDir = dataDir.getParent().resolve(HUB_DIR);
        this.countdown = new Countdown(proxy, this);
        // Vor allem anderen: Datenordner vom Zwischen-Namen zurückholen.
        DataFolder.adoptInterim(dataDir.getParent(), log);
    }

    /** Als Erstes – vor einem Netzwerk-Plugin unter dem Zwischen-Namen, falls dessen Jar noch daliegt. */
    @SuppressWarnings("deprecation")
    @Subscribe(order = PostOrder.CUSTOM, priority = Short.MAX_VALUE)
    public void onInit(ProxyInitializeEvent event) {
        Optional<PluginContainer> interim = proxy.getPluginManager().getPlugin(DataFolder.INTERIM_PROXY_PLUGIN);
        // Hat es beim Laden den Datenordner wieder an sich gezogen, kommt er jetzt zurück.
        interim.ifPresent(other -> DataFolder.adoptInterim(dataDir.getParent(), log));
        try {
            HubConfig config = HubConfig.load(dataDir);
            hub = new HubClient(config, log, this::onHub, this::sendOnline);
            hub.start();
        } catch (Exception e) {
            log.warning("MoinMorni ist nicht eingerichtet (" + e.getMessage() + ") – der Proxy läuft ohne Netzwerk-Funktionen.");
        }
        proxy.getScheduler().buildTask(this, this::returnWithoutHub)
                .repeat(LOCAL_RETURN_SECONDS, TimeUnit.SECONDS).schedule();
        interim.ifPresent(this::retireInterimPlugin);
    }

    /**
     * Liegt die Jar des Netzwerk-Plugins unter dem Zwischen-Namen noch da (eigentlich räumt MoinMorni sie vor dem
     * Neustart weg), wird sie gelöscht. Abschalten kann Velocity Plugins nicht – ohne seinen Ordner ist das andere nicht
     * eingerichtet und tut nichts. Es versucht beim Start aber, diese Jar zu löschen: Sie kommt aus dem Speicher zurück.
     */
    private void retireInterimPlugin(PluginContainer other) {
        log.warning("Das Netzwerk-Plugin unter dem Zwischen-Namen lief noch – seine Jar wird gelöscht.");
        other.getDescription().getSource().ifPresent(jar -> {
            try {
                Files.deleteIfExists(jar);
            } catch (IOException e) {
                log.warning("Die Jar ließ sich nicht löschen (" + e.getMessage() + ") – bitte von Hand.");
            }
        });
        proxy.getPluginManager().fromInstance(this).flatMap(own -> own.getDescription().getSource()).ifPresent(own -> {
            try {
                byte[] bytes = Files.readAllBytes(own);
                proxy.getScheduler().buildTask(this, () -> keepJar(own, bytes))
                        .delay(KEEP_JAR_SECONDS, TimeUnit.SECONDS).schedule();
            } catch (IOException e) {
                log.warning("Eigene Jar nicht lesbar (" + e.getMessage() + ").");
            }
        });
    }

    private void keepJar(Path own, byte[] bytes) {
        if (Files.exists(own)) {
            return;
        }
        try {
            Files.write(own, bytes);
            log.info("Eigene Jar wiederhergestellt (" + own.getFileName() + ").");
        } catch (IOException e) {
            log.warning("Eigene Jar ließ sich nicht wiederherstellen (" + e.getMessage() + ") – MoinMorni spielt sie neu auf.");
        }
    }

    @Subscribe
    public void onShutdown(ProxyShutdownEvent event) {
        countdown.hideAll();
        if (hub != null) {
            hub.stop();
        }
    }

    // ---------- Meldungen vom Hub ----------

    private void onHub(JsonObject m) {
        String type = HubClient.str(m, "t");
        if (type == null) {
            return;
        }
        switch (type) {
            case "welcome" -> registerCommands(m.getAsJsonArray("commands"));
            case "network" -> network = m;
            case "bans" -> updateBans(m.getAsJsonArray("list"));
            case "msg" -> player(m).ifPresent(p -> p.sendMessage(message(m)));
            case "streamer-config" -> streamerMask.hosts(m.getAsJsonArray("hosts"));
            case "kick" -> player(m).ifPresent(p -> p.disconnect(MM.deserialize(HubClient.str(m, "text"))));
            case "connect" -> player(m).ifPresent(p -> proxy.getServer(HubClient.str(m, "server"))
                    .ifPresent(s -> p.createConnectionRequest(s).fireAndForget()));
            case "badges" -> {
                badges = BadgePack.Config.of(m);
                // An, aus oder neue Fassung (Rang geändert): gleich für alle, die schon da sind.
                proxy.getAllPlayers().forEach(p -> offerBadges(p, false));
            }
            case "badges-send" -> player(m).ifPresent(p -> offerBadges(p, true));
            case "netzpaket" -> {
                netz = BadgePack.Config.of(m);
                // Neue Fassung (oder an/aus): gleich für alle, die schon da sind – einmal, nicht bei jedem Wechsel.
                proxy.getAllPlayers().forEach(p -> offerNetz(p, false));
            }
            case "netzpaket-send" -> player(m).ifPresent(p -> offerNetz(p, true));
            case "countdown" -> player(m).ifPresent(p -> countdown.show(p, HubClient.str(m, "text"),
                    m.has("seconds") ? m.get("seconds").getAsInt() : 0));
            default -> log.fine("Unbekannte Nachricht vom Hub: " + type);
        }
    }

    /** Nachricht vom Hub; an Streamer (Feld „mask“) mit verdeckten Adressen. */
    private Component message(JsonObject m) {
        Component text = MM.deserialize(HubClient.str(m, "text"));
        return m.has("mask") && m.get("mask").getAsBoolean() ? streamerMask.apply(text) : text;
    }

    private Optional<Player> player(JsonObject m) {
        String uuid = HubClient.str(m, "uuid");
        return uuid == null ? Optional.empty() : proxy.getPlayer(UUID.fromString(uuid));
    }

    private void updateBans(JsonArray list) {
        bans.clear();
        for (JsonElement e : list) {
            JsonObject ban = e.getAsJsonObject();
            String until = HubClient.str(ban, "until");
            bans.put(UUID.fromString(HubClient.str(ban, "uuid")), until == null ? Instant.MAX : Instant.parse(until));
        }
    }

    /** Nach jedem (Wieder-)Verbinden: wer ist gerade da? */
    private void sendOnline() {
        JsonArray list = new JsonArray();
        for (Player p : proxy.getAllPlayers()) {
            JsonObject o = new JsonObject();
            o.addProperty("uuid", p.getUniqueId().toString());
            o.addProperty("name", p.getUsername());
            o.addProperty("server", p.getCurrentServer().map(s -> s.getServerInfo().getName()).orElse(null));
            o.addProperty("locale", localeOf(p));
            o.addProperty("bedrock", bedrock(p.getUniqueId()));
            list.add(o);
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "online");
        body.add("players", list);
        hub.send(body);
    }

    // ---------- Spieler ----------

    @Subscribe
    public EventTask onLogin(LoginEvent event) {
        Player p = event.getPlayer();
        if (hub == null) {
            return null;
        }
        if (!hub.ready()) {
            Instant until = bans.get(p.getUniqueId());
            if (until != null && until.isAfter(Instant.now())) {
                event.setResult(ResultedEvent.ComponentResult.denied(MM.deserialize(
                        "<red><bold>Du bist gebannt</bold></red>\n\n<gray>You are banned.")));
            } else if (maintenance()) {
                // Ohne Hub weiß der Proxy nicht, wer zum Team gehört – bei Wartung geht es nur in die Wartungs-Lobby
                // (ohne sie bleibt die Tür ganz zu).
                if (wartungOn() && proxy.getServer(WARTUNG).isPresent()) {
                    firstServer.put(p.getUniqueId(), WARTUNG);
                } else {
                    event.setResult(ResultedEvent.ComponentResult.denied(MM.deserialize(HUB_AWAY)));
                }
            }
            return null;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "login");
        body.addProperty("uuid", p.getUniqueId().toString());
        body.addProperty("name", p.getUsername());
        body.addProperty("locale", localeOf(p));
        body.addProperty("bedrock", bedrock(p.getUniqueId()));
        CompletableFuture<Void> done = hub.request(body).handle((data, error) -> {
            if (error == null && data.has("allow") && !data.get("allow").getAsBoolean()) {
                event.setResult(ResultedEvent.ComponentResult.denied(MM.deserialize(HubClient.str(data, "message"))));
            } else if (error == null && HubClient.str(data, "server") != null) {
                firstServer.put(p.getUniqueId(), HubClient.str(data, "server"));
            }
            return null;
        });
        return EventTask.resumeWhenComplete(done);
    }

    /** Erster Server: was der Hub sagt (Lobby, oder die Wartungs-Lobby, wenn die Lobby fehlt oder Wartung ist). */
    @Subscribe(order = PostOrder.LATE)
    public void onChooseInitial(PlayerChooseInitialServerEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        String wanted = firstServer.remove(id);
        String name = wanted != null && Fallback.openWithoutHub(wanted) ? wanted : LOBBY;
        Optional<RegisteredServer> server = proxy.getServer(name).or(() -> proxy.getServer(LOBBY));
        server.ifPresent(s -> {
            event.setInitialServer(s);
            sending.put(id, s.getServerInfo().getName());
        });
    }

    /**
     * Rauswurf von einem Server oder Verbinden gescheitert: nur Lobby oder Wartungs-Lobby (der Hub sagt, in welcher
     * Reihenfolge und mit welcher Nachricht), sonst freundlich trennen. Scheitert ein Wechsel, während der Spieler noch
     * auf einem Server ist, bleibt er einfach dort (das macht Velocity selbst).
     */
    @Subscribe(order = PostOrder.LAST)
    public EventTask onKicked(KickedFromServerEvent event) {
        Player p = event.getPlayer();
        if (event.kickedDuringServerConnect() || !p.isActive()) {
            return null;
        }
        String from = event.getServer().getServerInfo().getName();
        Set<String> tried = failed.computeIfAbsent(p.getUniqueId(), k -> ConcurrentHashMap.newKeySet());
        tried.add(from);
        Component reason = event.getServerKickReason().orElse(null);
        if (hub == null || !hub.ready()) {
            redirect(event, Fallback.localOrder(maintenance(), wartungOn()), tried, LOCAL_BYE, reason);
            return null;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "fallback");
        body.addProperty("uuid", p.getUniqueId().toString());
        body.addProperty("from", from);
        JsonArray list = new JsonArray();
        tried.forEach(list::add);
        body.add("tried", list);
        CompletableFuture<Void> done = hub.request(body).handle((data, error) -> {
            if (error != null || data == null || !data.has("order")) {
                redirect(event, Fallback.localOrder(maintenance(), wartungOn()), tried, LOCAL_BYE, reason);
                return null;
            }
            List<String> order = new ArrayList<>();
            data.getAsJsonArray("order").forEach(e -> order.add(e.getAsString()));
            redirect(event, Fallback.onlyFallbacks(order), tried, HubClient.str(data, "bye"), reason);
            return null;
        });
        return EventTask.resumeWhenComplete(done);
    }

    private void redirect(KickedFromServerEvent event, List<String> order, Set<String> tried, String bye,
                          Component reason) {
        Player p = event.getPlayer();
        Optional<String> next = Fallback.next(order, tried, name -> proxy.getServer(name).isPresent());
        if (next.isEmpty()) {
            Component text = MM.deserialize(bye == null ? LOCAL_BYE : bye);
            event.setResult(KickedFromServerEvent.DisconnectPlayer.create(text));
            return;
        }
        RegisteredServer target = proxy.getServer(next.get()).orElseThrow();
        sending.put(p.getUniqueId(), target.getServerInfo().getName());
        // In die Wartungs-Lobby ohne Nachricht vom Proxy: Beim Wechsel ginge sie verloren, die Wartungs-Lobby sagt
        // beim Ankommen selbst, warum man dort ist. In die Lobby mit dem Grund des Rauswurfs (wie Velocity sonst).
        Component message = WARTUNG.equals(next.get()) ? Component.empty() : friendlyReason(reason, event);
        event.setResult(KickedFromServerEvent.RedirectPlayer.create(target, message));
    }

    /**
     * Grund für den Wechsel in die Lobby. Bricht ein Spielserver weg (Absturz, Neustart), hat er keinen eigenen Grund –
     * Velocity zeigte dann sein englisches „An internal server connection error occurred.“. Jetzt ein freundlicher
     * Satz in Deutsch und Englisch; ein echter Grund des Servers (z. B. Rauswurf) bleibt.
     */
    static Component friendlyReason(Component reason, KickedFromServerEvent event) {
        boolean ownWords = reason != null
                && !(reason instanceof net.kyori.adventure.text.TranslatableComponent t && t.key().startsWith("velocity."))
                && !net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer.plainText()
                        .serialize(reason).isBlank();
        if (ownWords) {
            return reason;
        }
        String server = event == null ? "" : event.getServer().getServerInfo().getName();
        return MM.deserialize(LOST_SERVER.replace("<server>", MM.escapeTags(server)));
    }

    /** Ohne Hub: Antwortet die Lobby wieder, kommen die Wartenden zurück (nicht während einer Wartung). */
    private void returnWithoutHub() {
        if (hub == null || hub.ready() || maintenance()) {
            return;
        }
        Optional<RegisteredServer> wartung = proxy.getServer(WARTUNG);
        Optional<RegisteredServer> lobby = proxy.getServer(LOBBY);
        if (wartung.isEmpty() || lobby.isEmpty() || wartung.get().getPlayersConnected().isEmpty()) {
            return;
        }
        lobby.get().ping().thenAccept(ping -> wartung.get().getPlayersConnected().forEach(p -> {
            p.sendMessage(MM.deserialize(LOCAL_BACK));
            p.createConnectionRequest(lobby.get()).fireAndForget();
        }));
    }

    private boolean maintenance() {
        JsonObject net = network;
        return net != null && net.has("maintenance") && net.get("maintenance").getAsBoolean();
    }

    /** Wartungs-Lobby eingeschaltet? (Ohne Angabe vom Hub: ja.) */
    private boolean wartungOn() {
        JsonObject net = network;
        return net == null || !net.has("wartung") || net.get("wartung").getAsBoolean();
    }

    /** Ohne Hub: in die Lobby und die Wartungs-Lobby ja, woandershin nein (wer gerade erst kommt, landet in der Lobby). */
    private void closedWithoutHub(ServerPreConnectEvent event, RegisteredServer target) {
        if (Fallback.openWithoutHub(target.getServerInfo().getName())) {
            return;
        }
        Optional<RegisteredServer> lobby = proxy.getServer(LOBBY);
        if (event.getPreviousServer() == null && lobby.isPresent()) {
            event.setResult(ServerPreConnectEvent.ServerResult.allowed(lobby.get()));
        } else {
            event.setResult(ServerPreConnectEvent.ServerResult.denied());
            event.getPlayer().sendMessage(MM.deserialize(HUB_AWAY));
        }
    }

    /**
     * Vor jedem Serverwechsel: Ist der Modus offen und wach? Schläft er, weckt ihn der Hub und der Spieler kommt
     * danach von selbst hinein. Wer gerade erst ins Netzwerk kommt, wartet so lange in der Lobby (bzw. bei Wartung in
     * der Wartungs-Lobby, wenn der Hub es sagt).
     */
    @Subscribe
    public EventTask onPreConnect(ServerPreConnectEvent event) {
        Optional<RegisteredServer> target = event.getResult().getServer();
        if (hub == null || target.isEmpty()) {
            return null;
        }
        String name = target.get().getServerInfo().getName();
        boolean sent = name.equals(sending.remove(event.getPlayer().getUniqueId()));
        if (!hub.ready()) {
            // Ohne Hub kann niemand prüfen, wer in Bau-Server, Einladungs-Modi oder Wartung darf: nur Lobby und
            // Wartungs-Lobby sind offen.
            closedWithoutHub(event, target.get());
            return null;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "connecting");
        body.addProperty("uuid", event.getPlayer().getUniqueId().toString());
        body.addProperty("server", name);
        // Der Proxy schickt ihn hin (Ankunft oder Rauswurf) – in der Wartungs-Lobby wartet er dann und kommt zurück.
        body.addProperty("fallback", sent);
        CompletableFuture<Void> done = hub.request(body).handle((data, error) -> {
            if (error != null) {
                closedWithoutHub(event, target.get());
                return null;
            }
            if (!data.has("allow") || data.get("allow").getAsBoolean()) {
                return null;
            }
            String redirect = HubClient.str(data, "redirect");
            Optional<RegisteredServer> lobby = redirect != null && Fallback.openWithoutHub(redirect)
                    ? proxy.getServer(redirect) : proxy.getServer(LOBBY);
            boolean first = event.getPreviousServer() == null;
            if (first && lobby.isPresent() && !lobby.get().equals(target.get())) {
                event.setResult(ServerPreConnectEvent.ServerResult.allowed(lobby.get()));
            } else {
                event.setResult(ServerPreConnectEvent.ServerResult.denied());
            }
            return null;
        });
        return EventTask.resumeWhenComplete(done);
    }

    @Subscribe
    public void onConnected(ServerConnectedEvent event) {
        if (hub == null) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "switch");
        body.addProperty("uuid", event.getPlayer().getUniqueId().toString());
        body.addProperty("server", event.getServer().getServerInfo().getName());
        hub.send(body);
    }

    /**
     * Ein Paket fürs ganze Netzwerk: Beim ersten Server bekommt jeder Java-Spieler das Netzwerk-Paket (Möbel, Brunnen,
     * Fische, Kleidung, Musik) und das kleine Abzeichen-Paket – Minecraft fragt einmal und lädt beides in einem Rutsch.
     * Danach nimmt der Proxy nichts mehr ab und schickt nichts neu: Jeder Wechsel zwischen Lobby und Spielmodi geht ohne
     * Ladebildschirm.
     */
    @Subscribe
    public void onSwitched(ServerPostConnectEvent event) {
        Player p = event.getPlayer();
        failed.remove(p.getUniqueId());
        if (event.getPreviousServer() == null) {
            offerNetz(p, false);
            offerBadges(p, false);
        }
        // Aufräumen nach dem Umstieg: Hat jemand noch ein früheres Server-Paket (Möbel, Fische), kommt es weg – der
        // Inhalt steckt im Netzwerk-Paket.
        p.getAppliedResourcePacks().stream()
                .map(ResourcePackInfo::getId)
                .filter(BadgePack.OLD_SERVER_PACKS::contains)
                .forEach(p::removeResourcePacks);
    }

    /**
     * Spielserver bieten kein eigenes Paket mehr an. Steht in einer noch nicht aufgeräumten server.properties (oder in
     * einer älteren Angelkönig-Fassung) noch eins von uns, lässt der Proxy es nicht durch – der Server bekommt
     * „abgelehnt“ zurück und der Spieler lädt nichts.
     */
    @Subscribe
    public void onServerPack(ServerResourcePackSendEvent event) {
        ResourcePackInfo pack = event.getProvidedResourcePack();
        if (pack != null && BadgePack.oldServerPack(pack.getId(), pack.getUrl())) {
            event.setResult(ResultedEvent.GenericResult.denied());
        }
    }

    /**
     * Was hat der Spieler mit dem Netzwerk-Paket gemacht? Der Hub gibt es mit dem Profil weiter (`pack`): Mit Paket
     * spielt die Lobbymusik als Klangdatei, Angelkönig zeigt die eigene Kleidung (Metadaten am Spieler). Abgelehnt +
     * Pflicht → der Hub wirft freundlich hinaus. Nach einem Fehler versucht es der Proxy noch dreimal.
     */
    @Subscribe
    public void onPackStatus(PlayerResourcePackStatusEvent event) {
        if (!BadgePack.NETZ_ID.equals(event.getPackId()) || event.getStatus().isIntermediate()) {
            return;
        }
        Player p = event.getPlayer();
        BadgePack.Config config = netz;
        BadgePack.Sent sent = netzSent.get(p.getUniqueId());
        ResourcePackInfo info = event.getPackInfo();
        // Antwort auf eine ältere Fassung (inzwischen neu geschickt oder ausgeschaltet): zählt nicht.
        if (sent == null || info == null || !config.enabled() || !Arrays.equals(info.getHash(), config.hash())) {
            return;
        }
        switch (event.getStatus()) {
            case SUCCESSFUL -> reportNetz(p, true, "loaded");
            case DECLINED -> {
                netzSent.put(p.getUniqueId(), new BadgePack.Sent(sent.sha1(), true, sent.tries()));
                reportNetz(p, false, "declined");
            }
            case DISCARDED -> reportNetz(p, false, "discarded");
            case FAILED_DOWNLOAD, INVALID_URL, FAILED_RELOAD -> {
                int next = sent.tries() + 1;
                long delay = BadgePack.retryDelaySeconds(next);
                if (delay == 0) {
                    reportNetz(p, false, "failed");
                    return;
                }
                proxy.getScheduler().buildTask(this, () -> {
                    BadgePack.Config now = netz;
                    if (p.isActive() && now.enabled() && now.sha1().equals(config.sha1())) {
                        sendNetz(p, now, next);
                    }
                }).delay(delay, TimeUnit.SECONDS).schedule();
            }
            default -> {
            }
        }
    }

    /** Netzwerk-Paket schicken, abnehmen (nur wenn es ganz aus ist) oder lassen – Regeln wie bei den Abzeichen. */
    private void offerNetz(Player p, boolean manual) {
        BadgePack.Config config = netz;
        switch (BadgePack.plan(config, netzSent.get(p.getUniqueId()), BadgePack.java(p.getUniqueId()), manual)) {
            case SEND -> sendNetz(p, config, 0);
            case REMOVE -> {
                netzSent.remove(p.getUniqueId());
                p.removeResourcePacks(BadgePack.NETZ_ID);
            }
            default -> {
            }
        }
    }

    /** Nie als „verpflichtend“ an Minecraft (siehe {@link #sendBadges}); Pflicht steht im Text, der Hub wirft hinaus. */
    private void sendNetz(Player p, BadgePack.Config config, int tries) {
        ResourcePackInfo info = proxy.createResourcePackBuilder(config.url())
                .setId(BadgePack.NETZ_ID)
                .setHash(config.hash())
                .setShouldForce(false)
                .setPrompt(MM.deserialize(config.prompt(p.getEffectiveLocale())))
                .build();
        netzSent.put(p.getUniqueId(), new BadgePack.Sent(config.sha1(), false, tries));
        p.sendResourcePackOffer(info);
    }

    private void reportNetz(Player p, boolean loaded, String status) {
        if (hub == null || !hub.ready()) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "pack");
        body.addProperty("uuid", p.getUniqueId().toString());
        body.addProperty("loaded", loaded);
        body.addProperty("status", status);
        hub.send(body);
    }

    @Subscribe
    public void onSettings(PlayerSettingsChangedEvent event) {
        if (hub == null) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "locale");
        body.addProperty("uuid", event.getPlayer().getUniqueId().toString());
        body.addProperty("locale", event.getPlayerSettings().getLocale().toString());
        hub.send(body);
    }

    @Subscribe
    public void onDisconnect(DisconnectEvent event) {
        UUID gone = event.getPlayer().getUniqueId();
        firstServer.remove(gone);
        sending.remove(gone);
        failed.remove(gone);
        badgeSent.remove(gone);
        netzSent.remove(gone);
        countdown.hide(gone);
        if (hub == null || event.getLoginStatus() != DisconnectEvent.LoginStatus.SUCCESSFUL_LOGIN) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "leave");
        body.addProperty("uuid", event.getPlayer().getUniqueId().toString());
        hub.send(body);
    }

    @Subscribe
    public void onPing(ProxyPingEvent event) {
        JsonObject net = network;
        if (net == null) {
            return;
        }
        ServerPing ping = event.getPing();
        Component motd = LEGACY.deserialize(HubClient.str(net, "motd1"))
                .append(Component.newline())
                .append(LEGACY.deserialize(HubClient.str(net, "motd2")));
        ServerPing.Builder builder = ping.asBuilder()
                .description(motd)
                .maximumPlayers(net.get("maxPlayers").getAsInt());
        event.setPing(builder.build());
    }

    // ---------- Rang-Abzeichen ----------

    /** Abzeichen-Paket schicken, abnehmen oder lassen (Regeln in BadgePack.plan). */
    private void offerBadges(Player p, boolean manual) {
        BadgePack.Config config = badges;
        boolean capable = BadgePack.capable(p.getProtocolVersion().getProtocol(), p.getUniqueId());
        switch (BadgePack.plan(config, badgeSent.get(p.getUniqueId()), capable, manual)) {
            case SEND -> sendBadges(p, config, 0, manual);
            case REMOVE -> {
                badgeSent.remove(p.getUniqueId());
                p.removeResourcePacks(BadgePack.ID);
            }
            case UNSUPPORTED -> reportBadges(p, "unsupported");
            case NOTHING -> {
            }
        }
    }

    /**
     * Nie als „verpflichtend“ an Minecraft: Lehnt man ein verpflichtendes Paket ab, wirft Velocity (ab 1.17 ohne
     * Einspruch) mit einer knappen Meldung hinaus. Ist das Paket im Panel Pflicht, sagt das der Text im Fenster, und
     * wer ablehnt, bekommt vom Hub eine Erklärung, wie man es einschaltet.
     */
    private void sendBadges(Player p, BadgePack.Config config, int tries, boolean manual) {
        ResourcePackInfo info = proxy.createResourcePackBuilder(config.url())
                .setId(BadgePack.ID)
                .setHash(config.hash())
                .setShouldForce(false)
                .setPrompt(MM.deserialize(config.prompt(p.getEffectiveLocale())))
                .build();
        badgeSent.put(p.getUniqueId(), new BadgePack.Sent(config.sha1(), false, tries));
        p.sendResourcePackOffer(info);
        if (manual) {
            reportBadges(p, "sent");
        }
    }

    /** Dem Hub sagen, wie es ausging – er antwortet dem Spieler in seiner Sprache (oder wirft ihn bei Pflicht hinaus). */
    private void reportBadges(Player p, String status) {
        if (hub == null || !hub.ready()) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "badge-status");
        body.addProperty("uuid", p.getUniqueId().toString());
        body.addProperty("status", status);
        hub.send(body);
    }

    /** Antwort auf das Abzeichen-Paket (das Netzwerk-Paket hat seinen eigenen Empfänger, {@link #onPackStatus}). */
    @Subscribe
    public void onBadgePackStatus(PlayerResourcePackStatusEvent event) {
        if (!BadgePack.ID.equals(event.getPackId())) {
            return;
        }
        Player p = event.getPlayer();
        BadgePack.Config config = badges;
        BadgePack.Sent sent = badgeSent.get(p.getUniqueId());
        ResourcePackInfo info = event.getPackInfo();
        // Antwort auf eine ältere Fassung (inzwischen neu geschickt oder ausgeschaltet): zählt nicht.
        if (sent == null || info == null || !config.enabled() || !Arrays.equals(info.getHash(), config.hash())) {
            return;
        }
        switch (event.getStatus()) {
            case SUCCESSFUL -> reportBadges(p, "loaded");
            case DECLINED -> {
                badgeSent.put(p.getUniqueId(), new BadgePack.Sent(sent.sha1(), true, sent.tries()));
                // Pflicht: Der Hub wirft freundlich hinaus, mit Erklärung, wie man das Paket einschaltet.
                reportBadges(p, "declined");
            }
            case FAILED_DOWNLOAD, INVALID_URL, FAILED_RELOAD -> {
                int next = sent.tries() + 1;
                long delay = BadgePack.retryDelaySeconds(next);
                if (delay == 0) {
                    reportBadges(p, "failed");
                    return;
                }
                proxy.getScheduler().buildTask(this, () -> {
                    BadgePack.Config now = badges;
                    if (p.isActive() && now.enabled() && now.sha1().equals(config.sha1())) {
                        sendBadges(p, now, next, false);
                    }
                }).delay(delay, TimeUnit.SECONDS).schedule();
            }
            default -> {
            }
        }
    }

    // ---------- Befehle ----------

    private void registerCommands(JsonArray list) {
        commands.forEach(name -> proxy.getCommandManager().unregister(name));
        commands.clear();
        for (JsonElement e : list) {
            JsonObject c = e.getAsJsonObject();
            String name = HubClient.str(c, "name");
            List<String> aliases = new ArrayList<>();
            c.getAsJsonArray("aliases").forEach(a -> aliases.add(a.getAsString()));
            CommandMeta meta = proxy.getCommandManager().metaBuilder(name)
                    .aliases(aliases.toArray(String[]::new))
                    .plugin(this)
                    .build();
            proxy.getCommandManager().register(meta, new HubCommand(name));
            commands.add(name);
        }
    }

    private final class HubCommand implements SimpleCommand {
        private final String name;

        HubCommand(String name) {
            this.name = name;
        }

        @Override
        public void execute(Invocation invocation) {
            if (!(invocation.source() instanceof Player p)) {
                invocation.source().sendMessage(Component.text("Diesen Befehl gibt es nur im Spiel."));
                return;
            }
            hub.request(body("command", p, invocation.arguments())).exceptionally(e -> {
                p.sendMessage(MM.deserialize("<red>Das Netzwerk antwortet gerade nicht – probier es gleich nochmal."));
                return null;
            });
        }

        @Override
        public CompletableFuture<List<String>> suggestAsync(Invocation invocation) {
            if (!(invocation.source() instanceof Player p) || !hub.ready()) {
                return CompletableFuture.completedFuture(List.of());
            }
            return hub.request(body("complete", p, invocation.arguments())).handle((data, e) -> {
                List<String> out = new ArrayList<>();
                if (e == null && data.has("suggestions")) {
                    data.getAsJsonArray("suggestions").forEach(s -> out.add(s.getAsString()));
                }
                return out;
            });
        }

        private JsonObject body(String type, Player p, String[] args) {
            JsonObject body = new JsonObject();
            body.addProperty("t", type);
            body.addProperty("uuid", p.getUniqueId().toString());
            body.addProperty("command", name);
            JsonArray a = new JsonArray();
            for (String arg : args) {
                a.add(arg);
            }
            // Beim Tippen ist das letzte (leere) Wort wichtig für Vorschläge.
            if (type.equals("complete") && args.length == 0) {
                a.add("");
            }
            body.add("args", a);
            return body;
        }
    }

    // ---------- Hilfen ----------

    private static String localeOf(Player p) {
        Locale locale = p.getEffectiveLocale();
        return locale == null ? null : locale.toString();
    }

    /** Bedrock-Spieler (Floodgate) haben UUIDs, deren erste Hälfte 0 ist. */
    private static boolean bedrock(UUID uuid) {
        return uuid.getMostSignificantBits() == 0;
    }
}
