package de.moinmorni.network.velocity;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Countdown-Leiste vor einem Neustart: Sekunden im Text, wie voll die Leiste ist. */
class CountdownTest {

    @Test
    void secondsGoIntoTheText() {
        String text = "<gold>Update eingespielt</gold> – <white>Duels</white> startet in <yellow>{s} s</yellow> neu";
        assertEquals("<gold>Update eingespielt</gold> – <white>Duels</white> startet in <yellow>12 s</yellow> neu",
                Countdown.withSeconds(text, 12));
        assertEquals("ohne Platzhalter", Countdown.withSeconds("ohne Platzhalter", 5));
    }

    @Test
    void clockForLongCountdowns() {
        assertEquals("0:45", Countdown.clock(45));
        assertEquals("10:00", Countdown.clock(600));
        assertEquals("1:02:03", Countdown.clock(3723));
        assertEquals("Wartung in 9:59", Countdown.withSeconds("Wartung in {t}", 599));
    }

    @Test
    void barEmptiesWithTheSeconds() {
        assertEquals(1f, Countdown.progress(30, 30));
        assertEquals(0.5f, Countdown.progress(15, 30));
        assertEquals(0f, Countdown.progress(0, 30));
        assertEquals(0f, Countdown.progress(5, 0));
        assertEquals(1f, Countdown.progress(40, 30));
    }
}
