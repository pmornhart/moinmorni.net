package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Gefängnis ohne Server: Liste vom Hub, längste Strafe zählt, Zelle, Stand auf der Platte nach einem Neustart. */
class JailBookTest {

    private static final UUID LENA = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final UUID FINN = UUID.fromString("33333333-3333-3333-3333-333333333333");
    private static final Instant NOW = Instant.parse("2026-11-16T22:00:00Z");
    /** Zelle wie im Bauplan (packages/builder/src/lobby/jail.ts). */
    private static final String CELL = """
            {"spawn":{"x":-29.5,"y":58,"z":36.5,"yaw":180,"pitch":5},
             "min":{"x":-33,"y":58,"z":32},"max":{"x":-27,"y":61,"z":38}}""";

    private static JsonObject state(String players) {
        return JsonParser.parseString("{\"t\":\"jail\",\"cell\":" + CELL + ",\"players\":[" + players + "]}")
                .getAsJsonObject();
    }

    private static String entry(UUID id, String until) {
        return "{\"uuid\":\"" + id + "\",\"until\":" + (until == null ? "null" : "\"" + until + "\"")
                + ",\"reason\":\"Spam\"}";
    }

    @Test
    void zeitUndFreilassen(@TempDir Path dir) {
        JailBook book = new JailBook(dir, Logger.getAnonymousLogger());
        assertFalse(book.isJailed(LENA, NOW));
        book.apply(state(entry(LENA, "2026-11-16T22:10:00Z") + "," + entry(FINN, null)));
        assertTrue(book.isJailed(LENA, NOW));
        assertTrue(book.isJailed(FINN, NOW));
        // Zeit um: nicht mehr eingesperrt, auch ohne neue Nachricht vom Hub.
        assertFalse(book.isJailed(LENA, Instant.parse("2026-11-16T22:10:00Z")));
        // Freigelassen (/frei, Panel): fehlt in der nächsten Liste.
        book.apply(state(entry(FINN, null)));
        assertFalse(book.isJailed(LENA, NOW));
        book.forget(FINN);
        assertFalse(book.isJailed(FINN, NOW));
    }

    @Test
    void zweiStrafenDieLaengsteZaehlt() {
        var list = JailBook.parsePlayers(state(entry(LENA, "2026-11-16T22:05:00Z") + ","
                + entry(LENA, "2026-11-16T23:00:00Z") + "," + entry(FINN, "2026-11-16T22:05:00Z") + ","
                + entry(FINN, null)).getAsJsonArray("players"));
        assertEquals(Instant.parse("2026-11-16T23:00:00Z"), list.get(LENA).until());
        assertNull(list.get(FINN).until());
    }

    @Test
    void zelleMitBodenUndRand() {
        JailBook.Cell c = JailBook.parseCell(state("").getAsJsonObject("cell"));
        assertTrue(c.contains(-29.5, 58, 36.5));
        assertTrue(c.contains(-33, 57.5, 32));
        assertTrue(c.contains(-26.01, 61.9, 38.99));
        assertFalse(c.contains(-26, 58, 36));
        assertFalse(c.contains(-30, 62, 36));
        assertFalse(c.contains(-30, 56.9, 36));
        assertFalse(c.contains(-30, 58, 39));
        // Dorfplatz und Rathaus darüber liegen draußen.
        assertFalse(c.contains(-30, 65, 35));
        assertFalse(c.contains(0.5, 65, 0.5));
    }

    @Test
    void nachNeustartKenntDieLobbyZelleUndEingesperrte(@TempDir Path dir) throws Exception {
        new JailBook(dir, Logger.getAnonymousLogger()).apply(state(entry(LENA, null)));
        assertTrue(Files.isRegularFile(dir.resolve("jail.json")));
        JailBook fresh = new JailBook(dir, Logger.getAnonymousLogger());
        assertNull(fresh.cell());
        fresh.load();
        assertTrue(fresh.isJailed(LENA, NOW));
        assertEquals(-29.5, fresh.cell().spawn().x());
        // Kaputte Datei: leer bleiben, auf den Hub warten.
        Files.writeString(dir.resolve("jail.json"), "{kaputt");
        JailBook broken = new JailBook(dir, Logger.getAnonymousLogger());
        broken.load();
        assertNull(broken.cell());
        assertFalse(broken.isJailed(LENA, NOW));
    }
}
