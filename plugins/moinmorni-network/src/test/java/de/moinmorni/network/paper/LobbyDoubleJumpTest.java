package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.bukkit.util.Vector;
import org.junit.jupiter.api.Test;

/** Klassischer Doppelsprung: Schub in Blickrichtung, Weite und Höhe des Bogens nach Minecrafts Flugregeln. */
class LobbyDoubleJumpTest {

    private static final double EPS = 1e-9;

    /** Blickrichtung wie {@code Location#getDirection} (Grad, Minecraft-Drehung). */
    private static Vector look(double yaw, double pitch) {
        double y = Math.toRadians(yaw);
        double p = Math.toRadians(pitch);
        return new Vector(-Math.cos(p) * Math.sin(y), -Math.sin(p), Math.cos(p) * Math.cos(y));
    }

    /**
     * Bogen ohne Tasten in der Luft: jeden Tick bewegen, dann Schwerkraft 0,08 und Luftwiderstand 0,98 (senkrecht)
     * bzw. 0,91 (waagrecht) – so rechnet Minecraft einen Spieler in der Luft. Gibt {Weite, Gipfel} bis zurück auf
     * Abflughöhe.
     */
    private static double[] arc(Vector v) {
        double h = Math.hypot(v.getX(), v.getZ());
        double vy = v.getY();
        double x = 0;
        double y = 0;
        double peak = 0;
        do {
            x += h;
            y += vy;
            peak = Math.max(peak, y);
            h *= 0.91;
            vy = (vy - 0.08) * 0.98;
        } while (y > 0);
        return new double[] {x, peak};
    }

    @Test
    void standardIstDerKlassischeSchub() {
        Vector v = LobbyDoubleJump.push(look(0, 0), 1);
        assertEquals(0, v.getX(), EPS);
        assertEquals(1.6, v.getZ(), EPS);
        assertEquals(1.0, v.getY(), EPS);
        // nach Osten geschaut (yaw −90) geht es nach Osten (+x)
        assertEquals(1.6, LobbyDoubleJump.push(look(-90, 0), 1).getX(), EPS);
    }

    @Test
    void blickNachObenOderUntenKommtWenigerWeit() {
        Vector flat = LobbyDoubleJump.push(look(30, 0), 1);
        Vector up = LobbyDoubleJump.push(look(30, -60), 1);
        Vector down = LobbyDoubleJump.push(look(30, 90), 1);
        assertTrue(Math.hypot(up.getX(), up.getZ()) < Math.hypot(flat.getX(), flat.getZ()) * 0.6);
        assertEquals(0, Math.hypot(down.getX(), down.getZ()), 1e-6);
        // nach oben immer gleich viel – auch wer nach unten schaut, springt hoch
        assertEquals(1.0, up.getY(), EPS);
        assertEquals(1.0, down.getY(), EPS);
    }

    @Test
    void staerkeImPanelUndGrenzen() {
        assertEquals(3.2, LobbyDoubleJump.push(look(0, 0), 2).getZ(), EPS);
        assertEquals(1.4, LobbyDoubleJump.push(look(0, 0), 2).getY(), EPS);
        assertEquals(0.8, LobbyDoubleJump.push(look(0, 0), 0.5).getZ(), EPS);
        // außerhalb 0,5–2 begrenzt
        assertEquals(LobbyDoubleJump.push(look(0, 0), 2).getZ(), LobbyDoubleJump.push(look(0, 0), 9).getZ(), EPS);
        assertEquals(LobbyDoubleJump.push(look(0, 0), 0.5).getY(), LobbyDoubleJump.push(look(0, 0), 0).getY(), EPS);
    }

    @Test
    void weiteUndHoeheDesBogens() {
        double[] one = arc(LobbyDoubleJump.push(look(0, 0), 1));
        double[] two = arc(LobbyDoubleJump.push(look(0, 0), 2));
        double[] half = arc(LobbyDoubleJump.push(look(0, 0), 0.5));
        // Stärke 1: gut 15 Blöcke weit, knapp 6 über der Abflughöhe – dreimal so weit wie der alte Schwung
        assertTrue(one[0] > 14 && one[0] < 18, "Weite " + one[0]);
        assertTrue(one[1] > 5 && one[1] < 7, "Gipfel " + one[1]);
        assertTrue(two[0] > 30 && two[0] < 36, "Weite " + two[0]);
        assertTrue(half[0] > 6 && half[0] < 9, "Weite " + half[0]);
        // alter Schwung bei Stärke 1 (0,45 vorn, 0,72 hoch): gut 4 Blöcke
        double[] old = arc(new Vector(0, 0.72, 0.45));
        assertTrue(one[0] > old[0] * 3, old[0] + " → " + one[0]);
    }

    @Test
    void abVipFliegenSonstDoppelsprung() {
        // Recht, nichts gewählt: fliegen – auch wenn der Doppelsprung im Panel aus ist
        assertEquals(LobbyDoubleJump.Mode.FLY, LobbyDoubleJump.mode(true, true, false, true));
        assertEquals(LobbyDoubleJump.Mode.FLY, LobbyDoubleJump.mode(true, true, false, false));
        // Recht, /fly aus: Doppelsprung (wenn an)
        assertEquals(LobbyDoubleJump.Mode.JUMP, LobbyDoubleJump.mode(true, true, true, true));
        assertEquals(LobbyDoubleJump.Mode.NONE, LobbyDoubleJump.mode(true, true, true, false));
        // ohne Recht: Doppelsprung, die Wahl zählt nicht
        assertEquals(LobbyDoubleJump.Mode.JUMP, LobbyDoubleJump.mode(true, false, false, true));
        assertEquals(LobbyDoubleJump.Mode.NONE, LobbyDoubleJump.mode(true, false, false, false));
        // Jump and Run, Gefängnis, Rundgang, Kreativ/Zuschauer: weder noch
        assertEquals(LobbyDoubleJump.Mode.NONE, LobbyDoubleJump.mode(false, true, false, true));
        assertEquals(LobbyDoubleJump.Mode.NONE, LobbyDoubleJump.mode(false, false, false, true));
    }

    @Test
    void flyBefehl() {
        assertFalse(LobbyDoubleJump.wantFly("", true));
        assertTrue(LobbyDoubleJump.wantFly("", false));
        assertTrue(LobbyDoubleJump.wantFly("AN", false));
        assertTrue(LobbyDoubleJump.wantFly("on", true));
        assertFalse(LobbyDoubleJump.wantFly("aus", true));
        assertFalse(LobbyDoubleJump.wantFly("off", false));
        assertNull(LobbyDoubleJump.wantFly("vielleicht", true));
    }
}
