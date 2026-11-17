package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.junit.jupiter.api.Test;

/** Schild über den Modus-Figuren und wie der Körper beim Laufen nachdreht. */
class LobbyNpcsTest {

    private static final TextColor ORANGE = TextColor.color(0xFF9A2E);

    private static LobbyNpcs.ModeInfo mode(String state, String access, int players, boolean awake, String phase) {
        return new LobbyNpcs.ModeInfo("bollwerk", "Bollwerk", "Bulwark", state, access, players, true, awake, "shield",
                phase);
    }

    private static String plain(Component c) {
        return c == null ? null : PlainTextComponentSerializer.plainText().serialize(c);
    }

    @Test
    void dreiZeilenNameZustandHinweis() {
        LobbyNpcs.LabelText awake = LobbyNpcs.labelText(mode("on", "everyone", 12, true, null), "bollwerk", "de", ORANGE);
        assertEquals("Bollwerk", plain(awake.name()));
        assertEquals(ORANGE, awake.name().color());
        assertEquals("● 12 spielen", plain(awake.state()));
        assertEquals("Rechtsklick: Mitspielen", plain(awake.hint()));
        assertEquals("● 1 spielt",
                plain(LobbyNpcs.labelText(mode("on", "everyone", 1, true, null), "bollwerk", "de", ORANGE).state()));
        LobbyNpcs.LabelText english = LobbyNpcs.labelText(mode("on", "everyone", 3, true, null), "bollwerk", "en", ORANGE);
        assertEquals("Bulwark", plain(english.name()));
        assertEquals("● 3 playing", plain(english.state()));
        assertEquals("Right-click to play", plain(english.hint()));
    }

    @Test
    void schlaeftGeschlossenWartungEinladung() {
        assertEquals("☾ schläft – Klick weckt",
                plain(LobbyNpcs.labelText(mode("on", "everyone", 0, false, null), "b", "de", ORANGE).state()));
        LobbyNpcs.LabelText off = LobbyNpcs.labelText(mode("off", "everyone", 0, false, null), "b", "de", ORANGE);
        assertEquals("● geschlossen", plain(off.state()));
        assertNull(off.hint());
        assertEquals("⚒ Wartung",
                plain(LobbyNpcs.labelText(mode("maintenance", "everyone", 0, true, null), "b", "de", ORANGE).state()));
        LobbyNpcs.LabelText invite = LobbyNpcs.labelText(mode("on", "whitelist", 2, true, null), "b", "de", ORANGE);
        assertEquals("Nur auf Einladung", plain(invite.hint()));
        assertEquals(NamedTextColor.LIGHT_PURPLE, invite.hint().color());
        LobbyNpcs.LabelText pause = LobbyNpcs.labelText(mode("on", "everyone", 0, true, "closed"), "b", "de", ORANGE);
        assertTrue(plain(pause.hint()).contains("Dorf anschauen"));
    }

    @Test
    void koerperDrehtLangsamNachHoechstens50GradHinterDemKopf() {
        // 30 % je Schritt (Minecraft), aber nie mehr als 50° hinter der Blickrichtung: 0 → 27 → 40
        assertEquals(40f, LobbyNpcs.followBody(0f, 90f), 0.01f);
        assertEquals(19.5f, LobbyNpcs.followBody(0f, 65f), 0.01f);
        float body = 0f;
        for (int i = 0; i < 40; i++) {
            body = LobbyNpcs.followBody(body, 90f);
        }
        assertEquals(90f, body, 0.05f);
        // über die ±180°-Grenze hinweg der kurze Weg: 170° → −150° heißt 40° weiter, 30 % davon
        float across = LobbyNpcs.followBody(170f, -150f);
        assertEquals(182f, across, 0.01f);
    }
}
