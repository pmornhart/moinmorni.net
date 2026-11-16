/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: positions in the lobby as the world has them */
/**
 * Jump and Run der Lobby (statt der Parkour-Spirale): Startplatz im Nordwesten am Boden – runder Platz mit Smaragd in
 * der Mitte, Tafel mit der Bestenliste, Fahnen, Laternen und ein paar schwebenden Blöcken als Wegweiser in den Himmel.
 * Wer auf den Smaragd tritt, steht gleich darauf hoch über dem Dorf in seiner eigenen Bahn – dort zeigt das
 * Lobby-Plugin nur ihm Block für Block (`JumpCourse.java`, `LobbyJump.java`). Hier steht nur, was echt gebaut wird,
 * und die Punkte, die MoinMorni dem Plugin schickt.
 */
import type { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { disc, range } from '../range.js';
import { signText } from '../village.js';
import { lampPost } from './common.js';
import type { LobbyPoint, LobbyView } from './features.js';

/** Eine Bahn hoch über dem Dorf (Zellen einschließlich) – darin liegen alle Blöcke eines Läufers. */
export interface JumpLane {
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
  readonly x2: number;
  readonly y2: number;
  readonly z2: number;
}

export interface JumpAndRun {
  /** Startfeld (Smaragd im Boden): darauf treten = los. */
  readonly start: LobbyPoint;
  /** Hierher kommt man nach einem Sturz zurück (vor dem Startfeld, Blick zur Tafel). */
  readonly back: LobbyView;
  /** Mitte der Bestenliste vor der Tafel (Schrift schaut nach Süden: yaw 0). */
  readonly board: LobbyView;
  /** Eigene Bahnen hoch über dem Dorf, die nächste zum Startplatz zuerst. */
  readonly lanes: readonly JumpLane[];
}

/** Mitte des Startplatzes: wo die Parkour-Spirale stand (Wiese im Nordwesten, eben auf GROUND). */
const JX = -60;
const JZ = -41;
/** Radius des Platzes und des Smaragd-Rings in der Mitte. */
const PLATFORM = 5.4;
const EDGE = 4.5;
const CHECKER = 2.6;
/** Tafel an der Nordseite, Blick nach Süden zum Platz. */
const BOARD_Z = JZ - 6;
const BOARD_HALF = 3;

/** Bahnen: 3 × 3 Felder à 32 × 32, je 8 Blöcke Luft dazwischen, 86–106 Blöcke über dem Dorf. */
const LANE_SIZE = 32;
const LANE_GAP = 8;
const LANE_Y1 = GROUND + 86;
const LANE_Y2 = GROUND + 106;
const LANE_CENTRES_X = [-40, 0, 40];
const LANE_CENTRES_Z = [-50, -10, 30];

const lanes: readonly JumpLane[] = LANE_CENTRES_X.flatMap((cx) =>
  LANE_CENTRES_Z.map((cz) => ({
    x1: cx - LANE_SIZE / 2,
    y1: LANE_Y1,
    z1: cz - LANE_SIZE / 2,
    x2: cx + LANE_SIZE / 2 - 1,
    y2: LANE_Y2,
    z2: cz + LANE_SIZE / 2 - 1,
  })),
).sort(
  (a, b) =>
    Math.hypot((a.x1 + a.x2) / 2 - JX, (a.z1 + a.z2) / 2 - JZ) -
    Math.hypot((b.x1 + b.x2) / 2 - JX, (b.z1 + b.z2) / 2 - JZ),
);

export const JUMP_AND_RUN: JumpAndRun = {
  start: { x: JX, y: GROUND, z: JZ },
  back: { x: JX + 0.5, y: GROUND + 1, z: JZ + 3.5, yaw: 180, pitch: -10 },
  board: { x: JX + 0.5, y: GROUND + 1.15, z: BOARD_Z + 0.62, yaw: 0, pitch: 0 },
  lanes,
};

/** Abstand zwischen zwei Bahnen (für Tests: keine Bahn ragt in eine andere). */
export const JUMP_LANE_GAP = LANE_GAP;

/** Schwebende Blöcke über dem Platz: ein Bogen in den Himmel, Farben wie die Stufen im Jump and Run. */
const HINT_BLOCKS = [
  'white_concrete',
  'light_blue_concrete',
  'lime_concrete',
  'yellow_concrete',
  'orange_concrete',
  'red_concrete',
];
const HINT_FROM = GROUND + 10;
const HINT_RISE = 4;
const HINT_RADIUS = 3;

/** Startplatz bauen: Platz, Smaragd, Tafel mit Dach, Schrift, Fahnen, Laternen, schwebende Blöcke. */
export function buildJumpStart(c: Canvas): void {
  // Platz: Kopfsteinrand, Andesit, weiß-blaues Rautenfeld um den Smaragd; darüber frei (kein Gras, keine Blumen)
  disc(JX, JZ, PLATFORM).forEach(([x, z]) => {
    const r = Math.hypot(x - JX, z - JZ);
    const inner = Math.abs(x - JX) + Math.abs(z - JZ);
    let block = 'polished_andesite';
    if (r > EDGE) block = 'stone_bricks';
    else if (r <= CHECKER) block = inner % 2 === 0 ? 'white_concrete' : 'light_blue_concrete';
    c.set(x, GROUND, z, block);
    range(GROUND + 1, GROUND + 6).forEach((y) => c.set(x, y, z, 'air'));
  });
  c.set(JX, GROUND, JZ, 'emerald_block');

  // Tafel an der Nordseite: Fichtenbretter im Rahmen aus Fichtenstämmen, kleines Dach
  range(JX - BOARD_HALF, JX + BOARD_HALF).forEach((x) => {
    range(GROUND + 1, GROUND + 4).forEach((y) => c.set(x, y, BOARD_Z, 'spruce_planks'));
    c.set(x, GROUND + 5, BOARD_Z, 'stripped_spruce_log[axis=x]');
  });
  [JX - BOARD_HALF - 1, JX + BOARD_HALF + 1].forEach((x) => {
    range(GROUND + 1, GROUND + 5).forEach((y) => c.set(x, y, BOARD_Z, 'stripped_spruce_log'));
    c.set(x, GROUND + 4, BOARD_Z + 1, 'light_blue_wall_banner[facing=south]');
  });
  range(JX - BOARD_HALF - 2, JX + BOARD_HALF + 2).forEach((x) =>
    range(BOARD_Z - 1, BOARD_Z + 1).forEach((z) => c.set(x, GROUND + 6, z, 'spruce_slab[type=bottom]')),
  );
  [JX - 2, JX, JX + 2].forEach((x) => c.set(x, GROUND + 5, BOARD_Z + 1, 'lantern[hanging=true]'));
  signText(
    c,
    JX + 0.5,
    GROUND + 6.3,
    BOARD_Z + 1.4,
    'south',
    [{ text: 'Jump and Run', color: 'gold', bold: true }],
    1.6,
  );

  // Eingang im Süden: Fahnenmasten mit weiß-blauen Fahnen, Laternen an den Seiten
  [
    [JX - 3, 'light_blue_banner[rotation=0]'],
    [JX + 3, 'white_banner[rotation=0]'],
  ].forEach(([x, banner]) => {
    range(GROUND + 1, GROUND + 4).forEach((y) => c.set(Number(x), y, JZ + 5, 'spruce_fence'));
    c.set(Number(x), GROUND + 5, JZ + 5, String(banner));
  });
  lampPost(c, JX - 5, GROUND, JZ);
  lampPost(c, JX + 5, GROUND, JZ);

  // Schwebende Blöcke: ein Bogen in den Himmel – dort oben geht es los
  HINT_BLOCKS.forEach((block, i) => {
    const a = (i / HINT_BLOCKS.length) * Math.PI * 1.5 + Math.PI / 2;
    c.set(
      Math.round(JX + Math.cos(a) * HINT_RADIUS),
      HINT_FROM + i * HINT_RISE,
      Math.round(JZ + Math.sin(a) * HINT_RADIUS),
      block,
    );
  });
}
