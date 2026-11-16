package de.moinmorni.network.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import de.moinmorni.api.MoinMorni;
import de.moinmorni.network.common.HubClient;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import org.bukkit.entity.Player;

/** Die Netzwerk-Schnittstelle für Spielmodi ({@link MoinMorni}), gestützt auf den Hub und die Profile der Spieler. */
final class ModeApi implements MoinMorni {

    private static final Rank PLAYER = new Rank("player", "", "#aaaaaa", 99);

    private final HubClient hub;
    private final String server;
    private final Function<UUID, String> lang;
    private final Function<UUID, Rank> rank;
    private final Function<UUID, java.util.Set<String>> rights;

    ModeApi(HubClient hub, String server, Function<UUID, String> lang, Function<UUID, Rank> rank,
            Function<UUID, java.util.Set<String>> rights) {
        this.hub = hub;
        this.server = server;
        this.lang = lang;
        this.rank = rank;
        this.rights = rights;
    }

    @Override
    public String serverName() {
        return server;
    }

    @Override
    public boolean online() {
        return hub != null && hub.ready();
    }

    @Override
    public String language(UUID player) {
        return lang.apply(player);
    }

    @Override
    public Rank rank(UUID player) {
        Rank r = rank.apply(player);
        return r == null ? PLAYER : r;
    }

    @Override
    public boolean hasRight(UUID player, String right) {
        java.util.Set<String> set = rights.apply(player);
        return set != null && set.contains(right);
    }

    @Override
    public CompletableFuture<Optional<Party>> party(UUID player) {
        if (!online()) {
            return CompletableFuture.completedFuture(Optional.empty());
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "party");
        body.addProperty("uuid", player.toString());
        return hub.request(body).thenApply(ModeApi::partyOf).exceptionally(e -> Optional.empty());
    }

    private static Optional<Party> partyOf(JsonObject reply) {
        if (!reply.has("ok") || !reply.get("ok").getAsBoolean()) {
            return Optional.empty();
        }
        JsonObject data = reply.getAsJsonObject("data");
        JsonElement p = data == null ? null : data.get("party");
        if (p == null || !p.isJsonObject()) {
            return Optional.empty();
        }
        JsonObject party = p.getAsJsonObject();
        List<Party.Member> members = new ArrayList<>();
        JsonArray list = party.getAsJsonArray("members");
        list.forEach(e -> {
            JsonObject m = e.getAsJsonObject();
            JsonElement srv = m.get("server");
            members.add(new Party.Member(UUID.fromString(HubClient.str(m, "uuid")), HubClient.str(m, "name"),
                    srv == null || srv.isJsonNull() ? null : srv.getAsString()));
        });
        return Optional.of(new Party(UUID.fromString(HubClient.str(party, "leader")), List.copyOf(members)));
    }

    @Override
    public void stats(String mode, UUID player, Map<String, Long> add, Map<String, Long> best, boolean lowerIsBetter) {
        if (!online()) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "stats");
        body.addProperty("mode", mode);
        body.addProperty("uuid", player.toString());
        body.add("add", toJson(add));
        body.add(lowerIsBetter ? "min" : "max", toJson(best));
        hub.send(body);
    }

    private static JsonObject toJson(Map<String, Long> values) {
        JsonObject o = new JsonObject();
        if (values != null) {
            values.forEach(o::addProperty);
        }
        return o;
    }

    @Override
    public void state(String mode, String state, int players) {
        if (!online()) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "mode-state");
        body.addProperty("mode", mode);
        body.addProperty("state", state);
        body.addProperty("players", players);
        hub.send(body);
    }

    @Override
    public void toLobby(Player player) {
        if (!online()) {
            player.kick(net.kyori.adventure.text.Component.text("Zurück in die Lobby: bitte neu verbinden."));
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "to-lobby");
        body.addProperty("uuid", player.getUniqueId().toString());
        hub.send(body);
    }
}
