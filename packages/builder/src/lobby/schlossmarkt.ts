/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/**
 * Schlossmarkt: die zweite Marktzeile auf dem Vorplatz zwischen Dorfplatz und Schlosstreppe. Der Dorfmarkt um den
 * Maibaum hat Platz für sieben Modi; alle weiteren stehen hier in einer Reihe von Ständen links und rechts der
 * Prachtstraße – mit Marktbogen und Wimpeln über der Straße, Wegweiser am Dorfplatz, Stützmauer mit Hecke zum
 * Schlossberg, Lager hinter den Ständen, Brotzeit-Bänken davor und Leuten, die schauen und einkaufen.
 */
import type { Canvas } from '../canvas.js';
import { MOEBEL } from '../furniture.js';
import { GROUND, roundTree } from '../nature.js';
import { pick, random } from '../noise.js';
import { range } from '../range.js';
import { npc, signText } from '../village.js';
import { lampPost, MODES, stallAt, type Mode } from './common.js';

/** So viele Modi stehen am Dorfmarkt um den Maibaum; alle weiteren kommen auf den Schlossmarkt. */
export const RING_MODES = 7;

/** Vorderkante der Stände (sie schauen nach Süden, zum Dorfplatz). */
const FRONT_Z = -31;
/** Mitte der Stände: innen zuerst (nah an der Prachtstraße), abwechselnd links und rechts. */
const SLOTS: readonly number[] = [-20, 20, -30, 30, -40, 40];
/** Nordrand des Vorplatzes: dahinter steigt der Schlossberg an (Stützmauer mit Hecke). */
const WALL_Z = -39;
const PLAZA = { x1: -50, x2: 50, z1: -38, z2: -23 };
/** Prachtstraße x −5 … 5 (bleibt frei, steigt zum Schloss an); daneben stehen Mauerpfeiler und Bogen. */
const STREET = 5;
const ARCH_POST = STREET + 1;

/** Der sechste Stand gehört keinem Modus: Blumen und Kräuter aus dem Schlossgarten. */
const FLOWER_STAND: Mode = {
  id: 'blumen',
  name: 'Blumen & Kräuter',
  colour: 'pink',
  line: 'Frisch aus dem Schlossgarten',
  status: 'Grüß Gott!',
  skin: 'blumenfrau',
  icon: 'poppy',
  goods: ['potted_red_tulip', 'potted_cornflower', 'potted_allium', 'potted_oxeye_daisy'],
};

/** Wo der Stand eines Modus steht (Mitte der Vorderkante), für Bilder, Rundgang und Tests. */
export interface MarketSlot {
  readonly mode: string;
  readonly x: number;
  readonly z: number;
}

/** Die Stände des Schlossmarkts in Reihenfolge (Modi ab dem achten, dann die Blumenfrau). */
export const SCHLOSSMARKT: readonly MarketSlot[] = SLOTS.map((x, i) => ({
  mode: (MODES[RING_MODES + i] ?? FLOWER_STAND).id,
  x,
  z: FRONT_Z,
}));

/**
 * Was auf dem Gelände wächst – das darf weg, wo der Vorplatz eben sein soll. Passt: "grass_block",
 * "tall_grass[half=upper]", "red_tulip"; passt nicht: "stone_bricks", "lantern".
 * https://regex101.com/?flavor=javascript&regex=%5E(grass_block%7Cdirt%7Ctall_grass%7C.*_tulip)(%5C%5B.*%5C%5D)%3F%24&testString=tall_grass%5Bhalf%3Dupper%5D
 */
const TERRAIN =
  /^(grass_block|dirt|coarse_dirt|short_grass|tall_grass|fern|large_fern|poppy|dandelion|blue_orchid|oxeye_daisy|cornflower|azure_bluet|allium|.*_tulip|lily_of_the_valley)(\[.*\])?$/;

const WALL_STONE = ['stone_bricks', 'stone_bricks', 'mossy_stone_bricks', 'andesite', 'cracked_stone_bricks'];
const HEDGE = [
  'azalea_leaves[persistent=true]',
  'azalea_leaves[persistent=true]',
  'flowering_azalea_leaves[persistent=true]',
];
const FLOWERS = [
  'poppy',
  'cornflower',
  'oxeye_daisy',
  'allium',
  'pink_tulip',
  'red_tulip',
  'azure_bluet',
  'cornflower',
];
const CRATES = [
  'barrel[facing=up]',
  'barrel[facing=up]',
  'barrel[facing=north]',
  'hay_block',
  'composter[level=8]',
];

export function buildSchlossmarkt(c: Canvas, height: (x: number, z: number) => number): void {
  const rnd = random(1611);
  levelPlaza(c, height);
  retainingWall(c, height, rnd);

  SCHLOSSMARKT.forEach((slot, i) => {
    const mode = MODES[RING_MODES + i];
    if (mode) stallAt(c, slot.x, GROUND, slot.z, 'south', mode);
    else stallAt(c, slot.x, GROUND, slot.z, 'south', FLOWER_STAND, ['mm_village', 'mm_market']);
    storeBehind(c, slot.x, rnd);
  });
  // Zwischen den Ständen: Laterne, Blumenkübel; davor Brotzeit-Garnituren
  [-1, 1].forEach((side) => {
    [25, 35].forEach((ax) => {
      const x = side * ax;
      lampPost(c, x, GROUND, FRONT_Z + 1);
      c.set(x, GROUND + 1, FRONT_Z - 1, 'spruce_trapdoor[half=top,facing=south,open=false]');
      c.set(x, GROUND + 1, FRONT_Z - 3, 'barrel[facing=up]');
      c.set(x, GROUND + 2, FRONT_Z - 3, pick(rnd, ['potted_red_tulip', 'potted_pink_tulip', 'potted_poppy']));
      brotzeit(c, x, -25);
    });
    marketCart(c, side * 47, FRONT_Z + 1, side, rnd);
  });

  marketArch(c);
  flowerBorder(c, rnd);
  signpost(c);
  marketFolk(c);
}

/** Wo der Schlossberg schon über den Vorplatz wächst, das Gras wegnehmen (die Pflaster bleiben, die Straße auch). */
function levelPlaza(c: Canvas, height: (x: number, z: number) => number): void {
  range(PLAZA.x1, PLAZA.x2)
    .filter((x) => Math.abs(x) > STREET)
    .forEach((x) =>
      range(PLAZA.z1, PLAZA.z2).forEach((z) => {
        const top = Math.round(height(x, z)) - GROUND;
        range(GROUND + 1, GROUND + top + 2).forEach((y) => {
          const b = c.get(x, y, z);
          if (b && TERRAIN.test(b)) c.set(x, y, z, 'air');
        });
      }),
    );
}

/** Stützmauer mit Hecke am Nordrand: so hoch wie der Hang dahinter, an der Straße mit Pfeilern. */
function retainingWall(c: Canvas, height: (x: number, z: number) => number, rnd: () => number): void {
  range(PLAZA.x1 + 2, PLAZA.x2 - 2)
    .filter((x) => Math.abs(x) > STREET)
    .forEach((x) => {
      const slope = Math.max(0, Math.min(4, Math.round(height(x, WALL_Z - 1)) - GROUND));
      const pillar = Math.abs(x) === ARCH_POST || x % 10 === 5 || x % 10 === -5;
      const top = GROUND + slope + (pillar ? 2 : 0);
      range(GROUND, top).forEach((y) =>
        c.set(x, y, WALL_Z, pillar ? 'chiseled_stone_bricks' : pick(rnd, WALL_STONE)),
      );
      if (pillar) {
        c.set(x, top + 1, WALL_Z, 'stone_brick_wall');
        c.set(x, top + 2, WALL_Z, 'lantern');
      } else {
        c.set(x, top + 1, WALL_Z, pick(rnd, HEDGE));
      }
      // Hinter der Mauer bis zum Hang auffüllen, damit kein Loch bleibt.
      range(GROUND + 1, GROUND + slope).forEach((y) => c.soft(x, y, WALL_Z - 1, 'dirt'));
    });
}

/** Lager hinter einem Stand: Fässer, Heu, Kisten und ein Holzstoß an der Mauer. */
function storeBehind(c: Canvas, x: number, rnd: () => number): void {
  [-3, -2, 2, 3].forEach((dx) => {
    c.set(x + dx, GROUND + 1, -37, pick(rnd, CRATES));
    if (rnd() < 0.45)
      c.set(x + dx, GROUND + 2, -37, pick(rnd, ['barrel[facing=up]', 'hay_block', 'pumpkin']));
  });
  range(-1, 1).forEach((dx) => c.set(x + dx, GROUND + 1, -38, 'spruce_log[axis=x]'));
  c.set(x, GROUND + 2, -38, 'spruce_log[axis=x]');
}

/** Brotzeit-Garnitur: Bierbank, Biertisch, Bierbank (Möbel-Paket), mit Krügen. */
function brotzeit(c: Canvas, x: number, z: number): void {
  range(x - 1, x + 1).forEach((bx) => {
    c.set(bx, GROUND + 1, z - 1, MOEBEL.bierbank);
    c.set(bx, GROUND + 1, z, MOEBEL.biertisch);
    c.set(bx, GROUND + 1, z + 1, MOEBEL.bierbank);
  });
  c.set(x, GROUND + 2, z, MOEBEL.krug(2));
}

/** Marktkarren am Ende der Reihe: Heu, Kürbisse, Melone, Speichenräder aus Falltüren. */
function marketCart(c: Canvas, x: number, z: number, side: number, rnd: () => number): void {
  range(z - 2, z).forEach((cz) => c.set(x, GROUND + 1, cz, 'spruce_slab[type=top]'));
  [z - 2, z].forEach((cz) =>
    [-1, 1].forEach((s) =>
      c.set(x + s, GROUND + 1, cz, `dark_oak_trapdoor[open=true,facing=${s < 0 ? 'west' : 'east'}]`),
    ),
  );
  c.set(x, GROUND + 2, z - 2, 'hay_block');
  c.set(x, GROUND + 2, z - 1, pick(rnd, ['pumpkin', 'melon', 'carved_pumpkin[facing=south]']));
  c.set(x, GROUND + 2, z, 'pumpkin');
  c.set(x - side, GROUND + 1, z + 1, 'oak_fence');
}

/** Marktbogen über der Prachtstraße: Pfosten, Balken, Wimpel in den Farben der Stände, Schild „Schlossmarkt“. */
function marketArch(c: Canvas): void {
  const z = -28;
  const top = GROUND + 7;
  [-ARCH_POST, ARCH_POST].forEach((x) => {
    range(GROUND + 1, top - 1).forEach((y) => c.set(x, y, z, 'stripped_dark_oak_log[axis=y]'));
    c.set(x, GROUND + 1, z - 1, 'potted_red_tulip');
    c.set(x, GROUND + 1, z + 1, 'potted_red_tulip');
  });
  range(-ARCH_POST - 1, ARCH_POST + 1).forEach((x) => c.set(x, top, z, 'dark_oak_log[axis=x]'));
  [-ARCH_POST - 1, ARCH_POST + 1].forEach((x) => c.set(x, top + 1, z, 'lantern'));
  const colours = [...MODES.slice(RING_MODES).map((m) => m.colour), FLOWER_STAND.colour];
  const pennants = [-5, -4, -3, 3, 4, 5];
  pennants.forEach((x, i) => {
    const colour = colours[i % colours.length] ?? 'white';
    c.set(x, top - 1, z + 1, `${colour}_wall_banner[facing=south]`);
    c.set(x, top - 1, z - 1, `${colours[(i + 3) % colours.length] ?? 'white'}_wall_banner[facing=north]`);
  });
  [-1, 1].forEach((x) => c.set(x, top - 1, z, 'lantern[hanging=true]'));
  const name = [{ text: 'Schlossmarkt', color: 'gold', bold: true }] as const;
  signText(c, 0.5, top - 0.75, z + 1.08, 'south', name, 1.3);
  signText(c, 0.5, top - 0.75, z - 0.08, 'north', name, 1.3);
}

/** Wegweiser am Nordausgang des Dorfplatzes: wer die neuen Modi sucht, findet sie. */
function signpost(c: Canvas): void {
  const [x, z] = [7, -21];
  range(GROUND + 1, GROUND + 3).forEach((y) => c.set(x, y, z, 'spruce_fence'));
  c.set(x, GROUND + 4, z, 'lantern');
  c.set(x, GROUND + 3, z - 1, 'spruce_wall_sign[facing=north]');
  signText(
    c,
    x + 0.5,
    GROUND + 2.6,
    z + 0.62,
    'south',
    [
      { text: '↑ Schlossmarkt\n', color: 'gold', bold: true },
      {
        text: MODES.slice(RING_MODES)
          .map((m) => m.name)
          .join(' · '),
        color: 'white',
      },
    ],
    0.8,
  );
}

/** Leute am Markt: schauen, kaufen, bummeln (zwei laufen herum). */
function marketFolk(c: Canvas): void {
  const village = ['mm_village'];
  npc(c, { x: -31, y: GROUND + 1, z: FRONT_Z + 4, look: 'north', skin: 'madl', small: true, tags: village });
  npc(c, { x: -29, y: GROUND + 1, z: FRONT_Z + 4, look: 'north', skin: 'gast2', tags: village });
  npc(c, {
    x: 21,
    y: GROUND + 1,
    z: FRONT_Z + 4,
    look: 'north',
    skin: 'gast3',
    hand: 'cookie',
    tags: village,
  });
  npc(c, {
    x: 41,
    y: GROUND + 1,
    z: FRONT_Z + 3,
    look: 'north',
    skin: 'gast8',
    hand: 'poppy',
    tags: village,
  });
  npc(c, {
    x: 35,
    y: GROUND + 1,
    z: -24,
    look: 'north',
    skin: 'gast5',
    hand: 'honey_bottle',
    sit: true,
    tags: village,
  });
  [
    [-24, -26, 'gast6'],
    [27, -27, 'bua'],
  ].forEach(([x, z, skin]) =>
    npc(c, {
      x: Number(x),
      y: GROUND + 1,
      z: Number(z),
      look: 'west',
      skin: String(skin),
      small: skin === 'bua',
      tags: ['mm_walker', 'mm_route_schlossmarkt'],
    }),
  );
  // Je eine Linde an den Enden spendet Schatten über den Karren.
  const shade = random(77);
  [-47, 47].forEach((x) =>
    roundTree(c, x, GROUND + 1, -36, { height: 9, radius: 3.4, leaves: 'oak_leaves', rnd: shade }),
  );
}

/** Blumenbeete am Südrand des Vorplatzes (zum Dorfplatz hin), mit Lücken zum Durchgehen. */
function flowerBorder(c: Canvas, rnd: () => number): void {
  const z = PLAZA.z2 + 1;
  range(PLAZA.x1 + 2, PLAZA.x2 - 2)
    .filter((x) => Math.abs(x) > 9 && Math.abs(x) % 8 < 5)
    .forEach((x) => {
      if (c.get(x, GROUND, z) !== undefined) return; // Pflaster des Dorfplatzes bleibt frei
      c.set(x, GROUND, z, 'grass_block');
      c.set(x, GROUND + 1, z, pick(rnd, FLOWERS));
    });
}
