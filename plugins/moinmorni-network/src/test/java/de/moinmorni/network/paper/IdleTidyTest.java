package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/** Aufräumen im Ruhezustand: nur im Leerlauf-Modus des Motors, erst wenn wirklich niemand mehr da ist. */
class IdleTidyTest {

    @Test
    void nurImLeerlaufModusDesMotors() {
        // So startet der Motor einen Server mit „Arbeitsspeicher im Leerlauf freigeben“ (idle-memory.ts).
        assertTrue(IdleTidy.idleMemoryMode(List.of("-Xms256M", "-Xmx1536M", "-XX:+UseG1GC",
                "-XX:G1PeriodicGCInterval=60000", "-XX:TrimNativeHeapInterval=60000")));
        // Klassisch (Aikars Flags mit festem Start-Heap): Aufräumen brächte nichts, der Heap bleibt beim Startwert.
        assertFalse(IdleTidy.idleMemoryMode(List.of("-Xms1024M", "-Xmx1536M", "-XX:+UseG1GC",
                "-XX:+AlwaysPreTouch")));
        assertFalse(IdleTidy.idleMemoryMode(List.of()));
    }

    @Test
    void werGehtZaehltImEreignisNochMit() {
        assertTrue(IdleTidy.emptyAfterQuit(1));
        assertTrue(IdleTidy.emptyAfterQuit(0));
        assertFalse(IdleTidy.emptyAfterQuit(2));
    }
}
