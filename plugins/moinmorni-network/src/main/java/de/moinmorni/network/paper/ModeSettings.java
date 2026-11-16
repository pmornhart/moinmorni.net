package de.moinmorni.network.paper;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.logging.Logger;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.InvalidConfigurationException;
import org.bukkit.configuration.file.YamlConfiguration;

/**
 * Einstellungen eines Spielmodus aus dem Panel (Hub-Nachricht {@code mode-settings}): „Pfad in der config.yml → Wert“.
 * Sie landen in plugins/&lt;Plugin&gt;/config.yml des Modus – Kommentare bleiben – und in
 * plugins/moinmorni/mode-settings.json. Beim nächsten Start trägt {@link #applySaved()} sie ein, bevor der Modus seine
 * config.yml liest. Ob der Modus neu starten muss, entscheidet der Vergleich mit dem, was er beim Start gelesen hat.
 *
 * <p>Pfade nur aus {@code a-z 0-9 . _ -}, keine leeren Teile; eine Zahl als Teil ist die Stelle in einer Liste
 * ({@code edelweiss-jagd-runden.0}, {@code ankauf.stufen.1.prozent}).
 */
final class ModeSettings {

    // "kampf.zeitlimit-sekunden", "ankauf.preise.melon_slice.preis" – kein ".." und kein Punkt am Rand.
    // https://regex101.com/?flavor=java&regex=%5E%5Ba-z0-9_-%5D%2B(%5C.%5Ba-z0-9_-%5D%2B)*%24&testString=ankauf.stufen.1.prozent
    private static final Pattern PATH = Pattern.compile("^[a-z0-9_-]+(\\.[a-z0-9_-]+)*$");
    // Name aus der plugin.yml des Modus: "MoinMorniDuels", "MorniSMP".
    // https://regex101.com/?flavor=java&regex=%5E%5BA-Za-z0-9_-%5D%7B1%2C64%7D%24&testString=MoinMorniDuels
    private static final Pattern PLUGIN = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
    // Stelle in einer Liste: "0" bis "9999".
    // https://regex101.com/?flavor=java&regex=%5E%5B0-9%5D%7B1%2C4%7D%24&testString=12
    private static final Pattern INDEX = Pattern.compile("^[0-9]{1,4}$");
    // Feld eines Listen-Eintrags oder Wort einer Auswahl: "prozent", "heisse-brezn".
    // https://regex101.com/?flavor=java&regex=%5E%5Ba-z0-9_-%5D%7B1%2C64%7D%24&testString=heisse-brezn
    private static final Pattern WORD = Pattern.compile("^[a-z0-9_-]{1,64}$");
    private static final String FILE = "mode-settings.json";
    private static final String CONFIG = "config.yml";
    private static final String DESCRIPTOR = "plugin.yml";
    private static final int MAX_VALUES = 1000;
    private static final int MAX_LIST = 1000;
    private static final int MAX_TEXT = 4000;
    private static final int MAX_DEPTH = 3;

    /** Was der Hub schickt: Modus, Plugin und Werte (schon geprüft). */
    record Settings(String mode, String plugin, Map<String, Object> values) {
    }

    /** Antwort an den Hub: muss der Modus neu starten, und wie viele Werte sind anders als beim Start? */
    record Result(boolean restart, int changed) {
    }

    private final Path pluginsDir;
    private final Path hubDir;
    private final String ownName;
    private final Logger log;
    /** config.yml je Plugin, so wie der Modus sie beim Start gelesen hat (vor der ersten Änderung gemerkt). */
    private final Map<String, YamlConfiguration> atStart = new HashMap<>();

    ModeSettings(Path pluginsDir, Path hubDir, String ownName, Logger log) {
        this.pluginsDir = pluginsDir;
        this.hubDir = hubDir;
        this.ownName = ownName;
        this.log = log;
    }

    // ---------- Prüfen ----------

    /** Nachricht des Hubs prüfen; wirft IllegalArgumentException mit dem Grund. */
    Settings parse(JsonObject m) {
        String mode = text(m, "mode");
        String plugin = text(m, "plugin");
        if (!WORD.matcher(mode).matches()) {
            throw new IllegalArgumentException("Modus „" + mode + "“");
        }
        if (!PLUGIN.matcher(plugin).matches() || plugin.equalsIgnoreCase(ownName)
                || plugin.equalsIgnoreCase(hubDir.getFileName().toString())) {
            throw new IllegalArgumentException("Plugin „" + plugin + "“");
        }
        JsonElement raw = m.get("values");
        if (raw == null || !raw.isJsonObject() || raw.getAsJsonObject().size() > MAX_VALUES) {
            throw new IllegalArgumentException("Werte fehlen oder sind zu viele");
        }
        Map<String, Object> values = new LinkedHashMap<>();
        for (Map.Entry<String, JsonElement> e : raw.getAsJsonObject().entrySet()) {
            if (!PATH.matcher(e.getKey()).matches()) {
                throw new IllegalArgumentException("Pfad „" + e.getKey() + "“");
            }
            values.put(e.getKey(), toJava(e.getValue(), 0));
        }
        return new Settings(mode, plugin, values);
    }

    private static String text(JsonObject m, String key) {
        JsonElement e = m.get(key);
        return e != null && e.isJsonPrimitive() ? e.getAsString() : "";
    }

    /** JSON → Werte, wie YAML sie kennt: Wahr/Falsch, ganze Zahl, Kommazahl, Text, Liste, Eintrag mit Feldern. */
    private static Object toJava(JsonElement e, int depth) {
        if (depth > MAX_DEPTH || e == null || e.isJsonNull()) {
            throw new IllegalArgumentException("Wert leer oder zu tief verschachtelt");
        }
        if (e.isJsonPrimitive()) {
            JsonPrimitive p = e.getAsJsonPrimitive();
            if (p.isBoolean()) {
                return p.getAsBoolean();
            }
            if (p.isNumber()) {
                return number(p.getAsBigDecimal());
            }
            String s = p.getAsString();
            if (s.length() > MAX_TEXT) {
                throw new IllegalArgumentException("Text zu lang");
            }
            return s;
        }
        if (e.isJsonArray()) {
            if (e.getAsJsonArray().size() > MAX_LIST) {
                throw new IllegalArgumentException("Liste zu lang");
            }
            List<Object> list = new ArrayList<>();
            e.getAsJsonArray().forEach(item -> list.add(toJava(item, depth + 1)));
            return list;
        }
        Map<String, Object> map = new LinkedHashMap<>();
        for (Map.Entry<String, JsonElement> f : e.getAsJsonObject().entrySet()) {
            if (!WORD.matcher(f.getKey()).matches()) {
                throw new IllegalArgumentException("Feld „" + f.getKey() + "“");
            }
            map.put(f.getKey(), toJava(f.getValue(), depth + 1));
        }
        return map;
    }

    /** Ganze Zahlen als Integer/Long (so schreibt YAML „3“, nicht „3.0“), sonst Kommazahl. */
    private static Object number(BigDecimal d) {
        try {
            return d.intValueExact();
        } catch (ArithmeticException notInt) {
            try {
                return d.longValueExact();
            } catch (ArithmeticException notLong) {
                return d.doubleValue();
            }
        }
    }

    // ---------- Eintragen ----------

    /**
     * Neue Werte vom Hub (auf dem Hauptthread): merken, in die config.yml des Modus eintragen (nur wenn sich etwas
     * ändert) und mit dem Stand beim Start vergleichen. Ohne das Modus-Plugin auf diesem Server wird nur gemerkt.
     */
    Result apply(Settings s, boolean pluginPresent) throws IOException {
        save(s);
        if (!pluginPresent) {
            return new Result(false, 0);
        }
        Path config = configOf(s.plugin());
        YamlConfiguration start = atStart.computeIfAbsent(s.plugin(), p -> loadOrEmpty(config));
        int written = write(config, s.values());
        if (written > 0) {
            log.info("MoinMorni: " + written + " Einstellung(en) aus dem Panel in " + s.plugin() + "/" + CONFIG
                    + " eingetragen.");
        }
        int changed = (int) s.values().entrySet().stream()
                .filter(e -> !same(get(start, e.getKey()), e.getValue()))
                .count();
        return new Result(changed > 0, changed);
    }

    /**
     * Beim Laden des Servers, bevor der Modus startet: gemerkte Werte in seine config.yml. Gibt es sie noch nicht
     * (erster Start), kommt sie aus der Jar des Modus – wie sonst bei seinem ersten Start.
     */
    void applySaved() {
        Path file = hubDir.resolve(FILE);
        if (!Files.isRegularFile(file)) {
            return;
        }
        try {
            Settings s = parse(JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject());
            Path config = configOf(s.plugin());
            if (!Files.isRegularFile(config) && !extractDefault(s.plugin(), config)) {
                return;
            }
            int written = write(config, s.values());
            if (written > 0) {
                log.info("MoinMorni: " + written + " Einstellung(en) aus dem Panel vor dem Start in " + s.plugin()
                        + "/" + CONFIG + " eingetragen.");
            }
        } catch (IOException | RuntimeException e) {
            log.warning("MoinMorni: gemerkte Einstellungen nicht eingetragen (" + e.getMessage() + ")");
        }
    }

    private Path configOf(String plugin) {
        Path config = pluginsDir.resolve(plugin).resolve(CONFIG).normalize();
        if (!config.startsWith(pluginsDir)) {
            throw new IllegalArgumentException("Pfad außerhalb von plugins/");
        }
        return config;
    }

    /** plugins/moinmorni/mode-settings.json (atomar). */
    private void save(Settings s) throws IOException {
        JsonObject body = new JsonObject();
        body.addProperty("mode", s.mode());
        body.addProperty("plugin", s.plugin());
        body.add("values", new Gson().toJsonTree(s.values()));
        Files.createDirectories(hubDir);
        writeAtomically(hubDir.resolve(FILE), new GsonBuilder().setPrettyPrinting().create().toJson(body) + "\n");
    }

    /** Werte in die config.yml (Kommentare bleiben); Rückgabe: wie viele wirklich anders waren. */
    private int write(Path config, Map<String, Object> values) throws IOException {
        YamlConfiguration yaml = new YamlConfiguration();
        if (Files.isRegularFile(config)) {
            try {
                yaml.loadFromString(Files.readString(config, StandardCharsets.UTF_8));
            } catch (InvalidConfigurationException e) {
                // Kaputte Datei nicht überschreiben – der Modus meldet sie selbst.
                throw new IOException(config.getFileName() + " ist kein gültiges YAML: " + e.getMessage(), e);
            }
        }
        int written = 0;
        for (Map.Entry<String, Object> e : values.entrySet()) {
            if (same(get(yaml, e.getKey()), e.getValue())) {
                continue;
            }
            if (set(yaml, e.getKey(), e.getValue())) {
                written++;
            } else {
                log.warning("MoinMorni: Einstellung „" + e.getKey() + "“ passt nicht zur " + CONFIG + " – übersprungen.");
            }
        }
        if (written > 0) {
            Files.createDirectories(config.getParent());
            writeAtomically(config, yaml.saveToString());
        }
        return written;
    }

    private static void writeAtomically(Path target, String content) throws IOException {
        Path tmp = Files.createTempFile(target.getParent(), target.getFileName().toString(), ".tmp");
        try {
            Files.writeString(tmp, content, StandardCharsets.UTF_8);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    private YamlConfiguration loadOrEmpty(Path config) {
        YamlConfiguration yaml = new YamlConfiguration();
        try {
            if (Files.isRegularFile(config)) {
                yaml.loadFromString(Files.readString(config, StandardCharsets.UTF_8));
            }
        } catch (IOException | InvalidConfigurationException e) {
            log.warning("MoinMorni: " + config + " nicht gelesen (" + e.getMessage() + ")");
        }
        return yaml;
    }

    /** Mitgelieferte config.yml aus der Jar des Plugins (Name aus der plugin.yml) – wie beim ersten Start. */
    private boolean extractDefault(String plugin, Path target) throws IOException {
        try (DirectoryStream<Path> jars = Files.newDirectoryStream(pluginsDir, "*.jar")) {
            for (Path jar : jars) {
                try (JarFile file = new JarFile(jar.toFile())) {
                    JarEntry descriptor = file.getJarEntry(DESCRIPTOR);
                    JarEntry config = file.getJarEntry(CONFIG);
                    if (descriptor == null || config == null || !plugin.equals(nameIn(file, descriptor))) {
                        continue;
                    }
                    Files.createDirectories(target.getParent());
                    try (InputStream in = file.getInputStream(config)) {
                        Files.copy(in, target);
                    }
                    return true;
                } catch (IOException e) {
                    // Keine lesbare Jar – weiter mit der nächsten.
                }
            }
        }
        return false;
    }

    private static String nameIn(JarFile file, JarEntry descriptor) throws IOException {
        try (InputStream in = file.getInputStream(descriptor)) {
            YamlConfiguration yaml = new YamlConfiguration();
            yaml.loadFromString(new String(in.readAllBytes(), StandardCharsets.UTF_8));
            return yaml.getString("name", "");
        } catch (InvalidConfigurationException e) {
            return "";
        }
    }

    // ---------- Pfade mit Listen ----------

    /** Wert an einem Pfad; eine Zahl als Teil zeigt in eine Liste. null = nicht da. */
    static Object get(ConfigurationSection yaml, String path) {
        String[] parts = path.split("\\.");
        for (int i = 0; i + 1 < parts.length; i++) {
            if (yaml.get(prefix(parts, i)) instanceof List<?> list) {
                return inList(list, parts, i + 1);
            }
        }
        return yaml.get(path);
    }

    private static Object inList(List<?> list, String[] parts, int at) {
        if (!INDEX.matcher(parts[at]).matches()) {
            return null;
        }
        int index = Integer.parseInt(parts[at]);
        Object entry = index < list.size() ? list.get(index) : null;
        if (at + 1 == parts.length) {
            return entry;
        }
        return at + 2 == parts.length && entry instanceof Map<?, ?> map ? map.get(parts[at + 1]) : null;
    }

    /**
     * Wert setzen. In Listen nur vorhandene Einträge oder genau einer hinten dran; eine Zahl als Teil ohne Liste
     * davor wird nicht angelegt (false = passt nicht zur Datei).
     */
    static boolean set(ConfigurationSection yaml, String path, Object value) {
        String[] parts = path.split("\\.");
        for (int i = 0; i + 1 < parts.length; i++) {
            String prefix = prefix(parts, i);
            if (yaml.get(prefix) instanceof List<?> list) {
                List<Object> copy = setInList(list, parts, i + 1, value);
                if (copy == null) {
                    return false;
                }
                yaml.set(prefix, copy);
                return true;
            }
        }
        for (String part : parts) {
            if (INDEX.matcher(part).matches()) {
                return false;
            }
        }
        yaml.set(path, fit(yaml.get(path), value));
        return true;
    }

    private static List<Object> setInList(List<?> list, String[] parts, int at, Object value) {
        if (!INDEX.matcher(parts[at]).matches() || at + 2 < parts.length) {
            return null;
        }
        int index = Integer.parseInt(parts[at]);
        if (index > list.size()) {
            return null;
        }
        List<Object> copy = new ArrayList<>(list);
        Object old = index < copy.size() ? copy.get(index) : null;
        Object next;
        if (at + 1 == parts.length) {
            next = fit(old, value);
        } else if (old == null || old instanceof Map<?, ?>) {
            Map<String, Object> entry = new LinkedHashMap<>();
            if (old instanceof Map<?, ?> map) {
                map.forEach((k, v) -> entry.put(String.valueOf(k), v));
            }
            String field = parts[at + 1];
            entry.put(field, fit(entry.get(field), value));
            next = entry;
        } else {
            return null;
        }
        if (index == copy.size()) {
            copy.add(next);
        } else {
            copy.set(index, next);
        }
        return copy;
    }

    private static String prefix(String[] parts, int last) {
        return String.join(".", Arrays.copyOfRange(parts, 0, last + 1));
    }

    /** War der alte Wert eine Kommazahl („7.0“), bleibt es eine – sonst wie geschickt. */
    private static Object fit(Object old, Object value) {
        if ((old instanceof Double || old instanceof Float) && value instanceof Number n) {
            return n.doubleValue();
        }
        return value;
    }

    // ---------- Vergleichen ----------

    /** Gleicher Wert, egal ob 7 oder 7.0, Liste oder Abschnitt. */
    static boolean same(Object a, Object b) {
        return canon(a).equals(canon(b));
    }

    private static String canon(Object v) {
        if (v == null) {
            return "∅";
        }
        if (v instanceof Number n) {
            return "n" + new BigDecimal(n.toString()).stripTrailingZeros().toPlainString();
        }
        if (v instanceof Boolean || v instanceof String) {
            return (v instanceof String ? "s" : "b") + v;
        }
        if (v instanceof ConfigurationSection section) {
            return canon(section.getValues(false));
        }
        if (v instanceof Map<?, ?> map) {
            Map<String, String> sorted = new TreeMap<>();
            map.forEach((k, x) -> sorted.put(String.valueOf(k), canon(x)));
            return "{" + sorted + "}";
        }
        if (v instanceof List<?> list) {
            return list.stream().map(ModeSettings::canon).collect(Collectors.joining(",", "[", "]"));
        }
        return "?" + v.toString().toLowerCase(Locale.ROOT);
    }
}
