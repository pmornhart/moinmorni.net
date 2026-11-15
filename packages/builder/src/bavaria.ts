/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/**
 * Bayerische Bauteile im MoinMorni-Stil (eigene Entwürfe, keine Nachbauten echter Gebäude):
 * Alpenhaus, Maibaum, Biergarten, Schloss-Teile (Flügel, Turm mit Zwiebelhaube), Portal-Bogen, Launchpad, Brunnen.
 * Alle Maße stehen als Bauplan in `D` bzw. direkt an der Stelle, an der der Bau sie braucht.
 */
import type { Canvas } from './canvas.js';
import { Frame } from './frame.js';
import { pick } from './noise.js';
import { pairs, range } from './range.js';
import { cylinder, discAt, gableRoof, lathe, slab, stairs, STEP, YAW, type Facing } from './shapes.js';
import { furnish, signText, type RoomKind } from './village.js';
import { roundTree } from './nature.js';
import { MOEBEL, MOEBEL_BODEN } from './furniture.js';
import { hollowWing, rotunda, type WingKind } from './schloss.js';

const D = {
  floor: 4,
  windowGap: 3,
  windowFrom: 2,
  windowHigh: 2,
  balconyDepth: 1,
  eaves: 2,
  poleBand: 2,
  armLen: 3,
  wreathR: 2,
  ribbon: 2,
  crown: 3,
  firstArm: 9,
  armStep: 4,
  tableLen: 5,
  tableGap: 4,
  bench: 1,
  /** Anteil der Biertisch-Stücke mit Krügen darauf. */
  mugChance: 0.55,
  domeTip: 3,
  pilasterGap: 4,
  storey: 5,
  archW: 7,
  archH: 7,
  npcAhead: 2.5,
  textUp: 1.6,
  half: 0.5,
  centre: 3,
  signAhead: 0.52,
  signY: 3.12,
  signScale: 0.8,
} as const;

const WALL_PLASTER = ['calcite', 'calcite', 'white_concrete', 'calcite'] as const;
/** Sockel unten ums Haus (Bruchstein, etwas Moos). */
const PLINTH = ['stone_bricks', 'stone_bricks', 'cobblestone', 'mossy_stone_bricks', 'andesite'] as const;
/** Blumen am Fenster: Geranien-Rot überwiegt, wie an echten Alpenhäusern. */
const WINDOW_FLOWERS = [
  'potted_red_tulip',
  'potted_poppy',
  'potted_red_tulip',
  'potted_pink_tulip',
  'potted_poppy',
  'potted_allium',
  'potted_orange_tulip',
] as const;
/** Ab dieser Breite (u bis w) passt ein Kamin neben den First. */
const CHIMNEY_MIN_W = 6;

export interface HouseSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly front: Facing;
  readonly width: number;
  readonly depth: number;
  readonly floors: number;
  readonly rnd: () => number;
  readonly roof?: string;
  readonly shutter?: string;
  readonly wood?: string;
  /** Mit Einrichtung (begehbar, Leiter nach oben); ohne bleibt das Haus innen voll. */
  readonly interior?: RoomKind;
  /** Schild über der Tür, z. B. „Bäckerei“. */
  readonly sign?: string;
}

/** Alpenhaus: weißer Putz unten, Holz oben, Giebel nach vorne, Balkon mit Blumen, Fensterläden. */
export function alpineHouse(c: Canvas, h: HouseSpec): void {
  const f = new Frame(c, h.x, h.y, h.z, h.front);
  const wood = h.wood ?? 'spruce';
  const roof = h.roof ?? 'dark_oak';
  const shutter = `${h.shutter ?? 'waxed_oxidized_copper'}_trapdoor`;
  const w = h.width - 1;
  const d = h.depth - 1;
  const top = h.floors * D.floor;
  f.fill(0, 0, 0, w, 0, d, 'stone_bricks');
  pairs(range(0, w), range(0, d))
    .filter(([u, v]) => u === 0 || v === 0 || u === w || v === d)
    .forEach(([u, v]) =>
      range(1, top).forEach((y) => {
        const upper = y > D.floor && h.floors > 1;
        f.set(u, y, v, upper ? `${wood}_planks` : pick(h.rnd, WALL_PLASTER));
      }),
    );
  if (h.interior) hollowOut(f, h, w, d, top, wood);
  else f.fill(1, 1, 1, w - 1, top, d - 1, `${wood}_planks`);
  pairs(range(0, w), range(0, d))
    .filter(([u, v]) => u === 0 || v === 0 || u === w || v === d)
    .forEach(([u, v]) => f.set(u, 1, v, pick(h.rnd, PLINTH)));
  [0, w].forEach((u) => [0, d].forEach((v) => f.fill(u, 1, v, u, top, v, `stripped_${wood}_log`)));
  range(0, h.floors - 1).forEach((fl) =>
    f.fill(
      0,
      (fl + 1) * D.floor,
      -0,
      w,
      (fl + 1) * D.floor,
      0,
      `stripped_${wood}_log[axis=${f.frontAxis()}]`,
    ),
  );
  const pane = `glass_pane[${f.dir('left')}=true,${f.dir('right')}=true]`;
  const windowsAt = range(1, w - 1).filter((u) => u % D.windowGap === 1 && u + 1 < w);
  range(0, h.floors - 1).forEach((fl) => {
    const y0 = fl * D.floor + D.windowFrom;
    windowsAt.forEach((u) => {
      if (fl === 0 && Math.abs(u - w / 2) < 1) return;
      f.fill(u, y0, 0, u, y0 + D.windowHigh - 1, 0, pane);
      range(y0, y0 + D.windowHigh - 1).forEach((y) => {
        f.set(u - 1, y, -1, `${shutter}[facing=${f.dir('back')},open=true,half=top]`);
        f.set(u + 1, y, -1, `${shutter}[facing=${f.dir('back')},open=true,half=top]`);
      });
      // Fensterbank (schmales Brett) mit einem Blumentopf davor
      f.set(u, y0 - 1, -1, `${wood}_trapdoor[facing=${f.dir('back')},half=top,open=false]`);
      f.soft(u, y0, -1, pick(h.rnd, WINDOW_FLOWERS));
    });
  });
  const door = Math.floor(w / 2);
  f.set(door, 1, 0, `${wood}_door[facing=${f.dir('front')},half=lower,hinge=left]`);
  f.set(door, 2, 0, `${wood}_door[facing=${f.dir('front')},half=upper,hinge=left]`);
  if (h.sign) {
    [door - 1, door + 1].forEach((u) => f.set(u, D.floor - 1, -1, 'lantern'));
    const [sx, , sz] = f.at(door, 0, 0);
    const [fx, fz] = STEP[h.front];
    signText(
      c,
      sx + D.half + fx * D.signAhead,
      h.y + D.signY,
      sz + D.half + fz * D.signAhead,
      h.front,
      [{ text: h.sign, color: 'gold', bold: true }],
      D.signScale,
    );
  } else f.set(door, D.floor - 1, -1, 'lantern');
  if (h.interior) furnish(f, { kind: h.interior, w, d, floors: h.floors, storey: D.floor, wood, door });
  if (h.floors > 1) {
    const by = D.floor + 1;
    f.fill(0, D.floor, -D.balconyDepth, w, D.floor, -D.balconyDepth, slab(wood, 'top'));
    f.fill(
      0,
      by,
      -D.balconyDepth,
      w,
      by,
      -D.balconyDepth,
      `${wood}_fence[${f.dir('left')}=true,${f.dir('right')}=true]`,
    );
    // Blumentöpfe auf dem Geländer – nur wo kein Fensterladen ist
    range(0, w)
      .filter((u) => u % 2 === 0)
      .forEach((u) => f.soft(u, by + 1, -D.balconyDepth, pick(h.rnd, WINDOW_FLOWERS)));
  }
  houseBench(f, w, door, windowsAt, wood);
  const [x1, , z1] = f.at(0, 0, 0);
  const [x2, , z2] = f.at(w, 0, d);
  gableRoof(c, {
    x1: Math.min(x1, x2),
    z1: Math.min(z1, z2),
    x2: Math.max(x1, x2),
    z2: Math.max(z1, z2),
    y: h.y + top + 1,
    along: f.frontAxis() === 'x' ? 'z' : 'x',
    material: roof,
    gable: `${wood}_planks`,
    overhang: 1,
    eaves: D.eaves,
  });
  // Laternen unter dem Dachvorsprung an beiden Ecken
  [0, w].forEach((u) => f.set(u, top, -1, 'lantern[hanging=true]'));
  if (w >= CHIMNEY_MIN_W) chimney(f, w, d, top);
}

/** Kamin aus Ziegeln rechts neben dem First, oben ein Lagerfeuer – es raucht. */
function chimney(f: Frame, w: number, d: number, top: number): void {
  const u = w - 2;
  const v = Math.floor((d * 2) / 3);
  // Dachfläche bei u: unterste Reihe liegt bei u = w + 1 auf top + 1, jede Reihe nach innen eins höher
  const roofY = top + 1 + (w + 1 - u);
  range(top + 1, roofY + 1).forEach((y) => f.set(u, y, v, 'bricks'));
  f.set(u, roofY + 2, v, 'campfire[lit=true,signal_fire=false]');
}

/** Hausbank an der Vorderwand: zwei Treppen, Lehne zur Wand, wo weder Tür noch Fensterbank ist. */
function houseBench(f: Frame, w: number, door: number, windowsAt: readonly number[], wood: string): void {
  const busy = new Set([...windowsAt, door - 1, door, door + 1]);
  const spot = range(1, w - 2)
    .filter((u) => !busy.has(u) && !busy.has(u + 1))
    .sort((a, b) => Math.abs(a - door) - Math.abs(b - door))[0];
  if (spot === undefined) return;
  [spot, spot + 1].forEach((u) => f.soft(u, 1, -1, `${wood}_stairs[facing=${f.dir('back')},half=bottom]`));
}

/** Innen hohl: Dielen, Decken je Stockwerk, Leiter hinten rechts, Fenster an Seiten und Rückwand. */
function hollowOut(f: Frame, h: HouseSpec, w: number, d: number, top: number, wood: string): void {
  f.fill(1, 0, 1, w - 1, 0, d - 1, `${wood}_planks`);
  f.fill(1, 1, 1, w - 1, top - 1, d - 1, 'air');
  range(1, h.floors).forEach((fl) =>
    f.fill(1, fl * D.floor, 1, w - 1, fl * D.floor, d - 1, `${wood}_planks`),
  );
  range(1, (h.floors - 1) * D.floor + 1).forEach((y) =>
    f.set(w - 1, y, d - 1, `ladder[facing=${f.dir('front')}]`),
  );
  const sidePane = `glass_pane[${f.dir('front')}=true,${f.dir('back')}=true]`;
  const backPane = `glass_pane[${f.dir('left')}=true,${f.dir('right')}=true]`;
  range(0, h.floors - 1).forEach((fl) => {
    const y0 = fl * D.floor + D.windowFrom;
    range(2, d - 2)
      .filter((v) => v % D.windowGap === 2)
      .forEach((v) => [0, w].forEach((u) => f.fill(u, y0, v, u, y0 + D.windowHigh - 1, v, sidePane)));
    range(1, w - 2)
      .filter((u) => u % D.windowGap === 1)
      .forEach((u) => f.fill(u, y0, d, u, y0 + D.windowHigh - 1, d, backPane));
  });
}

/** Maibaum: weiß-blau gestreift, Kranz mit Bändern, Zunftarme mit Fahnen, grüne Spitze. */
export function maypole(c: Canvas, x: number, y: number, z: number, height: number): void {
  pairs(range(x - 1, x + 1), range(z - 1, z + 1)).forEach(([px, pz]) =>
    c.set(px, y, pz, 'polished_andesite'),
  );
  range(y + 1, y + height).forEach((py) =>
    c.set(x, py, z, Math.floor((py - y) / D.poleBand) % 2 === 0 ? 'white_concrete' : 'light_blue_concrete'),
  );
  range(0, Math.floor((height - D.firstArm - D.crown * 2) / D.armStep)).forEach((i) => {
    const ay = y + D.firstArm + i * D.armStep;
    const alongX = i % 2 === 0;
    range(1, D.armLen).forEach((s) =>
      [-1, 1].forEach((sign) => {
        const [ax, az] = alongX ? [x + s * sign, z] : [x, z + s * sign];
        c.set(ax, ay, az, `dark_oak_fence[${alongX ? 'east=true,west=true' : 'north=true,south=true'}]`);
        if (s === D.armLen) {
          c.set(ax, ay - 1, az, i % 2 === 0 ? 'light_blue_wool' : 'white_wool');
          c.set(ax, ay - 2, az, 'lantern[hanging=true]');
        }
      }),
    );
  });
  const wy = y + height - D.crown * 2;
  discAt(c, x, wy, z, D.wreathR, 'spruce_leaves[persistent=true]');
  c.set(x, wy, z, 'white_concrete');
  [
    [D.wreathR, 0],
    [-D.wreathR, 0],
    [0, D.wreathR],
    [0, -D.wreathR],
  ].forEach(([dx = 0, dz = 0], i) =>
    range(1, D.ribbon).forEach((r) =>
      c.set(x + dx, wy - r, z + dz, i % 2 === 0 ? 'light_blue_wool' : 'white_wool'),
    ),
  );
  lathe(c, x, y + height + 1, z, [2, 2, 1, 1, 0], 'spruce_leaves[persistent=true]');
}

/** Biergarten: Kies, Kastanien, lange Tische mit Bänken, Lampions, Ausschank mit weiß-blauer Markise. */
/** 1 bis 4 Krüge auf einem Tischstück. */
function mugCount(rnd: () => number): 1 | 2 | 3 | 4 {
  const MUGS = [1, 2, 3, 4] as const;
  return MUGS[Math.floor(rnd() * MUGS.length)] ?? 1;
}

export function biergarten(
  c: Canvas,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
  rnd: () => number,
): void {
  pairs(range(x1, x2), range(z1, z2)).forEach(([x, z]) =>
    c.set(x, y, z, rnd() < 0.85 ? 'gravel' : 'coarse_dirt'),
  );
  const rows = range(z1 + 2, z2 - 2).filter((z) => (z - z1 - 2) % D.tableGap === 0);
  const cols = range(x1 + 2, x2 - D.tableLen - 1).filter((x) => (x - x1 - 2) % (D.tableLen + 3) === 0);
  // Bierbank und Biertisch aus dem Ressourcenpaket; unter den Bänken Kies (das Modell zeichnet ihn mit).
  pairs(cols, rows).forEach(([tx, tz]) => {
    range(tx, tx + D.tableLen - 1).forEach((x) => {
      c.set(x, y + 1, tz, MOEBEL.biertisch);
      [tz - D.bench, tz + D.bench].forEach((bz) => {
        c.set(x, y, bz, MOEBEL_BODEN.biergarten);
        c.set(x, y + 1, bz, MOEBEL.bierbank);
      });
      if (rnd() < D.mugChance) c.set(x, y + 2, tz, MOEBEL.krug(mugCount(rnd)));
    });
  });
  const trees = pairs(range(x1, x2), range(z1, z2)).filter(
    ([x, z]) => (x - x1) % 9 === 0 && (z - z1) % 9 === 0 && x > x1 && z > z1 && x < x2 && z < z2,
  );
  trees.forEach(([x, z]) => {
    c.set(x, y, z, 'grass_block');
    roundTree(c, x, y + 1, z, { height: 11, radius: 4.5, log: 'dark_oak_log', leaves: 'oak_leaves', rnd });
  });
  range(x1 + 1, x2 - 1)
    .filter((x) => x % 3 === 0)
    .forEach((x) => rows.forEach((z) => c.set(x, y + 6, z, 'lantern[hanging=true]')));
  range(x1 + 1, x2 - 1).forEach((x) => rows.forEach((z) => c.soft(x, y + 7, z, 'iron_chain[axis=x]')));
  const bx = x2 - 6;
  const bz = z1 - 1;
  range(bx, bx + 5).forEach((x) => {
    range(y + 1, y + 3).forEach((yy) => c.set(x, yy, bz - 2, 'spruce_planks'));
    c.set(x, y + 1, bz, x % 2 === 0 ? 'barrel[facing=up]' : slab('spruce', 'top'));
    c.set(x, y + 4, bz - 1, x % 2 === 0 ? 'white_wool' : 'light_blue_wool');
    c.set(x, y + 4, bz, x % 2 === 0 ? 'white_wool' : 'light_blue_wool');
    c.set(x, y + 4, bz - 2, x % 2 === 0 ? 'white_wool' : 'light_blue_wool');
  });
}

/** Rundturm mit weißer Wand, Gold-Gesims und grüner Zwiebelhaube mit goldener Spitze. */
export function onionTower(c: Canvas, cx: number, y: number, cz: number, r: number, height: number): void {
  cylinder(c, cx, cz, y, y + height, r, 'white_concrete');
  cylinder(c, cx, cz, y, y + 1, r, 'stone_bricks');
  discAt(c, cx, y + height, cz, r + 1, 'smooth_quartz');
  range(0, Math.floor(height / D.storey) - 1).forEach((i) => {
    const wy = y + D.centre + i * D.storey;
    [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ].forEach(([dx = 0, dz = 0]) => {
      c.set(cx + dx, wy, cz + dz, 'light_blue_stained_glass');
      c.set(cx + dx, wy + 1, cz + dz, 'light_blue_stained_glass');
    });
  });
  const dome = y + height + 1;
  const bulb = [r, r + 1, r + 1, r + 1, r, r - 1, r - 2, Math.max(1, r - 3), 1, 1].map((v) => Math.max(0, v));
  lathe(c, cx, dome, cz, bulb, 'waxed_oxidized_copper');
  range(dome + bulb.length, dome + bulb.length + D.domeTip - 1).forEach((ty) =>
    c.set(cx, ty, cz, 'gold_block'),
  );
  c.set(cx, dome + bulb.length + D.domeTip, cz, 'lightning_rod');
}

export interface WingSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly front: Facing;
  readonly width: number;
  readonly depth: number;
  readonly storeys: number;
  /** Innen hohl und eingerichtet (begehbar); ohne bleibt der Flügel massiv. */
  readonly interior?: WingKind;
}

/** Schlossflügel: weiße Fassade mit Pilastern, hohe Fenster, Gold-Gesims, grünes Kupferdach. */
export function palaceWing(c: Canvas, s: WingSpec): void {
  const f = new Frame(c, s.x, s.y, s.z, s.front);
  const w = s.width - 1;
  const d = s.depth - 1;
  const top = s.storeys * D.storey;
  f.fill(0, 0, 0, w, top, d, 'white_concrete');
  f.fill(0, 0, 0, w, 1, d, 'stone_bricks');
  const pane = `light_blue_stained_glass_pane[${f.dir('left')}=true,${f.dir('right')}=true]`;
  range(0, w).forEach((u) => {
    const pilaster = u % D.pilasterGap === 0;
    if (pilaster) f.fill(u, 2, -1, u, top, -1, 'quartz_pillar');
    range(0, s.storeys - 1).forEach((st) => {
      const wy = st * D.storey + D.centre;
      if (!pilaster && u % D.pilasterGap === 2) {
        f.fill(u, wy, 0, u, wy + 2, 0, pane);
        f.set(u, wy + D.centre, -1, 'gold_block');
        f.set(u, wy - 1, -1, stairs('quartz', f.dir('back'), 'top'));
      }
    });
  });
  f.fill(-1, top, -1, w + 1, top, d + 1, 'smooth_quartz');
  f.fill(-1, top + 1, -2, w + 1, top + 1, -2, stairs('quartz', f.dir('back')));
  const [x1, , z1] = f.at(0, 0, 0);
  const [x2, , z2] = f.at(w, 0, d);
  gableRoof(c, {
    x1: Math.min(x1, x2),
    z1: Math.min(z1, z2),
    x2: Math.max(x1, x2),
    z2: Math.max(z1, z2),
    y: s.y + top + 1,
    along: f.frontAxis(),
    material: 'waxed_oxidized_cut_copper',
    gable: 'white_concrete',
    overhang: 1,
    eaves: 0,
  });
  const door = Math.floor(w / 2);
  if (s.interior) hollowWing(c, f, s.interior, w, d, top);
  f.fill(door - 1, 2, 0, door + 1, 5, 0, 'air');
  f.fill(door - 2, 6, -1, door + 2, 6, -1, 'gold_block');
  f.set(door, 7, -1, 'emerald_block');
}

export interface PortalSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly front: Facing;
  /** Farbe des Schleiers und der Wimpel (z. B. „lime“, „orange“). */
  readonly colour: string;
  readonly name: string;
  readonly line: string;
  /** Figur (NPC) seitlich vor dem Portal. */
  readonly npc?: boolean;
}

/**
 * Portal-Bogen (9 breit, 11 hoch): Stufen-Sockel, Quarz-Säulen mit Gold-Kapitell und Laterne, runder Bogen mit
 * Gold-Schlussstein, Smaragd-Krone, farbiger Schleier und Wimpel in der Modus-Farbe, Name + Status groß darüber.
 * (x, y, z) = vorne links unten; der Bogen ist 9 Blöcke breit.
 */
export function portalArch(c: Canvas, p: PortalSpec): void {
  const f = new Frame(c, p.x, p.y, p.z, p.front);
  f.fill(-2, 0, -3, 10, 0, 2, 'polished_andesite');
  f.fill(-1, 0, -4, 9, 0, -4, stairs('polished_andesite', f.dir('back')));
  f.fill(3, 0, -3, 5, 0, -1, 'gold_block');
  f.set(4, 0, -2, 'emerald_block');
  f.fill(-2, 0, -3, 10, 0, -3, 'chiseled_stone_bricks');
  [0, 8].forEach((u) => {
    f.set(u, 1, 0, 'chiseled_quartz_block');
    f.fill(u, 2, 0, u, 7, 0, 'quartz_pillar');
    f.set(u, 8, 0, 'chiseled_quartz_block');
    f.set(u, 9, 0, 'gold_block');
    f.set(u, 10, 0, 'lantern');
    f.set(u, 6, -1, `${p.colour}_wall_banner[facing=${f.dir('front')}]`);
  });
  [1, 7].forEach((u) => f.fill(u, 1, 0, u, 8, 0, 'smooth_quartz'));
  f.fill(1, 8, 0, 7, 8, 0, 'smooth_quartz');
  f.set(2, 7, 0, stairs('quartz', f.dir('right'), 'top'));
  f.set(6, 7, 0, stairs('quartz', f.dir('left'), 'top'));
  f.fill(2, 9, 0, 6, 9, 0, slab('smooth_quartz'));
  f.set(4, 8, 0, 'gold_block');
  f.set(4, 9, 0, 'emerald_block');
  f.set(4, 10, 0, 'gold_block');
  const veil = `${p.colour}_stained_glass_pane[${f.dir('left')}=true,${f.dir('right')}=true]`;
  f.fill(2, 1, 0, 6, 6, 0, veil);
  f.fill(3, 7, 0, 5, 7, 0, veil);
  f.fill(1, 0, 1, 7, 0, 1, 'polished_andesite');
  const [tx, ty, tz] = f.at(4, 11.6, -D.half);
  const yaw = YAW[p.front];
  c.extra.push(
    `summon text_display ${tx + D.half} ${ty} ${tz + D.half} {billboard:'fixed',Rotation:[${yaw}f,0f],text:[{text:'${p.name}\\n',color:'gold',bold:true},{text:'${p.line}',color:'green'}],background:0,shadow:true,transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[2.2f,2.2f,2.2f]}}`,
  );
  if (p.npc) {
    const [nx, ny, nz] = f.at(-1, 1, -2);
    c.extra.push(
      `summon mannequin ${nx + D.half} ${ny} ${nz + D.half} {Rotation:[${yaw}f,0f],immovable:true}`,
    );
  }
}

export interface CastleSpec {
  /** Mitte der Vorderkante der Bastei. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly front: Facing;
  /** Wie tief die Bastei-Mauer nach unten reicht. */
  readonly wallDrop: number;
  readonly rnd: () => number;
}

/**
 * Schloss: Bastei mit Zinnen, Freitreppe, Ehrenhof mit Brunnen und Beeten, Hauptflügel mit großer Mittelkuppel,
 * zwei Seitenflügel, sechs Türme mit Zwiebelhauben, Wimpel in Weiß-Blau. Eigener Entwurf.
 */
export function castle(c: Canvas, s: CastleSpec): void {
  const f = new Frame(c, s.x, s.y, s.z, s.front);
  const W = 31;
  const DEPTH = 62;
  f.fill(-W, 0, 0, W, 0, DEPTH, 'polished_andesite');
  pairs(range(-W, W), range(0, DEPTH))
    .filter(([u, v]) => u === -W || u === W || v === 0 || v === DEPTH)
    .forEach(([u, v]) => {
      f.fill(u, -s.wallDrop, v, u, 0, v, s.rnd() < 0.15 ? 'mossy_stone_bricks' : 'stone_bricks');
      f.set(u, 1, v, (u + v) % 2 === 0 ? 'stone_brick_wall' : 'air');
    });
  f.fill(-4, 1, 0, 4, 1, 0, 'air');
  range(1, s.wallDrop).forEach((i) => f.fill(-4, -i, -i, 4, -i, -i, stairs('stone_brick', f.dir('back'))));
  range(1, s.wallDrop).forEach((i) => f.fill(-4, -i - 1, -i, 4, -i - 1, -i, 'stone_bricks'));
  [-5, 5].forEach((u) => {
    f.fill(u, -s.wallDrop, -s.wallDrop, u, 0, 0, 'stone_bricks');
    f.set(u, 1, 0, 'gold_block');
    f.set(u, 2, 0, 'lantern');
  });
  // Ehrenhof: Kies-Wege, Beete, Brunnen
  pairs(range(-18, 18), range(3, 30)).forEach(([u, v]) => {
    const pathTile = Math.abs(u) <= 2 || v === 16;
    f.set(u, 0, v, pathTile ? 'gravel' : 'grass_block');
    if (!pathTile && (Math.abs(u) === 5 || Math.abs(u) === 16 || v === 4 || v === 29))
      f.set(u, 1, v, 'azalea_leaves[persistent=true]');
    else if (!pathTile && (u + v) % 3 === 0)
      f.set(u, 1, v, pick(s.rnd, ['red_tulip', 'white_tulip', 'cornflower', 'allium', 'oxeye_daisy']));
  });
  const [fx, fy, fz] = f.at(0, 0, 16);
  fountain(c, fx, fy, fz, 4);
  // Seitenflügel (Fronten zum Hof), Hauptflügel hinten
  palaceWing(c, {
    ...wingOrigin(f, -W + 2, 1, 31, 'right'),
    width: 31,
    depth: 11,
    storeys: 2,
    interior: 'bibliothek',
  });
  palaceWing(c, {
    ...wingOrigin(f, W - 2, 1, 31, 'left'),
    width: 31,
    depth: 11,
    storeys: 2,
    interior: 'rittersaal',
  });
  const [mx, my, mz] = f.at(-W + 2, 1, 33);
  palaceWing(c, {
    x: mx,
    y: my,
    z: mz,
    front: f.dir('front'),
    width: 2 * W - 3,
    depth: 15,
    storeys: 3,
    interior: 'festsaal',
  });
  // Mittelkuppel über dem Hauptflügel
  const [dx, dy, dz] = f.at(0, 1, 40);
  cylinder(c, dx, dz, dy + 15, dy + 23, 8, 'white_concrete');
  range(0, 7).forEach((i) => {
    const a = (i / 8) * Math.PI * 2;
    const wx = Math.round(dx + Math.cos(a) * 8);
    const wz = Math.round(dz + Math.sin(a) * 8);
    c.set(wx, dy + 18, wz, 'light_blue_stained_glass');
    c.set(wx, dy + 19, wz, 'light_blue_stained_glass');
    c.set(wx, dy + 20, wz, 'light_blue_stained_glass');
  });
  discAt(c, dx, dy + 24, dz, 9, 'smooth_quartz');
  lathe(c, dx, dy + 25, dz, [8, 9, 9, 9, 8, 8, 7, 6, 5, 4, 3, 2, 1, 1], 'waxed_oxidized_copper');
  range(dy + 39, dy + 41).forEach((ty) => c.set(dx, ty, dz, 'gold_block'));
  c.set(dx, dy + 42, dz, 'lightning_rod');
  // Innen: Rotunde unter der Kuppel mit Brunnen (Festsaal-Boden liegt eine Reihe über dem Flügel-Ursprung)
  rotunda(c, dx, dz, dy + 1, dy + 24);
  fountain(c, dx, dy + 1, dz, 3);
  // Türme: vier am Hauptflügel, zwei vorne an den Seitenflügeln
  [
    [-W + 1, 33],
    [W - 1, 33],
    [-W + 1, 48],
    [W - 1, 48],
    [-W + 1, 2],
    [W - 1, 2],
  ].forEach(([u = 0, v = 0], i) => {
    const [tx, ty, tz] = f.at(u, 1, v);
    onionTower(c, tx, ty, tz, 5, i < 4 ? 30 : 22);
    c.set(tx, ty + (i < 4 ? 30 : 22) + 1, tz, 'white_banner');
  });
}

/** Ursprung eines Seitenflügels, dessen Vorderseite zur Hofmitte zeigt. */
function wingOrigin(
  f: Frame,
  u: number,
  y: number,
  v: number,
  face: 'left' | 'right',
): { x: number; y: number; z: number; front: Facing } {
  const [x, wy, z] = f.at(u, y, v);
  return { x, y: wy, z, front: f.dir(face) };
}

/** Dorfkapelle: weißes Schiff, Satteldach, Turm mit grüner Zwiebelhaube und goldener Kugel. */
export function chapel(c: Canvas, x: number, y: number, z: number, front: Facing): void {
  const f = new Frame(c, x, y, z, front);
  f.fill(0, 0, 0, 8, 0, 14, 'stone_bricks');
  pairs(range(0, 8), range(0, 14))
    .filter(([u, v]) => u === 0 || u === 8 || v === 0 || v === 14)
    .forEach(([u, v]) => f.fill(u, 1, v, u, 6, v, 'white_concrete'));
  f.fill(1, 1, 1, 7, 6, 13, 'oak_planks');
  [3, 7, 11].forEach((v) => [0, 8].forEach((u) => f.fill(u, 3, v, u, 5, v, 'yellow_stained_glass')));
  f.set(4, 1, 0, `spruce_door[facing=${f.dir('front')},half=lower]`);
  f.set(4, 2, 0, `spruce_door[facing=${f.dir('front')},half=upper]`);
  const [ax, , az] = f.at(0, 0, 0);
  const [bx, , bz] = f.at(8, 0, 14);
  gableRoof(c, {
    x1: Math.min(ax, bx),
    z1: Math.min(az, bz),
    x2: Math.max(ax, bx),
    z2: Math.max(az, bz),
    y: y + 7,
    along: f.frontAxis() === 'x' ? 'z' : 'x',
    material: 'dark_oak',
    gable: 'white_concrete',
    overhang: 1,
    eaves: 1,
  });
  f.fill(2, 0, -5, 6, 16, -1, 'white_concrete');
  f.fill(3, 10, -5, 5, 12, -5, 'air');
  f.set(4, 11, -5, 'bell[attachment=ceiling]');
  f.fill(1, 17, -6, 7, 17, 0, 'smooth_quartz');
  const [tx, ty, tz] = f.at(4, 18, -3);
  lathe(c, tx, ty, tz, [3, 3, 3, 2, 1, 1, 0], 'waxed_oxidized_copper');
  c.set(tx, ty + 7, tz, 'gold_block');
  c.set(tx, ty + 8, tz, 'lightning_rod');
  f.set(4, 1, -6, `spruce_door[facing=${f.dir('front')},half=lower]`);
  f.set(4, 2, -6, `spruce_door[facing=${f.dir('front')},half=upper]`);
}

/** Launchpad: Gold-Druckplatte auf Smaragd mit Rahmen. */
export function launchpad(c: Canvas, x: number, y: number, z: number): void {
  pairs(range(x - 1, x + 1), range(z - 1, z + 1)).forEach(([px, pz]) => c.set(px, y, pz, 'gold_block'));
  c.set(x, y, z, 'emerald_block');
  c.set(x, y + 1, z, 'light_weighted_pressure_plate');
}

/** Brunnen: achteckiges Becken mit Säule und Schale. */
export function fountain(c: Canvas, x: number, y: number, z: number, r: number): void {
  discAt(c, x, y, z, r, 'polished_andesite');
  discAt(c, x, y + 1, z, r, 'stone_brick_wall');
  discAt(c, x, y + 1, z, r - 1, 'water');
  range(y + 1, y + D.centre).forEach((py) => c.set(x, py, z, 'quartz_pillar'));
  discAt(c, x, y + D.centre + 1, z, 1, 'smooth_quartz_slab');
  c.set(x, y + D.centre + 1, z, 'water');
}
