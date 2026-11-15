package de.moinmorni.network.paper;

import com.google.gson.JsonObject;
import de.moinmorni.network.common.HubClient;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.bukkit.Bukkit;
import org.bukkit.GameRule;
import org.bukkit.World;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Tageszeit der Lobby wie in echt: Sonnenaufgang, Mittag, Sonnenuntergang und Mitternacht liegen dort, wo sie heute in
 * Bayern liegen (Zeitzone und Ort vom Hub, Standard München) – um 20 Uhr ist es im Winter Nacht, im Sommer noch hell.
 * Dazu die echte Mondphase. Andere Einstellungen halten die Zeit fest (Morgen, Mittag, Abendrot, Nacht).
 *
 * <p>Minecraft-Zeit: 0 = Sonne geht auf, 6000 = Mittag, 12000 = Sonne geht unter, 18000 = Mitternacht. Der echte
 * Sonnenaufgang (Sonnenscheibe am Horizont) entspricht etwa 23400, der Sonnenuntergang etwa 12600.
 */
final class LobbyClock {

    private static final long TICKS_PER_DAY = 24000;
    private static final double SUNRISE_TICK = -600;
    private static final double SUNSET_TICK = 12600;
    private static final double DAY_TICKS = SUNSET_TICK - SUNRISE_TICK;
    private static final double NIGHT_TICKS = TICKS_PER_DAY - DAY_TICKS;
    private static final double MINUTES_PER_DAY = 1440;
    private static final long UPDATE_TICKS = 100;
    /** Feste Zeiten: Morgen, Mittag, Abendrot, Nacht. */
    private static final long MORNING = 1000;
    private static final long NOON = 6000;
    private static final long EVENING = 12300;
    private static final long NIGHT = 18000;
    /** Mond: Neumond am 6.1.2000 18:14 UTC, synodischer Monat in Tagen. */
    private static final double NEW_MOON_MILLIS = 947182440000.0;
    private static final double SYNODIC_DAYS = 29.530588853;
    private static final double MILLIS_PER_DAY = 86_400_000.0;
    private static final int MOON_PHASES = 8;
    /** Minecraft zählt die Phasen ab Vollmond (0), Neumond ist 4. */
    private static final int NEW_MOON_PHASE = 4;
    /** Sonne 0,833° unter dem Horizont: Brechung + Sonnenscheibe (wie Wetterdienste rechnen). */
    private static final double ZENITH = 90.833;

    private final JavaPlugin plugin;
    private BukkitTask task;
    private String mode = "real";
    private ZoneId zone = ZoneId.of("Europe/Berlin");
    private double latitude = 48.137;
    private double longitude = 11.575;

    LobbyClock(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    /** Einstellungen vom Hub (lobby-settings): daytime + clock {timeZone, latitude, longitude}. */
    void onSettings(JsonObject m) {
        String next = HubClient.str(m, "daytime");
        JsonObject clock = m.has("clock") && m.get("clock").isJsonObject() ? m.getAsJsonObject("clock") : null;
        Bukkit.getScheduler().runTask(plugin, () -> {
            mode = next == null ? "real" : next;
            if (clock != null) {
                try {
                    zone = ZoneId.of(HubClient.str(clock, "timeZone"));
                } catch (RuntimeException e) {
                    zone = ZoneId.of("Europe/Berlin");
                }
                latitude = clock.get("latitude").getAsDouble();
                longitude = clock.get("longitude").getAsDouble();
            }
            start();
            tick();
        });
    }

    private void start() {
        if (task != null) {
            return;
        }
        task = Bukkit.getScheduler().runTaskTimer(plugin, this::tick, UPDATE_TICKS, UPDATE_TICKS);
    }

    void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
    }

    private void tick() {
        World world = Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
        if (world == null) {
            return;
        }
        if (!Boolean.FALSE.equals(world.getGameRuleValue(GameRule.DO_DAYLIGHT_CYCLE))) {
            world.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, false);
        }
        ZonedDateTime now = ZonedDateTime.now(zone);
        long dayTime = switch (mode) {
            case "morning" -> MORNING;
            case "day" -> NOON;
            case "evening" -> EVENING;
            case "night" -> NIGHT;
            default -> realTicks(now);
        };
        long phase = moonPhase(now.toInstant());
        world.setFullTime(phase * TICKS_PER_DAY + dayTime);
    }

    /** Echte Uhrzeit → Minecraft-Zeit, an Sonnenauf- und -untergang des Tages ausgerichtet. */
    long realTicks(ZonedDateTime now) {
        double[] sun = sunriseSunset(now.toLocalDate());
        double minute = now.getHour() * 60 + now.getMinute() + now.getSecond() / 60.0;
        double rise = sun[0];
        double set = sun[1];
        double ticks;
        if (minute >= rise && minute < set) {
            ticks = SUNRISE_TICK + (minute - rise) / (set - rise) * DAY_TICKS;
        } else {
            double night = MINUTES_PER_DAY - (set - rise);
            double since = (minute - set + MINUTES_PER_DAY) % MINUTES_PER_DAY;
            ticks = SUNSET_TICK + since / night * NIGHT_TICKS;
        }
        return Math.floorMod(Math.round(ticks), TICKS_PER_DAY);
    }

    /** Mondphase wie heute, als Minecraft-Phase (0 = Vollmond … 4 = Neumond). */
    static long moonPhase(Instant at) {
        double age = ((at.toEpochMilli() - NEW_MOON_MILLIS) / MILLIS_PER_DAY) % SYNODIC_DAYS;
        if (age < 0) {
            age += SYNODIC_DAYS;
        }
        int step = (int) Math.round(age / SYNODIC_DAYS * MOON_PHASES) % MOON_PHASES;
        return (NEW_MOON_PHASE + step) % MOON_PHASES;
    }

    /**
     * Sonnenaufgang und -untergang in Minuten nach Mitternacht (Ortszeit), nach dem bekannten Verfahren des
     * US-Wetterdienstes (Almanac for Computers, 1990) – auf ein, zwei Minuten genau.
     */
    double[] sunriseSunset(LocalDate date) {
        return new double[] {sunEvent(date, true), sunEvent(date, false)};
    }

    private double sunEvent(LocalDate date, boolean rising) {
        int n = date.getDayOfYear();
        double lngHour = longitude / 15.0;
        double t = n + ((rising ? 6 : 18) - lngHour) / 24.0;
        double m = 0.9856 * t - 3.289;
        double l = norm360(m + 1.916 * sin(m) + 0.020 * sin(2 * m) + 282.634);
        double ra = norm360(Math.toDegrees(Math.atan(0.91764 * tan(l))));
        ra = (ra + (Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90)) / 15.0;
        double sinDec = 0.39782 * sin(l);
        double cosDec = Math.cos(Math.asin(sinDec));
        double cosH = (cos(ZENITH) - sinDec * sin(latitude)) / (cosDec * cos(latitude));
        cosH = Math.max(-1, Math.min(1, cosH));
        double h = (rising ? 360 - Math.toDegrees(Math.acos(cosH)) : Math.toDegrees(Math.acos(cosH))) / 15.0;
        double localMean = h + ra - 0.06571 * t - 6.622;
        double ut = ((localMean - lngHour) % 24 + 24) % 24;
        double offsetHours = zone.getRules().getOffset(date.atStartOfDay(zone).toInstant().plusSeconds(43200))
                .getTotalSeconds() / 3600.0;
        return ((ut + offsetHours) % 24 + 24) % 24 * 60;
    }

    private static double norm360(double deg) {
        return ((deg % 360) + 360) % 360;
    }

    private static double sin(double deg) {
        return Math.sin(Math.toRadians(deg));
    }

    private static double cos(double deg) {
        return Math.cos(Math.toRadians(deg));
    }

    private static double tan(double deg) {
        return Math.tan(Math.toRadians(deg));
    }
}
