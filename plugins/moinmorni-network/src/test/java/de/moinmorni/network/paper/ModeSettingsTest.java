package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;
import org.bukkit.configuration.file.YamlConfiguration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Modus-Einstellungen: nur saubere Pfade, Listen-Stellen, Kommentare bleiben, Neustart nur bei Änderung. */
class ModeSettingsTest {

    private static final String CONFIG = """
            # Kopf-Kommentar
            kampf:
              # So lange dauert ein Kampf.
              zeitlimit-sekunden: 600
            suppe:
              heilung: 7.0
            runden: [10, 15, 20]
            stufen:
              - {ab: 0, prozent: 100}
              - {ab: 1, prozent: 50}
            auswahl: []
            """;

    @TempDir
    Path plugins;

    private ModeSettings modes() {
        return new ModeSettings(plugins, plugins.resolve("moinmorni"), "MoinMorni", Logger.getAnonymousLogger());
    }

    private static com.google.gson.JsonObject msg(String values) {
        return JsonParser.parseString("{\"mode\":\"duels\",\"plugin\":\"MoinMorniDuels\",\"values\":" + values + "}")
                .getAsJsonObject();
    }

    @Test
    void lehntUnsauberePfadeUndPluginsAb() {
        ModeSettings m = modes();
        for (String bad : List.of("../x", "a..b", ".a", "a.", "A.b", "a/b", "a b", "")) {
            assertThrows(IllegalArgumentException.class, () -> m.parse(msg("{\"" + bad + "\": 1}")), bad);
        }
        assertThrows(IllegalArgumentException.class, () -> m.parse(JsonParser.parseString(
                "{\"mode\":\"x\",\"plugin\":\"../etc\",\"values\":{}}").getAsJsonObject()));
        assertThrows(IllegalArgumentException.class, () -> m.parse(JsonParser.parseString(
                "{\"mode\":\"x\",\"plugin\":\"MoinMorni\",\"values\":{}}").getAsJsonObject()));
        assertEquals(600, m.parse(msg("{\"kampf.zeitlimit-sekunden\": 600}")).values().get("kampf.zeitlimit-sekunden"));
    }

    @Test
    void listenStellenUndFelder() throws Exception {
        YamlConfiguration yaml = new YamlConfiguration();
        yaml.loadFromString(CONFIG);
        assertEquals(15, ModeSettings.get(yaml, "runden.1"));
        assertEquals(50, ModeSettings.get(yaml, "stufen.1.prozent"));
        assertTrue(ModeSettings.set(yaml, "runden.2", 25));
        assertTrue(ModeSettings.set(yaml, "stufen.1.prozent", 40));
        assertEquals(List.of(10, 15, 25), yaml.getList("runden"));
        assertEquals(Map.of("ab", 1, "prozent", 40), yaml.getMapList("stufen").get(1));
        assertFalse(ModeSettings.set(yaml, "runden.9", 1), "Lücke in der Liste");
        assertFalse(ModeSettings.set(yaml, "gibts.0", 1), "Zahl ohne Liste davor");
        assertTrue(ModeSettings.same(7, 7.0));
        assertFalse(ModeSettings.same(7, 7.5));
    }

    @Test
    void schreibtNurBeiAenderungUndMeldetNeustart() throws Exception {
        Path config = plugins.resolve("MoinMorniDuels").resolve("config.yml");
        Files.createDirectories(config.getParent());
        Files.writeString(config, CONFIG);
        ModeSettings m = modes();
        ModeSettings.Result same = m.apply(m.parse(msg("{\"kampf.zeitlimit-sekunden\": 600, \"suppe.heilung\": 7}")), true);
        assertFalse(same.restart());
        assertEquals(CONFIG, Files.readString(config), "unverändert, nicht neu geschrieben");

        ModeSettings.Result changed = m.apply(m.parse(msg("{\"kampf.zeitlimit-sekunden\": 300, \"suppe.heilung\": 7.5}")), true);
        assertTrue(changed.restart());
        assertEquals(2, changed.changed());
        String text = Files.readString(config);
        assertTrue(text.contains("# So lange dauert ein Kampf."), "Kommentar bleibt");
        assertTrue(text.contains("zeitlimit-sekunden: 300"));
        assertTrue(text.contains("heilung: 7.5"));
        assertTrue(Files.isRegularFile(plugins.resolve("moinmorni/mode-settings.json")));

        // Zurück auf den Wert vom Start: kein Neustart mehr nötig.
        assertFalse(m.apply(m.parse(msg("{\"kampf.zeitlimit-sekunden\": 600, \"suppe.heilung\": 7}")), true).restart());

        // Nächster Start: die gemerkten Werte werden vorher eingetragen.
        m.apply(m.parse(msg("{\"kampf.zeitlimit-sekunden\": 120}")), true);
        Files.writeString(config, CONFIG);
        modes().applySaved();
        assertTrue(Files.readString(config).contains("zeitlimit-sekunden: 120"));
    }
}
