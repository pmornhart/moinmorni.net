/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/** Gemeinsame Teile der Lobby (und der drei Entwürfe): Modi-Liste, Berg-Kulisse, Häuser mittig setzen, Laternen, Wälder. */
import type { Canvas } from '../canvas.js';
import { alpineHouse, portalArch } from '../bavaria.js';
import { fbm } from '../noise.js';
import { GROUND, roundTree, spruce } from '../nature.js';
import { pairs, range } from '../range.js';
import { STEP, type Facing } from '../shapes.js';
import { marketStall, type RoomKind } from '../village.js';

export interface Mode {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  readonly line: string;
  /** Zeile unter der Spielerzahl (im echten Betrieb vom Lobby-Plugin gesetzt). */
  readonly status: string;
  /** Skin der Figur (`cast.ts`). */
  readonly skin: string;
  /** Waren auf der Theke des Marktstands. */
  readonly goods: readonly string[];
}

/** Spielmodi wie im Entwurf (Spielerzahlen sind Beispiele). */
export const MODES: readonly Mode[] = [
  {
    id: 'mornicraft',
    name: 'MorniCraft',
    colour: 'lime',
    line: '● Nur auf Einladung',
    status: 'Klick: Bewerben',
    skin: 'mornicraft',
    goods: ['hay_block', 'pumpkin', 'melon', 'potted_oak_sapling'],
  },
  {
    id: 'duels',
    name: 'Duels',
    colour: 'red',
    line: '● 12 Spieler',
    status: 'Klick: Mitspielen',
    skin: 'duels',
    goods: ['target', 'anvil', 'iron_block', 'potted_cactus'],
  },
  {
    id: 'party',
    name: 'Morni Party',
    colour: 'yellow',
    line: '● 8 Spieler',
    status: 'Klick: Mitspielen',
    skin: 'party',
    goods: ['cake', 'yellow_candle[candles=4,lit=true]', 'note_block', 'jukebox'],
  },
  {
    id: 'gipfelsturm',
    name: 'Gipfelsturm',
    colour: 'light_blue',
    line: '● 5 Spieler',
    status: 'Klick: Mitspielen',
    skin: 'gipfelsturm',
    goods: ['blue_ice', 'packed_ice', 'snow_block', 'potted_spruce_sapling'],
  },
  {
    id: 'burgverlies',
    name: 'Burgverlies',
    colour: 'purple',
    line: '● 3 Spieler',
    status: 'Klick: Mitspielen',
    skin: 'burgverlies',
    goods: ['skeleton_skull', 'chest', 'iron_bars', 'soul_lantern'],
  },
  {
    id: 'bollwerk',
    name: 'Bollwerk',
    colour: 'orange',
    line: '● 4 Spieler',
    status: 'Klick: Mitspielen',
    skin: 'bollwerk',
    goods: ['dispenser[facing=up]', 'redstone_block', 'target', 'iron_block'],
  },
  {
    id: 'mirni',
    name: 'Mirni SMP',
    colour: 'gray',
    line: '○ Bald',
    status: 'Noch geschlossen',
    skin: 'mirni',
    goods: ['grass_block', 'oak_log', 'crafting_table', 'potted_poppy'],
  },
];

/** 0 innerhalb von `from`, 1 ab `to`, weich dazwischen. */
export function ramp(d: number, from: number, to: number): number {
  const t = Math.min(1, Math.max(0, (d - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** Berg-Kranz um (cx, cz): flach innen, steil außen, mit unregelmäßigen Gipfeln. */
export function mountains(seed: number, cx: number, cz: number, inner: number, outer: number, peak: number) {
  return (x: number, z: number): number => {
    const base = ramp(Math.hypot(x - cx, z - cz), inner, outer);
    if (base <= 0) return 0;
    const ridge = 1 - Math.abs(2 * fbm(seed, x, z, 64, 4) - 1);
    const detail = fbm(seed + 1, x, z, 15, 3);
    return base * peak * (0.3 + 0.7 * ridge ** 1.6) + base * 14 * detail;
  };
}

/** Haus mittig an der Vorderkante (cx, cz) ausrichten. */
export function houseAt(
  c: Canvas,
  cx: number,
  y: number,
  cz: number,
  front: Facing,
  width: number,
  depth: number,
  floors: number,
  rnd: () => number,
  roof = 'dark_oak',
  extra: { interior?: RoomKind; sign?: string; wood?: string } = {},
): void {
  const [rx, rz] = STEP[RIGHT_SEEN_FROM_FRONT[front]];
  const half = Math.floor((width - 1) / 2);
  alpineHouse(c, {
    x: cx - rx * half,
    y,
    z: cz - rz * half,
    front,
    width,
    depth,
    floors,
    rnd,
    roof,
    ...extra,
  });
}

/** Rechts aus Sicht von jemandem, der vor dem Gebäude steht und es anschaut. */
const RIGHT_SEEN_FROM_FRONT: Readonly<Record<Facing, Facing>> = {
  north: 'west',
  south: 'east',
  east: 'north',
  west: 'south',
};

/** Portal mittig an (cx, cz) ausrichten. */
export function portalAt(c: Canvas, cx: number, y: number, cz: number, front: Facing, mode: Mode): void {
  const [rx, rz] = STEP[RIGHT_SEEN_FROM_FRONT[front]];
  portalArch(c, {
    x: cx - rx * 4,
    y,
    z: cz - rz * 4,
    front,
    colour: mode.colour,
    name: mode.name,
    line: mode.line,
    npc: true,
  });
}

/** Marktstand mit Modus-Figur mittig an (cx, cz) ausrichten. */
export function stallAt(c: Canvas, cx: number, y: number, cz: number, front: Facing, mode: Mode): void {
  const [rx, rz] = STEP[RIGHT_SEEN_FROM_FRONT[front]];
  marketStall(c, {
    x: cx - rx * 3,
    y,
    z: cz - rz * 3,
    front,
    colour: mode.colour,
    skin: mode.skin,
    name: mode.name,
    line: mode.line,
    status: mode.status,
    mode: mode.id,
    goods: mode.goods,
  });
}

/** Garten-Zaun um ein Rechteck (mit Lücke vorne in der Mitte). */
export function fence(
  c: Canvas,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
  gapAt?: [number, number],
): void {
  pairs(range(x1, x2), range(z1, z2))
    .filter(([x, z]) => x === x1 || x === x2 || z === z1 || z === z2)
    .filter(([x, z]) => !gapAt || Math.abs(x - gapAt[0]) + Math.abs(z - gapAt[1]) > 1)
    .forEach(([x, z]) => {
      const ns = z === z1 || z === z2 ? 'east=true,west=true' : 'north=true,south=true';
      c.set(x, y, z, `spruce_fence[${ns}]`);
    });
}

/** Feld mit reifem Weizen (oder Karotten) in Reihen, dazwischen Wasser. */
export function field(
  c: Canvas,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
  crop = 'wheat[age=7]',
): void {
  pairs(range(x1, x2), range(z1, z2)).forEach(([x, z]) => {
    const water = (x - x1) % 5 === 2;
    c.set(x, y, z, water ? 'water' : 'farmland[moisture=7]');
    if (!water) c.set(x, y + 1, z, crop);
  });
}

/** Laternenpfahl. */
export function lampPost(c: Canvas, x: number, y: number, z: number): void {
  c.set(x, y, z, 'polished_andesite');
  range(y + 1, y + 3).forEach((py) => c.set(x, py, z, 'dark_oak_fence'));
  c.set(x, y + 4, z, 'lantern');
}

/** Wald: Fichten an den Hängen, Laubbäume unten – nur wo `ok` erlaubt. */
export function forest(
  c: Canvas,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  height: (x: number, z: number) => number,
  ok: (x: number, z: number, h: number) => boolean,
  seed: number,
  rnd: () => number,
): void {
  pairs(range(x1, x2), range(z1, z2))
    .filter(([x, z]) => x % 5 === 0 && z % 5 === 0)
    .forEach(([gx, gz]) => {
      const x = gx + Math.floor(rnd() * 4);
      const z = gz + Math.floor(rnd() * 4);
      const h = Math.round(height(x, z));
      if (!ok(x, z, h) || fbm(seed + 11, x, z, 40, 2) < 0.48) return;
      if (h > GROUND + 6) spruce(c, x, h + 1, z, 9 + Math.floor(rnd() * 8));
      else if (rnd() < 0.5) roundTree(c, x, h + 1, z, { height: 9, radius: 3 + rnd() * 1.5, rnd });
      else spruce(c, x, h + 1, z, 8 + Math.floor(rnd() * 6));
    });
}
