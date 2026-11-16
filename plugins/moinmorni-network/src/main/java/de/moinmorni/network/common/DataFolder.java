package de.moinmorni.network.common;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.logging.Logger;

/**
 * Der Datenordner des Netzwerk-Plugins auf jedem Server: {@code plugins/moinmorni/} (hub.json, gemerkte Einstellungen
 * der Spielmodi, Bestenliste des Parkours, Bau-Stand der Lobby …) – auf Paper und Velocity gleich.
 *
 * <p>Rückbenennung: Am 16.11.2026 lief der Entwicklungs-Branch ein paar Stunden unter einem Zwischen-Namen, der Ordner
 * auch ({@link #INTERIM_FOLDER}). Beim Start holt das Plugin alles von dort zurück. Was es hier schon gibt (z. B. eine
 * neue hub.json, die MoinMorni vor dem Neustart hingelegt hat), ist neuer und bleibt; danach ist der Zwischen-Ordner weg.
 */
public final class DataFolder {

    /** Name des Ordners unter plugins/. */
    public static final String NAME = "moinmorni";
    /** Ordner unter dem Zwischen-Namen (nur für die Rückbenennung bestehender Server). */
    static final String INTERIM_FOLDER = "morninet";
    /** Netzwerk-Plugin unter dem Zwischen-Namen auf Paper (plugin.yml) – läuft es noch, wird es abgeschaltet. */
    public static final String INTERIM_PLUGIN = "MorniNet";
    /** ID des Netzwerk-Plugins unter dem Zwischen-Namen auf Velocity. */
    public static final String INTERIM_PROXY_PLUGIN = INTERIM_FOLDER;

    private DataFolder() {
    }

    /** plugins/moinmorni/ zum Plugin-Ordner (plugins/). */
    public static Path in(Path plugins) {
        return plugins.resolve(NAME);
    }

    /**
     * Holt den Ordner unter dem Zwischen-Namen nach plugins/moinmorni/ zurück. Gibt zurück, wie viele Einträge
     * übernommen wurden (0 = es gab nichts zurückzuholen).
     */
    public static int adoptInterim(Path plugins, Logger log) {
        Path interim = plugins.resolve(INTERIM_FOLDER);
        // Nie einem Link folgen: zurückgeholt wird nur ein echter Ordner.
        if (!Files.isDirectory(interim, LinkOption.NOFOLLOW_LINKS)) {
            return 0;
        }
        Path target = in(plugins);
        int moved = 0;
        try {
            Files.createDirectories(target);
            try (DirectoryStream<Path> entries = Files.newDirectoryStream(interim)) {
                for (Path entry : entries) {
                    Path dest = target.resolve(entry.getFileName().toString());
                    if (Files.exists(dest, LinkOption.NOFOLLOW_LINKS)) {
                        continue;
                    }
                    Files.move(entry, dest, StandardCopyOption.ATOMIC_MOVE);
                    moved++;
                }
            }
            deleteTree(interim);
            log.info("Daten aus plugins/" + INTERIM_FOLDER + "/ nach plugins/" + NAME + "/ zurückgeholt (" + moved
                    + " Einträge) – das Netzwerk heißt wieder MoinMorni.");
        } catch (IOException e) {
            log.warning("Zurückholen von plugins/" + INTERIM_FOLDER + "/ nach plugins/" + NAME + "/ ging nicht ganz ("
                    + e.getMessage() + ") – nächster Versuch beim nächsten Start.");
        }
        return moved;
    }

    private static void deleteTree(Path dir) throws IOException {
        Files.walkFileTree(dir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path d, IOException e) throws IOException {
                if (e != null) {
                    throw e;
                }
                Files.delete(d);
                return FileVisitResult.CONTINUE;
            }
        });
    }
}
