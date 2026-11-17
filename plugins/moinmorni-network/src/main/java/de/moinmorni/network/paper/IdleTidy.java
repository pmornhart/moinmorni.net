package de.moinmorni.network.paper;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryUsage;
import java.util.List;
import javax.management.MBeanServer;
import javax.management.ObjectName;
import org.bukkit.Bukkit;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Aufräumen im Ruhezustand: Ist ein Server eine Weile leer, räumt Java einmal gründlich auf und gibt den Platz zurück.
 *
 * <p>Warum: Geht der letzte Spieler, entlädt und speichert der Server seine Chunks – dabei entsteht viel Müll im Heap.
 * Eine Minute später hält Minecraft die Welt an (pause-when-empty-seconds), danach wird kaum noch etwas angelegt. Die
 * periodische Sammlung von G1 markiert den Müll nur; aufgeräumt wird er erst in den nächsten jungen Sammlungen, und
 * die kommen ohne neue Objekte nicht. Gemessen in der Lobby (Paper 26.1.2, 17.11.): leer vorher 250 MB belegt, nach
 * einem Rundgang 2,5 Minuten später noch 570 MB belegt und 1,1 GB Arbeitsspeicher, obwohl alle Chunks entladen waren;
 * mit dem Aufräumen 256 MB belegt und 784 MB Arbeitsspeicher (volle Sammlung 0,3 s, niemand online).
 *
 * <p>Darum: zwei Minuten, nachdem der letzte gegangen ist (und einmal nach dem Start), eine volle Sammlung über den
 * Diagnose-Befehl der JVM (wie {@code jcmd GC.run} – {@code -XX:+DisableExplicitGC} aus Aikars Flags gilt nur für
 * {@code System.gc()}), danach den freien Speicher außerhalb des Heaps zurückgeben. Niemand ist online, die kurze
 * Pause merkt keiner. Nur wenn der Motor „Arbeitsspeicher im Leerlauf freigeben“ eingeschaltet hat (erkennbar an
 * {@code -XX:G1PeriodicGCInterval}) – sonst bliebe der Heap ohnehin beim Startwert.
 */
final class IdleTidy implements Listener {

    /** Chunks sind dann entladen und gespeichert (Paper wartet 10 s mit dem Entladen, das Speichern dauert). */
    static final long QUIET_TICKS = 20L * 120;
    /** Daran erkennt man den Leerlauf-Modus des Motors (servers/idle-memory.ts in MorniHosting). */
    static final String IDLE_FLAG = "-XX:G1PeriodicGCInterval=";
    private static final String DIAGNOSTIC = "com.sun.management:type=DiagnosticCommand";
    private static final long MB = 1024L * 1024L;

    private final JavaPlugin plugin;
    private BukkitTask pending;

    IdleTidy(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    /** Läuft der Server im Leerlauf-Modus des Motors? (Nur dann lohnt das Aufräumen.) */
    static boolean idleMemoryMode(List<String> jvmArguments) {
        return jvmArguments.stream().anyMatch(a -> a.startsWith(IDLE_FLAG));
    }

    /** Wer gerade geht, zählt im Ereignis noch mit. */
    static boolean emptyAfterQuit(int onlineDuringQuit) {
        return onlineDuringQuit <= 1;
    }

    void start() {
        if (!idleMemoryMode(ManagementFactory.getRuntimeMXBean().getInputArguments())) {
            return;
        }
        Bukkit.getPluginManager().registerEvents(this, plugin);
        // Auch nach dem Start: das Laden der Welt hinterlässt Müll, und vielleicht kommt lange niemand.
        schedule();
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        if (emptyAfterQuit(Bukkit.getOnlinePlayers().size())) {
            schedule();
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        cancel();
    }

    private void schedule() {
        cancel();
        pending = Bukkit.getScheduler().runTaskLater(plugin, this::tidy, QUIET_TICKS);
    }

    private void cancel() {
        if (pending != null) {
            pending.cancel();
            pending = null;
        }
    }

    private void tidy() {
        pending = null;
        if (!Bukkit.getOnlinePlayers().isEmpty()) {
            return;
        }
        // Die Sammlung hält ohnehin alle Fäden an – im eigenen Faden wartet nur der Hauptfaden nicht auf das Protokoll.
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            MemoryUsage before = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
            try {
                MBeanServer server = ManagementFactory.getPlatformMBeanServer();
                ObjectName name = new ObjectName(DIAGNOSTIC);
                server.invoke(name, "gcRun", null, null);
                trimNative(server, name);
            } catch (Exception | LinkageError e) {
                plugin.getLogger().fine("Aufräumen im Leerlauf ging nicht: " + e.getMessage());
                return;
            }
            MemoryUsage after = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
            plugin.getLogger().info("Leerlauf: aufgeräumt, Heap " + before.getCommitted() / MB + " MB auf "
                    + after.getCommitted() / MB + " MB (belegt " + before.getUsed() / MB + " MB auf "
                    + after.getUsed() / MB + " MB)");
        });
    }

    /** Freien Speicher außerhalb des Heaps gleich zurückgeben (Java 17.0.9+, sonst eben beim nächsten Mal). */
    private static void trimNative(MBeanServer server, ObjectName name) {
        try {
            server.invoke(name, "systemTrimNativeHeap", null, null);
        } catch (Exception e) {
            // Ältere Java-Fassung: TrimNativeHeapInterval erledigt es ohnehin jede Minute.
        }
    }
}
