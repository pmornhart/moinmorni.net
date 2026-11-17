/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the lobby needs them */
/**
 * Der große Christbaum mitten im Dorfmarkt – im Winter steht er **an Stelle des Maibaums** (der Maibaum ist solange
 * weg und kommt mit jeder anderen Saison genau so zurück, wie er war; `winter.ts` merkt sich jeden Block).
 *
 * - Fichte in acht Stufen, gut 36 Blöcke hoch (höher als der Maibaum): jede Stufe mit hängenden Zweigspitzen, nach
 *   oben schmaler, Schnee liegt auf jedem Stufenrand (macht `winter.ts`), echte Kerzen auf den Rändern.
 * - Kugeln in Rot, Gold, Silber und Blau unter jedem Stufenrand und dazwischen (Block-Anzeigen ohne Hitbox; mit dem
 *   Lobby-Paket runde Kugeln, siehe `schmuck.ts`), warme Lichterkette um jede Stufe, großer leuchtender Stern.
 * - Geschenke unter dem Baum, unsichtbares Licht rundherum (nachts strahlt der Baum den Markt an).
 */
import { maypole } from '../bavaria.js';
import { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { disc, range } from '../range.js';
import { KUGELN } from '../schmuck.js';
import { aroundX, aroundY, blockDisplay, multiply, placeModel, type Vec } from './deko.js';
import { present, stern } from './winter-figuren.js';
import { BASE, HALF, clearPlants, tags, type View } from './winter-base.js';

/** Platz des Maibaums (Mitte des Dorfplatzes) – dort steht im Winter der Christbaum. */
export const CHRISTBAUM = { x: 0, z: 0 } as const;
/** Höhe des Maibaums (wie in `dorfplatz.ts` gebaut). */
export const MAIBAUM_HOEHE = 30;

/** Stufen: unterste beginnt 2 über dem Boden, je 4 hoch; Radius unten und wie viel schmaler jede Stufe wird. */
const TIER_COUNT = 8;
const TIER_FROM = 2;
const TIER_HEIGHT = 4;
const RADIUS = 7.6;
const RADIUS_STEP = 0.85;
/** Innerhalb einer Stufe wird jede Lage so viel schmaler. */
const LAYER_STEP = 0.9;
/** Spitze über der obersten Stufe, darüber der Stern. */
export const BAUM_SPITZE = TIER_FROM + TIER_COUNT * TIER_HEIGHT + 2;
/** So weit reicht der Baum samt Stern über den Boden (für Tests). */
export const BAUM_HOEHE = BAUM_SPITZE + 3;
/** Äußerster Rand der Zweige (unterste Stufe). */
export const BAUM_RADIUS = RADIUS;

const LEAVES = 'spruce_leaves[persistent=true]';

interface Tier {
  /** Höhe der untersten Lage über dem Boden. */
  readonly h: number;
  readonly r: number;
}

export const TIERS: readonly Tier[] = range(0, TIER_COUNT - 1).map((i) => ({
  h: TIER_FROM + i * TIER_HEIGHT,
  r: RADIUS - i * RADIUS_STEP,
}));

/** Radius einer Lage j (0 = unterste) in einer Stufe. */
const layerRadius = (t: Tier, j: number): number => Math.max(0.7, t.r - j * LAYER_STEP);

/** Alle Blöcke des Maibaums (über dem Pflaster) – die nimmt der Winter weg. */
export function maibaumBlocks(): Array<readonly [number, number, number, string]> {
  const scratch = new Canvas();
  maypole(scratch, CHRISTBAUM.x, GROUND, CHRISTBAUM.z, MAIBAUM_HOEHE);
  return scratch.find(() => true).filter(([, y]) => y > GROUND);
}

/** Baum setzen (Maibaum weg, Fichte, Kerzen, Licht) und die Anzeige-Wesen dazu liefern. */
export function christbaum(w: Canvas, v: View): string[] {
  const { x: cx, z: cz } = CHRISTBAUM;
  maibaumBlocks().forEach(([x, y, z]) => w.set(x, y, z, 'air'));
  disc(cx, cz, RADIUS + 1).forEach(([x, z]) => clearPlants(w, v, x, z));
  TIERS.forEach((t) => {
    // Hängende Zweigspitzen: der äußere Ring eine Lage tiefer
    disc(cx, cz, t.r)
      .filter(([x, z]) => Math.hypot(x - cx, z - cz) > t.r - 1.15)
      .forEach(([x, z]) => w.set(x, BASE + t.h - 1, z, LEAVES));
    range(0, TIER_HEIGHT - 1).forEach((j) =>
      disc(cx, cz, layerRadius(t, j)).forEach(([x, z]) => w.set(x, BASE + t.h + j, z, LEAVES)),
    );
  });
  // Spitze: Kreuz, dann zwei Nadeln
  const spitze = BASE + BAUM_SPITZE - 2;
  [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].forEach(([dx = 0, dz = 0]) => w.set(cx + dx, spitze, cz + dz, LEAVES));
  [spitze + 1, spitze + 2].forEach((y) => w.set(cx, y, cz, LEAVES));
  range(BASE, spitze - 1).forEach((y) => w.set(cx, y, cz, 'spruce_log'));
  kerzen(w);
  licht(w);
  return [
    ...kugeln(),
    ...lichterkette(),
    ...placeModel(tags('stern'), sternMitte(), 0, stern(2.8)),
    ...geschenke(),
  ];
}

/** Mitte des Sterns auf der Spitze. */
export const sternMitte = (): Vec => [CHRISTBAUM.x + HALF, BASE + BAUM_SPITZE + 1.6, CHRISTBAUM.z + HALF];

/** Echte Kerzen auf dem Rand jeder Stufe (wo darüber keine Lage mehr ist) – je höher, desto weniger. */
function kerzen(w: Canvas): void {
  const { x: cx, z: cz } = CHRISTBAUM;
  TIERS.slice(0, -1).forEach((t, k) => {
    const count = Math.max(6, Math.round(t.r * 1.6));
    const rim = layerRadius(t, 1);
    range(0, count - 1).forEach((i) => {
      const a = ((i + (k % 2) * HALF) / count) * Math.PI * 2;
      const r = (t.r + rim) / 2 + 0.2;
      const x = Math.round(cx + Math.cos(a) * r);
      const z = Math.round(cz + Math.sin(a) * r);
      const d = Math.hypot(x - cx, z - cz);
      if (d <= t.r && d > rim) w.set(x, BASE + t.h + 1, z, `white_candle[candles=${k < 3 ? 3 : 2},lit=true]`);
    });
  });
}

/** Unsichtbares Licht rund um den Baum (Ringe auf mehreren Höhen) und im Stern. */
function licht(w: Canvas): void {
  const { x: cx, z: cz } = CHRISTBAUM;
  const ring = (y: number, r: number, n: number, level: number): void =>
    range(0, n - 1).forEach((i) => {
      const a = ((i + HALF) / n) * Math.PI * 2;
      w.set(Math.round(cx + Math.cos(a) * r), y, Math.round(cz + Math.sin(a) * r), `light[level=${level}]`);
    });
  ring(BASE + 2, RADIUS + 2, 8, 14);
  ring(BASE + 10, TIERS[2]!.r + 1.6, 6, 13);
  ring(BASE + 18, TIERS[4]!.r + 1.6, 4, 12);
  ring(BASE + 26, TIERS[6]!.r + 1.6, 4, 12);
  w.set(cx, BASE + BAUM_SPITZE + 1, cz, 'light[level=15]');
}

/** Farben der Kugeln in Reihenfolge (zwei Rot, Gold, Silber, Blau …). */
const KUGEL_FOLGE = ['rot', 'gold', 'rot', 'silber', 'gold', 'blau'] as const;
/** Kugel schräg gestellt: ohne Paket ein Edelstein, mit Paket eine runde Kugel (rund von allen Seiten). */
const SCHRAEG = multiply(aroundY(Math.PI / 4), aroundX(0.6155));

function kugel(at: Vec, size: number, i: number): string {
  const farbe = KUGEL_FOLGE[i % KUGEL_FOLGE.length] ?? 'rot';
  return blockDisplay(tags('kugel'), at, KUGELN[farbe], {
    scale: [size, size, size],
    rotation: SCHRAEG,
    light: { sky: 15, block: 12 },
  });
}

/** Kugeln: unter jedem Stufenrand (hängend) und eine zweite Reihe auf halber Höhe der Stufe. */
function kugeln(): string[] {
  const { x: cx, z: cz } = CHRISTBAUM;
  return TIERS.flatMap((t, k) => {
    const size = 0.62 - k * 0.04;
    const under = Math.max(6, Math.round((2 * Math.PI * t.r) / 1.7));
    // Unter der untersten Stufe nicht: die Kugeln lägen dort fast auf dem Pflaster (da liegen die Geschenke).
    const hanging = (k === 0 ? [] : range(0, under - 1)).map((i) => {
      const a = ((i + (k % 2) * HALF) / under) * Math.PI * 2;
      const r = t.r - 0.35;
      return kugel(
        [cx + HALF + Math.cos(a) * r, BASE + t.h - 1 - size / 2 - 0.08, cz + HALF + Math.sin(a) * r],
        size,
        i + k,
      );
    });
    const mid = layerRadius(t, 2);
    const upper = Math.max(4, Math.round((2 * Math.PI * mid) / 2.4));
    const between = range(0, upper - 1).map((i) => {
      const a = ((i + HALF + (k % 2) * HALF) / upper) * Math.PI * 2;
      const r = mid + 0.62;
      return kugel(
        [cx + HALF + Math.cos(a) * r, BASE + t.h + 2.35, cz + HALF + Math.sin(a) * r],
        size * 0.85,
        i + k + 3,
      );
    });
    return [...hanging, ...between];
  });
}

const WARM: readonly string[] = ['glowstone', 'ochre_froglight', 'glowstone', 'shroomlight'];

/** Feinheit beim Suchen der Zweig-Außenkante. */
const EDGE_STEP = 0.05;
/** Lichter sitzen so weit vor der Außenkante der Zweige (sonst schweben sie). */
const ON_LEAVES = 0.06;

/**
 * Abstand von der Baummitte bis zur Außenkante einer Lage mit Radius r in Richtung a – die Lage besteht aus ganzen
 * Blöcken (wie `disc`), ihre Kante springt also je nach Richtung um bis zu einen Block.
 */
function leafEdge(r: number, a: number): number {
  const { x: cx, z: cz } = CHRISTBAUM;
  const inside = (d: number): boolean => {
    const x = Math.floor(cx + HALF + Math.cos(a) * d) - cx;
    const z = Math.floor(cz + HALF + Math.sin(a) * d) - cz;
    return x * x + z * z <= r * r;
  };
  const steps = range(0, Math.ceil((r + 2) / EDGE_STEP)).map((i) => r + 2 - i * EDGE_STEP);
  return steps.find(inside) ?? r;
}

/** Warme Lichterkette um jede Stufe – direkt auf den äußersten Zweigen der untersten Lage. */
function lichterkette(): string[] {
  const { x: cx, z: cz } = CHRISTBAUM;
  return TIERS.flatMap((t, k) => {
    const count = Math.max(8, Math.round((2 * Math.PI * (t.r + HALF)) / 1.05));
    return range(0, count - 1).map((i) => {
      const a = ((i + k * 0.37) / count) * Math.PI * 2;
      const r = leafEdge(t.r, a) + ON_LEAVES;
      // leichte Welle: die Kette hängt zwischen den Zweigen etwas durch
      const sag = Math.abs(Math.sin(a * 4)) * 0.25;
      return blockDisplay(
        tags('licht'),
        [cx + HALF + Math.cos(a) * r, BASE + t.h + 0.55 - sag, cz + HALF + Math.sin(a) * r],
        WARM[i % WARM.length] ?? 'glowstone',
        { scale: [0.15, 0.15, 0.15], glow: true },
      );
    });
  });
}

/** Geschenke: [Abstand, Winkel, Größe, Schachtel, Band]. */
const GESCHENKE: readonly (readonly [number, number, number, string, string])[] = [
  [6.6, 0.2, 0.7, 'red_wool', 'gold_block'],
  [7.4, 0.55, 0.5, 'white_wool', 'red_wool'],
  [6.9, 1.45, 0.62, 'green_wool', 'red_wool'],
  [7.6, 1.75, 0.45, 'blue_wool', 'white_wool'],
  [6.5, 2.6, 0.66, 'red_wool', 'white_wool'],
  [7.3, 3.0, 0.48, 'yellow_wool', 'red_wool'],
  [6.8, 3.65, 0.58, 'purple_wool', 'gold_block'],
  [7.5, 4.1, 0.5, 'white_wool', 'gold_block'],
  [6.6, 4.75, 0.7, 'green_wool', 'gold_block'],
  [7.2, 5.25, 0.44, 'red_wool', 'white_wool'],
  [6.9, 5.8, 0.55, 'blue_wool', 'gold_block'],
  [7.7, 6.05, 0.4, 'pink_wool', 'white_wool'],
];

/** Geschenke rund um den Baum, unter den untersten Zweigen. */
function geschenke(): string[] {
  const { x: cx, z: cz } = CHRISTBAUM;
  return GESCHENKE.flatMap(([r, a, size, box, ribbon]) =>
    placeModel(
      tags('geschenk'),
      [cx + HALF + Math.cos(a) * r, BASE + 0.01, cz + HALF + Math.sin(a) * r],
      a * 2,
      present(size, box, ribbon),
    ),
  );
}
