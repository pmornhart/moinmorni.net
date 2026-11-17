package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.function.Predicate;
import net.kyori.adventure.key.Key;
import net.kyori.adventure.sound.Sound;
import net.kyori.adventure.sound.SoundStop;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerResourcePackStatusEvent;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Lobbymusik (nur auf dem Server, dem der Hub {@code lobby-music} schickt): Stücke der aktuellen Saison der Reihe nach,
 * für jeden Spieler einzeln (wer später kommt, hört ein Stück von vorn). Mit geladenem Lobby-Paket spielt die
 * Klangdatei der Kapelle, sonst – und auf Bedrock – dieselbe Melodie mit Notenblöcken. Alles im Bereich
 * „Plattenspieler/Notenblöcke“, damit der Regler im Spiel wirkt; Minecrafts eigene Hintergrundmusik schweigt, solange
 * unsere spielt.
 *
 * <p>Im Parkour, beim Rundgang und im Gefängnis klingt sie gedämpft: Eine laufende Klangdatei lässt sich nicht leiser
 * drehen – dann spielt dasselbe Stück an derselben Stelle leise mit Notenblöcken weiter, das nächste wieder normal.
 */
final class LobbyMusic implements Listener {

    /** Pro Spieler: welches Stück, seit wann, als Klangdatei oder Notenblöcke. */
    private static final class State {
        int index;
        /** Server-Tick, an dem das Stück beginnt (davor: Pause). */
        long start;
        boolean begun;
        boolean ogg;
        int cursor;
        int skip;
        int volume;
        String sound;
    }

    private static final long START_DELAY = 60L;
    private static final long VANILLA_CHECK = 20L;
    /** So lange nach dem Anfang eines Stücks fängt es mit der Kapelle neu an, wenn das Paket erst jetzt geladen ist. */
    private static final long PACK_GRACE = 200L;
    private static final String NOTE_SOUND = "block.note_block.";
    private static final Sound.Source SOURCE = Sound.Source.RECORD;

    private final JavaPlugin plugin;
    private final Function<Player, String> langOf;
    private final Predicate<UUID> damped;
    private volatile MusicPlan.Settings settings;
    private final Map<UUID, MusicPlan.Pref> prefs = new ConcurrentHashMap<>();
    /** Paket ohne Proxy gemeldet (Bukkit-Ereignis, nur wenn ein Paket im Spiel geschickt wird). */
    private final Map<UUID, Boolean> localPack = new ConcurrentHashMap<>();
    private final Map<UUID, State> states = new HashMap<>();
    private final Key[] noteKeys = new Key[MusicPlan.BLOCKS.length];
    private long tick;
    private boolean started;

    /**
     * @param damped wer gerade gedämpft hören soll (Parkour, Rundgang, Gefängnis)
     */
    LobbyMusic(JavaPlugin plugin, Function<Player, String> langOf, Predicate<UUID> damped) {
        this.plugin = plugin;
        this.langOf = langOf;
        this.damped = damped;
        for (int i = 0; i < MusicPlan.BLOCKS.length; i++) {
            noteKeys[i] = Key.key(Key.MINECRAFT_NAMESPACE, NOTE_SOUND + MusicPlan.BLOCKS[i]);
        }
    }

    // ---------- vom Hub (eigener Thread) ----------

    void onSettings(JsonObject m) {
        MusicPlan.Settings next;
        try {
            next = MusicPlan.parse(m);
        } catch (RuntimeException e) {
            plugin.getLogger().warning("Lobbymusik nicht gelesen: " + e.getMessage());
            return;
        }
        Bukkit.getScheduler().runTask(plugin, () -> apply(next));
    }

    void onProfile(UUID uuid, JsonObject music) {
        MusicPlan.Pref next = MusicPlan.pref(music);
        MusicPlan.Pref before = prefs.put(uuid, next);
        Bukkit.getScheduler().runTask(plugin, () -> changed(uuid, before, next));
    }

    // ---------- Hauptthread ----------

    private void apply(MusicPlan.Settings next) {
        MusicPlan.Settings before = settings;
        settings = next;
        if (!started) {
            started = true;
            Bukkit.getPluginManager().registerEvents(this, plugin);
            Bukkit.getScheduler().runTaskTimer(plugin, this::tick, 1L, 1L);
        }
        // Andere Saison oder andere Stücke: für alle neu anfangen (laufende Klangdateien aus).
        if (!next.samePlaylist(before)) {
            for (Player p : Bukkit.getOnlinePlayers()) {
                stop(p);
            }
            states.clear();
        }
    }

    private void changed(UUID uuid, MusicPlan.Pref before, MusicPlan.Pref next) {
        Player p = Bukkit.getPlayer(uuid);
        State s = states.get(uuid);
        if (p == null || s == null || before == null) {
            return;
        }
        boolean otherVolume = before.volume() != next.volume() && s.ogg;
        boolean lostPack = before.pack() && !next.pack() && s.ogg;
        if (!next.on() || next.volume() == 0 || next.skip() != s.skip || otherVolume) {
            // Aus, „weiter“ oder neue Lautstärke für die Klangdatei: gleich das nächste Stück.
            stop(p);
            s.skip = next.skip();
            nextSong(s, START_DELAY / 2);
        } else if (lostPack) {
            toNotes(p, s);
        } else if (!before.pack() && next.pack() && s.begun && !s.ogg && tick - s.start < PACK_GRACE
                && !damped.test(uuid)) {
            // Das Paket kam erst kurz nach dem Anfang des Stücks: dasselbe Stück von vorn mit der Kapelle.
            s.begun = false;
            s.start = tick;
        }
    }

    private void tick() {
        tick++;
        MusicPlan.Settings set = settings;
        if (set == null) {
            return;
        }
        boolean quietVanilla = tick % VANILLA_CHECK == 0;
        for (Player p : Bukkit.getOnlinePlayers()) {
            MusicPlan.Pref pref = prefOf(p.getUniqueId());
            State s = states.get(p.getUniqueId());
            if (!MusicPlan.audible(set, pref)) {
                if (s != null && s.begun) {
                    stop(p);
                    s.begun = false;
                }
                continue;
            }
            if (s == null) {
                s = new State();
                s.index = ThreadLocalRandom.current().nextInt(set.songs().size());
                s.start = tick + START_DELAY;
                s.skip = pref.skip();
                states.put(p.getUniqueId(), s);
            }
            if (quietVanilla) {
                // Minecrafts eigene Hintergrundmusik (C418 & Co.) schweigt, solange unsere läuft.
                p.stopSound(SoundStop.source(Sound.Source.MUSIC));
            }
            play(p, set, pref, s);
        }
    }

    private void play(Player p, MusicPlan.Settings set, MusicPlan.Pref pref, State s) {
        if (tick < s.start) {
            return;
        }
        if (s.index >= set.songs().size()) {
            s.index = 0;
        }
        MusicPlan.Song song = set.songs().get(s.index);
        boolean quiet = damped.test(p.getUniqueId());
        if (!s.begun) {
            s.begun = true;
            s.cursor = 0;
            s.ogg = MusicPlan.playsSound(song, pref, quiet) || MusicPlan.playsSound(song, withLocalPack(p, pref), quiet);
            s.volume = pref.volume();
            if (s.ogg) {
                s.sound = song.sound();
                p.playSound(Sound.sound(Key.key(song.sound()), SOURCE, MusicPlan.volume(set, pref, false), 1f),
                        Sound.Emitter.self());
            }
            if (!quiet) {
                boolean en = "en".equals(langOf.apply(p));
                p.sendActionBar(Component.text("♪ " + (en ? song.titleEn() : song.titleDe()), NamedTextColor.GOLD));
            }
        }
        int elapsed = (int) (tick - s.start);
        if (s.ogg && quiet) {
            toNotes(p, s);
        }
        if (!s.ogg) {
            float volume = MusicPlan.volume(set, pref, quiet) * MusicPlan.NOTE_GAIN;
            while (s.cursor < song.notes().size() && song.notes().get(s.cursor).tick() <= elapsed) {
                MusicPlan.Note n = song.notes().get(s.cursor++);
                float v = n.volume() * volume;
                if (v > 0) {
                    p.playSound(Sound.sound(noteKeys[n.block()], SOURCE, v, n.pitch()), Sound.Emitter.self());
                }
            }
        }
        if (elapsed >= song.length(s.ogg)) {
            s.sound = null;
            nextSong(s, set.pauseTicks());
        }
    }

    /** Laufende Klangdatei aus, dasselbe Stück an derselben Stelle mit Notenblöcken weiter. */
    private void toNotes(Player p, State s) {
        if (s.sound != null) {
            p.stopSound(SoundStop.named(Key.key(s.sound)));
        }
        s.ogg = false;
        s.sound = null;
        MusicPlan.Settings set = settings;
        if (set != null && s.index < set.songs().size()) {
            s.cursor = set.songs().get(s.index).cursorAt((int) (tick - s.start));
        }
    }

    private void nextSong(State s, long pause) {
        MusicPlan.Settings set = settings;
        s.index = MusicPlan.next(s.index, set == null ? 0 : set.songs().size());
        s.start = tick + pause;
        s.begun = false;
        s.ogg = false;
    }

    private void stop(Player p) {
        State s = states.get(p.getUniqueId());
        if (s != null && s.sound != null) {
            p.stopSound(SoundStop.named(Key.key(s.sound)));
            s.sound = null;
        }
    }

    private MusicPlan.Pref prefOf(UUID uuid) {
        return prefs.getOrDefault(uuid, MusicPlan.Pref.DEFAULT);
    }

    private MusicPlan.Pref withLocalPack(Player p, MusicPlan.Pref pref) {
        boolean local = Boolean.TRUE.equals(localPack.get(p.getUniqueId()));
        return local ? new MusicPlan.Pref(pref.on(), pref.volume(), true, pref.skip()) : pref;
    }

    /** Ohne Proxy (oder wenn ein Plugin das Paket im Spiel schickt): Paper meldet es selbst. */
    @EventHandler
    public void onPack(PlayerResourcePackStatusEvent event) {
        switch (event.getStatus()) {
            case SUCCESSFULLY_LOADED -> localPack.put(event.getPlayer().getUniqueId(), true);
            case DECLINED, FAILED_DOWNLOAD, FAILED_RELOAD, INVALID_URL, DISCARDED ->
                    localPack.put(event.getPlayer().getUniqueId(), false);
            default -> {
            }
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        states.remove(id);
        prefs.remove(id);
        localPack.remove(id);
    }
}
