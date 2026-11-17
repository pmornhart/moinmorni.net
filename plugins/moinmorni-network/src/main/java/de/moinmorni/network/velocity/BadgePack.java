package de.moinmorni.network.velocity;

import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;

/**
 * Das Abzeichen-Paket aus Sicht des Proxys (Rang-Abzeichen, docs/hub-protokoll.md: {@code badges}): Der Hub sagt, ob
 * Abzeichen an sind, wo das Paket liegt und ob es Pflicht ist; hier steht, wem der Proxy es schickt. Nur Regeln,
 * ohne Velocity – darum mit Tests ({@code BadgePackTest}).
 *
 * <p>Das Paket hat eine eigene, feste Kennung neben dem Möbel-Paket der Lobby. Minecraft kann seit 1.20.3 mehrere
 * Server-Pakete gleichzeitig; ältere Clients können nur eins – dort bliebe sonst das Möbel-Paket auf der Strecke, darum
 * bekommen sie keins (und sehen wie Bedrock-Spieler Symbol und Farbe).
 */
public final class BadgePack {

    /** Feste Kennung des Pakets („moinmorni-badges“ als Bytes). */
    public static final UUID ID = UUID.fromString("6d6f696e-6d6f-726e-692d-626164676573");
    /** Protokoll von Minecraft 1.20.3 – ab da mehrere Server-Pakete gleichzeitig. */
    public static final int MIN_PROTOCOL = 765;
    /** So oft versucht der Proxy es nach einem Fehler noch einmal (10 s, 20 s, 40 s). */
    public static final int RETRIES = 3;
    private static final long FIRST_RETRY_SECONDS = 10;

    /**
     * Was der Hub gerade sagt; {@code OFF}, solange er nichts gesagt hat. Ob das Paket Pflicht ist, steht im Text des
     * Fensters, und wer ablehnt, bekommt die Antwort vom Hub – der Proxy schickt es nie als „verpflichtend“.
     */
    public record Config(boolean enabled, String url, String sha1, String promptDe, String promptEn) {
        public static final Config OFF = new Config(false, null, null, "", "");

        /** Aus der Nachricht {@code badges} des Hubs; ohne Adresse oder SHA-1 gilt „aus“. */
        public static Config of(JsonObject m) {
            String url = HubClient.str(m, "url");
            String sha1 = HubClient.str(m, "sha1");
            boolean enabled = m.has("enabled") && m.get("enabled").getAsBoolean() && url != null && sha1 != null
                    && sha1.matches("[0-9a-f]{40}");
            JsonObject prompt = m.has("prompt") && m.get("prompt").isJsonObject()
                    ? m.getAsJsonObject("prompt")
                    : new JsonObject();
            String de = HubClient.str(prompt, "de");
            String en = HubClient.str(prompt, "en");
            return new Config(enabled, enabled ? url : null, enabled ? sha1 : null, de == null ? "" : de,
                    en == null ? "" : en);
        }

        public byte[] hash() {
            return sha1 == null ? new byte[0] : HexFormat.of().parseHex(sha1);
        }

        /** Text im Fenster, mit dem Minecraft fragt – in der Sprache des Clients. */
        public String prompt(Locale locale) {
            return locale != null && "de".equals(locale.getLanguage()) ? promptDe : promptEn;
        }
    }

    /** Was der Proxy einem Spieler zuletzt geschickt hat und was der damit gemacht hat. */
    public record Sent(String sha1, boolean declined, int tries) {
    }

    /** Was jetzt zu tun ist. */
    public enum Step {
        /** Paket schicken (neu oder neue Fassung). */
        SEND,
        /** Paket wieder abnehmen (Abzeichen ausgeschaltet). */
        REMOVE,
        /** Bekommt keins: Bedrock oder Minecraft vor 1.20.3. */
        UNSUPPORTED,
        NOTHING,
    }

    private BadgePack() {
    }

    /** Java ab 1.20.3? Bedrock-Spieler (Floodgate) haben UUIDs, deren erste Hälfte 0 ist. */
    public static boolean capable(int protocol, UUID uuid) {
        return protocol >= MIN_PROTOCOL && uuid.getMostSignificantBits() != 0;
    }

    /**
     * Schicken, abnehmen oder nichts? {@code manual} = der Spieler hat /abzeichen getippt – dann auch nach einem
     * Ablehnen noch einmal (sonst fragt der Proxy nicht ständig nach, nur bei einer neuen Fassung nach Rang-Änderung).
     */
    public static Step plan(Config config, Sent sent, boolean capable, boolean manual) {
        if (!config.enabled()) {
            return sent == null ? Step.NOTHING : Step.REMOVE;
        }
        if (!capable) {
            return manual ? Step.UNSUPPORTED : Step.NOTHING;
        }
        if (manual || sent == null) {
            return Step.SEND;
        }
        return !sent.declined() && !config.sha1().equals(sent.sha1()) ? Step.SEND : Step.NOTHING;
    }

    /** Wartezeit vor dem n-ten neuen Versuch (1, 2, 3 → 10, 20, 40 Sekunden); 0 = keiner mehr. */
    public static long retryDelaySeconds(int tries) {
        return tries < 1 || tries > RETRIES ? 0 : FIRST_RETRY_SECONDS << (tries - 1);
    }
}
