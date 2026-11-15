package de.moinmorni.network.paper;

import java.util.ArrayList;
import java.util.List;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.SoundCategory;
import org.bukkit.World;
import org.bukkit.entity.Marker;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Der Prunkbrunnen im Schlosshof lebt: Wo ein Wasserstrahl aufs Wasser trifft, spritzt es (Partikel), in der Mitte
 * plätschert es leise. Die Stellen setzt der Bau der Lobby als unsichtbare Marker (`mm_brunnen_spritzer`,
 * `mm_brunnen_mitte`); auf anderen Servern gibt es keine – dann passiert nichts.
 */
final class LobbyFountain {

    private static final String SPLASH_TAG = "mm_brunnen_spritzer";
    private static final String CENTRE_TAG = "mm_brunnen_mitte";
    /** Marker neu suchen (Stücke werden geladen und entladen). */
    private static final long SCAN_TICKS = 600;
    private static final long SPLASH_TICKS = 4;
    private static final long SOUND_TICKS = 70;
    private static final long FIRST_SCAN = 40;
    /** Nur wenn jemand in der Nähe ist. */
    private static final double SEE = 32;
    private static final double HEAR = 18;
    private static final int DROPS = 3;
    private static final double SPREAD = 0.08;
    private static final double SPREAD_UP = 0.02;
    private static final float VOLUME = 0.45f;
    private static final float PITCH = 1.1f;

    private final JavaPlugin plugin;
    private List<Location> splashes = List.of();
    private List<Location> centres = List.of();

    LobbyFountain(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    void start() {
        Bukkit.getScheduler().runTaskTimer(plugin, this::scan, FIRST_SCAN, SCAN_TICKS);
        Bukkit.getScheduler().runTaskTimer(plugin, this::splash, FIRST_SCAN + SPLASH_TICKS, SPLASH_TICKS);
        Bukkit.getScheduler().runTaskTimer(plugin, this::sound, FIRST_SCAN + SOUND_TICKS, SOUND_TICKS);
    }

    private void scan() {
        List<Location> foundSplashes = new ArrayList<>();
        List<Location> foundCentres = new ArrayList<>();
        for (World world : Bukkit.getWorlds()) {
            for (Marker marker : world.getEntitiesByClass(Marker.class)) {
                if (marker.getScoreboardTags().contains(SPLASH_TAG)) {
                    foundSplashes.add(marker.getLocation());
                } else if (marker.getScoreboardTags().contains(CENTRE_TAG)) {
                    foundCentres.add(marker.getLocation());
                }
            }
        }
        splashes = List.copyOf(foundSplashes);
        centres = List.copyOf(foundCentres);
    }

    private static boolean someoneNear(Location at, double distance) {
        return at.getWorld() != null && !at.getWorld().getNearbyPlayers(at, distance).isEmpty();
    }

    private void splash() {
        for (Location at : splashes) {
            if (someoneNear(at, SEE)) {
                at.getWorld().spawnParticle(Particle.SPLASH, at, DROPS, SPREAD, SPREAD_UP, SPREAD, 0);
            }
        }
    }

    private void sound() {
        for (Location at : centres) {
            if (someoneNear(at, HEAR)) {
                at.getWorld().playSound(at, Sound.BLOCK_WATER_AMBIENT, SoundCategory.AMBIENT, VOLUME, PITCH);
            }
        }
    }
}
