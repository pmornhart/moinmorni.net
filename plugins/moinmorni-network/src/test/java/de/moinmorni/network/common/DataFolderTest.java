package de.moinmorni.network.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Rückbenennung: Datenordner unter dem Zwischen-Namen zurück nach plugins/moinmorni/. */
class DataFolderTest {

    private static final Logger LOG = Logger.getAnonymousLogger();

    @TempDir
    Path root;

    private Path plugins() throws IOException {
        return Files.createDirectories(root.resolve("plugins"));
    }

    @Test
    void holtZurueckUndNeueresBleibt() throws IOException {
        Path plugins = plugins();
        Path interim = plugins.resolve(DataFolder.INTERIM_FOLDER);
        Files.createDirectories(interim.resolve("unter"));
        Files.writeString(interim.resolve("hub.json"), "zwischen");
        Files.writeString(interim.resolve("parkour.yml"), "bestzeiten");
        Files.writeString(interim.resolve("mode-settings.json"), "{}");
        Files.writeString(interim.resolve("unter/datei.txt"), "x");
        Path neu = DataFolder.in(plugins);
        Files.createDirectories(neu);
        Files.writeString(neu.resolve("hub.json"), "neu");

        assertEquals(3, DataFolder.adoptInterim(plugins, LOG));

        assertEquals("neu", Files.readString(neu.resolve("hub.json")));
        assertEquals("bestzeiten", Files.readString(neu.resolve("parkour.yml")));
        assertEquals("{}", Files.readString(neu.resolve("mode-settings.json")));
        assertEquals("x", Files.readString(neu.resolve("unter/datei.txt")));
        assertFalse(Files.exists(interim));
    }

    @Test
    void ohneZwischenOrdnerPassiertNichts() throws IOException {
        Path plugins = plugins();
        assertEquals(0, DataFolder.adoptInterim(plugins, LOG));
        assertFalse(Files.exists(DataFolder.in(plugins)));
    }

    @Test
    void folgtKeinemLink() throws IOException {
        Path plugins = plugins();
        Path elsewhere = Files.createDirectories(root.resolve("anderswo"));
        Files.writeString(elsewhere.resolve("geheim.txt"), "bleibt");
        Files.createSymbolicLink(plugins.resolve(DataFolder.INTERIM_FOLDER), elsewhere);

        assertEquals(0, DataFolder.adoptInterim(plugins, LOG));

        assertTrue(Files.exists(elsewhere.resolve("geheim.txt")));
        assertFalse(Files.exists(DataFolder.in(plugins).resolve("geheim.txt")));
    }

    @Test
    void zweimalHintereinanderIstHarmlos() throws IOException {
        Path plugins = plugins();
        Path interim = Files.createDirectories(plugins.resolve(DataFolder.INTERIM_FOLDER));
        Files.writeString(interim.resolve("parkour.yml"), "bestzeiten");

        assertEquals(1, DataFolder.adoptInterim(plugins, LOG));
        assertEquals(0, DataFolder.adoptInterim(plugins, LOG));
        assertEquals("bestzeiten", Files.readString(DataFolder.in(plugins).resolve("parkour.yml")));
    }
}
