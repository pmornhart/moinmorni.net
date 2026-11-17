package de.moinmorni.network.velocity;

import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.scheduler.ScheduledTask;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import net.kyori.adventure.bossbar.BossBar;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;

/**
 * Leiste oben, die herunterzählt – vom Hub vor einem Neustart („Update eingespielt – Duels startet in 30 s neu“). Sie
 * hängt am Proxy, bleibt also stehen, wenn der Spieler vorher in die Lobby wechselt. „{s}“ im Text sind die Sekunden.
 */
final class Countdown {

    private static final MiniMessage MM = MiniMessage.miniMessage();
    private static final String SECONDS = "{s}";
    /** „{t}“ = Restzeit lesbar: „9:59“, „1:02:03“ (für lange Ankündigungen wie eine Wartung in einer Stunde). */
    private static final String CLOCK = "{t}";
    private static final int MINUTE = 60;
    private static final int HOUR = 3600;
    private static final java.time.Duration TITLE_IN = java.time.Duration.ofMillis(300);
    private static final java.time.Duration TITLE_STAY = java.time.Duration.ofSeconds(4);
    private static final java.time.Duration TITLE_OUT = java.time.Duration.ofMillis(700);
    private static final long TICK_SECONDS = 1;
    /** Länger als sechs Stunden zählt keine Leiste (angekündigte Wartung höchstens sechs Stunden). */
    private static final int MAX_SECONDS = 6 * HOUR;

    private record Running(BossBar bar, ScheduledTask task) {
    }

    private final ProxyServer proxy;
    private final Object plugin;
    private final Map<UUID, Running> bars = new ConcurrentHashMap<>();

    Countdown(ProxyServer proxy, Object plugin) {
        this.proxy = proxy;
        this.plugin = plugin;
    }

    /** Text mit den verbleibenden Sekunden. */
    static String withSeconds(String text, int seconds) {
        return text.replace(SECONDS, Integer.toString(seconds)).replace(CLOCK, clock(seconds));
    }

    /** Restzeit als Uhr: 45 → „0:45“, 600 → „10:00“, 3723 → „1:02:03“. */
    static String clock(int seconds) {
        int h = seconds / HOUR;
        int m = (seconds % HOUR) / MINUTE;
        int s = seconds % MINUTE;
        return h > 0 ? String.format("%d:%02d:%02d", h, m, s) : String.format("%d:%02d", m, s);
    }

    /** Großer Titel auf dem Bildschirm (Hub: „title“, z. B. angekündigte Wartung). */
    static net.kyori.adventure.title.Title title(Component title, Component subtitle) {
        return net.kyori.adventure.title.Title.title(title, subtitle,
                net.kyori.adventure.title.Title.Times.times(TITLE_IN, TITLE_STAY, TITLE_OUT));
    }

    /** Wie voll die Leiste noch ist (1 = gerade begonnen, 0 = vorbei). */
    static float progress(int left, int total) {
        return total <= 0 ? 0f : Math.max(0f, Math.min(1f, left / (float) total));
    }

    void show(Player player, String text, int seconds) {
        int total = Math.max(1, Math.min(seconds, MAX_SECONDS));
        hide(player.getUniqueId());
        BossBar bar = BossBar.bossBar(render(text, total), 1f, BossBar.Color.YELLOW, BossBar.Overlay.PROGRESS);
        player.showBossBar(bar);
        AtomicInteger left = new AtomicInteger(total);
        ScheduledTask task = proxy.getScheduler().buildTask(plugin, () -> {
            int now = left.decrementAndGet();
            if (now <= 0) {
                hide(player.getUniqueId());
                return;
            }
            bar.name(render(text, now));
            bar.progress(progress(now, total));
        }).delay(TICK_SECONDS, TimeUnit.SECONDS).repeat(TICK_SECONDS, TimeUnit.SECONDS).schedule();
        bars.put(player.getUniqueId(), new Running(bar, task));
    }

    /** Leiste weg (Countdown vorbei oder Spieler gegangen). */
    void hide(UUID player) {
        Running running = bars.remove(player);
        if (running == null) {
            return;
        }
        running.task().cancel();
        proxy.getPlayer(player).ifPresent(p -> p.hideBossBar(running.bar()));
    }

    void hideAll() {
        bars.keySet().forEach(this::hide);
    }

    private static Component render(String text, int seconds) {
        return MM.deserialize(withSeconds(text, seconds));
    }
}
