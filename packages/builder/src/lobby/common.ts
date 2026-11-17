/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/** Gemeinsame Teile der Lobby (und der drei Entwürfe): Modi-Liste, Berg-Kulisse, Häuser mittig setzen, Laternen, Wälder. */
import type { Canvas } from '../canvas.js';
import { alpineHouse, portalArch } from '../bavaria.js';
import { fbm } from '../noise.js';
import { GROUND, ORIGIN, roundTree, spruce } from '../nature.js';
import { pairs, range } from '../range.js';
import { STEP, type Facing } from '../shapes.js';
import { marketStall, type Holds, type RoomKind } from '../village.js';

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
  /** Symbol im Kompass-Menü der Lobby (Minecraft-Gegenstand). */
  readonly icon: string;
  /** Schriftfarbe des Namens über der Figur (#rrggbb, wie auf der Webseite). */
  readonly tint?: string;
  /** Was die Figur hält (wie auf den Bildern der Webseite); ohne Angabe das Symbol in der Hand. */
  readonly holds?: Holds;
}

/** Symbol für einen Modus im Kompass-Menü (unbekannte Modi: Kompass). */
export function modeIcon(id: string): string {
  return MODES.find((m) => m.id === id)?.icon ?? 'compass';
}

/** Spielmodi wie im Entwurf (Spielerzahlen sind Beispiele). */
export const MODES: readonly Mode[] = [
  {
    id: 'mornicraft',
    name: 'MorniCraft',
    colour: 'lime',
    line: '● Nur auf Einladung',
    status: 'Rechtsklick: Bewerben',
    skin: 'mornicraft',
    icon: 'grass_block',
    tint: '#6cc644',
    holds: { hand: 'diamond_pickaxe' },
    goods: ['hay_block', 'pumpkin', 'melon', 'potted_oak_sapling'],
  },
  {
    id: 'duels',
    name: 'Duels',
    colour: 'red',
    line: '● 12 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'duels',
    icon: 'iron_sword',
    tint: '#ef4b3f',
    holds: { hand: 'iron_sword' },
    goods: ['target', 'anvil', 'iron_block', 'potted_cactus'],
  },
  {
    id: 'party',
    name: 'Morni Party',
    colour: 'yellow',
    line: '● 8 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'party',
    icon: 'cake',
    tint: '#ffc93c',
    holds: { hand: 'note_block' },
    goods: ['cake', 'yellow_candle[candles=4,lit=true]', 'note_block', 'jukebox'],
  },
  {
    id: 'gipfelsturm',
    name: 'Gipfelsturm',
    colour: 'light_blue',
    line: '● 5 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'gipfelsturm',
    icon: 'goat_horn',
    tint: '#4cb4f0',
    holds: { hand: 'iron_pickaxe' },
    goods: ['blue_ice', 'packed_ice', 'snow_block', 'potted_spruce_sapling'],
  },
  {
    id: 'burgverlies',
    name: 'Burgverlies',
    colour: 'purple',
    line: '● 3 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'burgverlies',
    icon: 'skeleton_skull',
    tint: '#a660f2',
    holds: { hand: 'mace' },
    goods: ['skeleton_skull', 'chest', 'iron_bars', 'soul_lantern'],
  },
  {
    id: 'bollwerk',
    name: 'Bollwerk',
    colour: 'orange',
    line: '● 4 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'bollwerk',
    icon: 'shield',
    tint: '#ff9a2e',
    holds: { offhand: 'shield' },
    goods: ['dispenser[facing=up]', 'redstone_block', 'target', 'iron_block'],
  },
  {
    id: 'mirni',
    name: 'MorniSMP',
    colour: 'gray',
    line: '○ bald',
    status: 'noch geschlossen',
    skin: 'mirni',
    icon: 'oak_sapling',
    tint: '#9fb0ba',
    holds: { hand: 'chest' },
    goods: ['grass_block', 'oak_log', 'crafting_table', 'potted_poppy'],
  },
  {
    id: 'wolkenkampf',
    name: 'Wolkenkampf',
    colour: 'cyan',
    line: '● 9 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'wolkenkampf',
    icon: 'white_wool',
    tint: '#53dbe3',
    holds: { hand: 'bow' },
    goods: ['white_wool', 'chest[facing=south]', 'pink_wool', 'potted_azure_bluet'],
  },
  {
    id: 'versteckerl',
    name: 'Versteckerl',
    colour: 'green',
    line: '● 11 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'versteckerl',
    icon: 'hay_block',
    tint: '#7fd35a',
    holds: { hand: 'spyglass' },
    goods: ['hay_block', 'potted_fern', 'pumpkin', 'decorated_pot'],
  },
  {
    id: 'wintersport',
    name: 'Wintersport',
    colour: 'light_gray',
    line: '● 6 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'wintersport',
    icon: 'oak_boat',
    tint: '#cfe6ff',
    holds: { hand: 'snow_block' },
    goods: ['snow_block', 'blue_ice', 'powder_snow_cauldron[level=3]', 'potted_spruce_sapling'],
  },
  {
    id: 'adlerflug',
    name: 'Adlerflug',
    colour: 'magenta',
    line: '● 4 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'adlerflug',
    icon: 'elytra',
    tint: '#f070dc',
    holds: { back: 'elytra' },
    goods: ['bell[attachment=floor,facing=south]', 'yellow_concrete', 'orange_concrete', 'potted_dandelion'],
  },
  {
    id: 'angelkoenig',
    name: 'Angelkönig',
    colour: 'blue',
    line: '● 7 spielen',
    status: 'Rechtsklick: Mitspielen',
    skin: 'angelkoenig',
    icon: 'fishing_rod',
    tint: '#5b93ff',
    holds: { hand: 'fishing_rod' },
    goods: [
      'barrel[facing=up]',
      'dried_kelp_block',
      'sea_pickle[pickles=4,waterlogged=false]',
      'potted_blue_orchid',
    ],
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
  c.tagged(`haus ${cx},${cz}`, () =>
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
    }),
  );
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
export function stallAt(
  c: Canvas,
  cx: number,
  y: number,
  cz: number,
  front: Facing,
  mode: Mode,
  npcTags?: readonly string[],
): void {
  const [rx, rz] = STEP[RIGHT_SEEN_FROM_FRONT[front]];
  c.tagged(`stand ${mode.id}`, () =>
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
      ...(npcTags ? { npcTags } : {}),
      ...(mode.tint ? { tint: mode.tint } : {}),
      holds: mode.holds ?? { hand: mode.icon },
    }),
  );
}

/** Garten-Zaun um ein Rechteck (mit Lücke um `gapAt`), an den Ecken und am Tor richtig verbunden. */
export function fence(
  c: Canvas,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
  gapAt?: [number, number],
): void {
  const onFence = (x: number, z: number): boolean =>
    x >= x1 &&
    x <= x2 &&
    z >= z1 &&
    z <= z2 &&
    (x === x1 || x === x2 || z === z1 || z === z2) &&
    (!gapAt || Math.abs(x - gapAt[0]) + Math.abs(z - gapAt[1]) > 1);
  c.tagged(`zaun ${x1},${z1}`, () =>
    pairs(range(x1, x2), range(z1, z2))
      .filter(([x, z]) => onFence(x, z))
      .forEach(([x, z]) => {
        const arms = SIDES.filter((d) => onFence(x + STEP[d][0], z + STEP[d][1])).map((d) => `${d}=true`);
        c.set(x, y, z, arms.length > 0 ? `spruce_fence[${arms.join(',')}]` : 'spruce_fence');
      }),
  );
}

const SIDES: readonly Facing[] = ['north', 'east', 'south', 'west'];

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
  c.tagged(`feld ${x1},${z1}`, () =>
    pairs(range(x1, x2), range(z1, z2)).forEach(([x, z]) => {
      const water = (x - x1) % 5 === 2;
      c.set(x, y, z, water ? 'water' : 'farmland[moisture=7]');
      if (!water) c.set(x, y + 1, z, crop);
    }),
  );
}

/** Laternenpfahl. */
export function lampPost(c: Canvas, x: number, y: number, z: number): void {
  c.tagged(`laterne ${x},${z}`, () => {
    c.set(x, y, z, 'polished_andesite');
    range(y + 1, y + 3).forEach((py) => c.set(x, py, z, 'dark_oak_fence'));
    c.set(x, y + 4, z, 'lantern');
  });
}

/**
 * Platz für einen Baum: im Umkreis `reach` von der Stammhöhe bis über die Spitze steht nichts Gebautes, und der Stamm
 * steht auf Gelände (nicht auf Weg, Feld oder Pflaster). So wächst kein Wald in Kapelle, Felder oder Wege.
 */
function roomFor(c: Canvas, x: number, h: number, z: number, reach: number, tall: number): boolean {
  const ground = c.get(x, h, z);
  // Außerhalb des Geländes (über dem Rand hinaus) gäbe es keinen Boden unter dem Stamm
  if (ground === undefined && h !== GROUND) return false;
  if (ground !== undefined && c.originAt(x, h, z) !== ORIGIN.terrain) return false;
  const r = Math.ceil(reach);
  return pairs(range(x - r, x + r), range(z - r, z + r))
    .filter(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 <= (reach + 0.5) ** 2)
    .every(([px, pz]) =>
      range(h + 1, h + tall + 2).every((py) => {
        const b = c.get(px, py, pz);
        const origin = c.originAt(px, py, pz);
        return b === undefined || b === 'air' || origin === ORIGIN.terrain || origin === ORIGIN.tree;
      }),
    );
}

/** Wie ein Wald gemischt ist. */
export interface ForestMix {
  /** Darüber nur Fichten (Höhe der Oberfläche). */
  readonly spruceAbove: number;
  /** Anteil Laubbäume darunter, der Rest sind Fichten. */
  readonly broadleaf: number;
  /** Anteil Birken unter den Laubbäumen (helles Laub, weiße Stämme). */
  readonly birch: number;
}

/** Bergwald: an den Hängen Fichten, unten halb Laubbäume. */
const MOUNTAIN_FOREST: ForestMix = { spruceAbove: GROUND + 6, broadleaf: 0.5, birch: 0 };

/** Wald: Fichten an den Hängen, Laubbäume unten – nur wo `ok` erlaubt und Platz ist. */
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
  mix: ForestMix = MOUNTAIN_FOREST,
): void {
  pairs(range(x1, x2), range(z1, z2))
    .filter(([x, z]) => x % 5 === 0 && z % 5 === 0)
    .forEach(([gx, gz]) => {
      const x = gx + Math.floor(rnd() * 4);
      const z = gz + Math.floor(rnd() * 4);
      const h = Math.round(height(x, z));
      if (!ok(x, z, h) || fbm(seed + 11, x, z, 40, 2) < 0.48) return;
      if (h > mix.spruceAbove) {
        const tall = 9 + Math.floor(rnd() * 8);
        if (roomFor(c, x, h, z, spruceReach(tall), tall)) spruce(c, x, h + 1, z, tall);
      } else if (rnd() < mix.broadleaf) {
        const radius = 3 + rnd() * 1.5;
        const birch = mix.birch > 0 && rnd() < mix.birch;
        const wood = birch ? { log: 'birch_log', leaves: 'birch_leaves' } : {};
        if (roomFor(c, x, h, z, radius * ROUND_CROWN_REACH, 9))
          roundTree(c, x, h + 1, z, { height: 9, radius, rnd, ...wood });
      } else {
        const tall = 8 + Math.floor(rnd() * 6);
        if (roomFor(c, x, h, z, spruceReach(tall), tall)) spruce(c, x, h + 1, z, tall);
      }
    });
}

/** Wie weit eine Fichte zur Seite reicht (unterster Ring + Spitze der Raute). */
const spruceReach = (tall: number): number => Math.max(1, Math.round(tall / 4)) + 1;
/** Laubkrone mit Ausbuchtungen reicht etwa so weit wie das 1,3-Fache des Radius. */
const ROUND_CROWN_REACH = 1.3;
