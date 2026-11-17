package de.moinmorni.network.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import de.moinmorni.network.paper.JumpCourse.Kind;
import de.moinmorni.network.paper.JumpCourse.Step;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Der Weg des Jump and Run: immer erreichbar (gegen die nachgerechnete Bewegung von Minecraft), nie außerhalb der
 * eigenen Bahn (also nie in Bauten oder in der Bahn eines anderen), gleiche Blöcke bei gleichem Startwert, mit den
 * Punkten schwerer.
 */
class JumpCourseTest {

    /** Eine Bahn wie in der Lobby: 32 × 21 × 32 Zellen hoch über dem Dorf. */
    private static final JumpCourse.Box LANE = new JumpCourse.Box(-76, 150, -52, -45, 170, -21);
    /** So viel Luft muss jeder Sprung zur echten Grenze lassen (Blöcke). */
    private static final double FAIR = 0.08;
    /** Anlauf auf dem Absprung: auf vollen Blöcken mindestens 1, auf schmalen 0,4 (aus dem Stand). */
    private static final double RUNUP_FULL = 1.0;
    private static final double RUNUP_NARROW = 0.4;
    private static final int SEEDS = 120;
    private static final int STEPS = 160;

    /** Alle Blöcke eines Wegs (Start + {@code steps} Sprünge) – wie im Spiel: ein Punkt je Sprung. */
    private static List<Step> course(long seed, int harderFrom, int steps) {
        JumpCourse c = new JumpCourse(LANE, seed, harderFrom);
        List<Step> list = new ArrayList<>();
        list.add(c.start());
        for (int score = 0; score < steps; score++) {
            list.add(c.next(score));
        }
        return list;
    }

    @Test
    void gleicherStartwertGleicheBloecke() {
        assertEquals(course(4242, 10, 300), course(4242, 10, 300));
        assertEquals(course(7, 1, 200), course(7, 1, 200));
        assertNotEquals(course(4242, 10, 300), course(4243, 10, 300));
    }

    @Test
    void bleibtInDerEigenenBahn() {
        for (int harder : new int[] {1, 10, 40}) {
            for (long seed = 0; seed < SEEDS; seed++) {
                for (Step s : course(seed, harder, STEPS)) {
                    assertTrue(LANE.contains(s.x(), s.y(), s.z()), "außerhalb der Bahn: " + s);
                    // Licht bzw. Oberkante von Zaun und Mauer liegen eine Zelle höher – auch noch in der Bahn.
                    assertTrue(s.y() + 1 <= LANE.y2(), "oben zu knapp: " + s);
                }
            }
        }
    }

    @Test
    void jederSprungIstFairErreichbar() {
        int checked = 0;
        for (int harder : new int[] {1, 10}) {
            for (long seed = 0; seed < SEEDS; seed++) {
                List<Step> steps = course(seed, harder, STEPS);
                for (int i = 1; i < steps.size(); i++) {
                    Step before = i >= 2 ? steps.get(i - 2) : null;
                    assertReachable(before, steps.get(i - 1), steps.get(i));
                    checked++;
                }
            }
        }
        assertTrue(checked > 30_000, "nur " + checked + " Sprünge geprüft");
    }

    private static void assertReachable(Step before, Step from, Step to) {
        String what = from + " → " + to;
        assertTrue(Math.max(Math.abs(to.x() - from.x()), Math.abs(to.z() - from.z())) >= 2,
                "mindestens eine Zelle Luft dazwischen (sonst steht der neue Block im Spieler): " + what);
        double gap = JumpCourse.required(from, to);
        double dy = to.top() - from.top();
        if (from.kind() == Kind.SLIME) {
            assertTrue(before != null && before.top() - from.top() >= 5, "auf Schleim fällt man tief: " + what);
            double drop = before.top() - from.top();
            assertTrue(dy <= Physics.bouncePeak(drop) - 0.6, "zu hoch nach dem Schleim: " + what);
            double reach = Physics.bounceTravel(drop, dy);
            assertTrue(gap <= reach - FAIR, "nach dem Schleim zu weit: " + gap + " von " + reach + " – " + what);
            return;
        }
        assertTrue(dy <= Physics.peak() - 0.2, "zu hoch: " + what);
        // Vom Eis aus: kurzer Anlauf auf dem glatten Block (das Eis schmilzt bald), mit Eis-Reibung gerechnet.
        boolean ice = from.kind() == Kind.ICE;
        double runup = from.kind().narrow || ice ? RUNUP_NARROW : RUNUP_FULL;
        double slip = ice ? Physics.ICE : Physics.NORMAL;
        boolean sprint = to.level() >= 1;
        double reach = Physics.travel(dy, sprint, runup, slip);
        assertTrue(gap <= reach - FAIR, "zu weit: " + gap + " von " + reach + " – " + what);
        if (to.level() == 0) {
            double walk = Physics.travel(dy, false, runup, slip);
            assertTrue(gap <= walk - FAIR, "am Anfang ohne Sprinten: " + gap + " von " + walk + " – " + what);
        }
        if (to.kind() == Kind.ICE) {
            // Auf Eis landet man nur nach kurzen Sprüngen – sonst rutscht man über die Kante.
            assertTrue(gap <= 1.6 + FAIR, "zu weit auf Eis: " + gap + " – " + what);
        }
    }

    @Test
    void amAnfangLeichtDannImmerSchwerer() {
        Map<Kind, Integer> easy = new EnumMap<>(Kind.class);
        double[] travel = new double[JumpCourse.MAX_LEVEL + 1];
        int[] count = new int[JumpCourse.MAX_LEVEL + 1];
        Map<Integer, Map<Kind, Integer>> kinds = new java.util.HashMap<>();
        for (long seed = 0; seed < SEEDS; seed++) {
            List<Step> steps = course(seed, 10, 120);
            for (int i = 1; i < steps.size(); i++) {
                Step from = steps.get(i - 1);
                Step to = steps.get(i);
                kinds.computeIfAbsent(to.level(), l -> new EnumMap<>(Kind.class)).merge(to.kind(), 1, Integer::sum);
                if (to.level() == 0) {
                    easy.merge(to.kind(), 1, Integer::sum);
                    double dy = to.top() - from.top();
                    assertTrue(Math.abs(dy) <= 1.0, "Stufe 0 nur ±1: " + from + " → " + to);
                }
                if (from.kind() != Kind.SLIME && to.kind() != Kind.SLIME) {
                    travel[to.level()] += JumpCourse.required(from, to);
                    count[to.level()]++;
                }
            }
        }
        // Stufe 0: nur volle Blöcke und halbe Stufen, die ersten zehn Punkte.
        assertEquals(java.util.Set.of(Kind.FULL, Kind.SLAB), easy.keySet());
        assertFalse(kinds.get(1).containsKey(Kind.FENCE), "schmale Blöcke erst ab Stufe 2");
        assertTrue(kinds.get(2).containsKey(Kind.FENCE) && kinds.get(2).containsKey(Kind.WALL)
                && kinds.get(2).containsKey(Kind.TRAPDOOR), "Stufe 2: Zäune, Mauern, Falltüren");
        assertFalse(kinds.get(2).containsKey(Kind.SLIME), "Schleim erst ab Stufe 3");
        assertTrue(kinds.get(3).containsKey(Kind.SLIME), "Stufe 3: Schleim zum Hochfedern");
        assertFalse(kinds.get(2).containsKey(Kind.ICE), "Eis erst ab Stufe 3");
        assertTrue(kinds.get(3).containsKey(Kind.ICE) && kinds.get(4).containsKey(Kind.ICE), "Stufe 3 und 4: Eis");
        double previous = -1;
        for (int level = 0; level <= JumpCourse.MAX_LEVEL; level++) {
            double mean = travel[level] / count[level];
            assertTrue(mean > previous, "Stufe " + level + " nicht weiter als die davor: " + mean);
            previous = mean;
        }
    }

    @Test
    void stufenNachPunkten() {
        assertEquals(0, JumpCourse.level(0, 10));
        assertEquals(0, JumpCourse.level(9, 10));
        assertEquals(1, JumpCourse.level(10, 10));
        assertEquals(1, JumpCourse.level(24, 10));
        assertEquals(2, JumpCourse.level(25, 10));
        assertEquals(4, JumpCourse.level(1000, 10));
        assertEquals(1, JumpCourse.level(1, 1));
        assertEquals(0, JumpCourse.level(49, 50));
    }

    @Test
    void flaechenDerBloecke() {
        Step fence = new Step(10, 150, 20, Kind.FENCE, 0, 2);
        assertEquals(151.5, fence.top(), 1e-9);
        assertEquals(10.375, fence.minX(), 1e-9);
        assertEquals(10.625, fence.maxX(), 1e-9);
        Step slab = new Step(10, 150, 20, Kind.SLAB, 0, 0);
        assertEquals(150.5, slab.top(), 1e-9);
        // Offene Falltür nach Norden: Balken an der Südkante (wie Minecraft: z 13/16 … 1).
        Step north = new Step(0, 150, 0, Kind.TRAPDOOR, JumpCourse.NORTH, 2);
        assertEquals(13.0 / 16, north.minZ(), 1e-9);
        assertEquals(1, north.maxZ(), 1e-9);
        assertEquals(0, north.minX(), 1e-9);
        assertEquals(1, north.maxX(), 1e-9);
        Step east = new Step(0, 150, 0, Kind.TRAPDOOR, JumpCourse.EAST, 2);
        assertEquals(0, east.minX(), 1e-9);
        assertEquals(3.0 / 16, east.maxX(), 1e-9);
        // Draufstehen: Füße genau auf der Oberkante, mit dem Rand der Füße noch über der Fläche.
        assertTrue(fence.holds(10.9, 151.5, 20.5, 0.05));
        assertFalse(fence.holds(10.95, 151.5, 20.5, 0.05));
        assertFalse(fence.holds(10.5, 151.0, 20.5, 0.05));
        // Falltür liegt längs zur Sprungrichtung, mit der Kante zum Absprung hin.
        assertEquals(JumpCourse.SOUTH, JumpCourse.facingFor(3, 1));
        assertEquals(JumpCourse.NORTH, JumpCourse.facingFor(-3, -1));
        assertEquals(JumpCourse.EAST, JumpCourse.facingFor(1, 3));
        assertEquals(JumpCourse.WEST, JumpCourse.facingFor(-1, -4));
    }

    @Test
    void grenzenPassenZurPhysik() {
        assertEquals(1.2522, Physics.peak(), 0.001);
        // Ohne Sprinten auf Stufe 0, mit Sprinten danach – jede Grenze mit Luft zur echten Bewegung.
        double[] heights = {1.0, 0.5, 0.0, -0.5, -1.0, -1.5, -2.0};
        for (double dy : heights) {
            for (Kind from : new Kind[] {Kind.FULL, Kind.FENCE}) {
                for (Kind to : new Kind[] {Kind.FULL, Kind.TRAPDOOR}) {
                    double runup = from.narrow ? RUNUP_NARROW : RUNUP_FULL;
                    double walk = JumpCourse.maxTravel(0, dy, from, to);
                    double sprint = JumpCourse.maxTravel(1, dy, from, to);
                    assertTrue(walk <= Physics.travel(dy, false, runup, Physics.NORMAL) - FAIR, "gehen " + dy + " " + from);
                    assertTrue(sprint <= Physics.travel(dy, true, runup, Physics.NORMAL) - FAIR, "sprinten " + dy + " " + from);
                }
            }
        }
        assertTrue(Double.isNaN(JumpCourse.maxTravel(4, 1.5, Kind.FULL, Kind.FULL)), "1,5 hoch geht nicht");
        // Vom Eis: schon aus dem Stand (ohne Anlauf) reicht der Schwung des Abstoßens für jeden erlaubten Sprung.
        for (double dy : heights) {
            double ice = JumpCourse.maxTravel(1, dy, Kind.ICE, Kind.FULL);
            assertTrue(ice <= Physics.travel(dy, true, RUNUP_NARROW, Physics.ICE) - FAIR, "vom Eis " + dy);
            assertTrue(JumpCourse.maxTravel(4, dy, Kind.FULL, Kind.ICE) <= 1.6 + 1e-9, "aufs Eis " + dy);
        }
        // Schleim: Tabelle unter dem echten Zurückfedern, der Block danach mit Abstand darunter.
        for (int drop : JumpCourse.SLIME_DROPS) {
            assertTrue(JumpCourse.bouncePeak(drop) <= Physics.bouncePeak(drop) + 0.05, "Schleim " + drop);
            assertTrue(JumpCourse.bounceUp(drop) >= 2, "Schleim " + drop + " lohnt sich");
        }
    }

    /**
     * Tick-genaue Nachrechnung der Bewegung (Java Edition, ohne Effekte) – unabhängig vom Weg-Bauer: Er nutzt eine
     * vorsichtige Tabelle, dieser Test die echte Rechnung. Boden: Beschleunigung 0,1·1,3·0,98 beim Sprinten
     * (0,1·0,98 gehend), Reibung 0,6·0,91; Luft: 0,02·1,3·0,98 (0,02·0,98), Reibung 0,91; Sprung 0,42 nach oben, beim
     * Sprinten +0,2 nach vorn; Schwerkraft (vy − 0,08)·0,98. Landen kann man nur, wenn man im Tick davor schon über
     * der Oberkante war (Minecraft prüft die Höhe zuerst).
     */
    static final class Physics {
        static final double GROUND_SPRINT = 0.1 * 1.3 * 0.98;
        static final double GROUND_WALK = 0.1 * 0.98;
        static final double AIR_SPRINT = 0.02 * 1.3 * 0.98;
        static final double AIR_WALK = 0.02 * 0.98;
        /** Glätte des Bodens: normale Blöcke 0,6, Eis 0,98. */
        static final double NORMAL = 0.6;
        static final double ICE = 0.98;
        static final double AIR_FRICTION = 0.91;
        static final double JUMP = 0.42;
        static final double BOOST = 0.2;

        private Physics() {
        }

        private static double gravity(double vy) {
            return (vy - 0.08) * 0.98;
        }

        /**
         * Waagerechte Flugstrecke (Spieler-Mitte), bis man auf Höhe {@code dy} landen kann, nach {@code runup} Blöcken
         * Anlauf aus dem Stand auf einem Boden der Glätte {@code slip}. NaN, wenn man die Höhe nie erreicht. Auf glattem
         * Boden beschleunigt man langsamer (× 0,216 / Glätte³), behält den Schwung aber länger (× Glätte · 0,91) – auch
         * beim Absprung.
         */
        static double travel(double dy, boolean sprint, double runup, double slip) {
            double friction = slip * AIR_FRICTION;
            double acc = (sprint ? GROUND_SPRINT : GROUND_WALK) * (0.216 / (slip * slip * slip));
            double air = sprint ? AIR_SPRINT : AIR_WALK;
            double v = 0;
            double x = 0;
            while (x + v + acc <= runup) {
                double d = v + acc;
                x += d;
                v = d * friction;
            }
            double d = v + (sprint ? BOOST : 0) + acc;
            double travelled = d;
            double y = JUMP;
            double peak = y;
            double vx = d * friction;
            double vy = gravity(JUMP);
            for (int t = 2; t < 400; t++) {
                double step = vx + air;
                double ny = y + vy;
                peak = Math.max(peak, ny);
                if (vy < 0 && ny <= dy && y >= dy) {
                    return travelled;
                }
                if (vy < 0 && ny < dy && peak < dy) {
                    return Double.NaN;
                }
                travelled += step;
                y = ny;
                vx = step * AIR_FRICTION;
                vy = gravity(vy);
            }
            return Double.NaN;
        }

        /** Höchster Punkt eines Sprungs (Füße). */
        static double peak() {
            double y = 0;
            double vy = JUMP;
            double best = 0;
            for (int t = 0; t < 40; t++) {
                y += vy;
                best = Math.max(best, y);
                vy = gravity(vy);
            }
            return best;
        }

        /** Geschwindigkeit beim Aufprall nach einem Fall aus {@code drop} Blöcken (aus dem Stand, abwärts positiv). */
        private static double impact(double drop) {
            double y = drop;
            double vy = 0;
            while (y + vy > 0) {
                y += vy;
                vy = gravity(vy);
            }
            return -vy;
        }

        /**
         * Wie hoch man von Schleim zurückfedert: Minecraft dreht beim Aufprall die Geschwindigkeit um (Lebewesen ohne
         * Verlust) und zieht im selben Tick schon die Schwerkraft ab.
         */
        static double bouncePeak(double drop) {
            double vy = gravity(impact(drop));
            double y = 0;
            double best = 0;
            for (int t = 0; t < 200 && vy > 0; t++) {
                y += vy;
                best = Math.max(best, y);
                vy = gravity(vy);
            }
            return best;
        }

        /**
         * Waagerechte Strecke nach dem Abprallen, bis man auf Höhe {@code dy} über dem Schleim landen kann – ohne
         * Schwung von vorher (senkrecht darauf gefallen), nur mit Luftsteuerung und ohne Sprinten.
         */
        static double bounceTravel(double drop, double dy) {
            double vy = gravity(impact(drop));
            double y = 0;
            double peak = 0;
            double travelled = 0;
            double vx = 0;
            for (int t = 0; t < 400; t++) {
                double step = vx + AIR_WALK;
                double ny = y + vy;
                peak = Math.max(peak, ny);
                if (vy < 0 && ny <= dy && y >= dy) {
                    return travelled;
                }
                if (vy < 0 && ny < dy && peak < dy) {
                    return Double.NaN;
                }
                travelled += step;
                y = ny;
                vx = step * AIR_FRICTION;
                vy = gravity(vy);
            }
            return Double.NaN;
        }
    }
}
