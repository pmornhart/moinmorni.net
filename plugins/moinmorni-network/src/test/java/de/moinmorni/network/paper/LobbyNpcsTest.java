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
        return pausing(state, access, players, awake, phase, null);
    }

    /** {@code pause} sagt der Hub: „summer“ nur bei Saison-Modi (Wintersport), sonst „closed“. */
    private static LobbyNpcs.ModeInfo pausing(String state, String access, int players, boolean awake, String phase,
                                              String pause) {
        return new LobbyNpcs.ModeInfo("bollwerk", "Bollwerk", "Bulwark", state, access, players, true, awake, "shield",
                phase, pause);
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
        LobbyNpcs.LabelText summer = LobbyNpcs.labelText(pausing("on", "everyone", 0, true, "closed", "summer"), "b",
                "de", ORANGE);
        assertEquals("☀ Sommerpause", plain(summer.state()));
        assertTrue(plain(summer.hint()).contains("Dorf anschauen"));
        // Andere Modi melden „closed“ z. B. beim Beenden: gerade zu, keine Sommerpause
        LobbyNpcs.LabelText closed = LobbyNpcs.labelText(pausing("on", "everyone", 0, true, "closed", "closed"), "b",
                "de", ORANGE);
        assertEquals("● Gerade geschlossen", plain(closed.state()));
        assertEquals("Gleich wieder offen", plain(closed.hint()));
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
        assertEquals(-178f, across, 0.01f);
    }

    @Test
    void imStehenBleibtDerKoerperBisDerKopf50GradVorausIst() {
        // Auf der Stelle drehen (12° je Tick): der Körper rührt sich erst, wenn der Kopf 50° voraus ist
        assertEquals(0f, LobbyNpcs.bodyAfter(0f, 48f, false), 0.01f);
        assertEquals(10f, LobbyNpcs.bodyAfter(0f, 60f, false), 0.01f);
        float body = 0f;
        for (float yaw = 12; yaw <= 180; yaw += 12) {
            body = LobbyNpcs.bodyAfter(body, yaw, false);
            assertTrue(LobbyNpcs.wrap(yaw - body) <= 50.01f, "höchstens 50° hinter dem Kopf");
        }
        assertEquals(130f, body, 0.01f);
        // dann losgehen: der Körper holt in wenigen Schritten auf
        for (int i = 0; i < 15; i++) {
            body = LobbyNpcs.bodyAfter(body, 180f, true);
        }
        assertEquals(180f, Math.abs(body), 0.5f);
    }

    @Test
    void platzAusDemBauWirdGemerkt() {
        double[] home = LobbyNpcs.parseHome("2.5;65.0;-27.5");
        assertEquals(2.5, home[0], 1e-9);
        assertEquals(65.0, home[1], 1e-9);
        assertEquals(-27.5, home[2], 1e-9);
        assertNull(LobbyNpcs.parseHome(null));
        assertNull(LobbyNpcs.parseHome("2.5;65"));
        assertNull(LobbyNpcs.parseHome("a;b;c"));
    }

    @Test
    void durchSchilderFahnenUndFackelnLaeuftNiemand() {
        assertTrue(LobbyNpcs.inTheWay(org.bukkit.Material.OAK_SIGN));
        assertTrue(LobbyNpcs.inTheWay(org.bukkit.Material.SPRUCE_WALL_HANGING_SIGN));
        assertTrue(LobbyNpcs.inTheWay(org.bukkit.Material.WHITE_BANNER));
        assertTrue(LobbyNpcs.inTheWay(org.bukkit.Material.LANTERN) == false);
        assertTrue(LobbyNpcs.inTheWay(org.bukkit.Material.TORCH));
        assertTrue(LobbyNpcs.inTheWay(org.bukkit.Material.SUGAR_CANE));
        assertTrue(!LobbyNpcs.inTheWay(org.bukkit.Material.SHORT_GRASS));
        assertTrue(!LobbyNpcs.inTheWay(org.bukkit.Material.POPPY));
        // auf Zäunen und Mauern läuft niemand entlang
        assertTrue(LobbyNpcs.fenceLike(org.bukkit.Material.OAK_FENCE));
        assertTrue(LobbyNpcs.fenceLike(org.bukkit.Material.STONE_BRICK_WALL));
        assertTrue(LobbyNpcs.fenceLike(org.bukkit.Material.SPRUCE_FENCE_GATE));
        assertTrue(!LobbyNpcs.fenceLike(org.bukkit.Material.STONE_BRICKS));
    }

    @Test
    void kopfDrehtSichWeichZumZiel() {
        float yaw = 0f;
        int ticks = 0;
        float last = 0f;
        while (yaw != 60f && ticks < 40) {
            float next = LobbyNpcs.ease(yaw, 60f);
            assertTrue(next - yaw <= 9.01f, "höchstens 9° je Tick");
            assertTrue(next - yaw >= 0.49f || next == 60f, "keine Hänger");
            yaw = next;
            ticks++;
            last = yaw;
        }
        assertEquals(60f, last, 0.001f);
        assertTrue(ticks > 6 && ticks < 25, "weich, aber nicht träge: " + ticks);
        // über die ±180°-Grenze den kurzen Weg
        // 14° Abstand: 35 % davon = 4,9° weiter, also über 180° hinaus
        assertEquals(-179.1f, LobbyNpcs.wrap(LobbyNpcs.ease(176f, -170f)), 0.01f);
    }
}
