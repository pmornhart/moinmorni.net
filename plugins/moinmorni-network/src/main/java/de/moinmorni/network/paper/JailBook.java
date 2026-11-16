package de.moinmorni.network.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import de.moinmorni.network.common.HubClient;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;

/**
 * Wer im Gefängnis sitzt und wo die Zelle ist – ohne Bukkit, damit es sich prüfen lässt. Der Stand kommt vom Hub
 * ({@code jail}) und liegt zusätzlich in {@code plugins/moinmorni/jail.json}: Startet die Lobby neu, kennt sie Zelle
 * und Eingesperrte schon, bevor der Hub sich meldet – so kommt niemand frei, der es nicht sein soll, und wer
 * inzwischen frei ist und noch in der Zelle steht, wird herausgesetzt.
 */
final class JailBook {

    /** Innenraum der Zelle (Blockkoordinaten, beide Ecken inklusive) und wo man nach dem Einsperren steht. */
    record Cell(Spot spawn, int minX, int minY, int minZ, int maxX, int maxY, int maxZ) {
        /** Steht man (Füße) in der Zelle? Eine Höhe unter dem Boden zählt mit (man steht auf dem Boden). */
        boolean contains(double x, double y, double z) {
            return x >= minX && x < maxX + 1 && y >= minY - 1 && y < maxY + 1 && z >= minZ && z < maxZ + 1;
        }
    }

    record Spot(double x, double y, double z, float yaw, float pitch) {
    }

    /** Ende der Strafe (null = bis das Team freilässt) und Grund. */
    record Entry(Instant until, String reason) {
        boolean over(Instant now) {
            return until != null && !now.isBefore(until);
        }
    }

    private static final String FILE = "jail.json";

    private final Path file;
    private final Logger log;
    private volatile Cell cell;
    private volatile Map<UUID, Entry> jailed = Map.of();

    JailBook(Path dataDir, Logger log) {
        this.file = dataDir.resolve(FILE);
        this.log = log;
    }

    Cell cell() {
        return cell;
    }

    Entry entry(UUID id) {
        return jailed.get(id);
    }

    /** Sitzt gerade im Gefängnis (Zelle bekannt, Strafe da und Zeit noch nicht um)? */
    boolean isJailed(UUID id, Instant now) {
        Entry e = jailed.get(id);
        return e != null && !e.over(now) && cell != null;
    }

    /** Zeit um: aus der Liste nehmen (der Hub schickt beim nächsten Mal ohnehin nur noch Gültige). */
    void forget(UUID id) {
        Map<UUID, Entry> next = new HashMap<>(jailed);
        if (next.remove(id) != null) {
            jailed = Map.copyOf(next);
        }
    }

    /** Stand vom Hub übernehmen und merken. */
    void apply(JsonObject m) {
        read(m);
        save(m);
    }

    /** Gemerkten Stand laden (vor dem Hub); fehlt die Datei oder ist sie kaputt, bleibt alles leer. */
    void load() {
        if (!Files.isRegularFile(file)) {
            return;
        }
        try {
            read(JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject());
        } catch (IOException | RuntimeException e) {
            log.warning("Gefängnis: gemerkter Stand nicht lesbar (" + e.getMessage() + ") – warte auf den Hub.");
        }
    }

    private void read(JsonObject m) {
        JsonObject c = m.getAsJsonObject("cell");
        if (c != null) {
            cell = parseCell(c);
        }
        jailed = Map.copyOf(parsePlayers(m.getAsJsonArray("players")));
    }

    private void save(JsonObject m) {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = Files.createTempFile(file.getParent(), FILE, ".tmp");
            Files.writeString(tmp, m.toString(), StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            log.warning("Gefängnis: Stand nicht gespeichert (" + e.getMessage() + ").");
        }
    }

    /**
     * Eingesperrte aus der Liste des Hubs. Steht jemand mehrmals darin (zwei Strafen), zählt die längste – „für immer“
     * schlägt jedes Ende; so stimmt die Zelle mit dem Hub überein, der jede gültige Strafe zählt.
     */
    static Map<UUID, Entry> parsePlayers(JsonArray list) {
        Map<UUID, Entry> next = new HashMap<>();
        if (list == null) {
            return next;
        }
        for (JsonElement el : list) {
            JsonObject o = el.getAsJsonObject();
            String until = HubClient.str(o, "until");
            Entry e = new Entry(until == null ? null : Instant.parse(until), HubClient.str(o, "reason"));
            next.merge(UUID.fromString(HubClient.str(o, "uuid")), e, JailBook::longer);
        }
        return next;
    }

    static Entry longer(Entry a, Entry b) {
        if (a.until() == null || b.until() == null) {
            return a.until() == null ? a : b;
        }
        return a.until().isAfter(b.until()) ? a : b;
    }

    static Cell parseCell(JsonObject c) {
        JsonObject s = c.getAsJsonObject("spawn");
        JsonObject min = c.getAsJsonObject("min");
        JsonObject max = c.getAsJsonObject("max");
        Spot spawn = new Spot(s.get("x").getAsDouble(), s.get("y").getAsDouble(), s.get("z").getAsDouble(),
                s.get("yaw").getAsFloat(), s.get("pitch").getAsFloat());
        return new Cell(spawn, min.get("x").getAsInt(), min.get("y").getAsInt(), min.get("z").getAsInt(),
                max.get("x").getAsInt(), max.get("y").getAsInt(), max.get("z").getAsInt());
    }
}
