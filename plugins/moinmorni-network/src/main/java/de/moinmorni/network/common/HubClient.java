package de.moinmorni.network.common;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Verbindung zum Hub (docs/hub-protokoll.md): Handschlag, signierte Rahmen in beide Richtungen, Anfragen mit
 * Antwort, und bei einem Abbruch verbindet sie sich von selbst neu (2 s, dann länger, höchstens 30 s).
 */
public final class HubClient {

    private static final int PROTOCOL_VERSION = 1;
    private static final long RETRY_FIRST_MS = 2_000;
    private static final long RETRY_MAX_MS = 30_000;
    private static final long REQUEST_TIMEOUT_MS = 5_000;
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);

    private final HubConfig config;
    private final Logger log;
    private final Consumer<JsonObject> onMessage;
    private final Runnable onReady;
    private final HttpClient http = HttpClient.newBuilder()
            .proxy(HttpClient.Builder.NO_PROXY)
            .connectTimeout(CONNECT_TIMEOUT)
            .build();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "MoinMorni-Hub");
        t.setDaemon(true);
        return t;
    });
    private final Map<Long, CompletableFuture<JsonObject>> pending = new ConcurrentHashMap<>();
    private final AtomicLong nextId = new AtomicLong(1);

    private volatile Session session;
    private volatile boolean stopped;
    private long retryMs = RETRY_FIRST_MS;

    /** Eine Verbindung: eigener Sitzungsschlüssel und eigene Zähler. */
    private final class Session implements WebSocket.Listener {
        private final StringBuilder buffer = new StringBuilder();
        private WebSocket socket;
        private String sessionKey;
        private long inSeq;
        private long outSeq;
        private boolean ready;
        private CompletableFuture<?> sending = CompletableFuture.completedFuture(null);

        @Override
        public void onOpen(WebSocket webSocket) {
            this.socket = webSocket;
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            buffer.append(data);
            if (last) {
                String text = buffer.toString();
                buffer.setLength(0);
                try {
                    receive(text);
                } catch (RuntimeException e) {
                    log.log(Level.WARNING, "Hub: Nachricht nicht verstanden – Verbindung wird neu aufgebaut", e);
                    webSocket.abort();
                }
            }
            webSocket.request(1);
            return null;
        }

        private void receive(String text) {
            JsonObject raw = JsonParser.parseString(text).getAsJsonObject();
            if (sessionKey == null) {
                if (!"hello".equals(str(raw, "t"))) {
                    throw new IllegalStateException("kein hello");
                }
                String hubNonce = str(raw, "nonce");
                String pluginNonce = HubCrypto.nonce();
                sessionKey = HubCrypto.sessionKey(config.key(), hubNonce, pluginNonce);
                JsonObject auth = new JsonObject();
                auth.addProperty("t", "auth");
                auth.addProperty("v", PROTOCOL_VERSION);
                auth.addProperty("server", config.server());
                auth.addProperty("kind", config.kind());
                auth.addProperty("nonce", pluginNonce);
                auth.addProperty("proof", HubCrypto.proof(config.key(), hubNonce, pluginNonce, config.server(), config.kind()));
                write(auth.toString());
                return;
            }
            long seq = raw.get("s").getAsLong();
            String body = str(raw, "b");
            if (seq != inSeq + 1 || !HubCrypto.same(str(raw, "h"), HubCrypto.frameMac(sessionKey, seq, body))) {
                throw new IllegalStateException("Rahmen falsch signiert");
            }
            inSeq = seq;
            JsonObject message = JsonParser.parseString(body).getAsJsonObject();
            String type = str(message, "t");
            if ("reply".equals(type)) {
                CompletableFuture<JsonObject> waiting = pending.remove(message.get("id").getAsLong());
                if (waiting != null) {
                    waiting.complete(message);
                }
                return;
            }
            if ("welcome".equals(type) && !ready) {
                ready = true;
                retryMs = RETRY_FIRST_MS;
                log.info("Mit dem MoinMorni-Hub verbunden als " + config.server());
                onMessage.accept(message);
                onReady.run();
                return;
            }
            onMessage.accept(message);
        }

        synchronized void send(JsonObject body) {
            outSeq++;
            String b = body.toString();
            JsonObject frame = new JsonObject();
            frame.addProperty("s", outSeq);
            frame.addProperty("b", b);
            frame.addProperty("h", HubCrypto.frameMac(sessionKey, outSeq, b));
            write(frame.toString());
        }

        /** WebSocket erlaubt nur ein Senden gleichzeitig – darum eine Kette. */
        private synchronized void write(String text) {
            sending = sending.thenCompose(v -> socket.sendText(text, true)).exceptionally(e -> null);
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            lost("geschlossen (" + statusCode + " " + reason + ")");
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            lost(error.getMessage());
        }

        private void lost(String why) {
            if (session != this) {
                return;
            }
            session = null;
            pending.values().forEach(f -> f.completeExceptionally(new IllegalStateException("Hub weg")));
            pending.clear();
            if (ready) {
                log.warning("Verbindung zum Hub verloren: " + why);
            }
            scheduleReconnect();
        }
    }

    public HubClient(HubConfig config, Logger log, Consumer<JsonObject> onMessage, Runnable onReady) {
        this.config = config;
        this.log = log;
        this.onMessage = onMessage;
        this.onReady = onReady;
    }

    public void start() {
        connect();
    }

    public void stop() {
        stopped = true;
        Session s = session;
        session = null;
        if (s != null && s.socket != null) {
            s.socket.sendClose(WebSocket.NORMAL_CLOSURE, "stop");
        }
        timer.shutdownNow();
    }

    /** Verbunden und angemeldet? */
    public boolean ready() {
        Session s = session;
        return s != null && s.ready;
    }

    public String server() {
        return config.server();
    }

    /** Nachricht ohne Antwort; ohne Verbindung geht sie verloren (false). */
    public boolean send(JsonObject body) {
        Session s = session;
        if (s == null || !s.ready) {
            return false;
        }
        s.send(body);
        return true;
    }

    /** Anfrage mit Antwort (`data`); schlägt fehl, wenn der Hub weg ist oder nicht in 5 s antwortet. */
    public CompletableFuture<JsonObject> request(JsonObject body) {
        long id = nextId.getAndIncrement();
        body.addProperty("id", id);
        CompletableFuture<JsonObject> reply = new CompletableFuture<>();
        pending.put(id, reply);
        if (!send(body)) {
            pending.remove(id);
            reply.completeExceptionally(new IllegalStateException("Hub nicht verbunden"));
            return reply;
        }
        return reply.orTimeout(REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .whenComplete((r, e) -> pending.remove(id))
                .thenApply(r -> {
                    if (!r.get("ok").getAsBoolean()) {
                        throw new IllegalStateException(str(r, "error"));
                    }
                    return r.has("data") && r.get("data").isJsonObject() ? r.getAsJsonObject("data") : new JsonObject();
                });
    }

    private void connect() {
        if (stopped) {
            return;
        }
        Session s = new Session();
        session = s;
        http.newWebSocketBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .buildAsync(URI.create(config.url()), s)
                .exceptionally(e -> {
                    s.lost(e.getMessage());
                    return null;
                });
    }

    private void scheduleReconnect() {
        if (stopped) {
            return;
        }
        long delay = retryMs;
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
        timer.schedule(this::connect, delay, TimeUnit.MILLISECONDS);
    }

    public static String str(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : null;
    }
}
