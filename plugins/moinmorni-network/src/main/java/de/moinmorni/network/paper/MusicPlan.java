package de.moinmorni.network.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.util.ArrayList;
import java.util.List;

/**
 * Was die Lobbymusik spielt und wie laut – ohne Bukkit, damit es sich prüfen lässt (Tests in {@code MusicPlanTest}).
 * Der Hub schickt {@code lobby-music} (Einstellungen aus dem Panel + Stücke der Saison), jeder Spieler hat im Profil
 * seinen Wunsch ({@code music}: an/aus, Lautstärke, Lobby-Paket geladen, „weiter“).
 */
final class MusicPlan {

    /** Die 16 Notenblock-Klänge in der Reihenfolge des Hub-Protokolls (wie NOTE_BLOCKS im Baukasten). */
    static final String[] BLOCKS = {"harp", "bass", "basedrum", "snare", "hat", "bell", "flute", "chime", "guitar",
        "xylophone", "iron_xylophone", "cow_bell", "didgeridoo", "bit", "banjo", "pling"};
    private static final int FIELDS = 4;
    private static final double PERCENT = 100.0;
    private static final int OCTAVE = 12;
    private static final int TICKS_PER_SECOND = 20;
    /** Notenblöcke sind laut – so viel von ihrer Lautstärke gilt, damit sie neben der Kapelle nicht herausstechen. */
    static final float NOTE_GAIN = 0.8f;

    /** Ein Notenblock-Klang: Tick im Stück, Klang (Index in BLOCKS), Klick 0–24, Lautstärke 0–1. */
    record Note(int tick, int block, int key, float volume) {
        /** Tonhöhe, die Minecraft für den Klick spielt (0,5 – 2,0). */
        float pitch() {
            return (float) Math.pow(2, (key - OCTAVE) / (double) OCTAVE);
        }
    }

    record Song(String id, String titleDe, String titleEn, int ticks, String sound, int soundTicks, List<Note> notes) {
        /** Wie lange das Stück läuft – als Klangdatei oder als Notenblöcke. */
        int length(boolean ogg) {
            return ogg && sound != null ? soundTicks : ticks;
        }

        /** Erster Klang ab diesem Tick (zum Weiterspielen mitten im Stück). */
        int cursorAt(int tick) {
            int i = 0;
            while (i < notes.size() && notes.get(i).tick() < tick) {
                i++;
            }
            return i;
        }
    }

    record Settings(boolean on, int volume, int quiet, int pause, String season, List<Song> songs) {
        int pauseTicks() {
            return pause * TICKS_PER_SECOND;
        }

        /** Gleiche Stücke in gleicher Reihenfolge? (Sonst fängt die Musik für alle neu an.) */
        boolean samePlaylist(Settings other) {
            return other != null && season.equals(other.season)
                    && songs.stream().map(Song::id).toList().equals(other.songs.stream().map(Song::id).toList());
        }
    }

    /** Wunsch eines Spielers (aus dem Profil); {@code skip} zählt bei jedem /musik weiter hoch. */
    record Pref(boolean on, int volume, boolean pack, int skip) {
        static final Pref DEFAULT = new Pref(true, 100, false, 0);
    }

    private MusicPlan() {
    }

    /** {@code lobby-music} vom Hub lesen. */
    static Settings parse(JsonObject m) {
        List<Song> songs = new ArrayList<>();
        for (JsonElement el : m.getAsJsonArray("songs")) {
            JsonObject o = el.getAsJsonObject();
            JsonObject title = o.getAsJsonObject("title");
            String sound = o.has("sound") && !o.get("sound").isJsonNull() ? o.get("sound").getAsString() : null;
            songs.add(new Song(HubClient.str(o, "id"), HubClient.str(title, "de"), HubClient.str(title, "en"),
                    o.get("ticks").getAsInt(), sound, o.get("soundTicks").getAsInt(), decode(o.getAsJsonArray("notes"))));
        }
        return new Settings(m.get("on").getAsBoolean(), m.get("volume").getAsInt(), m.get("quiet").getAsInt(),
                m.get("pause").getAsInt(), HubClient.str(m, "season"), List.copyOf(songs));
    }

    /** Notenblöcke aus der Kurzform: je vier Zahlen (Ticks seit dem vorigen, Klang, Klick, Lautstärke in %). */
    static List<Note> decode(JsonArray data) {
        List<Note> notes = new ArrayList<>(data.size() / FIELDS);
        int tick = 0;
        for (int i = 0; i + FIELDS - 1 < data.size(); i += FIELDS) {
            tick += data.get(i).getAsInt();
            int block = data.get(i + 1).getAsInt();
            if (block < 0 || block >= BLOCKS.length) {
                continue;
            }
            notes.add(new Note(tick, block, data.get(i + 2).getAsInt(), (float) (data.get(i + 3).getAsInt() / PERCENT)));
        }
        return List.copyOf(notes);
    }

    /** Wunsch aus dem Profil ({@code music}), sonst die Vorgabe. */
    static Pref pref(JsonObject music) {
        if (music == null) {
            return Pref.DEFAULT;
        }
        return new Pref(!music.has("on") || music.get("on").getAsBoolean(),
                music.has("volume") ? music.get("volume").getAsInt() : Pref.DEFAULT.volume(),
                music.has("pack") && music.get("pack").getAsBoolean(),
                music.has("skip") ? music.get("skip").getAsInt() : 0);
    }

    /** Spielt für diese Person überhaupt Musik? */
    static boolean audible(Settings s, Pref p) {
        return s != null && s.on() && !s.songs().isEmpty() && p.on() && p.volume() > 0;
    }

    /** Lautstärke 0–1: Panel × eigener Wunsch × gedämpft (Parkour, Rundgang, Gefängnis). */
    static float volume(Settings s, Pref p, boolean damped) {
        double v = s.volume() / PERCENT * p.volume() / PERCENT * (damped ? s.quiet() / PERCENT : 1);
        return (float) Math.max(0, Math.min(1, v));
    }

    /** Als Klangdatei der Kapelle (mit Paket, Datei da, nicht gedämpft) oder als Notenblöcke? */
    static boolean playsSound(Song song, Pref p, boolean damped) {
        return song.sound() != null && p.pack() && !damped;
    }

    /** Nächstes Stück der Reihe (nach dem letzten wieder das erste). */
    static int next(int index, int count) {
        return count <= 0 ? 0 : (index + 1) % count;
    }
}
