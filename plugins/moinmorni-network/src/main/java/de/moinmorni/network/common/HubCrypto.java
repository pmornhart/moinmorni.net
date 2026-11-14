package de.moinmorni.network.common;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Gleiche Rechnung wie im Hub (apps/server/src/hub/protocol.ts). */
public final class HubCrypto {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int NONCE_BYTES = 16;

    private HubCrypto() {
    }

    /** HMAC-SHA256 als Hex; der Schlüssel ist der Text selbst (wie Node: createHmac('sha256', key)). */
    public static String hmac(String key, String text) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(text.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String nonce() {
        byte[] bytes = new byte[NONCE_BYTES];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    public static String proof(String serverKey, String hubNonce, String pluginNonce, String server, String kind) {
        return hmac(serverKey, "auth|" + hubNonce + "|" + pluginNonce + "|" + server + "|" + kind);
    }

    public static String sessionKey(String serverKey, String hubNonce, String pluginNonce) {
        return hmac(serverKey, "session|" + hubNonce + "|" + pluginNonce);
    }

    public static String frameMac(String sessionKey, long seq, String body) {
        return hmac(sessionKey, seq + "." + body);
    }

    /** Vergleich in fester Zeit. */
    public static boolean same(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
