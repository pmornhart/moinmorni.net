package de.moinmorni.network.velocity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.Locale;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Wem der Proxy das Abzeichen-Paket schickt (BadgePack) – ohne Velocity. */
class BadgePackTest {

    private static final String SHA1 = "0123456789abcdef0123456789abcdef01234567";
    private static final String OTHER = "fedcba9876543210fedcba9876543210fedcba98";
    private static final UUID JAVA = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID BEDROCK = UUID.fromString("00000000-0000-0000-0009-01f2e3d4c5b6");

    private static BadgePack.Config config(String json) {
        return BadgePack.Config.of(JsonParser.parseString(json).getAsJsonObject());
    }

    private static final BadgePack.Config ON = config("{\"t\":\"badges\",\"enabled\":true,"
            + "\"url\":\"https://moinmorni.net/api/public/packs/abzeichen.zip?v=" + SHA1 + "\",\"sha1\":\"" + SHA1
            + "\",\"required\":false,\"prompt\":{\"de\":\"Abzeichen\",\"en\":\"Badges\"}}");

    @Test
    void readsWhatTheHubSays() {
        assertTrue(ON.enabled());
        assertEquals(20, ON.hash().length);
        assertEquals("Abzeichen", ON.prompt(Locale.GERMANY));
        assertEquals("Abzeichen", ON.prompt(Locale.of("de", "AT")));
        assertEquals("Badges", ON.prompt(Locale.US));
        assertEquals("Badges", ON.prompt(null));
        // Ohne Adresse, ohne gültige SHA-1 oder ausgeschaltet: aus.
        assertFalse(config("{\"enabled\":true,\"url\":null,\"sha1\":\"" + SHA1 + "\"}").enabled());
        assertFalse(config("{\"enabled\":true,\"url\":\"https://x\",\"sha1\":\"kaputt\"}").enabled());
        BadgePack.Config off = config("{\"enabled\":false,\"url\":null,\"sha1\":null,\"required\":true}");
        assertFalse(off.enabled());
        assertNull(off.url());
        assertFalse(BadgePack.Config.of(new JsonObject()).enabled());
    }

    @Test
    void onlyJavaFrom1203GetsThePack() {
        assertTrue(BadgePack.capable(BadgePack.MIN_PROTOCOL, JAVA));
        assertTrue(BadgePack.capable(775, JAVA));
        // 1.20.2 und älter können nur ein Server-Paket – das Möbel-Paket der Lobby bliebe sonst auf der Strecke.
        assertFalse(BadgePack.capable(764, JAVA));
        assertFalse(BadgePack.capable(775, BEDROCK));
    }

    @Test
    void sendsOnceAndAgainOnlyForANewVersion() {
        assertEquals(BadgePack.Step.SEND, BadgePack.plan(ON, null, true, false));
        BadgePack.Sent sent = new BadgePack.Sent(SHA1, false, 0);
        assertEquals(BadgePack.Step.NOTHING, BadgePack.plan(ON, sent, true, false));
        // Rang im Panel geändert → neue SHA-1 → neue Fassung.
        assertEquals(BadgePack.Step.SEND, BadgePack.plan(ON, new BadgePack.Sent(OTHER, false, 0), true, false));
        // Abgelehnt: nicht von selbst nachfragen, nur auf /abzeichen.
        BadgePack.Sent declined = new BadgePack.Sent(OTHER, true, 0);
        assertEquals(BadgePack.Step.NOTHING, BadgePack.plan(ON, declined, true, false));
        assertEquals(BadgePack.Step.SEND, BadgePack.plan(ON, declined, true, true));
    }

    @Test
    void oldClientsAndBedrockAndSwitchedOff() {
        assertEquals(BadgePack.Step.NOTHING, BadgePack.plan(ON, null, false, false));
        assertEquals(BadgePack.Step.UNSUPPORTED, BadgePack.plan(ON, null, false, true));
        // Im Panel ausgeschaltet: wer es hat, bekommt es abgenommen.
        assertEquals(BadgePack.Step.REMOVE,
                BadgePack.plan(BadgePack.Config.OFF, new BadgePack.Sent(SHA1, false, 0), true, false));
        assertEquals(BadgePack.Step.NOTHING, BadgePack.plan(BadgePack.Config.OFF, null, true, true));
    }

    @Test
    void triesAgainThreeTimesAfterAnError() {
        assertEquals(10, BadgePack.retryDelaySeconds(1));
        assertEquals(20, BadgePack.retryDelaySeconds(2));
        assertEquals(40, BadgePack.retryDelaySeconds(3));
        assertEquals(0, BadgePack.retryDelaySeconds(4));
        assertEquals(0, BadgePack.retryDelaySeconds(0));
    }
}
