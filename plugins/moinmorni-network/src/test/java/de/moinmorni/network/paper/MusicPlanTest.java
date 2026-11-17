package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Lobbymusik ohne Server: Nachricht lesen, Notenblöcke, Lautstärke, Klangdatei oder Notenblöcke. */
class MusicPlanTest {

    private static final String BODY = """
            {"t":"lobby-music","on":true,"volume":70,"quiet":40,"pause":4,"season":"winter","songs":[
              {"id":"stille-nacht","title":{"de":"Stille Nacht","en":"Silent Night"},"ticks":1776,
               "sound":"moinmorni:lobby.musik.stille-nacht","soundTicks":1790,"notes":[0,5,9,60, 0,1,6,80, 8,6,12,100, 4,99,0,50]},
              {"id":"eigenes","title":{"de":"Eigenes","en":"Own"},"ticks":200,"sound":null,"soundTicks":200,"notes":[]}
            ]}
            """;

    @Test
    void readsTheMessageAndTheNotes() {
        MusicPlan.Settings s = MusicPlan.parse(JsonParser.parseString(BODY).getAsJsonObject());
        assertTrue(s.on());
        assertEquals("winter", s.season());
        assertEquals(80, s.pauseTicks());
        MusicPlan.Song song = s.songs().get(0);
        assertEquals("Silent Night", song.titleEn());
        // Ticks zählen auf, unbekannter Klang (99) fällt weg.
        assertEquals(List.of(new MusicPlan.Note(0, 5, 9, 0.6f), new MusicPlan.Note(0, 1, 6, 0.8f),
                new MusicPlan.Note(8, 6, 12, 1f)), song.notes());
        assertEquals("bell", MusicPlan.BLOCKS[song.notes().get(0).block()]);
        assertEquals(1f, song.notes().get(2).pitch(), 1e-6);
        assertEquals(0.5f, new MusicPlan.Note(0, 0, 0, 1f).pitch(), 1e-6);
        assertEquals(2f, new MusicPlan.Note(0, 0, 24, 1f).pitch(), 1e-6);
        assertNull(s.songs().get(1).sound());
    }

    @Test
    void lengthAndPlaceInTheSong() {
        MusicPlan.Song song = MusicPlan.parse(JsonParser.parseString(BODY).getAsJsonObject()).songs().get(0);
        assertEquals(1790, song.length(true));
        assertEquals(1776, song.length(false));
        assertEquals(0, song.cursorAt(0));
        assertEquals(2, song.cursorAt(1));
        assertEquals(3, song.cursorAt(9));
    }

    @Test
    void wishFromTheProfile() {
        assertEquals(MusicPlan.Pref.DEFAULT, MusicPlan.pref(null));
        JsonObject music = JsonParser.parseString("{\"on\":false,\"volume\":30,\"pack\":true,\"skip\":2}").getAsJsonObject();
        assertEquals(new MusicPlan.Pref(false, 30, true, 2), MusicPlan.pref(music));
    }

    @Test
    void volumeAndHowItSounds() {
        MusicPlan.Settings s = MusicPlan.parse(JsonParser.parseString(BODY).getAsJsonObject());
        MusicPlan.Pref me = new MusicPlan.Pref(true, 50, true, 0);
        assertEquals(0.35f, MusicPlan.volume(s, me, false), 1e-6);
        assertEquals(0.14f, MusicPlan.volume(s, me, true), 1e-6);
        assertTrue(MusicPlan.audible(s, me));
        assertFalse(MusicPlan.audible(s, new MusicPlan.Pref(false, 50, true, 0)));
        assertFalse(MusicPlan.audible(s, new MusicPlan.Pref(true, 0, true, 0)));
        MusicPlan.Song withFile = s.songs().get(0);
        MusicPlan.Song withoutFile = s.songs().get(1);
        assertTrue(MusicPlan.playsSound(withFile, me, false));
        // Gedämpft, ohne Paket oder ohne Datei: Notenblöcke.
        assertFalse(MusicPlan.playsSound(withFile, me, true));
        assertFalse(MusicPlan.playsSound(withFile, new MusicPlan.Pref(true, 50, false, 0), false));
        assertFalse(MusicPlan.playsSound(withoutFile, me, false));
    }

    @Test
    void playlist() {
        assertEquals(1, MusicPlan.next(0, 3));
        assertEquals(0, MusicPlan.next(2, 3));
        assertEquals(0, MusicPlan.next(5, 0));
        MusicPlan.Settings a = MusicPlan.parse(JsonParser.parseString(BODY).getAsJsonObject());
        JsonObject louder = JsonParser.parseString(BODY).getAsJsonObject();
        louder.addProperty("volume", 90);
        assertTrue(a.samePlaylist(MusicPlan.parse(louder)));
        JsonObject other = JsonParser.parseString(BODY).getAsJsonObject();
        other.addProperty("season", "wiesn");
        assertFalse(a.samePlaylist(MusicPlan.parse(other)));
        assertFalse(a.samePlaylist(null));
    }
}
