package de.moinmorni.network.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import de.maxhenkel.voicechat.api.Group;
import de.maxhenkel.voicechat.api.VoicechatConnection;
import de.maxhenkel.voicechat.api.VoicechatPlugin;
import de.maxhenkel.voicechat.api.VoicechatServerApi;
import de.maxhenkel.voicechat.api.audiochannel.StaticAudioChannel;
import de.maxhenkel.voicechat.api.events.EventRegistration;
import de.maxhenkel.voicechat.api.events.JoinGroupEvent;
import de.maxhenkel.voicechat.api.events.LeaveGroupEvent;
import de.maxhenkel.voicechat.api.events.MicrophonePacketEvent;
import de.maxhenkel.voicechat.api.events.PlayerDisconnectedEvent;
import de.maxhenkel.voicechat.api.events.VoicechatServerStartedEvent;
import de.moinmorni.network.common.HubClient;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * Sprachchat-Brücke mit Simple Voice Chat: Auf jedem Server gibt es dieselben Kanäle (gleiche Gruppen-ID). Was
 * jemand in so einer Gruppe sagt, geht als Binär-Rahmen an den Hub; was von anderen Servern kommt, spielt dieser
 * Server allen eigenen Leuten in derselben Gruppe vor. Partys bekommen eine versteckte Gruppe über alle Server.
 * Nur geladen, wenn Simple Voice Chat installiert ist.
 */
final class VoiceBridge implements VoicechatPlugin {

    private static final byte AUDIO = 1;
    private static final int UUID_BYTES = 16;
    private static final int HEADER = 1 + UUID_BYTES * 2;
    private static final int PASSWORD_BYTES = 12;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final HubClient hub;
    private final Logger log;
    private volatile VoicechatServerApi api;
    /** Brücken-Gruppen (Kanäle + Partys): ID → Name. */
    private final Map<UUID, String> bridged = new ConcurrentHashMap<>();
    private final Set<UUID> parties = ConcurrentHashMap.newKeySet();
    /** Party-Gruppe → Mitglieder (für den automatischen Beitritt). */
    private final Map<UUID, Set<UUID>> partyMembers = new ConcurrentHashMap<>();
    private volatile Set<UUID> muted = Set.of();
    /** Wer in welcher Gruppe ist (aus den Ereignissen von Simple Voice Chat). */
    private final Map<UUID, UUID> groupOf = new ConcurrentHashMap<>();
    /** Ein Audiokanal pro fremdem Sprecher und Gruppe. */
    private final Map<UUID, StaticAudioChannel> channels = new ConcurrentHashMap<>();
    private volatile JsonObject pending;

    VoiceBridge(HubClient hub, Logger log) {
        this.hub = hub;
        this.log = log;
        hub.onBinary(this::onAudio);
    }

    @Override
    public String getPluginId() {
        return "moinmorni";
    }

    @Override
    public void registerEvents(EventRegistration events) {
        events.registerEvent(VoicechatServerStartedEvent.class, e -> {
            api = e.getVoicechat();
            JsonObject config = pending;
            if (config != null) {
                apply(config);
            }
        });
        events.registerEvent(MicrophonePacketEvent.class, this::onMicrophone);
        events.registerEvent(JoinGroupEvent.class, e -> report(e.getConnection(), e.getGroup()));
        events.registerEvent(LeaveGroupEvent.class, e -> report(e.getConnection(), null));
        events.registerEvent(PlayerDisconnectedEvent.class, e -> groupOf.remove(e.getPlayerUuid()));
    }

    // ---------- vom Hub ----------

    /** Kanäle, Stumm-Liste und Partys. */
    void apply(JsonObject config) {
        try {
            applyNow(config);
        } catch (RuntimeException | LinkageError e) {
            log.log(java.util.logging.Level.WARNING, "Sprachchat-Brücke: Einstellungen nicht übernommen", e);
        }
    }

    private void applyNow(JsonObject config) {
        pending = config;
        VoicechatServerApi voice = api;
        if (voice == null) {
            return;
        }
        Set<UUID> wanted = new HashSet<>();
        for (JsonElement e : config.getAsJsonArray("channels")) {
            JsonObject c = e.getAsJsonObject();
            UUID id = UUID.fromString(HubClient.str(c, "id"));
            ensure(voice, id, HubClient.str(c, "name"), false);
            wanted.add(id);
        }
        Set<UUID> partyIds = new HashSet<>();
        for (JsonElement e : config.getAsJsonArray("parties")) {
            JsonObject p = e.getAsJsonObject();
            UUID id = UUID.fromString(HubClient.str(p, "id"));
            Group group = ensure(voice, id, HubClient.str(p, "name"), true);
            Set<UUID> members = new HashSet<>();
            p.getAsJsonArray("members").forEach(m -> members.add(UUID.fromString(m.getAsString())));
            partyMembers.put(id, members);
            members.forEach(m -> {
                VoicechatConnection c = voice.getConnectionOf(m);
                if (c != null && c.isInstalled() && !id.equals(groupOf.get(m))) {
                    c.setGroup(group);
                }
            });
            partyIds.add(id);
            wanted.add(id);
        }
        // Aufgelöste Partys: Gruppe weg.
        parties.stream().filter(id -> !partyIds.contains(id)).forEach(id -> {
            voice.removeGroup(id);
            partyMembers.remove(id);
        });
        parties.retainAll(partyIds);
        parties.addAll(partyIds);
        bridged.keySet().retainAll(wanted);
        Set<UUID> mutedNow = new HashSet<>();
        config.getAsJsonArray("muted").forEach(m -> mutedNow.add(UUID.fromString(m.getAsString())));
        muted = mutedNow;
    }

    /** /voice <kanal>, /voice raus, Team folgt ohne Passwort. */
    void join(JsonObject m) {
        VoicechatServerApi voice = api;
        if (voice == null) {
            return;
        }
        VoicechatConnection c = voice.getConnectionOf(UUID.fromString(HubClient.str(m, "uuid")));
        if (c == null) {
            return;
        }
        String group = HubClient.str(m, "group");
        c.setGroup(group == null ? null : find(voice, UUID.fromString(group)));
    }

    private Group ensure(VoicechatServerApi voice, UUID id, String name, boolean party) {
        bridged.put(id, name);
        Group existing = find(voice, id);
        if (existing != null) {
            return existing;
        }
        Group.Builder builder = voice.groupBuilder()
                .setId(id)
                .setName(name)
                .setPersistent(true)
                .setType(Group.Type.OPEN);
        if (party) {
            byte[] secret = new byte[PASSWORD_BYTES];
            RANDOM.nextBytes(secret);
            builder.setHidden(true).setPassword(java.util.HexFormat.of().formatHex(secret)).setType(Group.Type.NORMAL);
        }
        Group group = builder.build();
        log.info("Sprachkanal bereit: " + name + (find(voice, id) != null ? "" : " (erscheint, sobald jemand beitritt)"));
        return group;
    }

    /** Simple Voice Chat gibt bei unbekannter ID eine leere Hülle statt null zurück – darum über die Liste. */
    private static Group find(VoicechatServerApi voice, UUID id) {
        return voice.getGroups().stream().filter(g -> id.equals(g.getId())).findFirst().orElse(null);
    }

    private void report(VoicechatConnection connection, Group group) {
        if (connection == null || connection.getPlayer() == null) {
            return;
        }
        UUID player = connection.getPlayer().getUuid();
        if (group == null) {
            groupOf.remove(player);
        } else {
            groupOf.put(player, group.getId());
        }
        JsonObject body = new JsonObject();
        body.addProperty("t", "voice-group");
        body.addProperty("uuid", player.toString());
        body.addProperty("group", group == null ? null : group.getId().toString());
        hub.send(body);
    }

    // ---------- Sprache ----------

    private void onMicrophone(MicrophonePacketEvent event) {
        VoicechatConnection sender = event.getSenderConnection();
        if (sender == null || sender.getPlayer() == null) {
            return;
        }
        UUID speaker = sender.getPlayer().getUuid();
        if (muted.contains(speaker)) {
            event.cancel();
            return;
        }
        Group group = sender.getGroup();
        if (group == null || !bridged.containsKey(group.getId())) {
            return;
        }
        byte[] opus = event.getPacket().getOpusEncodedData();
        if (opus.length == 0) {
            return;
        }
        ByteBuffer frame = ByteBuffer.allocate(HEADER + opus.length);
        frame.put(AUDIO);
        putUuid(frame, group.getId());
        putUuid(frame, speaker);
        frame.put(opus);
        hub.sendBinary(frame.array());
    }

    private void onAudio(byte[] payload) {
        VoicechatServerApi voice = api;
        if (voice == null || payload.length <= HEADER || payload[0] != AUDIO) {
            return;
        }
        ByteBuffer in = ByteBuffer.wrap(payload);
        in.get();
        UUID group = new UUID(in.getLong(), in.getLong());
        UUID speaker = new UUID(in.getLong(), in.getLong());
        byte[] opus = new byte[in.remaining()];
        in.get(opus);
        UUID channelId = UUID.nameUUIDFromBytes((speaker + "|" + group).getBytes(StandardCharsets.UTF_8));
        StaticAudioChannel channel = channels.computeIfAbsent(channelId, id -> {
            StaticAudioChannel c = voice.createStaticAudioChannel(id);
            c.setBypassGroupIsolation(true);
            return c;
        });
        channel.clearTargets();
        groupOf.forEach((player, g) -> {
            if (g.equals(group) && !player.equals(speaker)) {
                VoicechatConnection c = voice.getConnectionOf(player);
                if (c != null) {
                    channel.addTarget(c);
                }
            }
        });
        channel.send(opus);
    }

    private static void putUuid(ByteBuffer b, UUID id) {
        b.putLong(id.getMostSignificantBits());
        b.putLong(id.getLeastSignificantBits());
    }
}
