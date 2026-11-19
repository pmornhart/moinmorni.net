/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the lobby needs them */
/**
 * Winter-Wunderland – die Saison „Winter“ der Lobby (Panel: Lobby → Saison-Deko).
 *
 * Blöcke (nur solange Winter an ist):
 * - Schneedecke auf allem, was oben liegt: Wiesen und Beete mit Verwehungen, an Wegen und Plätzen ein Schneewall wie
 *   frisch geräumt, ein paar Schneehaufen; Wege und Plätze mit einer dünnen Schicht, die begehbar bleibt (Schnee mit
 *   einer Schicht hat keine Höhe), dicker Schnee auf den Markisen der Buden, Hecken und Baumkronen; Blumen und Gras
 *   verschwinden darunter, Teich und Gräben frieren zu.
 * - Statt des Maibaums ein riesiger Christbaum (`christbaum.ts`), der Weihnachtsmarkt mit Glühwein- und
 *   Lebkuchenbude und die Krippe (`weihnachtsmarkt.ts`), eine Eisbahn, verschneite Fichten rund ums Dorf,
 *   unsichtbares warmes Licht.
 * Jede geänderte Stelle steht mit ihrem alten Block im Plan (`restore`) – beim Wechsel der Saison kommt genau der
 * zurück, auch der Maibaum.
 *
 * Anzeige-Wesen (alle ohne Hitbox, siehe `deko.ts`): Schnee auf den Satteldächern (eine schräge Platte je Dachseite),
 * Eiszapfen, Lichter an den Giebeln, Schmuck an Baum und Buden, Lichterketten, Schneekappen auf Zäunen, Schneemänner,
 * Schlitten. Alles eigene Bauten aus Minecraft-Blöcken.
 */
import { baseName, Canvas } from '../canvas.js';
import { MITTE } from '../brunnen.js';
import { GROUND, spruce } from '../nature.js';
import { fbm, random } from '../noise.js';
import { disc, pairs, range } from '../range.js';
import { roofsOf, type RoofSpec } from '../shapes.js';
import { BAUM_RADIUS, christbaum, CHRISTBAUM } from './christbaum.js';
import { LAUNCHPADS, LOBBY_SPAWN_VIEW } from './features.js';
import { JUMP_AND_RUN } from './jumpandrun.js';
import { displayStuck, type World } from '../pruefung.js';
import { aroundX, aroundY, aroundZ, blockDisplay, placeModel, type Vec } from './deko.js';
import { settleDown } from './halt.js';
import { inSportZone } from './sportstand.js';
import { BUDEN, budeArea, krippeArea, weihnachtsmarkt } from './weihnachtsmarkt.js';
import { grosserSchlitten, rodel, schneemann } from './winter-figuren.js';
import {
  BASE,
  clearPlants,
  HALF,
  inArea,
  INNER,
  kindOf,
  occupies,
  snowLayer,
  tags,
  viewOf,
  type Change,
  type Kind,
  type View,
} from './winter-base.js';

export { INNER, kindOf, snowLayer } from './winter-base.js';
export { CHRISTBAUM } from './christbaum.js';

/**
 * Außen bis an die Kante des Geländes (±223, so weit räumt der Bau die Welt) wird Gras an den Bergen zu Schneeblöcken
 * – in Würfeln zu 32 Blöcken, mit wenigen Befehlen. Kommt beim Wechsel der Saison genau zurück.
 */
const OUTER = 224;
const FILL_STEP = 32;
/**
 * Höhen der Würfel: bis 143 (darüber beginnt an den Bergen der Schnee des Bauplans, frühestens auf 144 – dort wird
 * Gras Stelle für Stelle zu Schnee).
 */
const FILL_LAYERS: readonly (readonly [number, number])[] = [
  [GROUND, GROUND + 31],
  [GROUND + 32, GROUND + 63],
  [GROUND + 64, GROUND + 79],
];
const SNOW_LINE = GROUND + 80;
const KEY_OFFSET = 1024;
const KEY_SPAN = 4096;

/** Eisbahn mit Bande auf der Wiese westlich vom Platz: Eisfläche (ohne die vier Ecken), Eingang zur Krippe hin. */
export const EISBAHN = { x1: -50, x2: -43, z1: -19, z2: -7, gate: [-14, -13] } as const;
/** Schneemänner: [x, z, schaut zu x, z] – neben den Buden am Eingang und an der Eisbahn. */
export const SCHNEEMAENNER: readonly (readonly [number, number, number, number])[] = [
  [-28, -18, -16, -2],
  [-17, 22, LOBBY_SPAWN_VIEW.x, LOBBY_SPAWN_VIEW.z],
  [18, 22, LOBBY_SPAWN_VIEW.x, LOBBY_SPAWN_VIEW.z],
];
/** Rodel: [x, z, Fahrtrichtung (Bogenmaß, 0 = Süden), mit Geschenken]. */
const RODEL: readonly (readonly [number, number, number, boolean])[] = [
  [-45.5, -3.5, 1.4, false],
  [-15.2, 24.2, 2.6, true],
];
/** Großer Pferdeschlitten mit Geschenken neben der Krippe, schaut zum Platz. */
export const SCHLITTEN = { x: -26.5, z: -1.5, yaw: Math.PI / 2 } as const;
/** Schneehaufen auf den Wiesen: [x, z, Radius]. */
export const SCHNEEHAUFEN: readonly (readonly [number, number, number])[] = [
  [-24, 16, 2.6],
  [24, 16, 2.4],
  [25, -15, 2.8],
  [-24, -21, 2.2],
  [-40, -1, 2.0],
  [-20, 25, 1.8],
];

/** Würfel (Ecken eingeschlossen). */
export interface FillBox {
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
  readonly x2: number;
  readonly y2: number;
  readonly z2: number;
}

export interface WinterPlan {
  /** Blöcke für den Winter (`fill … strict`), in Bau-Reihenfolge. */
  readonly on: readonly string[];
  /** Die alten Blöcke wieder hin – genau an den Stellen, die der Winter geändert hat. */
  readonly off: readonly string[];
  /** Anzeige-Wesen (summon …). */
  readonly displays: readonly string[];
  /** Weitere Befehle der Winter-Deko (Dorfleute unter dem Christbaum ein Stück nach außen). */
  readonly moves: readonly string[];
  /** Innen: neuer Block je geänderter Stelle. */
  readonly blocks: Canvas;
  /** Innen: alter Block je geänderter Stelle. */
  readonly restore: Canvas;
  /** Außen: Würfel, in denen Gras zu Schneeblock wird (und zurück). */
  readonly mountains: readonly FillBox[];
  /** Innen: Würfel, in denen „Schnee weg“ als ein Befehl geht (der Bauplan hat dort keinen Schnee). */
  readonly snowBoxes: readonly FillBox[];
}

// ---------- Schnee ----------

/** Verwehungen auf Wiesen: meist zwei Schichten, mal eine, mal drei – große, weiche Flecken. */
const DRIFT: readonly number[] = [0.42, 0.6];
function drift(x: number, z: number): number {
  const n = fbm(1312, x, z, 16, 2);
  return 1 + DRIFT.filter((d) => n > d).length;
}

/** Platz des Jump and Run (Smaragd + Rautenfeld): bleibt frei – wer auf den Smaragd tritt, startet. */
export const JUMP_CLEAR = 6;

/** Wo kein Schnee hin soll: Launchpads (Platten), Platz des Jump and Run, Prunkbrunnen (3D-Modell). */
function keepClear(base: Canvas): (x: number, y: number, z: number) => boolean {
  const jump = JUMP_AND_RUN.start;
  // „summon marker 0.5 92 -79.5 {Tags:['mm_brunnen_mitte',…]}“ → Mitte des Brunnens
  const fountains = base.extra
    .filter((cmd) => cmd.startsWith('summon marker ') && cmd.includes(MITTE))
    .map((cmd) => cmd.split(' '))
    .map((p) => [Number(p[2]), Number(p[4])] as const);
  const FOUNTAIN_CLEAR = 8.5;
  return (x, y, z) =>
    LAUNCHPADS.some((p) => Math.abs(x - p.x) <= 1 && Math.abs(z - p.z) <= 1) ||
    Math.hypot(x - jump.x, z - jump.z) <= JUMP_CLEAR ||
    fountains.some(([fx, fz]) => Math.hypot(x + HALF - fx, z + HALF - fz) < FOUNTAIN_CLEAR);
}

const colKey = (x: number, z: number): number => (x + KEY_OFFSET) * KEY_SPAN + (z + KEY_OFFSET);

/** Höchster Block je Säule (Bauplan, Winter-Bauten, Gras der Grundwelt). */
function tops(base: Canvas, w: Canvas): Map<number, number> {
  const top = new Map<number, number>();
  const raise = (x: number, y: number, z: number): void => {
    if (!inArea(x, z)) return;
    const k = colKey(x, z);
    if ((top.get(k) ?? Number.NEGATIVE_INFINITY) < y) top.set(k, y);
  };
  base.find(occupies).forEach(([x, y, z]) => {
    const over = w.get(x, y, z);
    if (over === undefined || occupies(over)) raise(x, y, z);
  });
  w.find(occupies).forEach(([x, y, z]) => raise(x, y, z));
  pairs(range(INNER.from, INNER.to), range(INNER.from, INNER.to)).forEach(([x, z]) => {
    if (base.get(x, GROUND, z) === undefined && w.get(x, GROUND, z) === undefined) raise(x, GROUND, z);
  });
  return top;
}

function onTop(v: View, x: number, h: number, z: number, layers: number): Change[] {
  return v.now(x, h + 1, z) === 'air' ? [[x, h + 1, z, snowLayer(layers)]] : [];
}

/** Blumen und Gras: der Schnee nimmt ihren Platz ein (zweihohe Pflanzen ganz). */
function underPlant(v: View, x: number, h: number, z: number, depth: Depth): Change[] {
  const upper = v.now(x, h, z).includes('half=upper');
  const low = upper ? h - 1 : h;
  const soil = v.now(x, low - 1, z);
  if (kindOf(soil) !== 'ground') return [];
  const layers = baseName(soil) === 'farmland' ? 1 : depth(x, z);
  const snow: Change = [x, low, z, snowLayer(layers)];
  return upper ? [snow, [x, h, z, 'air']] : [snow];
}

/** Schicht-Tiefe je Säule (Wiese: Verwehung, neben Wegen ein Schneewall). */
type Depth = (x: number, z: number) => number;

const SNOW_ON: Readonly<Record<Kind, (v: View, x: number, h: number, z: number, depth: Depth) => Change[]>> =
  {
    ground: (v, x, h, z, depth) => onTop(v, x, h, z, depth(x, z)),
    leaves: (v, x, h, z) => onTop(v, x, h, z, fbm(2718, x, z, 6, 2) > 0.55 ? 2 : 1),
    // Markisen der Buden (Wolle) bekommen dicken Schnee, alles andere eine dünne Schicht
    solid: (v, x, h, z) => onTop(v, x, h, z, baseName(v.now(x, h, z)).endsWith('_wool') ? 3 : 1),
    water: (_v, x, h, z) => [[x, h, z, 'ice']],
    plant: (v, x, h, z, depth) => underPlant(v, x, h, z, depth),
    skip: () => [],
  };

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Schnee auf jede Säule (oben drauf, wo Minecraft ihn liegen ließe), Eis auf offenes Wasser. Wiesen direkt neben
 * Wegen und Plätzen bekommen einen Schneewall (drei bis vier Schichten – wie frisch geräumt, noch ohne Sprung
 * begehbar).
 */
function snowCover(base: Canvas, w: Canvas, v: View): void {
  const clear = keepClear(base);
  const top = tops(base, w);
  const paved = (x: number, z: number): boolean =>
    top.get(colKey(x, z)) === GROUND && kindOf(v.now(x, GROUND, z)) === 'solid';
  const bank = (x: number, z: number): number =>
    NEIGHBOURS.some(([dx, dz]) => paved(x + dx, z + dz)) ? 3 + (fbm(77, x, z, 5, 2) > 0.5 ? 1 : 0) : 0;
  const depth: Depth = (x, z) => Math.max(drift(x, z), bank(x, z));
  const changes: Change[] = [];
  top.forEach((h, k) => {
    const x = Math.floor(k / KEY_SPAN) - KEY_OFFSET;
    const z = (k % KEY_SPAN) - KEY_OFFSET;
    if (!clear(x, h, z)) changes.push(...SNOW_ON[kindOf(v.now(x, h, z))](v, x, h, z, depth));
  });
  changes.forEach(([x, y, z, b]) => w.set(x, y, z, b));
}

const LAYERS_PER_BLOCK = 8;

/** Schneehaufen auf freier Wiese: in der Mitte gut anderthalb Blöcke hoch, nach außen flacher. */
function schneehaufen(w: Canvas, v: View): void {
  SCHNEEHAUFEN.forEach(([cx, cz, r]) =>
    disc(cx, cz, r + HALF).forEach(([x, z]) => {
      const free =
        kindOf(v.now(x, GROUND, z)) === 'ground' &&
        [BASE, BASE + 1, BASE + 2].every((y) =>
          ['air', 'plant'].includes(v.now(x, y, z) === 'air' ? 'air' : kindOf(v.now(x, y, z))),
        );
      if (!free) return;
      const d = Math.hypot(x - cx, z - cz) / (r + 0.6);
      const layers = Math.max(1, Math.round((1 - d * d) * (6 + r * 3.2)));
      clearPlants(w, v, x, z);
      const full = Math.floor(layers / LAYERS_PER_BLOCK);
      range(0, full - 1).forEach((i) => w.set(x, BASE + i, z, 'snow_block'));
      const rest = layers % LAYERS_PER_BLOCK;
      if (rest > 0) w.set(x, BASE + full, z, snowLayer(rest));
    }),
  );
}

// ---------- Eisbahn ----------

function eisbahn(w: Canvas, v: View): void {
  const { x1, x2, z1, z2, gate } = EISBAHN;
  const corner = (x: number, z: number): boolean => (x === x1 || x === x2) && (z === z1 || z === z2);
  const ice = new Set(
    pairs(range(x1, x2), range(z1, z2))
      .filter(([x, z]) => !corner(x, z))
      .map(([x, z]) => `${x},${z}`),
  );
  const isIce = (x: number, z: number): boolean => ice.has(`${x},${z}`);
  const ring = pairs(range(x1 - 1, x2 + 1), range(z1 - 1, z2 + 1)).filter(
    ([x, z]) =>
      !isIce(x, z) &&
      pairs([-1, 0, 1], [-1, 0, 1]).some(([dx, dz]) => isIce(x + dx, z + dz)) &&
      !(x === x2 + 1 && (gate as readonly number[]).includes(z)),
  );
  const isRing = new Set(ring.map(([x, z]) => `${x},${z}`));
  pairs(range(x1, x2), range(z1, z2))
    .filter(([x, z]) => isIce(x, z))
    .forEach(([x, z]) => {
      clearPlants(w, v, x, z);
      w.set(x, GROUND, z, 'ice');
    });
  ring.forEach(([x, z]) => {
    clearPlants(w, v, x, z);
    const link = (dx: number, dz: number): boolean => isRing.has(`${x + dx},${z + dz}`);
    w.set(
      x,
      BASE,
      z,
      `spruce_fence[north=${link(0, -1)},east=${link(1, 0)},south=${link(0, 1)},west=${link(-1, 0)}]`,
    );
  });
  // Laternen auf den runden Ecken, Licht über der Fläche
  [
    [x1, z1],
    [x2, z1],
    [x1, z2],
    [x2, z2],
  ].forEach(([x = 0, z = 0]) => w.set(x, BASE + 1, z, 'lantern'));
  const mid = Math.round((x1 + x2) / 2);
  [z1 + 3, z2 - 3].forEach((z) => w.set(mid, BASE + 3, z, 'light[level=12]'));
}

// ---------- Verschneite Fichten rund ums Dorf ----------

/**
 * Freie Stellen auf den Wiesen rund ums Dorf: ebenes Gras, ringsum nichts Gebautes (keine Wege, Zäune, Bäume) und
 * nicht auf der Sichtachse zum Schloss, am Schlossberg, am Jump and Run, Christbaum oder Eisbahn.
 */
export function fichtenPlaetze(v: View): Array<readonly [number, number, number]> {
  const rnd = random(1224);
  const krippe = krippeArea();
  const busy: readonly (readonly [number, number, number])[] = [
    [CHRISTBAUM.x, CHRISTBAUM.z, 30],
    [(EISBAHN.x1 + EISBAHN.x2) / 2, (EISBAHN.z1 + EISBAHN.z2) / 2, 12],
    ...krippe.map(([x, z]) => [x, z, 4] as const),
    ...BUDEN.flatMap((b) => budeArea(b).map(([x, z]) => [x, z, 4] as const)),
    [SCHLITTEN.x, SCHLITTEN.z, 6],
    ...SCHNEEHAUFEN.map(([x, z, r]) => [x, z, r + 4] as const),
    [JUMP_AND_RUN.start.x, JUMP_AND_RUN.start.z, 16],
    [-66, 42, 17],
    ...LAUNCHPADS.map((p) => [p.x, p.z, 10] as const),
    ...SCHNEEMAENNER.map(([x, z]) => [x, z, 6] as const),
  ];

  const free = (x: number, z: number): boolean =>
    disc(x, z, 4).every(
      ([px, pz]) =>
        v.now(px, GROUND, pz) === 'grass_block' &&
        ['air', 'plant'].includes(v.now(px, BASE, pz) === 'air' ? 'air' : kindOf(v.now(px, BASE, pz))) &&
        range(BASE + 1, BASE + 16).every((y) => !occupies(v.now(px, y, pz))),
    );
  const candidates = pairs(range(-11, 11), range(-11, 11)).map(
    ([i, j]) =>
      [
        i * 10 + Math.floor(rnd() * 7) - 3,
        j * 10 + Math.floor(rnd() * 7) - 3,
        9 + Math.floor(rnd() * 5),
      ] as const,
  );
  return candidates
    .filter(([x, z]) => {
      const d = Math.hypot(x, z);
      return d > 36 && d < 112 && Math.abs(x) > 16 && !(z < -40 && Math.abs(x) < 64);
    })
    .filter(([x, z]) => busy.every(([bx, bz, r]) => Math.hypot(x - bx, z - bz) > r))
    .filter(([x, z]) => free(x, z))
    .reduce<Array<readonly [number, number, number]>>(
      (chosen, c) => (chosen.every(([x, z]) => Math.hypot(x - c[0], z - c[1]) > 9) ? [...chosen, c] : chosen),
      [],
    )
    .slice(0, 16);
}

// ---------- Dächer: Schnee, Eiszapfen, Lichter am Giebel ----------

interface RoofGeo {
  readonly a1: number;
  readonly a2: number;
  readonly b1: number;
  readonly b2: number;
  readonly y: number;
  readonly layers: number;
  readonly alongX: boolean;
  /** Mitte zwischen den Dachseiten (First). */
  readonly center: number;
  readonly material: string;
}

function geoOf(r: RoofSpec): RoofGeo {
  const ov = r.overhang ?? 1;
  const ev = r.eaves ?? 1;
  const alongX = r.along === 'x';
  const b1 = (alongX ? r.z1 : r.x1) - ov;
  const b2 = (alongX ? r.z2 : r.x2) + ov;
  return {
    a1: (alongX ? r.x1 : r.z1) - ev,
    a2: (alongX ? r.x2 : r.z2) + ev,
    b1,
    b2,
    y: r.y,
    layers: Math.floor((b2 - b1 + 1) / 2),
    alongX,
    center: (b1 + b2 + 1) / 2,
    material: r.material,
  };
}

type Side = 1 | 2;
/** Richtung von der Traufe zum First (Seite 1 an b1 steigt mit b, Seite 2 an b2 fällt). */
const sign = (side: Side): number => (side === 1 ? 1 : -1);
/** Äußere Kante der Dachreihe i (b), auf der Seite der Traufe. */
const outer = (g: RoofGeo, side: Side, i: number): number => (side === 1 ? g.b1 + i : g.b2 + 1 - i);
/** Block-Koordinate (b) der Treppe in Reihe i. */
const rowB = (g: RoofGeo, side: Side, i: number): number => (side === 1 ? g.b1 + i : g.b2 - i);
const toWorld = (g: RoofGeo, a: number, y: number, b: number): Vec => (g.alongX ? [a, y, b] : [b, y, a]);
/** Höhe der Dachfläche (Stufenkanten) bei b. */
const plane = (g: RoofGeo, side: Side, b: number): number =>
  g.y + HALF + sign(side) * (b - outer(g, side, 0));

/** Die Treppe, die in dieser Dachreihe liegt (wie `gableRoof` sie setzt). */
function stairOf(g: RoofGeo, side: Side): string {
  const [f1, f2] = g.alongX ? ['south', 'north'] : ['east', 'west'];
  return `${g.material}_stairs[facing=${side === 1 ? f1 : f2},half=bottom]`;
}

/** Abschnitte (a von … bis) einer Dachreihe, in denen die Treppe noch frei unter dem Himmel liegt. */
function rowSegments(v: View, g: RoofGeo, side: Side, i: number): Array<[number, number]> {
  const stair = stairOf(g, side);
  return range(g.a1, g.a2)
    .filter((a) => {
      const [x, y, z] = toWorld(g, a, g.y + i, rowB(g, side, i));
      return v.now(x, y, z) === stair && v.now(x, y + 1, z) === 'air';
    })
    .reduce<Array<[number, number]>>((runs, a) => {
      const last = runs[runs.length - 1];
      if (last && last[1] === a - 1) last[1] = a;
      else runs.push([a, a]);
      return runs;
    }, []);
}

const SHEET = 0.14;
const LIP = 0.18;

/** Schneeplatte über den Reihen i0 … i1 im Abschnitt aS … aE: liegt auf den Stufenkanten (45°). */
function sheet(g: RoofGeo, side: Side, i0: number, i1: number, aS: number, aE: number): string {
  const s = sign(side);
  const from = outer(g, side, i0) - s * (i0 === 0 ? LIP : 0);
  const to = i1 === g.layers - 1 ? g.center : outer(g, side, i1 + 1);
  const mid = (from + to) / 2;
  const lift = SHEET / 2 / Math.SQRT2;
  const slope = Math.abs(to - from) * Math.SQRT2;
  const length = aE + 1 - aS;
  const at = toWorld(g, (aS + aE + 1) / 2, plane(g, side, mid) + lift, mid - s * lift);
  return blockDisplay(tags('dach'), at, 'snow_block', {
    scale: g.alongX ? [length, SHEET, slope] : [slope, SHEET, length],
    rotation: g.alongX ? aroundX((-s * Math.PI) / 4) : aroundZ((s * Math.PI) / 4),
    light: { sky: 15, block: 0 },
    view: 2,
  });
}

/** Schnee auf einer Dachseite: Reihen mit gleichen Abschnitten bekommen eine gemeinsame Platte. */
function roofSide(v: View, g: RoofGeo, side: Side): string[] {
  const rows = range(0, g.layers - 1).map((i) => ({ i, segs: rowSegments(v, g, side, i) }));
  const groups = rows.reduce<Array<{ i0: number; i1: number; segs: Array<[number, number]> }>>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last && JSON.stringify(last.segs) === JSON.stringify(row.segs)) last.i1 = row.i;
    else acc.push({ i0: row.i, i1: row.i, segs: row.segs });
    return acc;
  }, []);
  // Steckt eine Platte in etwas (Turm, Wand, Kamin am Dach), wird sie geteilt – bis zu einzelnen Feldern, die frei
  // liegen; was dann noch steckt, bleibt ohne Schnee.
  const world: World = (x, y, z) => v.now(x, y, z);
  const fit = (i0: number, i1: number, aS: number, aE: number): string[] => {
    const cmd = sheet(g, side, i0, i1, aS, aE);
    if (displayStuck(world, cmd) === null) return [cmd];
    if (aS < aE) {
      const m = Math.floor((aS + aE) / 2);
      return [...fit(i0, i1, aS, m), ...fit(i0, i1, m + 1, aE)];
    }
    if (i0 < i1) {
      const m = Math.floor((i0 + i1) / 2);
      return [...fit(i0, m, aS, aE), ...fit(m + 1, i1, aS, aE)];
    }
    return [];
  };
  return groups.flatMap((gr) => gr.segs.flatMap(([aS, aE]) => fit(gr.i0, gr.i1, aS, aE)));
}

/** Holzdächer (Häuser, Kapelle) bekommen Eiszapfen und Lichter, die Kupferdächer des Schlosses nur Schnee. */
const wooden = (g: RoofGeo): boolean => !g.material.includes('copper');

/** Eiszapfen an der Traufe: unregelmäßig, verschieden lang. */
function icicles(v: View, g: RoofGeo, side: Side, rnd: () => number): string[] {
  const s = sign(side);
  return rowSegments(v, g, side, 0).flatMap(([aS, aE]) =>
    range(aS, aE).flatMap((a) => {
      const pick = rnd();
      const length = 0.3 + rnd() * 0.55;
      const shift = (rnd() - HALF) * 0.5;
      const [x, y, z] = toWorld(g, a, g.y - 1, rowB(g, side, 0));
      if (pick > 0.1 || v.now(x, y, z) !== 'air') return [];
      const at = toWorld(g, a + HALF + shift, g.y - length / 2 + 0.02, outer(g, side, 0) + s * 0.2);
      return [
        blockDisplay(tags('eiszapfen'), at, 'ice', {
          scale: [0.09, length, 0.09],
          rotation: aroundY(Math.PI / 4),
        }),
      ];
    }),
  );
}

const GABLE_LIGHTS: readonly string[] = [
  'glowstone',
  'red_concrete',
  'ochre_froglight',
  'glowstone',
  'shroomlight',
];

/** Giebel, an dessen Wand eine Haustür ist (dort hängt die Lichterkette): -1 = Anfang, 1 = Ende, 0 = keiner. */
function frontEnd(v: View, r: RoofSpec, g: RoofGeo): -1 | 0 | 1 {
  const across = g.alongX ? range(r.z1, r.z2) : range(r.x1, r.x2);
  const door = (wall: number): boolean =>
    across.some((b) =>
      range(r.y - 14, r.y - 1).some((y) => {
        const [x, wy, z] = toWorld(g, wall, y, b);
        return baseName(v.before(x, wy, z)).endsWith('_door');
      }),
    );
  const first = door(g.alongX ? r.x1 : r.z1);
  const last = door(g.alongX ? r.x2 : r.z2);
  if (first === last) return 0;
  return first ? -1 : 1;
}

/** Lichterkette entlang der Giebelkanten über der Haustür. */
function gableLights(v: View, r: RoofSpec, g: RoofGeo): string[] {
  const end = frontEnd(v, r, g);
  if (end === 0) return [];
  const a = end < 0 ? g.a1 - 0.08 : g.a2 + 1 + 0.08;
  return ([1, 2] as const).flatMap((side) => {
    const span = Math.abs(g.center - outer(g, side, 0));
    return range(0, Math.floor((span - 0.6) / 2.6)).flatMap((k) => {
      const b = outer(g, side, 0) + sign(side) * (0.35 + k * 2.6);
      const at = toWorld(g, a, plane(g, side, b) - 0.16, b);
      const [x, y, z] = at.map(Math.floor) as unknown as [number, number, number];
      if (v.now(x, y, z) !== 'air') return [];
      return [
        blockDisplay(tags('licht'), at, GABLE_LIGHTS[k % GABLE_LIGHTS.length] ?? 'glowstone', {
          scale: [0.17, 0.17, 0.17],
          glow: true,
        }),
      ];
    });
  });
}

/** Dächer des Bauplans und der Winter-Bauten (Buden, Krippe). */
function roofs(base: Canvas, w: Canvas, v: View): string[] {
  return [...roofsOf(base), ...roofsOf(w)].flatMap((r, i) => {
    const g = geoOf(r);
    const rnd = random(4000 + i);
    const snow = ([1, 2] as const).flatMap((side) => roofSide(v, g, side));
    if (!wooden(g)) return snow;
    return [
      ...snow,
      ...([1, 2] as const).flatMap((side) => icicles(v, g, side, rnd)),
      ...gableLights(v, r, g),
    ];
  });
}

// ---------- Zäune: Schneekappen ----------

/** Schnee auf Zäunen: eine schmale Kappe über jeder geraden Zaunreihe (Pfosten und obere Latte). */
function fenceCaps(base: Canvas, w: Canvas, v: View): string[] {
  const isFence = (b: string): boolean => {
    const name = baseName(b);
    return name.endsWith('_fence') || name.endsWith('_fence_gate');
  };
  const cells = [...new Set([...base.find(isFence), ...w.find(isFence)].map(([x, y, z]) => `${x},${y},${z}`))]
    .map((k) => k.split(',').map(Number) as [number, number, number])
    .filter(([x, y, z]) => inArea(x, z) && isFence(v.now(x, y, z)) && v.now(x, y + 1, z) === 'air');
  const runs = (axis: 0 | 2): Array<{ start: [number, number, number]; length: number }> => {
    const other = axis === 0 ? 2 : 0;
    const sorted = [...cells].sort((p, q) => p[1] - q[1] || p[other] - q[other] || p[axis] - q[axis]);
    return sorted.reduce<Array<{ start: [number, number, number]; length: number }>>((acc, p) => {
      const last = acc[acc.length - 1];
      const prev = last?.start;
      const follows =
        prev && prev[1] === p[1] && prev[other] === p[other] && prev[axis] + last.length === p[axis];
      if (last && follows) last.length += 1;
      else acc.push({ start: p, length: 1 });
      return acc;
    }, []);
  };
  const long = (axis: 0 | 2): Array<{ start: [number, number, number]; length: number }> =>
    runs(axis).filter((r) => r.length > 1);
  const along = (axis: 0 | 2): string[] =>
    long(axis).flatMap(({ start: [x, y, z], length }) =>
      range(0, length - 1).map((k) => (axis === 0 ? `${x + k},${y},${z}` : `${x},${y},${z + k}`)),
    );
  const covered = new Set([...along(0), ...along(2)]);
  const cap = (x: number, y: number, z: number, sx: number, sz: number, high: number): string =>
    blockDisplay(tags('zaun'), [x, y + 1 + high / 2, z], 'snow_block', { scale: [sx, high, sz] });
  return [
    ...long(0).map(({ start: [x, y, z], length }) =>
      cap(x + (length - 1) / 2 + HALF, y, z + HALF, length - 1 + 0.32, 0.3, 0.1),
    ),
    ...long(2).map(({ start: [x, y, z], length }) =>
      cap(x + HALF, y, z + (length - 1) / 2 + HALF, 0.3, length - 1 + 0.32, 0.09),
    ),
    ...cells
      .filter((p) => !covered.has(p.join(',')))
      .map(([x, y, z]) => cap(x + HALF, y, z + HALF, 0.32, 0.32, 0.1)),
  ];
}

// ---------- Schneemänner, Schlitten ----------

/** Schlitten und Rodel: von etwas über dem Boden herab, bis die Kufen aufliegen (im Schnee). */
function aufDemBoden(world: World, at: Vec, make: (at: Vec) => string[]): string[] {
  return settleDown(world, at, make, at[1] + 0.3, at[1] - 0.4) ?? make(at);
}

function figures(world: World): string[] {
  const snowmen = SCHNEEMAENNER.flatMap(([x, z, tx, tz]) =>
    placeModel(
      tags('schneemann'),
      [x + HALF, BASE + 0.02, z + HALF],
      Math.atan2(tx - x - HALF, tz - z - HALF),
      schneemann(),
    ),
  );
  const sleds = RODEL.flatMap(([x, z, yaw, gifts]) =>
    aufDemBoden(world, [x, BASE + 0.12, z], (at) => placeModel(tags('schlitten'), at, yaw, rodel(gifts))),
  );
  // Teile nach Lage sortiert: aufeinanderfolgende kleine Teile liegen dicht beieinander (ein Modell, keine Kette)
  const sleigh = [...grosserSchlitten()].sort(
    (p, q) => p.at[0] - q.at[0] || p.at[2] - q.at[2] || p.at[1] - q.at[1],
  );
  const big = aufDemBoden(world, [SCHLITTEN.x, BASE + 0.05, SCHLITTEN.z], (at) =>
    placeModel(tags('schlitten'), at, SCHLITTEN.yaw, sleigh),
  );
  return [...snowmen, ...sleds, ...big];
}

// ---------- Berge und schnelles Aufräumen ----------

/** Würfel zu 32 Blöcken, die `keep` erlaubt (x, z ab `from`, Höhen aus FILL_LAYERS). */
function cubes(from: number, to: number, keep: (b: FillBox) => boolean): FillBox[] {
  const starts = range(0, Math.floor((to - from + 1) / FILL_STEP) - 1).map((i) => from + i * FILL_STEP);
  return pairs(starts, starts)
    .flatMap(([x, z]) =>
      FILL_LAYERS.map(([y1, y2]) => ({ x1: x, y1, z1: z, x2: x + FILL_STEP - 1, y2, z2: z + FILL_STEP - 1 })),
    )
    .filter(keep);
}

const within = (b: FillBox, x: number, y: number, z: number): boolean =>
  x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2 && z >= b.z1 && z <= b.z2;
const boxText = (b: FillBox): string => `${b.x1} ${b.y1} ${b.z1} ${b.x2} ${b.y2} ${b.z2}`;

/** Würfel ohne einen bestimmten Block im Bauplan – nur dort ist „alles X wieder zu Y“ genau. */
function cleanCubes(base: Canvas, name: string, from: number, to: number, outside: boolean): FillBox[] {
  const cell = (n: number): number => Math.floor((n - from) / FILL_STEP);
  const layer = (y: number): number => FILL_LAYERS.findIndex(([y1, y2]) => y >= y1 && y <= y2);
  const dirty = new Set(
    base.find((b) => baseName(b) === name).map(([x, y, z]) => `${cell(x)},${layer(y)},${cell(z)}`),
  );
  const inner = (b: FillBox): boolean =>
    b.x1 >= INNER.from && b.x2 <= INNER.to && b.z1 >= INNER.from && b.z2 <= INNER.to;
  return cubes(
    from,
    to,
    (b) => inner(b) !== outside && !dirty.has(`${cell(b.x1)},${layer(b.y1)},${cell(b.z1)}`),
  );
}

/** Außen über den Würfeln (ab der frühesten Schneegrenze): Gras oben wird Stelle für Stelle Schnee. */
function highMeadows(base: Canvas, w: Canvas): void {
  base
    .find((b) => b === 'grass_block')
    .filter(([x, y, z]) => y >= SNOW_LINE && !inArea(x, z) && Math.abs(x) < OUTER && Math.abs(z) < OUTER)
    .filter(([x, y, z]) => !occupies(base.get(x, y + 1, z) ?? 'air'))
    .forEach(([x, y, z]) => w.set(x, y, z, 'snow_block'));
}

// ---------- Dorfleute ----------

/** Wer so nah am Baum herumläuft, stünde unter den Zweigen. */
const UNDER_TREE = BAUM_RADIUS + 1;
/** So weit gehen sie nach außen (bleibt vor den Ständen). */
const STEP_OUT = 4;

/**
 * Dorfleute, die um den Maibaum herumlaufen, stehen im Winter unter dem Christbaum: ein Stück nach außen (weg von der
 * Mitte). Das Lobby-Plugin lässt sie danach nicht mehr unter Zweige laufen.
 */
function walkersOut(): string {
  const [x, z] = [CHRISTBAUM.x + HALF, CHRISTBAUM.z + HALF];
  return (
    `execute as @e[type=mannequin,tag=mm_walker,x=${x},y=${BASE},z=${z},distance=..${UNDER_TREE}] at @s ` +
    `facing ${x} ${BASE} ${z} run tp @s ^ ^ ^-${STEP_OUT}`
  );
}

// ---------- Alles zusammen ----------

let cached: { base: Canvas; plan: WinterPlan } | null = null;

/** Der Winter für diesen Lobby-Bauplan (einmal berechnet). */
export function winterPlan(base: Canvas): WinterPlan {
  if (cached?.base === base) return cached.plan;
  const w = new Canvas();
  const v = viewOf(base, w);
  const tree = christbaum(w, v);
  const markt = weihnachtsmarkt(w, v);
  eisbahn(w, v);
  fichtenPlaetze(v).forEach(([x, z, h]) => {
    clearPlants(w, v, x, z);
    spruce(w, x, BASE, z, h);
  });
  schneehaufen(w, v);
  snowCover(base, w, v);
  highMeadows(base, w);
  const displays = [
    ...roofs(base, w, v),
    ...fenceCaps(base, w, v),
    ...tree,
    ...markt,
    ...figures((x, y, z) => v.now(x, y, z)),
  ];
  const blocks = new Canvas();
  const restore = new Canvas();
  w.find(() => true).forEach(([x, y, z, b]) => {
    // Der Sport-Stand bringt als Skihütte seinen eigenen Schnee mit (`sportstand.ts`)
    if (inSportZone(x, y, z)) return;
    const old = v.before(x, y, z);
    if (old === b) return;
    blocks.set(x, y, z, b);
    restore.set(x, y, z, old);
  });
  // Außen: Gras wird Schneeblock (nur in Würfeln ohne Schneeblock im Bauplan – sonst wäre der Rückweg nicht genau).
  const mountains = cleanCubes(base, 'snow_block', -OUTER, OUTER - 1, true);
  // Innen: Schnee, der auf Luft liegt, geht mit einem Befehl je Würfel weg (dort hat der Bauplan keinen Schnee).
  const snowBoxes = cleanCubes(base, 'snow', INNER.from, INNER.to, false);
  const quick = new Canvas();
  restore
    .find(() => true)
    .forEach(([x, y, z, old]) => {
      const fresh = blocks.get(x, y, z) ?? '';
      const byBox = old === 'air' && baseName(fresh) === 'snow' && snowBoxes.some((b) => within(b, x, y, z));
      if (!byBox) quick.set(x, y, z, old);
    });
  const plan: WinterPlan = {
    on: [
      ...mountains.map((b) => `fill ${boxText(b)} snow_block replace grass_block strict`),
      ...blocks.commands(),
    ],
    off: [
      ...mountains.map((b) => `fill ${boxText(b)} grass_block replace snow_block strict`),
      ...snowBoxes.map((b) => `fill ${boxText(b)} air replace snow strict`),
      ...quick.commands(),
    ],
    displays,
    moves: [walkersOut()],
    blocks,
    restore,
    mountains,
    snowBoxes,
  };
  cached = { base, plan };
  return plan;
}
