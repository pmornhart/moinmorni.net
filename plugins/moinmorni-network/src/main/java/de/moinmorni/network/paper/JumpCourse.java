package de.moinmorni.network.paper;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Der Weg des Jump and Run in der Lobby – ohne Server, darum mit Tests ({@code JumpCourseTest}): Block für Block hoch
 * über dem Dorf, immer in der eigenen Bahn des Spielers ({@link Box}), mit gleichem Startwert immer dieselben Blöcke.
 *
 * <p>Mit den Punkten wird es schwerer ({@link #level}): erst kurze, flache Sprünge, die man auch ohne Sprinten schafft;
 * ab „schwerer ab“ Punkten alle {@value #LEVEL_POINTS} Punkte eine Stufe mehr – weitere Sprünge, rauf und runter,
 * halbe Stufen, schmale Zaun- und Mauerpfosten, offene Falltüren als Balken, Eis, das schnell schmilzt, und Schleim
 * zum Hochfedern.
 *
 * <p>Fair heißt: Jeder Sprung bleibt unter dem, was man mit normaler Bewegung (Java und Bedrock, ohne Tricks, aus dem
 * Stand mit kurzem Anlauf) schafft. Die Grenzen in {@link #maxTravel} sind Flugstrecken der Spieler-Mitte zwischen den
 * Flächen, auf denen man stehen kann (Fläche + 0,3 rundherum – so weit darf man überstehen). Sie stammen aus der
 * Bewegungsphysik von Minecraft (Sprung 0,42, Schwerkraft 0,08, Luftwiderstand 0,98/0,91, Sprint-Sprung +0,2) und
 * werden in {@code JumpCourseTest} gegen eine Tick-für-Tick-Rechnung geprüft – mit Luft nach oben.
 */
final class JumpCourse {

    /** Was für ein Block: wie hoch man darauf steht (über der Unterkante der Zelle) und wie breit die Fläche ist. */
    enum Kind {
        /** Startblock (voller Block). */
        START(1.0, 0, 1, false),
        /** Voller Block (leuchtet). */
        FULL(1.0, 0, 1, false),
        /** Untere Stufe: halbe Höhe. */
        SLAB(0.5, 0, 1, false),
        /** Zaunpfosten: oben bei 1,5, nur 0,25 breit. */
        FENCE(1.5, 0.375, 0.625, true),
        /** Mauerpfosten: oben bei 1,5, 0,5 breit. */
        WALL(1.5, 0.25, 0.75, true),
        /** Offene Falltür: 3/16 dicker Balken an einer Kante der Zelle, voll hoch (Fläche je nach Richtung). */
        TRAPDOOR(1.0, 0, 1, true),
        /** Schleim: federt zurück, wenn man aus der Höhe darauf fällt. */
        SLIME(1.0, 0, 1, false),
        /** Eis: glatt und nur kurz da – es schmilzt kurz nach dem Landen ({@code LobbyJump}). */
        ICE(1.0, 0, 1, false);

        final double height;
        final double from;
        final double to;
        final boolean narrow;

        Kind(double height, double from, double to, boolean narrow) {
            this.height = height;
            this.from = from;
            this.to = to;
            this.narrow = narrow;
        }
    }

    /** Eine Bahn: Würfel aus Zellen (einschließlich), in dem alle Blöcke eines Spielers liegen. */
    record Box(int x1, int y1, int z1, int x2, int y2, int z2) {
        Box {
            if (x1 > x2 || y1 > y2 || z1 > z2) {
                throw new IllegalArgumentException("Bahn verkehrt herum");
            }
        }

        boolean contains(int x, int y, int z) {
            return x >= x1 && x <= x2 && y >= y1 && y <= y2 && z >= z1 && z <= z2;
        }

        double centerX() {
            return (x1 + x2) / 2.0;
        }

        double centerZ() {
            return (z1 + z2) / 2.0;
        }

        double centerY() {
            return (y1 + y2) / 2.0;
        }
    }

    /** Falltür-Richtungen (wie in Minecraft): Norden, Osten, Süden, Westen. */
    static final int NORTH = 0;
    static final int EAST = 1;
    static final int SOUTH = 2;
    static final int WEST = 3;
    /** Dicke einer offenen Falltür (3 von 16 Pixeln). */
    static final double PANEL = 3.0 / 16;

    /**
     * Ein Block des Wegs: Zelle, Art, Stufe (für die Farbe) und – nur bei Falltüren – die Richtung. Offene Falltür nach
     * Norden: Balken an der Südkante der Zelle (z 13/16 … 1), nach Süden an der Nordkante, nach Osten an der
     * Westkante, nach Westen an der Ostkante.
     */
    record Step(int x, int y, int z, Kind kind, int facing, int level) {

        /** Höhe, auf der man darauf steht. */
        double top() {
            return y + kind.height;
        }

        double minX() {
            if (kind == Kind.TRAPDOOR) {
                return x + (facing == WEST ? 1 - PANEL : 0);
            }
            return x + kind.from;
        }

        double maxX() {
            if (kind == Kind.TRAPDOOR) {
                return x + (facing == EAST ? PANEL : 1);
            }
            return x + kind.to;
        }

        double minZ() {
            if (kind == Kind.TRAPDOOR) {
                return z + (facing == NORTH ? 1 - PANEL : 0);
            }
            return z + kind.from;
        }

        double maxZ() {
            if (kind == Kind.TRAPDOOR) {
                return z + (facing == SOUTH ? PANEL : 1);
            }
            return z + kind.to;
        }

        /** Mitte der Fläche (zum Hinschauen und für Funken). */
        double centerX() {
            return (minX() + maxX()) / 2;
        }

        double centerZ() {
            return (minZ() + maxZ()) / 2;
        }

        /**
         * Steht ein Spieler (Füße bei x, y, z) darauf? Seine Füße sind 0,6 breit: er steht, solange er die Fläche noch
         * berührt, und genau auf der Höhe der Oberkante.
         */
        boolean holds(double px, double py, double pz, double tolerance) {
            return px > minX() - HALF_WIDTH && px < maxX() + HALF_WIDTH && pz > minZ() - HALF_WIDTH
                    && pz < maxZ() + HALF_WIDTH && Math.abs(py - top()) <= tolerance;
        }
    }

    /** Halbe Breite eines Spielers. */
    static final double HALF_WIDTH = 0.3;
    /** Höchste Stufe; bis „schwerer ab“ ist es Stufe 0. */
    static final int MAX_LEVEL = 4;
    /** So viele Punkte je weiterer Stufe. */
    static final int LEVEL_POINTS = 15;

    /** Höchster Sprung nach oben (Oberkante zu Oberkante) – der Sprung schafft 1,25. */
    static final double MAX_UP = 1.0;
    /** Flugstrecken mit Sprinten: hinauf (über +0,5), etwa eben (−1 … +0,5), hinunter (−1 und tiefer). */
    static final double SPRINT_UP = 1.4;
    static final double SPRINT_LEVEL = 2.4;
    static final double SPRINT_DOWN = 3.4;
    /** Flugstrecken ohne Sprinten (Stufe 0): hinauf, eben oder hinunter. */
    static final double WALK_UP = 0.4;
    static final double WALK_DOWN = 1.4;
    /** Von einem schmalen Block springt man ohne richtigen Anlauf ab, auf einem schmalen landet man genauer. */
    static final double NARROW_FROM = 0.6;
    static final double NARROW_TO = 0.4;
    /**
     * Auf Eis nur kurze Sprünge (höchstens so weit): wer weit springt, kommt schnell an und rutscht über die Kante.
     * Abspringen von Eis ist dagegen leicht (Eis bremst kaum, der Schwung geht mit – nachgerechnet in
     * {@code JumpCourseTest}).
     */
    static final double ICE_TO = 1.5;
    private static final double LEVEL_FROM_DY = 0.5;
    private static final double DOWN_FROM_DY = -1.0;
    /** Schleim: so tief fällt man darauf (aus dem Stand von der Kante), höchstens so weit zum nächsten Block. */
    static final int[] SLIME_DROPS = {5, 6};
    static final double BOUNCE_TRAVEL = 1.4;
    /** So viel tiefer als der höchste Punkt des Federns muss der nächste Block liegen (Zeit, sich darüber zu bewegen). */
    static final double BOUNCE_MARGIN = 1.0;
    /**
     * Wie hoch Schleim zurückfedert, nach Fallhöhe (Minecraft dreht beim Aufprall die Geschwindigkeit um und zieht im
     * selben Tick die Schwerkraft ab – nachgerechnet in {@code JumpCourseTest}: 2,55 / 3,53 / 4,05, hier abgerundet).
     */
    private static final double[][] BOUNCE = {{4, 2.5}, {5, 3.5}, {6, 4.0}};

    /** So weit (Zellen) darf der nächste Block vom letzten weg sein; mindestens eine Zelle Luft dazwischen. */
    private static final int REACH = 5;
    private static final int MIN_APART = 2;
    /** Näher als so viele Zellen am Rand der Bahn: lieber zur Mitte. */
    private static final int EDGE = 5;
    private static final double EDGE_PENALTY = 0.08;
    /** Weiter als so viel über (unter) der Mitte der Bahn: lieber wieder abwärts (aufwärts). */
    private static final double VERTICAL_DRIFT = 3;
    private static final double VERTICAL_PENALTY = 0.35;
    private static final double EPS = 1e-9;
    private static final double FULL_TURN = 2 * Math.PI;
    private static final int DIRECTIONS = 8;

    /** Höhenwechsel (Oberkante zu Oberkante) je Stufe mit Gewicht – Stufe 0 nur ±1 und halbe Stufen. */
    private static final double[] DY = {1.0, 0.5, 0.0, -0.5, -1.0, -1.5, -2.0};
    private static final double[][] DY_WEIGHT = {
        {3, 3, 5, 2, 2, 0, 0},
        {3, 3, 4, 2, 3, 1, 1},
        {3, 3, 3, 2, 3, 2, 2},
        {3, 3, 3, 2, 3, 2, 2},
        {3, 3, 3, 2, 3, 2, 2},
    };
    /** Gewicht je Art (Reihenfolge wie {@link Kind}) und Stufe; START kommt nur am Anfang. */
    private static final double[][] KIND_WEIGHT = {
        {0, 85, 15, 0, 0, 0, 0, 0},
        {0, 70, 30, 0, 0, 0, 0, 0},
        {0, 45, 20, 12, 12, 11, 0, 0},
        {0, 33, 14, 12, 11, 12, 10, 8},
        {0, 24, 13, 13, 13, 13, 12, 12},
    };
    /** Lieblings-Flugstrecke je Stufe (wird mit der Stufe länger) und wie breit gestreut. */
    private static final double[] PREFERRED = {0.4, 1.0, 1.5, 1.9, 2.2};
    private static final double SLIME_PREFERRED = 0.6;
    private static final double SPREAD = 0.8;
    /** Wie stark der Weg die Richtung hält (Bogenmaß): auf Stufe 0 geradeaus, später kurviger. */
    private static final double STRAIGHT_EASY = 0.55;
    private static final double STRAIGHT = 0.8;

    private final Box lane;
    private final int harderFrom;
    private final Random rnd;
    private Step last;
    private Step beforeLast;
    private double heading;

    JumpCourse(Box lane, long seed, int harderFrom) {
        this.lane = lane;
        this.harderFrom = Math.max(1, harderFrom);
        this.rnd = new Random(seed);
    }

    Box lane() {
        return lane;
    }

    /** Stufe bei so vielen Punkten: 0 bis „schwerer ab“, danach alle {@value #LEVEL_POINTS} Punkte eine mehr. */
    static int level(int score, int harderFrom) {
        int from = Math.max(1, harderFrom);
        if (score < from) {
            return 0;
        }
        return Math.min(MAX_LEVEL, 1 + (score - from) / LEVEL_POINTS);
    }

    /** Der Startblock in der Mitte der Bahn – auf ihm steht man am Anfang. */
    Step start() {
        int x = (lane.x1() + lane.x2()) / 2;
        int z = (lane.z1() + lane.z2()) / 2;
        int y = (lane.y1() + lane.y2()) / 2;
        heading = rnd.nextInt(DIRECTIONS) * FULL_TURN / DIRECTIONS;
        last = new Step(x, y, z, Kind.START, NORTH, 0);
        beforeLast = null;
        return last;
    }

    /** Der nächste Block, nachdem man {@code score} Punkte hat. */
    Step next(int score) {
        if (last == null) {
            start();
        }
        int level = level(score, harderFrom);
        Step from = last;
        Step chosen;
        if (from.kind() == Kind.SLIME) {
            chosen = pick(bounceCandidates(level, from));
        } else {
            Kind kind = chooseKind(level, from);
            List<Candidate> list = candidates(level, from, kind);
            if (list.isEmpty() && kind != Kind.FULL) {
                list = candidates(level, from, Kind.FULL);
            }
            chosen = pick(list);
        }
        if (chosen == null) {
            chosen = fallback(level, from);
        }
        beforeLast = from;
        last = chosen;
        heading = Math.atan2(chosen.z() - from.z(), chosen.x() - from.x());
        return chosen;
    }

    // ---------- Regeln ----------

    /**
     * Höchste erlaubte Flugstrecke (Spieler-Mitte) für einen Sprung um {@code dy} (Oberkante Ziel minus Oberkante
     * Absprung); {@code NaN}, wenn er gar nicht geht. Stufe 0 braucht kein Sprinten.
     */
    static double maxTravel(int level, double dy, Kind from, Kind to) {
        if (dy > MAX_UP + EPS) {
            return Double.NaN;
        }
        double limit;
        if (level == 0) {
            limit = dy > EPS ? WALK_UP : WALK_DOWN;
        } else if (dy > LEVEL_FROM_DY + EPS) {
            limit = SPRINT_UP;
        } else if (dy > DOWN_FROM_DY + EPS) {
            limit = SPRINT_LEVEL;
        } else {
            limit = SPRINT_DOWN;
        }
        if (from.narrow) {
            limit -= NARROW_FROM;
        }
        if (to.narrow) {
            limit -= NARROW_TO;
        }
        if (to == Kind.ICE) {
            limit = Math.min(limit, ICE_TO);
        }
        return limit;
    }

    /** Wie hoch Schleim zurückfedert, wenn man aus {@code drop} Blöcken Höhe darauf fällt (abgerundet). */
    static double bouncePeak(double drop) {
        double peak = 0;
        for (double[] row : BOUNCE) {
            if (drop + EPS >= row[0]) {
                peak = row[1];
            }
        }
        return peak;
    }

    /** So viel höher als der Schleim darf der Block danach liegen (ganze Blöcke). */
    static int bounceUp(double drop) {
        return (int) Math.floor(bouncePeak(drop) - BOUNCE_MARGIN + EPS);
    }

    /** Kürzeste Flugstrecke der Spieler-Mitte von der Fläche {@code a} zur Fläche {@code b} (waagerecht). */
    static double required(Step a, Step b) {
        double gx = Math.max(0, Math.max(b.minX() - HALF_WIDTH - (a.maxX() + HALF_WIDTH),
                a.minX() - HALF_WIDTH - (b.maxX() + HALF_WIDTH)));
        double gz = Math.max(0, Math.max(b.minZ() - HALF_WIDTH - (a.maxZ() + HALF_WIDTH),
                a.minZ() - HALF_WIDTH - (b.maxZ() + HALF_WIDTH)));
        return Math.hypot(gx, gz);
    }

    /**
     * Ist der Sprung von {@code from} nach {@code to} fair? {@code before} ist der Block vor {@code from} (für Schleim:
     * aus welcher Höhe man darauf gefallen ist).
     */
    static boolean fair(int level, Step before, Step from, Step to) {
        if (Math.max(Math.abs(to.x() - from.x()), Math.abs(to.z() - from.z())) < MIN_APART) {
            return false;
        }
        if (from.kind() == Kind.SLIME) {
            if (before == null || to.kind() == Kind.SLIME) {
                return false;
            }
            double drop = before.top() - from.top();
            return to.top() - from.top() <= bounceUp(drop) + EPS && required(from, to) <= BOUNCE_TRAVEL + EPS;
        }
        double limit = maxTravel(level, to.top() - from.top(), from.kind(), to.kind());
        return !Double.isNaN(limit) && required(from, to) <= limit + EPS;
    }

    // ---------- Auswahl ----------

    private record Candidate(Step step, double weight) {
    }

    private Kind chooseKind(int level, Step from) {
        double[] weights = KIND_WEIGHT[level].clone();
        boolean slimeFits = from.kind() != Kind.SLIME && isWhole(from.top())
                && from.y() - SLIME_DROPS[SLIME_DROPS.length - 1] - 1 >= lane.y1();
        if (!slimeFits) {
            weights[Kind.SLIME.ordinal()] = 0;
        }
        double total = 0;
        for (double w : weights) {
            total += w;
        }
        double roll = rnd.nextDouble() * total;
        Kind[] kinds = Kind.values();
        for (int i = 0; i < kinds.length; i++) {
            roll -= weights[i];
            if (roll < 0 && weights[i] > 0) {
                return kinds[i];
            }
        }
        return Kind.FULL;
    }

    private List<Candidate> candidates(int level, Step from, Kind kind) {
        List<Candidate> list = new ArrayList<>();
        double[] dys;
        double[] dyWeights;
        if (kind == Kind.SLIME) {
            dys = new double[SLIME_DROPS.length];
            dyWeights = new double[SLIME_DROPS.length];
            for (int i = 0; i < SLIME_DROPS.length; i++) {
                dys[i] = -SLIME_DROPS[i];
                dyWeights[i] = 1;
            }
        } else {
            dys = DY;
            dyWeights = DY_WEIGHT[level];
        }
        double preferred = kind == Kind.SLIME ? SLIME_PREFERRED : PREFERRED[level];
        double straight = level == 0 ? STRAIGHT_EASY : STRAIGHT;
        for (int i = 0; i < dys.length; i++) {
            if (dyWeights[i] <= 0) {
                continue;
            }
            double top = from.top() + dys[i];
            double cell = top - kind.height;
            if (!isWhole(cell)) {
                continue;
            }
            int y = (int) Math.round(cell);
            double vertical = verticalWeight(from, dys[i]);
            for (int dx = -REACH; dx <= REACH; dx++) {
                for (int dz = -REACH; dz <= REACH; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) < MIN_APART) {
                        continue;
                    }
                    int x = from.x() + dx;
                    int z = from.z() + dz;
                    if (!fits(x, y, z)) {
                        continue;
                    }
                    Step to = new Step(x, y, z, kind, kind == Kind.TRAPDOOR ? facingFor(dx, dz) : NORTH, level);
                    if (!fair(level, beforeLast, from, to)) {
                        continue;
                    }
                    double w = dyWeights[i] * vertical * direction(dx, dz, straight)
                            * closeTo(required(from, to), preferred) * edge(from, to);
                    if (w > 0) {
                        list.add(new Candidate(to, w));
                    }
                }
            }
        }
        return list;
    }

    /** Nach dem Schleim: ein voller Block so hoch, wie man zurückfedert, kurz voraus in Flugrichtung. */
    private List<Candidate> bounceCandidates(int level, Step slime) {
        List<Candidate> list = new ArrayList<>();
        if (beforeLast == null) {
            return list;
        }
        int up = bounceUp(beforeLast.top() - slime.top());
        if (up < 1) {
            return list;
        }
        int y = slime.y() + up;
        for (int dx = -REACH; dx <= REACH; dx++) {
            for (int dz = -REACH; dz <= REACH; dz++) {
                int x = slime.x() + dx;
                int z = slime.z() + dz;
                if (Math.max(Math.abs(dx), Math.abs(dz)) < MIN_APART || !fits(x, y, z)) {
                    continue;
                }
                Step to = new Step(x, y, z, Kind.FULL, NORTH, level);
                if (!fair(level, beforeLast, slime, to)) {
                    continue;
                }
                double w = direction(dx, dz, STRAIGHT) * edge(slime, to);
                if (w > 0) {
                    list.add(new Candidate(to, w));
                }
            }
        }
        return list;
    }

    /** Wenn sonst nichts passt: zwei Zellen Richtung Mitte der Bahn, ein voller Block (immer fair). */
    private Step fallback(int level, Step from) {
        double cx = lane.centerX() - from.x();
        double cz = lane.centerZ() - from.z();
        int dx = 0;
        int dz = 0;
        if (Math.abs(cx) >= Math.abs(cz)) {
            dx = cx >= 0 ? MIN_APART : -MIN_APART;
        } else {
            dz = cz >= 0 ? MIN_APART : -MIN_APART;
        }
        int y;
        if (from.kind() == Kind.SLIME && beforeLast != null) {
            y = from.y() + Math.max(0, bounceUp(beforeLast.top() - from.top()));
        } else {
            y = (int) Math.floor(from.top() + EPS) - 1;
        }
        y = Math.max(lane.y1(), Math.min(lane.y2() - 1, y));
        return new Step(from.x() + dx, y, from.z() + dz, Kind.FULL, NORTH, level);
    }

    private Candidate chosen(List<Candidate> list, double roll) {
        double left = roll;
        for (Candidate c : list) {
            left -= c.weight();
            if (left < 0) {
                return c;
            }
        }
        return list.get(list.size() - 1);
    }

    private Step pick(List<Candidate> list) {
        if (list.isEmpty()) {
            return null;
        }
        double total = 0;
        for (Candidate c : list) {
            total += c.weight();
        }
        return chosen(list, rnd.nextDouble() * total).step();
    }

    /** Passt die Zelle in die Bahn – mit Platz für das Licht darüber (und die Oberkante von Zaun und Mauer)? */
    private boolean fits(int x, int y, int z) {
        return lane.contains(x, y, z) && y + 1 <= lane.y2();
    }

    /** Offene Falltür als Balken in Sprungrichtung, an der Kante, die näher am Absprung liegt. */
    static int facingFor(int dx, int dz) {
        if (Math.abs(dx) >= Math.abs(dz)) {
            return dz > 0 ? SOUTH : NORTH;
        }
        return dx > 0 ? EAST : WEST;
    }

    private double direction(int dx, int dz, double straight) {
        double angle = Math.atan2(dz, dx) - heading;
        angle = Math.atan2(Math.sin(angle), Math.cos(angle));
        double a = angle / straight;
        return Math.exp(-a * a);
    }

    private static double closeTo(double travel, double preferred) {
        double d = (travel - preferred) / SPREAD;
        return Math.exp(-d * d);
    }

    /** Am Rand der Bahn nur ungern weiter nach außen. */
    private double edge(Step from, Step to) {
        boolean near = to.x() - lane.x1() < EDGE || lane.x2() - to.x() < EDGE || to.z() - lane.z1() < EDGE
                || lane.z2() - to.z() < EDGE;
        if (!near) {
            return 1;
        }
        double before = Math.hypot(from.x() - lane.centerX(), from.z() - lane.centerZ());
        double after = Math.hypot(to.x() - lane.centerX(), to.z() - lane.centerZ());
        return after > before ? EDGE_PENALTY : 1;
    }

    /** Weit über der Mitte der Bahn lieber abwärts, weit darunter lieber aufwärts. */
    private double verticalWeight(Step from, double dy) {
        double off = from.top() - lane.centerY();
        if (off > VERTICAL_DRIFT && dy > 0) {
            return VERTICAL_PENALTY;
        }
        if (off < -VERTICAL_DRIFT && dy < 0) {
            return VERTICAL_PENALTY;
        }
        return 1;
    }

    private static boolean isWhole(double v) {
        return Math.abs(v - Math.rint(v)) < EPS;
    }
}
