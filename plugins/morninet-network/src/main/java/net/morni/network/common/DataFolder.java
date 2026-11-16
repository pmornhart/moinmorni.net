package net.morni.network.common;

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
 * Der Datenordner des Netzwerk-Plugins auf jedem Server: {@code plugins/morninet/} (hub.json, gemerkte Einstellungen
 * der Spielmodi, Bestenliste des Parkours, Bau-Stand der Lobby …) – auf Paper und Velocity gleich.
 *
 * <p>Umzug: Bis zum 16.11.2026 hieß das Netzwerk anders, der Ordner auch ({@link #OLD_FOLDER}). Beim Start zieht das
 * Plugin alles von dort hierher um. Was es hier schon gibt (z. B. eine neue hub.json, die morni.net vor dem Neustart
 * hingelegt hat), ist neuer und bleibt; danach ist der alte Ordner weg.
 */
public final class DataFolder {

    /** Name des Ordners unter plugins/. */
    public static final String NAME = "morninet";
    /** Früherer Name des Ordners (nur für den Umzug bestehender Server). */
    static final String OLD_FOLDER = "moinmorni";
    /** Früherer Name des Netzwerk-Plugins auf Paper (plugin.yml) – läuft es noch, wird es abgeschaltet. */
    public static final String OLD_PLUGIN = "MoinMorni";
    /** Frühere ID des Netzwerk-Plugins auf Velocity. */
    public static final String OLD_PROXY_PLUGIN = OLD_FOLDER;

    private DataFolder() {
    }

    /** plugins/morninet/ zum Plugin-Ordner (plugins/). */
    public static Path in(Path plugins) {
        return plugins.resolve(NAME);
    }

    /**
     * Zieht den Ordner unter dem früheren Namen nach plugins/morninet/ um. Gibt zurück, wie viele Einträge
     * übernommen wurden (0 = es gab nichts umzuziehen).
     */
    public static int adoptOld(Path plugins, Logger log) {
        Path old = plugins.resolve(OLD_FOLDER);
        // Nie einem Link folgen: umgezogen wird nur ein echter Ordner.
        if (!Files.isDirectory(old, LinkOption.NOFOLLOW_LINKS)) {
            return 0;
        }
        Path target = in(plugins);
        int moved = 0;
        try {
            Files.createDirectories(target);
            try (DirectoryStream<Path> entries = Files.newDirectoryStream(old)) {
                for (Path entry : entries) {
                    Path dest = target.resolve(entry.getFileName().toString());
                    if (Files.exists(dest, LinkOption.NOFOLLOW_LINKS)) {
                        continue;
                    }
                    Files.move(entry, dest, StandardCopyOption.ATOMIC_MOVE);
                    moved++;
                }
            }
            deleteTree(old);
            log.info("Daten aus plugins/" + OLD_FOLDER + "/ nach plugins/" + NAME + "/ umgezogen (" + moved
                    + " Einträge) – das Netzwerk heißt jetzt morni.net.");
        } catch (IOException e) {
            log.warning("Umzug von plugins/" + OLD_FOLDER + "/ nach plugins/" + NAME + "/ ging nicht ganz ("
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
