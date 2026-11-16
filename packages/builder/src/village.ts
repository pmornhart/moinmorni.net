/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/**
 * Leben im Dorf: Figuren (Mannequins mit eigenen Skins aus `cast.ts`), Einrichtung der Häuser je Art
 * (Wohnhaus, Wirtshaus, Bäckerei …) und Marktstände für die Spielmodi.
 *
 * Einrichtung ist als Daten beschrieben: [u, y, v, Block, u2?, v2?] im Rahmen des Hauses (u nach rechts, v nach
 * hinten). Negative u/v zählen von der rechten bzw. hinteren Wand, `M` steht für die Spalte der Haustür.
 * Im Block stehen {F} {B} {L} {R} für vorne/hinten/links/rechts (aus Sicht vor dem Haus) und {W} für die Holzart.
 */
import type { Canvas } from './canvas.js';
import { MOEBEL } from './furniture.js';
import { castFor, signedSkin } from './cast.js';
import { bodyParts, trachtItems } from './trachten.js';
import { Frame, type Local } from './frame.js';
import { STEP, YAW, type Facing } from './shapes.js';

export type RoomKind =
  | 'wohnhaus'
  | 'wirtshaus'
  | 'baeckerei'
  | 'schmiede'
  | 'laden'
  | 'rathaus'
  | 'info'
  | 'apotheke'
  | 'schreinerei';

type Coord = number | 'M';
type Place = readonly [u: Coord, y: number, v: number, block: string, u2?: Coord, v2?: number];

interface RoomNpc {
  readonly u: Coord;
  readonly v: number;
  readonly look: Local;
  readonly skin: string;
  readonly hand?: string;
  /** Sitzt auf einer Treppe/Bank (y ist dann der Sitz-Block). */
  readonly sit?: boolean;
  readonly y?: number;
}

interface Room {
  readonly blocks: readonly Place[];
  readonly npcs?: readonly RoomNpc[];
}

export interface TextPart {
  readonly text: string;
  readonly color?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
}

export interface NpcSpec {
  /** Block, auf dem die Figur steht (bzw. sitzt) – die Mitte wird genommen. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly look: Facing;
  readonly skin: string;
  /** Gegenstand in der rechten Hand, in der linken (`offhand`) und auf dem Rücken (`back`, z. B. Flügel). */
  readonly hand?: string;
  readonly offhand?: string;
  readonly back?: string;
  readonly sit?: boolean;
  /** Kind (kleiner). */
  readonly small?: boolean;
  readonly tags?: readonly string[];
  /** Schild über dem Kopf: Zeilen von oben nach unten (Name groß, dann Zustand, unten klein der Hinweis). */
  readonly label?: readonly LabelLine[];
  /** Zusätzliche Tags für das Schild (z. B. `mm_mode_label`: das Lobby-Plugin ersetzt es durch Live-Zahlen). */
  readonly labelTags?: readonly string[];
}

/** Eine Zeile des Schilds über einer Figur: `name` groß, `state` mittel, `hint` klein. */
export interface LabelLine {
  readonly size: 'name' | 'state' | 'hint';
  readonly parts: readonly TextPart[];
}

/**
 * So stehen die Zeilen über einer Figur (gleich im Lobby-Plugin, `LobbyNpcs.java`): jede Zeile ein eigenes
 * Schild mit eigener Größe, die unterste 2,38 Blöcke über den Füßen (über jedem Hut), dazwischen ein kleiner Abstand.
 * Eine Zeile ist 10 Schrift-Pixel hoch, ein Schrift-Pixel 1/40 Block mal Größe.
 */
export const LABEL_LAYOUT = {
  bottom: 2.38,
  gap: 0.03,
  line: 0.25,
  scale: { name: 0.9, state: 0.72, hint: 0.55 },
} as const;

const HALF = 0.5;
/** Sitz: Anzeige-Block 0,55 über dem Sitz-Block – die Figur sitzt dann auf der Stufe (wie MorniCraft-Sitze). */
const SEAT_Y = 0.55;
const SMALL = 0.62;
/**
 * Körper-Tracht als Passagier: Minecraft setzt Passagiere 1,8 Blöcke über die Füße (mal Größe der Figur). Das Modell
 * ist in Skin-Pixeln gebaut (Mitte bei 8); Figuren zeichnen ein Skin-Pixel 0,9375/16 Block groß.
 */
const RIDE_HEIGHT = 1.8;
const SKIN_SCALE = 0.9375;
const MODEL_MIDDLE = 0.5;
/** Schild knapp vor der Markise, damit es nicht in der Wolle steckt. */
const AHEAD = 0.52;
/** Sitzende stecken tiefer: das Schild rückt entsprechend nach unten. */
const LABEL_SITTING_DROP = 0.55;
/** Schilder über Figuren: immer hell (auch nachts), leicht dunkler Grund (ARGB als vorzeichenbehaftete Zahl). */
const LABEL_BACKDROP = { name: 0x58000000, state: 0x58000000, hint: 0x40000000 } as const;

function snbtText(parts: readonly TextPart[]): string {
  // Zeilenumbruch als \n: in einer Datenpaket-Funktion steht jeder Befehl auf genau einer Zeile.
  const esc = (s: string): string =>
    s.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n');
  return `[${parts
    .map((p) => {
      const extra = [
        p.color && `color:'${p.color}'`,
        p.bold && 'bold:true',
        p.italic && 'italic:true',
      ].filter(Boolean);
      return `{${[`text:'${esc(p.text)}'`, ...extra].join(',')}}`;
    })
    .join(',')}]`;
}

import { lobbyTags } from './lobby-tags.js';
export { BUILD_PLACEHOLDER, BUILD_TAG_PREFIX, LOBBY_TAG, lobbyTags } from './lobby-tags.js';
const tagList = lobbyTags;

/**
 * Skin einer Figur: von Mojang signiert (sieht jeder, auch ohne Texturpaket und über Geyser), sonst – solange eine
 * geänderte Tracht noch nicht neu signiert ist – aus dem Texturpaket.
 */
function profileOf(skin: string): string {
  const signed = signedSkin(skin);
  return signed
    ? `profile:{properties:[{name:'textures',value:'${signed.value}',signature:'${signed.signature}'}]}`
    : `profile:{texture:'moinmorni:npc/${skin}',model:'wide'}`;
}

/** Hände, Rücken und Kopf (3D-Hut, Bart, Dutt – ohne Paket unsichtbar). */
function equipmentOf(n: NpcSpec, head: string | null): string[] {
  const item = (slot: string, id: string | undefined): string[] =>
    id ? [`${slot}:{id:'minecraft:${id}',count:1}`] : [];
  const slots = [
    ...item('mainhand', n.hand),
    ...item('offhand', n.offhand),
    ...item('chest', n.back),
    ...(head ? [`head:${head}`] : []),
  ];
  return slots.length > 0 ? [`equipment:{${slots.join(',')}}`] : [];
}

/** Anzeige-Objekt mit der Körper-Tracht, fährt auf der Figur mit (das Lobby-Plugin dreht es mit). */
function bodyDisplay(n: NpcSpec, item: string): string {
  const size = n.small ? SMALL : 1;
  const scale = SKIN_SCALE * size;
  const down = (-RIDE_HEIGHT * size + MODEL_MIDDLE * scale).toFixed(4);
  return `{id:'minecraft:item_display',item_display:'none',Tags:[${tagList(['mm_tracht'])}],Rotation:[${YAW[n.look]}f,0f],teleport_duration:2,transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,${down}f,0f],scale:[${scale}f,${scale}f,${scale}f]},item:${item}}`;
}

/** Weiteres Wesen der Lobby (z. B. Rüstungsständer im Schloss) – mit den Kennungen, die der Neubau aufräumt. */
export function decoEntity(
  c: Canvas,
  type: string,
  x: number,
  y: number,
  z: number,
  look: Facing,
  nbt: string,
): void {
  c.extra.push(
    `summon ${type} ${x} ${y} ${z} {Tags:[${tagList(['mm_deco'])}],Rotation:[${YAW[look]}f,0f],${nbt}}`,
  );
}

/** Figur aufstellen (Mannequin mit eigenem Skin, unverwundbar, nicht schiebbar). */
export function npc(c: Canvas, n: NpcSpec): void {
  const { id: wears, outfit } = castFor(n.skin);
  const tracht = outfit ? trachtItems(outfit, n.sit === true) : { head: null, body: null };
  // Im Rock gehen sie langsamer (kleinere Schritte – die Beine bleiben im Rock)
  const rock = outfit !== undefined && !n.sit && bodyParts(outfit).includes('rock');
  const tags = tagList(['mm_npc', `mm_skin_${n.skin}`, ...(rock ? ['mm_rock'] : []), ...(n.tags ?? [])]);
  const parts = [
    `Tags:[${tags}]`,
    `Rotation:[${YAW[n.look]}f,0f]`,
    'immovable:true',
    'hide_description:true',
    'Invulnerable:1b',
    'Silent:1b',
    profileOf(wears),
    ...equipmentOf(n, tracht.head),
    ...(n.small ? [`attributes:[{id:'minecraft:scale',base:${SMALL}d}]`] : []),
    ...(tracht.body ? [`Passengers:[${bodyDisplay(n, tracht.body)}]`] : []),
  ];
  const body = `{id:'minecraft:mannequin',${parts.join(',')}}`;
  const x = n.x + HALF;
  const z = n.z + HALF;
  c.extra.push(
    n.sit
      ? `summon block_display ${x} ${n.y + SEAT_Y} ${z} {Tags:[${tagList(['mm_seat'])}],Passengers:[${body}]}`
      : `summon mannequin ${x} ${n.y} ${z} {${parts.join(',')}}`,
  );
  if (n.label) labelAbove(c, n, x, z);
}

/** Schild über einer Figur: je Zeile ein eigenes Schild, von unten (Hinweis, klein) nach oben (Name, groß). */
function labelAbove(c: Canvas, n: NpcSpec, x: number, z: number): void {
  const size = n.small ? SMALL : 1;
  const base = n.y + (LABEL_LAYOUT.bottom - (n.sit ? LABEL_SITTING_DROP : 0)) * size;
  const tags = tagList(['mm_npc_label', `mm_label_${n.skin}`, ...(n.labelTags ?? [])]);
  [...(n.label ?? [])].reverse().reduce((y, line) => {
    const scale = LABEL_LAYOUT.scale[line.size];
    c.extra.push(
      `summon text_display ${x} ${y.toFixed(3)} ${z} {Tags:[${tags}],billboard:'vertical',text:${snbtText(line.parts)},background:${LABEL_BACKDROP[line.size] | 0},shadow:true,brightness:{block:15,sky:15},transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[${scale}f,${scale}f,${scale}f]}}`,
    );
    return y + (LABEL_LAYOUT.line * scale + LABEL_LAYOUT.gap) * size;
  }, base);
}

/** Schild als schwebender Text vor einer Wand (fest ausgerichtet). */
export function signText(
  c: Canvas,
  x: number,
  y: number,
  z: number,
  look: Facing,
  parts: readonly TextPart[],
  scale = 1,
): void {
  /** Dunkles Holzbraun, leicht durchsichtig (ARGB als vorzeichenbehaftete Zahl, wie Minecraft sie erwartet). */
  const BACKDROP = 0xcc3b2a1a | 0;
  c.extra.push(
    `summon text_display ${x} ${y} ${z} {Tags:[${tagList(['mm_sign'])}],billboard:'fixed',Rotation:[${YAW[look]}f,0f],text:${snbtText(parts)},background:${BACKDROP},shadow:true,transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[${scale}f,${scale}f,${scale}f]}}`,
  );
}

/** Stuhl und Tisch sind Möbel aus dem Ressourcenpaket (ohne Paket: Mangrove-Stufe/-Halbstufe, `furniture.ts`). */
const CHAIR = (look: string): string => MOEBEL.stuhl(`{${look}}`);
const TISCH = MOEBEL.wirtstisch;
/** Ladentheken bleiben Holz-Halbstufen der Hausart. */
const THEKE = '{W}_slab[type=top]';
const LANTERN_HANGING = 'lantern[hanging=true]';

/** Erdgeschoss je Hausart. */
const GROUND_FLOORS: Readonly<Record<RoomKind, Room>> = {
  wohnhaus: {
    blocks: [
      [1, 1, 1, 'smoker[facing={R}]'],
      [1, 1, 2, 'barrel[facing=up]'],
      [1, 1, 3, 'water_cauldron[level=3]'],
      [1, 2, 2, 'potted_red_tulip'],
      [1, 1, -1, CHAIR('B'), 3, -1],
      [1, 1, -3, CHAIR('L'), 1, -2],
      [2, 1, -3, TISCH, 3, -2],
      [4, 1, -3, CHAIR('R'), 4, -2],
      [2, 2, -2, 'candle[candles=3,lit=true]'],
      [3, 2, -3, 'potted_blue_orchid'],
      [-1, 1, 1, 'bricks'],
      [-1, 1, 2, 'furnace[facing={L},lit=true]'],
      [-1, 1, 3, 'bricks'],
      [-1, 1, 4, 'bookshelf', -1, 5],
      [3, 1, 2, 'red_carpet', -3, 4],
      ['M', 3, 3, LANTERN_HANGING],
      [2, 3, -2, LANTERN_HANGING],
    ],
  },
  wirtshaus: {
    blocks: [
      [2, 1, 3, TISCH, 5, 3],
      [2, 1, 2, CHAIR('F'), 5, 2],
      [2, 1, 4, CHAIR('B'), 5, 4],
      [2, 1, 7, TISCH, 5, 7],
      [2, 1, 6, CHAIR('F'), 5, 6],
      [2, 1, 8, CHAIR('B'), 5, 8],
      [3, 2, 3, MOEBEL.krug(2)],
      [5, 2, 3, MOEBEL.krug(1)],
      [2, 2, 7, MOEBEL.krug(4)],
      [4, 2, 7, MOEBEL.krug(3)],
      [2, 2, 7, 'potted_red_tulip'],
      [-6, 1, -4, '{W}_planks', -1, -4],
      [-5, 2, -4, 'brewing_stand'],
      [-2, 2, -4, 'cake'],
      [-3, 2, -4, 'candle[candles=2,lit=true]'],
      [1, 2, 2, 'light_blue_wall_banner[facing={R}]'],
      [1, 2, 5, 'white_wall_banner[facing={R}]'],
      [1, 2, 8, 'light_blue_wall_banner[facing={R}]'],
      [-6, 1, -1, 'barrel[facing={F}]', -3, -1],
      [-6, 2, -1, 'barrel[facing={F}]', -3, -1],
      [-6, 3, -1, 'barrel[facing={F}]', -4, -1],
      [1, 1, -1, 'furnace[facing={R},lit=true]'],
      [1, 2, -1, 'bricks'],
      [1, 1, -3, CHAIR('L'), 1, -2],
      [2, 1, -1, CHAIR('B'), 3, -1],
      [4, 3, 3, LANTERN_HANGING],
      [4, 3, 7, LANTERN_HANGING],
      [-4, 3, -3, LANTERN_HANGING],
      ['M', 1, 1, 'red_carpet', 'M', 5],
    ],
    npcs: [
      { u: -4, v: -3, look: 'front', skin: 'wirt', hand: 'honey_bottle' },
      { u: 2, v: 2, look: 'back', skin: 'gast1', sit: true },
      { u: 4, v: 4, look: 'front', skin: 'gast2', sit: true, hand: 'honey_bottle' },
      { u: 3, v: 6, look: 'back', skin: 'gast5', sit: true },
      { u: 5, v: 8, look: 'front', skin: 'gast8', sit: true },
      { u: 1, v: -2, look: 'right', skin: 'gast3', sit: true, hand: 'bread' },
    ],
  },
  baeckerei: {
    blocks: [
      [1, 1, 3, THEKE, -1, 3],
      ['M', 1, 3, 'air'],
      [1, 2, 3, 'cake'],
      [2, 2, 3, 'cake[bites=2]'],
      [-2, 2, 3, 'decorated_pot'],
      [-1, 2, 3, 'potted_dandelion'],
      [1, 1, -1, 'smoker[facing={F},lit=true]', 3, -1],
      [1, 2, -1, 'bricks', 3, -1],
      [-3, 1, -1, 'barrel[facing=up]', -2, -1],
      [-3, 2, -1, 'white_wool', -2, -1],
      [1, 1, 1, CHAIR('L')],
      [-1, 1, 1, 'potted_red_tulip'],
      ['M', 3, 2, LANTERN_HANGING],
      ['M', 3, -2, LANTERN_HANGING],
    ],
    npcs: [{ u: 'M', v: 4, look: 'front', skin: 'baecker', hand: 'bread' }],
  },
  schmiede: {
    blocks: [
      ['M', 1, 4, 'anvil[facing={L}]'],
      [1, 1, -1, 'blast_furnace[facing={F},lit=true]'],
      [2, 1, -1, 'lava_cauldron'],
      [3, 1, -1, 'smithing_table'],
      [1, 2, -1, 'bricks', 3, -1],
      [-1, 1, 2, 'grindstone[face=floor,facing={L}]'],
      [-1, 1, 3, 'chest[facing={L}]'],
      [-1, 1, 4, 'barrel[facing=up]'],
      [-1, 2, 4, 'iron_chain[axis=y]'],
      [1, 1, 2, 'stonecutter[facing={R}]'],
      [1, 1, 3, 'iron_block'],
      [2, 3, -1, LANTERN_HANGING],
      ['M', 3, 3, LANTERN_HANGING],
    ],
    npcs: [{ u: 'M', v: 5, look: 'front', skin: 'schmied', hand: 'iron_pickaxe' }],
  },
  laden: {
    blocks: [
      [1, 1, 3, THEKE, 3, 3],
      [-3, 1, 3, THEKE, -1, 3],
      [1, 1, -1, 'barrel[facing={F}]', -3, -1],
      [1, 2, -1, 'barrel[facing={F}]', -3, -1],
      [1, 1, 1, 'decorated_pot'],
      [-1, 1, 1, 'composter'],
      [1, 2, 3, 'potted_oxeye_daisy'],
      [-1, 2, 3, 'lantern'],
      [2, 2, 3, 'decorated_pot'],
      ['M', 3, 2, LANTERN_HANGING],
    ],
    npcs: [{ u: 'M', v: 4, look: 'front', skin: 'kraemer' }],
  },
  rathaus: {
    blocks: [
      [2, 1, -3, THEKE, -3, -3],
      [3, 2, -3, 'lectern[facing={F}]'],
      [-3, 2, -3, 'candle[candles=4,lit=true]'],
      [1, 1, -1, 'bookshelf', -2, -1],
      [1, 2, -1, 'bookshelf', -2, -1],
      [2, 1, 2, CHAIR('F'), 3, 2],
      [-3, 1, 2, CHAIR('F'), -2, 2],
      ['M', 1, 1, 'red_carpet', 'M', -4],
      ['M', 3, 3, LANTERN_HANGING],
      ['M', 3, -3, LANTERN_HANGING],
    ],
    npcs: [{ u: 'M', v: -2, look: 'front', skin: 'buergermeister' }],
  },
  info: {
    blocks: [
      [2, 1, 3, THEKE, -3, 3],
      ['M', 1, 3, 'air'],
      [2, 2, 3, 'cartography_table'],
      [-3, 2, 3, 'lectern[facing={F}]'],
      [1, 1, -1, 'bookshelf', -2, -1],
      [1, 1, 1, 'potted_azalea_bush'],
      [-1, 1, 1, 'potted_flowering_azalea_bush'],
      ['M', 3, 2, LANTERN_HANGING],
    ],
    npcs: [{ u: 'M', v: 2, look: 'front', skin: 'fuehrerin', hand: 'compass' }],
  },
  apotheke: {
    blocks: [
      [1, 1, 3, THEKE, -1, 3],
      ['M', 1, 3, 'air'],
      [1, 2, 3, 'brewing_stand'],
      [-1, 2, 3, 'potted_fern'],
      [1, 1, -1, 'bookshelf', -2, -1],
      [1, 2, -1, 'decorated_pot', -2, -1],
      [1, 1, 1, 'cauldron'],
      [-1, 1, 1, 'potted_lily_of_the_valley'],
      ['M', 3, 2, LANTERN_HANGING],
    ],
    npcs: [{ u: 'M', v: 4, look: 'front', skin: 'apothekerin', hand: 'glass_bottle' }],
  },
  schreinerei: {
    blocks: [
      ['M', 1, 4, 'crafting_table'],
      [1, 1, -1, 'stripped_oak_log[axis=x]', 3, -1],
      [1, 2, -1, 'stripped_spruce_log[axis=x]', 2, -1],
      [-1, 1, 2, 'stonecutter[facing={L}]'],
      [-1, 1, 3, 'barrel[facing=up]'],
      [1, 1, 2, 'scaffolding[bottom=false,distance=0]'],
      [1, 1, 3, 'oak_planks'],
      ['M', 3, 3, LANTERN_HANGING],
    ],
    npcs: [{ u: 'M', v: 5, look: 'front', skin: 'schreiner', hand: 'iron_axe' }],
  },
};

/** Obere Stockwerke (abwechselnd). */
const UPPER_FLOORS: readonly Room[] = [
  {
    blocks: [
      [1, 1, -1, 'red_bed[facing={B},part=head]'],
      [1, 1, -2, 'red_bed[facing={B},part=foot]'],
      [2, 1, -1, 'light_blue_bed[facing={B},part=head]'],
      [2, 1, -2, 'light_blue_bed[facing={B},part=foot]'],
      [1, 1, -3, 'chest[facing={F}]'],
      [3, 1, -1, 'barrel[facing=up]'],
      [3, 2, -1, 'lantern'],
      [1, 1, 1, 'barrel[facing={R}]', 1, 2],
      [1, 2, 1, 'barrel[facing={R}]', 1, 2],
      [-1, 1, 1, TISCH, -1, 2],
      [-2, 1, 1, CHAIR('L')],
      [-1, 2, 1, 'potted_cornflower'],
      [-1, 1, 4, 'bookshelf'],
      [3, 1, 2, 'light_blue_carpet', -3, 4],
      ['M', 3, 3, LANTERN_HANGING],
    ],
  },
  {
    blocks: [
      [1, 1, -1, 'yellow_bed[facing={B},part=head]'],
      [1, 1, -2, 'yellow_bed[facing={B},part=foot]'],
      [2, 1, -1, 'barrel[facing=up]'],
      [2, 2, -1, 'potted_pink_tulip'],
      [1, 1, 1, 'loom[facing={R}]'],
      [1, 1, 2, 'chest[facing={R}]'],
      [-1, 1, 1, 'bookshelf', -1, 2],
      [-2, 1, 3, CHAIR('L')],
      [3, 1, 2, 'lime_carpet', -3, 4],
      ['M', 3, 3, LANTERN_HANGING],
    ],
  },
];

export interface FurnishSpec {
  readonly kind: RoomKind;
  /** Index der rechten Wand bzw. Rückwand (Breite − 1, Tiefe − 1). */
  readonly w: number;
  readonly d: number;
  readonly floors: number;
  readonly storey: number;
  readonly wood: string;
  readonly door: number;
}

function resolve(c: Coord, wall: number, door: number): number {
  if (c === 'M') return door;
  return c < 0 ? wall + c : c;
}

function placeRoom(f: Frame, room: Room, s: FurnishSpec, base: number): void {
  const facing = (b: string): string =>
    b
      .replaceAll('{F}', f.dir('front'))
      .replaceAll('{B}', f.dir('back'))
      .replaceAll('{L}', f.dir('left'))
      .replaceAll('{R}', f.dir('right'))
      .replaceAll('{W}', s.wood);
  room.blocks.forEach(([u, y, v, block, u2, v2]) => {
    const a = resolve(u, s.w, s.door);
    const b = resolve(v, s.d, s.door);
    const a2 = u2 === undefined ? a : resolve(u2, s.w, s.door);
    const b2 = v2 === undefined ? b : resolve(v2, s.d, s.door);
    f.fill(
      Math.min(a, a2),
      base + y,
      Math.min(b, b2),
      Math.max(a, a2),
      base + y,
      Math.max(b, b2),
      facing(block),
    );
  });
  (room.npcs ?? []).forEach((n) => {
    const [x, y, z] = f.at(resolve(n.u, s.w, s.door), base + (n.y ?? 1), resolve(n.v, s.d, s.door));
    npc(f.c, { x, y, z, look: f.dir(n.look), skin: n.skin, hand: n.hand, sit: n.sit, tags: ['mm_village'] });
  });
}

/** Ein Haus einrichten: Erdgeschoss je Art, darüber Schlafzimmer. */
export function furnish(f: Frame, s: FurnishSpec): void {
  placeRoom(f, GROUND_FLOORS[s.kind], s, 0);
  Array.from({ length: s.floors - 1 }).forEach((_, i) =>
    placeRoom(f, UPPER_FLOORS[i % UPPER_FLOORS.length]!, s, (i + 1) * s.storey),
  );
}

export interface StallSpec {
  /** Linke vordere Ecke (von vorne gesehen); der Stand ist 7 breit. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly front: Facing;
  readonly colour: string;
  readonly skin: string;
  readonly name: string;
  readonly line: string;
  readonly status: string;
  /** Kennung für das Lobby-Plugin (Klick → Modus, Zahlen aktualisieren). */
  readonly mode: string;
  /** Waren auf der Theke (Block-Namen). */
  readonly goods: readonly string[];
  /** Eigene Kennungen der Figur (z. B. ein Marktstand ohne Modus); sonst die eines Modus-Standes. */
  readonly npcTags?: readonly string[];
  /** Schriftfarbe des Namens über der Figur (#rrggbb). */
  readonly tint?: string;
  /** Was die Figur hält bzw. trägt. */
  readonly holds?: Holds;
}

/** Was eine Figur in den Händen hält bzw. auf dem Rücken trägt (Minecraft-Gegenstände). */
export interface Holds {
  readonly hand?: string;
  readonly offhand?: string;
  readonly back?: string;
}

/** Farbe als Kennung am Wesen: „#ff9a2e“ → „mm_tint_ff9a2e“ (das Lobby-Plugin liest daraus die Schriftfarbe). */
export const tintTag = (hex: string): string => `mm_tint_${hex.replace('#', '').toLowerCase()}`;

/** Marktstand mit Markise in der Farbe des Modus, Figur in der Mitte (anklickbar), Name über dem Kopf. */
export function marketStall(c: Canvas, s: StallSpec): void {
  const f = new Frame(c, s.x, s.y, s.z, s.front);
  f.fill(-1, 0, -2, 7, 0, 4, 'polished_andesite');
  f.fill(0, 0, 0, 6, 0, 3, 'spruce_planks');
  [0, 6].forEach((u) => [0, 3].forEach((v) => f.fill(u, 1, v, u, 4, v, 'stripped_spruce_log[axis=y]')));
  f.fill(0, 1, 3, 6, 3, 3, 'spruce_planks');
  // Banner links und rechts über der Ware – nicht direkt hinter der Figur (sah dort aus wie ein Brett am Rücken)
  [1, 5].forEach((u) => f.set(u, 3, 2, `${s.colour}_wall_banner[facing=${f.dir('front')}]`));
  // Rückwand von außen: Banner in der Farbe des Standes und eine Laterne
  f.set(3, 2, 4, `${s.colour}_wall_banner[facing=${f.dir('back')}]`);
  [1, 5].forEach((u) => f.set(u, 1, 4, `lantern[hanging=false]`));
  [0, 1, 5, 6].forEach((u, i) => {
    f.set(u, 1, 1, 'barrel[facing=up]');
    f.set(u, 2, 1, s.goods[i % s.goods.length] ?? 'air');
  });
  range7().forEach((u) =>
    [-1, 0, 1, 2, 3].forEach((v) =>
      f.set(u, v === -1 ? 4 : 5, v, `${u % 2 === 0 ? s.colour : 'white'}_wool`),
    ),
  );
  range7().forEach((u) => f.set(u, 4, -1, `${u % 2 === 0 ? s.colour : 'white'}_wool`));
  f.set(0, 3, -1, 'lantern[hanging=true]');
  f.set(6, 3, -1, 'lantern[hanging=true]');
  const [sx, , sz] = f.at(3, 0, -1);
  const [fx, fz] = STEP[s.front];
  signText(
    c,
    sx + HALF + fx * AHEAD,
    s.y + 4.05,
    sz + HALF + fz * AHEAD,
    s.front,
    [{ text: s.name, color: 'white', bold: true }],
    1.1,
  );
  const [nx, ny, nz] = f.at(3, 1, 1);
  const tint = s.tint ?? '#ffaa00';
  npc(c, {
    x: nx,
    y: ny,
    z: nz,
    look: f.dir('front'),
    skin: s.skin,
    ...s.holds,
    tags: [...(s.npcTags ?? ['mm_mode_npc', `mm_mode_${s.mode}`]), tintTag(tint)],
    labelTags: s.npcTags ? [] : ['mm_mode_label'],
    label: [
      { size: 'name', parts: [{ text: s.name, color: tint, bold: true }] },
      { size: 'state', parts: [{ text: s.line, color: 'green' }] },
      { size: 'hint', parts: [{ text: s.status, color: '#c8c8c8' }] },
    ],
  });
}

function range7(): number[] {
  return [0, 1, 2, 3, 4, 5, 6];
}
