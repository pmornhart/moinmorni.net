package de.moinmorni.network.velocity;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.inject.Inject;
import com.velocitypowered.api.command.CommandMeta;
import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.event.EventTask;
import com.velocitypowered.api.event.ResultedEvent;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.DisconnectEvent;
import com.velocitypowered.api.event.connection.LoginEvent;
import com.velocitypowered.api.event.player.PlayerSettingsChangedEvent;
import com.velocitypowered.api.event.player.ServerPreConnectEvent;
import com.velocitypowered.api.event.player.ServerConnectedEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.event.proxy.ProxyPingEvent;
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.proxy.server.RegisteredServer;
import com.velocitypowered.api.proxy.server.ServerPing;
import de.moinmorni.network.common.HubClient;
import de.moinmorni.network.common.HubConfig;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;

/**
 * Der Proxy-Teil: meldet dem Hub, wer kommt, wechselt und geht, lässt den Hub über die Anmeldung entscheiden
 * (Bann, Wartung, voll), zeigt MOTD und Spielerzahl aus dem Panel und reicht Netzwerk-Befehle an den Hub weiter.
 */
@Plugin(
        id = "moinmorni",
        name = "MoinMorni",
        version = "0.1.0",
        description = "Verbindet den Proxy mit dem MoinMorni-Netzwerk",
        url = "https://moinmorni.net",
        authors = {"MoinMorni"})
public final class VelocityPlugin {

    private static final MiniMessage MM = MiniMessage.miniMessage();
    private static final LegacyComponentSerializer LEGACY = LegacyComponentSerializer.legacySection();
    private static final String HUB_DIR = "moinmorni";
    private static final String LOBBY = "lobby";
    private static final String HUB_AWAY =
            "<gold>MoinMorni startet gerade neu</gold> <gray>– versuch es in ein paar Sekunden nochmal.</gray>\n"
            + "<gray>MoinMorni is restarting – try again in a few seconds.</gray>";

    private final ProxyServer proxy;
    private final Logger log;
    private final Path dataDir;
    private final List<String> commands = new ArrayList<>();
    /** Banns aus der letzten Liste des Hubs: gelten auch, wenn der Hub kurz weg ist. */
    private final Map<UUID, Instant> bans = new ConcurrentHashMap<>();
    private volatile JsonObject network;
    private HubClient hub;

    @Inject
    public VelocityPlugin(ProxyServer proxy, @DataDirectory Path dataDir) {
        this.proxy = proxy;
        this.log = Logger.getLogger("MoinMorni");
        this.dataDir = dataDir.getParent().resolve(HUB_DIR);
    }

    @Subscribe
    public void onInit(ProxyInitializeEvent event) {
        try {
            HubConfig config = HubConfig.load(dataDir);
            hub = new HubClient(config, log, this::onHub, this::sendOnline);
            hub.start();
        } catch (Exception e) {
            log.warning("MoinMorni ist nicht eingerichtet (" + e.getMessage() + ") – der Proxy läuft ohne Netzwerk-Funktionen.");
        }
    }

    @Subscribe
    public void onShutdown(ProxyShutdownEvent event) {
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
            case "msg" -> player(m).ifPresent(p -> p.sendMessage(MM.deserialize(HubClient.str(m, "text"))));
            case "kick" -> player(m).ifPresent(p -> p.disconnect(MM.deserialize(HubClient.str(m, "text"))));
            case "connect" -> player(m).ifPresent(p -> proxy.getServer(HubClient.str(m, "server"))
                    .ifPresent(s -> p.createConnectionRequest(s).fireAndForget()));
            default -> log.fine("Unbekannte Nachricht vom Hub: " + type);
        }
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
            } else if (network != null && network.has("maintenance") && network.get("maintenance").getAsBoolean()) {
                // Ohne Hub weiß der Proxy nicht, wer zum Team gehört – bei Wartung bleibt die Tür dann ganz zu.
                event.setResult(ResultedEvent.ComponentResult.denied(MM.deserialize(HUB_AWAY)));
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
            }
            return null;
        });
        return EventTask.resumeWhenComplete(done);
    }

    /** Ohne Hub: in die Lobby ja, woandershin nein (wer gerade erst kommt, landet in der Lobby). */
    private void closedWithoutHub(ServerPreConnectEvent event, RegisteredServer target) {
        if (target.getServerInfo().getName().equals(LOBBY)) {
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
     * danach von selbst hinein. Wer gerade erst ins Netzwerk kommt, wartet so lange in der Lobby.
     */
    @Subscribe
    public EventTask onPreConnect(ServerPreConnectEvent event) {
        Optional<RegisteredServer> target = event.getResult().getServer();
        if (hub == null || target.isEmpty()) {
            return null;
        }
        if (!hub.ready()) {
            // Ohne Hub kann niemand prüfen, wer in Bau-Server, Einladungs-Modi oder Wartung darf: nur die Lobby ist offen.
            closedWithoutHub(event, target.get());
            return null;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "connecting");
        body.addProperty("uuid", event.getPlayer().getUniqueId().toString());
        body.addProperty("server", target.get().getServerInfo().getName());
        CompletableFuture<Void> done = hub.request(body).handle((data, error) -> {
            if (error != null) {
                closedWithoutHub(event, target.get());
                return null;
            }
            if (!data.has("allow") || data.get("allow").getAsBoolean()) {
                return null;
            }
            Optional<RegisteredServer> lobby = proxy.getServer(LOBBY);
            boolean firstServer = event.getPreviousServer() == null;
            if (firstServer && lobby.isPresent() && !lobby.get().equals(target.get())) {
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
