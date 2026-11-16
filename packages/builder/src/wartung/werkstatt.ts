/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the scene needs them */
/**
 * Die Wartungs-Lobby: eine kleine Alm im Talkessel, ringsum Berge. Vorne der Aushang „Wartungsarbeiten – gleich
 * geht's weiter“ (de/en, darunter der Text aus dem Panel), dahinter die offene Bergwerkstatt mit Schmied und
 * Schreiner, rechts eine Baustelle mit Gerüst, Kran und Absperrung, daneben Brotzeit am Lagerfeuer, links ein kleiner
 * Sprung-Parcours über Heuballen, Fässer und Stämme hinauf zur Glocke. Alles eigene Entwürfe, nur Minecraft-Blöcke.
 *
 * Die Welt ist flach (Gras auf y = 64, siehe `WARTUNG_GENERATOR`) – wenig Arbeitsspeicher, nichts muss erst
 * erzeugt werden. Die Punkte, die das Wartungs-Plugin braucht (Ankunft, Parcours), stehen in `WARTUNG_POINTS`.
 */
import { Canvas } from '../canvas.js';
import { lobbyTags } from '../lobby-tags.js';
import { fbm, pick, random } from '../noise.js';
import { GROUND, meadow, roundTree, spruce, terrain } from '../nature.js';
import { disc, range } from '../range.js';
import { gableRoof, stairs, type Facing } from '../shapes.js';
import { npc, signText, type TextPart } from '../village.js';
import { forest, lampPost, mountains } from '../lobby/common.js';
import type { LobbyPoint, LobbyView } from '../lobby/features.js';

const G = GROUND;
const SEED = 4711;
/** Talkessel: innen flach, ab `INNER` steigen die Berge an. */
const INNER = 36;
const OUTER = 64;
const PEAK = 42;
/** So weit reicht die gebaute Fläche (dahinter flaches Gras, von den Bergen verdeckt). */
export const WARTUNG_RADIUS = 72;
/** Weltgrenze (Seitenlänge): man bleibt im Talkessel. */
export const WARTUNG_BORDER = 78;

/** Flache Welt: Grundgestein, Stein, Erde, Gras auf y = 64 (wie die Grundwelt der Lobby), Biom Alm. */
export const WARTUNG_GENERATOR = {
  layers: [
    { block: 'minecraft:bedrock', height: 1 },
    { block: 'minecraft:stone', height: 124 },
    { block: 'minecraft:dirt', height: 3 },
    { block: 'minecraft:grass_block', height: 1 },
  ],
  biome: 'minecraft:meadow',
  features: false,
  lakes: false,
  structure_overrides: [],
} as const;

/** Blickrichtung von a nach b (Minecraft: yaw 0 = Süden, 90 = Westen, 180 = Norden). */
function look(from: LobbyPoint, at: LobbyPoint): LobbyView {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const dz = at.z - from.z;
  const yaw = Math.round((Math.atan2(-dx, dz) * 180) / Math.PI);
  const pitch = Math.round((-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI);
  return { ...from, yaw, pitch };
}

const p = (x: number, y: number, z: number): LobbyPoint => ({ x, y, z });

/** Ein Sprung des Parcours: Block, auf dem man landet. */
interface Step extends LobbyPoint {
  readonly block: string;
}

const HAY = 'hay_block[axis=y]';
const BARREL = 'barrel[facing=up]';
const LOG = 'stripped_spruce_log[axis=y]';

/**
 * Sprung-Parcours im Westen: von der Startplatte über Heuballen, Fässer und Stämme hinauf zur Plattform mit der Glocke.
 * Nur einfache Sprünge: 2 Blöcke vor und 1 hoch, oder 3 Blöcke vor auf gleicher Höhe.
 */
const PARKOUR_STEPS: readonly Step[] = [
  { x: -12, y: G + 1, z: 15, block: HAY },
  { x: -15, y: G + 1, z: 15, block: BARREL },
  { x: -17, y: G + 2, z: 15, block: HAY },
  { x: -20, y: G + 2, z: 15, block: LOG },
  { x: -20, y: G + 3, z: 13, block: HAY },
  { x: -20, y: G + 3, z: 10, block: BARREL },
  { x: -20, y: G + 4, z: 8, block: LOG },
  { x: -20, y: G + 4, z: 5, block: HAY },
  { x: -18, y: G + 5, z: 5, block: BARREL },
  { x: -15, y: G + 5, z: 5, block: LOG },
  { x: -15, y: G + 6, z: 3, block: HAY },
];
/** Plattform am Ende (3 × 3) mit Zielplatte und Glocke. */
const PARKOUR_TOP = p(-15, G + 6, 0);

/** Punkte für das Wartungs-Plugin (schickt der Hub mit dem Zustand der Wartungs-Lobby). */
export const WARTUNG_POINTS = {
  /** Ankunft: vor dem Aushang, Blick auf Aushang und Werkstatt. */
  spawn: look(p(0.5, G + 1, 18.5), p(0.5, G + 3.5, 8)),
  /** Startplatte (leichte Druckplatte) und Zielplatte (schwere) des Parcours. */
  parkourStart: p(-10, G + 1, 15),
  parkourFinish: p(PARKOUR_TOP.x, PARKOUR_TOP.y + 1, PARKOUR_TOP.z),
  /** Unter dieser Höhe zählt ein Versuch als runtergefallen. */
  parkourFloor: G + 1,
} as const;

/** Tag des Textes unter dem Aushang: das Plugin schreibt dort den Text aus dem Panel hinein. */
export const WARTUNG_TEXT_TAG = 'mm_wartung_text';

/** Aussichtspunkte für Bilder: Name, Kamera, Blickziel. */
export const WARTUNG_VIEWS = [
  '1-ankunft 0.5 66.6 21.5 @ 0.5 67 4',
  '2-aushang 0.5 66.4 12.5 @ 0.5 67.2 8',
  '3-werkstatt -1.5 66.8 -2 @ 0 66 -13',
  '4-baustelle 9 67 6 @ 17 69 -4',
  '5-parcours -6 67 20 @ -17 69 6',
  '6-von-oben 26 92 34 @ 0 66 -2',
];

function snbt(parts: readonly TextPart[]): string {
  const esc = (s: string): string =>
    s.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n');
  return `[${parts
    .map((t) => {
      const extra = [
        t.color && `color:'${t.color}'`,
        t.bold && 'bold:true',
        t.italic && 'italic:true',
      ].filter(Boolean);
      return `{${[`text:'${esc(t.text)}'`, ...extra].join(',')}}`;
    })
    .join(',')}]`;
}

/** Schwebender Text mit eigenen Kennungen (z. B. damit das Plugin ihn findet). */
function label(
  c: Canvas,
  at: LobbyPoint,
  facing: Facing | 'center',
  parts: readonly TextPart[],
  tags: readonly string[],
  scale = 1,
): void {
  const rotation =
    facing === 'center' ? "billboard:'center'" : `billboard:'fixed',Rotation:[${FACE_YAW[facing]}f,0f]`;
  c.extra.push(
    `summon text_display ${at.x} ${at.y} ${at.z} {Tags:[${lobbyTags(tags)}],${rotation},text:${snbt(parts)},background:${BACKDROP},shadow:true,line_width:220,transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[${scale}f,${scale}f,${scale}f]}}`,
  );
}
const FACE_YAW: Readonly<Record<Facing, number>> = { south: 0, west: 90, north: 180, east: -90 };
/** Dunkles Holzbraun, leicht durchsichtig (ARGB als vorzeichenbehaftete Zahl). */
const BACKDROP = 0xcc3b2a1a | 0;

/** Höhe des Geländes: flach im Kessel, Berge ringsum. */
export function wartungHeight(): (x: number, z: number) => number {
  const hills = mountains(SEED, 0, 0, INNER, OUTER, PEAK);
  return (x, z) => G + Math.round(hills(x, z));
}

/** Weg: meist festgetretene Erde, dazwischen Kies und grobe Erde (Anteile von unten gezählt). */
const TRAIL: ReadonlyArray<{ readonly below: number; readonly block: string }> = [
  { below: 0.16, block: 'gravel' },
  { below: 0.26, block: 'coarse_dirt' },
];

/** Wege aus festgetretener Erde mit Kies am Rand. */
function trail(c: Canvas, points: ReadonlyArray<readonly [number, number]>, rnd: () => number): void {
  points.slice(1).forEach((q, i) => {
    const a = points[i] as readonly [number, number];
    const len = Math.max(Math.abs(q[0] - a[0]), Math.abs(q[1] - a[1]), 1);
    range(0, len).forEach((s) => {
      const x = Math.round(a[0] + ((q[0] - a[0]) * s) / len);
      const z = Math.round(a[1] + ((q[1] - a[1]) * s) / len);
      disc(x, z, 1.2).forEach(([px, pz]) => {
        if (c.get(px, G, pz) !== undefined) return;
        const roll = rnd();
        const surface = TRAIL.find((t) => roll < t.below)?.block ?? 'dirt_path';
        c.set(px, G, pz, surface);
      });
    });
  });
}

/** Aushang: zwei Pfosten, Brett, kleines Dach – vorne Titel und darunter der Text aus dem Panel. */
function noticeBoard(c: Canvas): void {
  const z = 8;
  [-3, 3].forEach((x) => range(G + 1, G + 5).forEach((y) => c.set(x, y, z, 'spruce_log[axis=y]')));
  c.fill(-2, G + 2, z, 2, G + 4, z, 'dark_oak_planks');
  c.fill(-2, G + 1, z, 2, G + 1, z, 'spruce_slab[type=top]');
  range(-4, 4).forEach((x) => {
    c.set(x, G + 6, z - 1, stairs('spruce', 'north'));
    c.set(x, G + 6, z, 'spruce_planks');
    c.set(x, G + 6, z + 1, stairs('spruce', 'south'));
  });
  c.set(-4, G + 5, z + 1, 'lantern[hanging=true]');
  c.set(4, G + 5, z + 1, 'lantern[hanging=true]');
  const front = z + 1.03;
  label(
    c,
    p(0.5, G + 3.45, front),
    'south',
    [
      { text: '⚒ Wartungsarbeiten ⚒\n', color: 'gold', bold: true },
      { text: 'Gleich geht’s weiter!\n', color: 'white' },
      { text: 'Maintenance – back in a moment!', color: 'gray', italic: true },
    ],
    ['mm_sign'],
    1.15,
  );
  label(
    c,
    p(0.5, G + 2.05, front),
    'south',
    [{ text: 'Wir bauen gerade um – gleich geht’s weiter!', color: 'white' }],
    ['mm_sign', WARTUNG_TEXT_TAG],
    0.85,
  );
}

/** Offene Bergwerkstatt (Front nach Süden): Werkbänke, Amboss, Holzstapel, Laternen, Schmied und Schreiner. */
function workshop(c: Canvas, rnd: () => number): void {
  const [x1, x2, z1, z2] = [-8, 8, -16, -7];
  c.fill(x1, G, z1, x2, G, z2, 'spruce_planks');
  c.fill(x1, G, z2, x2, G, z2, 'stone_bricks');
  // Wände hinten und an den Seiten, vorne offen.
  range(G + 1, G + 5).forEach((y) => {
    range(x1, x2).forEach((x) => c.set(x, y, z1, 'spruce_planks'));
    range(z1, z2).forEach((z) => {
      c.set(x1, y, z, 'spruce_planks');
      c.set(x2, y, z, 'spruce_planks');
    });
  });
  [x1, x2].forEach((x) =>
    [z1, z2].forEach((z) => c.fill(x, G + 1, z, x, G + 5, z, 'stripped_spruce_log[axis=y]')),
  );
  [-3, 3].forEach((x) => c.fill(x, G + 1, z2, x, G + 5, z2, 'stripped_spruce_log[axis=y]'));
  c.fill(x1, G + 5, z2, x2, G + 5, z2, 'stripped_spruce_log[axis=x]');
  c.fill(x1 + 1, G + 1, z2, x2 - 1, G + 1, z2, 'air');
  range(x1 + 1, x2 - 1)
    .filter((x) => x !== -3 && x !== 3)
    .forEach((x) => range(G + 1, G + 4).forEach((y) => c.set(x, y, z2, 'air')));
  // Fenster in der Rückwand und den Seiten.
  [-5, -4, 4, 5].forEach((x) => c.fill(x, G + 2, z1, x, G + 3, z1, 'glass_pane[east=true,west=true]'));
  [-13, -12, -10].forEach((z) =>
    [x1, x2].forEach((x) => c.fill(x, G + 2, z, x, G + 3, z, 'glass_pane[north=true,south=true]')),
  );
  gableRoof(c, {
    x1,
    z1,
    x2,
    z2,
    y: G + 6,
    along: 'x',
    material: 'spruce',
    gable: 'spruce_planks',
    overhang: 1,
    eaves: 1,
  });
  // Werkbänke an der Rückwand.
  const bench = [
    'barrel[facing=south]',
    'chest[facing=south]',
    'crafting_table',
    'smithing_table',
    'fletching_table',
    'stonecutter[facing=south]',
    'cartography_table',
    'blast_furnace[facing=south,lit=true]',
    'smoker[facing=south,lit=true]',
    'loom[facing=south]',
    'grindstone[face=floor,facing=south]',
    'barrel[facing=up]',
    'composter[level=4]',
  ];
  bench.forEach((block, i) => c.set(-6 + i, G + 1, z1 + 1, block));
  ['lantern', 'potted_red_tulip', 'brewing_stand', 'candle[candles=3,lit=true]'].forEach((block, i) =>
    c.set(-5 + i * 3, G + 2, z1 + 1, block),
  );
  // Holzstapel links, Amboss und Hackklotz in der Mitte, Sägebock rechts.
  c.fill(-7, G + 1, -14, -6, G + 2, -10, 'spruce_log[axis=z]');
  c.fill(-7, G + 3, -13, -7, G + 3, -11, 'spruce_log[axis=z]');
  c.set(-2, G + 1, -12, 'anvil[facing=east]');
  c.set(-1, G + 1, -10, 'stripped_oak_log[axis=y]');
  c.set(-1, G + 2, -10, 'lightning_rod[facing=up]');
  c.set(5, G + 1, -11, 'oak_fence');
  c.set(5, G + 2, -11, 'oak_slab[type=bottom]');
  c.set(6, G + 1, -11, 'oak_fence');
  c.set(6, G + 1, -9, 'hay_block[axis=y]');
  c.set(7, G + 1, -9, 'barrel[facing=up]');
  c.set(-6, G + 1, -8, 'cauldron');
  // Laternen unter dem Dach.
  [-5, 0, 5].forEach((x) => c.set(x, G + 5, -11, 'lantern[hanging=true]'));
  npc(c, { x: -3, y: G + 1, z: -12, look: 'east', skin: 'schmied', hand: 'iron_pickaxe' });
  npc(c, { x: 4, y: G + 1, z: -13, look: 'south', skin: 'schreiner', hand: 'iron_axe' });
  signText(
    c,
    0.5,
    G + 5.15,
    z2 + 1.02,
    'south',
    [
      { text: 'Bergwerkstatt\n', color: 'gold', bold: true },
      { text: 'Mountain workshop', color: 'gray', italic: true },
    ],
    0.9,
  );
  // Werkzeug vor der Tür: Schubkarre (Kessel auf Rad) und Steinhaufen.
  c.set(6, G + 1, -5, 'cauldron');
  c.set(5, G + 1, -5, 'dark_oak_trapdoor[facing=east,half=bottom,open=true]');
  range(0, 3).forEach((i) =>
    c.set(-6 + i, G + 1, -5 - (i % 2), pick(rnd, ['cobblestone', 'andesite', 'gravel'])),
  );
}

/** Baustelle im Osten: Grundmauern, Gerüst, Kran mit Last, Absperrung mit Warnschild. */
function constructionSite(c: Canvas, rnd: () => number): void {
  const [x1, x2, z1, z2] = [13, 21, -6, 2];
  c.fill(x1, G, z1, x2, G, z2, 'stone_bricks');
  // Halbfertige Wände (Putz), unterschiedlich hoch, Tür in der Mitte vorne.
  range(x1, x2).forEach((x) =>
    range(z1, z2)
      .filter((z) => x === x1 || x === x2 || z === z1 || z === z2)
      .forEach((z) => {
        if (z === z2 && x === 17) return;
        const height = 1 + Math.floor(fbm(SEED + 3, x, z, 4, 2) * 4);
        range(G + 1, G + height).forEach((y) => c.set(x, y, z, y === G + 1 ? 'stone_bricks' : 'calcite'));
      }),
  );
  [x1, x2].forEach((x) =>
    [z1, z2].forEach((z) => c.fill(x, G + 1, z, x, G + 4, z, 'stripped_spruce_log[axis=y]')),
  );
  // Gerüst an der Westseite.
  [-5, -2, 1].forEach((z) =>
    range(G + 1, G + 6).forEach((y) => c.set(x1 - 1, y, z, 'scaffolding[bottom=false,distance=0]')),
  );
  range(-5, 1).forEach((z) => c.set(x1 - 1, G + 6, z, 'scaffolding[bottom=false,distance=0]'));
  npc(c, { x: x1 - 1, y: G + 7, z: -2, look: 'east', skin: 'gast4', hand: 'brick' });
  // Baumaterial: Ziegelstapel, Bretter, Kies.
  c.fill(18, G + 1, -4, 19, G + 2, -4, 'bricks');
  c.fill(15, G + 1, -4, 16, G + 1, -3, 'oak_planks');
  c.set(19, G + 1, 0, 'gravel');
  c.set(20, G + 1, 0, pick(rnd, ['gravel', 'sand']));
  // Kran: Mast, Ausleger, Gegengewicht, Kette mit Last über der Baustelle.
  const mast = { x: 23, z: -9 };
  range(G + 1, G + 18).forEach((y) =>
    c.set(mast.x, y, mast.z, y % 2 === 0 ? 'stripped_spruce_log[axis=y]' : 'spruce_log[axis=y]'),
  );
  range(14, 26).forEach((x) => c.set(x, G + 18, mast.z, 'stripped_spruce_log[axis=x]'));
  c.fill(25, G + 17, mast.z, 26, G + 17, mast.z, 'stone_bricks');
  c.set(mast.x, G + 19, mast.z, 'lantern');
  range(G + 11, G + 17).forEach((y) => c.set(16, y, mast.z, 'iron_chain[axis=y]'));
  c.set(16, G + 10, mast.z, 'barrel[facing=up]');
  // Absperrung vorne: gelb-schwarze Balken, Warnschild.
  range(x1 - 2, x2 + 1).forEach((x, i) => {
    if (i % 3 === 2) return;
    c.set(x, G + 1, 4, i % 3 === 0 ? 'yellow_concrete' : 'black_concrete');
  });
  signText(
    c,
    17.5,
    G + 2.3,
    4.53,
    'south',
    [
      { text: '⚠ Baustelle\n', color: 'yellow', bold: true },
      { text: 'Construction site', color: 'gray', italic: true },
    ],
    0.8,
  );
}

/** Brotzeit am Lagerfeuer: Tisch, Bänke, eine Bäuerin mit Brot. */
function brotzeit(c: Canvas): void {
  c.set(12, G + 1, 12, 'spruce_fence');
  c.set(12, G + 2, 12, 'spruce_slab[type=bottom]');
  c.set(13, G + 1, 12, 'spruce_fence');
  c.set(13, G + 2, 12, 'spruce_slab[type=bottom]');
  [12, 13].forEach((x) => {
    c.set(x, G + 1, 13, stairs('spruce', 'south'));
    c.set(x, G + 1, 11, stairs('spruce', 'north'));
  });
  c.set(13, G + 3, 12, 'candle[candles=2,lit=true]');
  c.set(16, G + 1, 14, 'campfire[lit=true,signal_fire=false]');
  disc(16, 14, 1.5)
    .filter(([x, z]) => x !== 16 || z !== 14)
    .forEach(([x, z]) => c.set(x, G, z, 'cobblestone'));
  npc(c, { x: 12, y: G + 1, z: 13, look: 'north', skin: 'gast2', hand: 'bread', sit: true });
  npc(c, { x: 13, y: G + 1, z: 11, look: 'south', skin: 'kellnerin', hand: 'honey_bottle', sit: true });
}

/** Sprung-Parcours im Westen (Zeitvertreib): Startplatte, Sprünge, Plattform mit Glocke. */
function parkour(c: Canvas): void {
  const s = WARTUNG_POINTS.parkourStart;
  c.set(s.x, G, s.z, 'polished_andesite');
  c.set(s.x, s.y, s.z, 'light_weighted_pressure_plate');
  PARKOUR_STEPS.forEach((st) => {
    c.set(st.x, st.y, st.z, st.block);
    range(G + 1, st.y - 1).forEach((y) => c.set(st.x, y, st.z, 'spruce_fence'));
  });
  const t = PARKOUR_TOP;
  c.fill(t.x - 1, t.y, t.z - 1, t.x + 1, t.y, t.z + 1, 'spruce_planks');
  range(G + 1, t.y - 1).forEach((y) => c.set(t.x, y, t.z, 'spruce_log[axis=y]'));
  c.set(t.x, t.y + 1, t.z, 'heavy_weighted_pressure_plate');
  c.set(t.x, t.y + 1, t.z - 1, 'bell[attachment=floor,facing=south]');
  c.set(t.x - 1, t.y + 1, t.z - 1, 'lantern');
  c.set(t.x + 1, t.y + 1, t.z - 1, 'lantern');
  label(
    c,
    p(s.x + 0.5, s.y + 1.4, s.z + 0.5),
    'center',
    [
      { text: '⏱ Sprung-Parcours\n', color: 'green', bold: true },
      { text: 'Jump course – auf die Platte! / step on the plate!', color: 'gray' },
    ],
    ['mm_sign'],
    0.8,
  );
}

export interface WartungScene {
  readonly canvas: Canvas;
}

/** Die ganze Wartungs-Lobby als Block-Karte. */
export function buildWartung(): WartungScene {
  const c = new Canvas();
  const rnd = random(SEED);
  const height = wartungHeight();
  terrain(c, {
    x1: -WARTUNG_RADIUS,
    z1: -WARTUNG_RADIUS,
    x2: WARTUNG_RADIUS,
    z2: WARTUNG_RADIUS,
    height,
    snowLine: G + 30,
    seed: SEED,
    skipFlat: true,
  });
  noticeBoard(c);
  workshop(c, rnd);
  constructionSite(c, rnd);
  brotzeit(c);
  parkour(c);
  trail(
    c,
    [
      [0, 22],
      [0, 11],
    ],
    rnd,
  );
  trail(
    c,
    [
      [0, 11],
      [-5, 10],
      [-5, 3],
      [0, -4],
    ],
    rnd,
  );
  trail(
    c,
    [
      [0, 11],
      [5, 10],
      [5, 3],
      [0, -4],
    ],
    rnd,
  );
  trail(
    c,
    [
      [-1, 16],
      [-9, 16],
    ],
    rnd,
  );
  trail(
    c,
    [
      [5, 6],
      [11, 6],
      [17, 6],
    ],
    rnd,
  );
  trail(
    c,
    [
      [2, 15],
      [10, 15],
    ],
    rnd,
  );
  [
    [2, 21],
    [-2, 12],
    [7, 9],
    [-7, 0],
    [9, -2],
  ].forEach(([x, z]) => lampPost(c, x ?? 0, G, z ?? 0));
  npc(c, { x: -1, y: G + 1, z: 12, look: 'north', skin: 'bua', small: true });
  // Bäume im Kessel und Wald an den Hängen.
  (
    [
      [-26, -18, 'spruce'],
      [-30, 2, 'spruce'],
      [27, -20, 'spruce'],
      [30, 6, 'spruce'],
      [-10, 28, 'spruce'],
      [12, 29, 'spruce'],
      [-24, 24, 'round'],
      [24, 24, 'round'],
      [-12, -24, 'round'],
      [14, -24, 'spruce'],
    ] as const
  ).forEach(([x, z, kind]) =>
    kind === 'spruce'
      ? spruce(c, x, G + 1, z, 9 + Math.floor(rnd() * 5))
      : roundTree(c, x, G + 1, z, { height: 8, radius: 3, rnd }),
  );
  forest(
    c,
    -WARTUNG_RADIUS + 2,
    -WARTUNG_RADIUS + 2,
    WARTUNG_RADIUS - 2,
    WARTUNG_RADIUS - 2,
    height,
    (x, z, h) => Math.hypot(x, z) > INNER + 2 && h < G + 18,
    SEED,
    rnd,
  );
  meadow(c, -WARTUNG_RADIUS, -WARTUNG_RADIUS, WARTUNG_RADIUS, WARTUNG_RADIUS, height, 0.22, rnd);
  return { canvas: c };
}
