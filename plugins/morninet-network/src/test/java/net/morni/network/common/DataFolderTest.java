package net.morni.network.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.logging.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Umzug des Datenordners vom früheren Namen nach plugins/morninet/. */
class DataFolderTest {

    private static final Logger LOG = Logger.getAnonymousLogger();

    @TempDir
    Path root;

    private Path plugins() throws IOException {
        return Files.createDirectories(root.resolve("plugins"));
    }

    @Test
    void ziehtUmUndNeueresBleibt() throws IOException {
        Path plugins = plugins();
        Path old = plugins.resolve(DataFolder.OLD_FOLDER);
        Files.createDirectories(old.resolve("unter"));
        Files.writeString(old.resolve("hub.json"), "alt");
        Files.writeString(old.resolve("parkour.yml"), "bestzeiten");
        Files.writeString(old.resolve("mode-settings.json"), "{}");
        Files.writeString(old.resolve("unter/datei.txt"), "x");
        Path neu = DataFolder.in(plugins);
        Files.createDirectories(neu);
        Files.writeString(neu.resolve("hub.json"), "neu");

        assertEquals(3, DataFolder.adoptOld(plugins, LOG));

        assertEquals("neu", Files.readString(neu.resolve("hub.json")));
        assertEquals("bestzeiten", Files.readString(neu.resolve("parkour.yml")));
        assertEquals("{}", Files.readString(neu.resolve("mode-settings.json")));
        assertEquals("x", Files.readString(neu.resolve("unter/datei.txt")));
        assertFalse(Files.exists(old));
    }

    @Test
    void ohneAltenOrdnerPassiertNichts() throws IOException {
        Path plugins = plugins();
        assertEquals(0, DataFolder.adoptOld(plugins, LOG));
        assertFalse(Files.exists(DataFolder.in(plugins)));
    }

    @Test
    void folgtKeinemLink() throws IOException {
        Path plugins = plugins();
        Path elsewhere = Files.createDirectories(root.resolve("anderswo"));
        Files.writeString(elsewhere.resolve("geheim.txt"), "bleibt");
        Files.createSymbolicLink(plugins.resolve(DataFolder.OLD_FOLDER), elsewhere);

        assertEquals(0, DataFolder.adoptOld(plugins, LOG));

        assertTrue(Files.exists(elsewhere.resolve("geheim.txt")));
        assertFalse(Files.exists(DataFolder.in(plugins).resolve("geheim.txt")));
    }
}
