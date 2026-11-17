/* eslint-disable ts-patterns/no-magic-numbers -- small models: sizes and offsets in blocks as the figures need them */
/**
 * Kleine Modelle der Winter-Deko aus Block-Anzeigen (eigene Bauten, nur Minecraft-Blöcke): Geschenk, Schneemann,
 * Rodel, großer Pferdeschlitten, Stern, die Figuren der Krippe und ein Lebkuchenherz-Brett.
 * Koordinaten je Modell: Boden-Mitte = (0, 0, 0), vorne = +z, oben = +y (siehe `placeModel` in `deko.ts`).
 */
import { range } from '../range.js';
import { aroundX, aroundY, aroundZ, multiply, type ModelPart, type Vec } from './deko.js';

/** Hautfarbe der Figuren: weiße Terrakotta ist in Minecraft ein warmes Beige. */
const SKIN = 'white_terracotta';

const shift = (parts: readonly ModelPart[], by: Vec): ModelPart[] =>
  parts.map((p) => ({ ...p, at: [p.at[0] + by[0], p.at[1] + by[1], p.at[2] + by[2]] as Vec }));

/** Ein Geschenk: Schachtel, Band über Kreuz, Schleife oben. */
export function present(size: number, box: string, ribbon: string): ModelPart[] {
  const h = size * 0.85;
  return [
    { at: [0, h / 2, 0], block: box, scale: [size, h, size] },
    { at: [0, h / 2, 0], block: ribbon, scale: [size + 0.02, h + 0.02, 0.1] },
    { at: [0, h / 2, 0], block: ribbon, scale: [0.1, h + 0.02, size + 0.02] },
    { at: [0, h + 0.07, 0], block: ribbon, scale: [0.18, 0.12, 0.18], rotation: aroundY(Math.PI / 4) },
    { at: [0, h + 0.07, 0], block: ribbon, scale: [0.18, 0.12, 0.18] },
  ];
}

/** Schneemann mit Kohle-Augen, Rüben-Nase, Knöpfen, Schal, Zylinder und Ast-Armen. */
export function schneemann(): ModelPart[] {
  const round = (y: number, size: number): ModelPart[] => [
    { at: [0, y, 0], block: 'snow_block', scale: [size, size, size] },
    { at: [0, y, 0], block: 'snow_block', scale: [size, size - 0.02, size], rotation: aroundY(Math.PI / 4) },
  ];
  const coal = (x: number, y: number, z: number, size: number): ModelPart => ({
    at: [x, y, z],
    block: 'coal_block',
    scale: [size, size, 0.04],
  });
  return [
    ...round(0.5, 1.0),
    ...round(1.32, 0.74),
    ...round(1.95, 0.54),
    coal(-0.11, 2.03, 0.285, 0.075),
    coal(0.11, 2.03, 0.285, 0.075),
    { at: [0, 1.95, 0.5], block: 'orange_concrete', scale: [0.075, 0.075, 0.26] },
    coal(0, 1.18, 0.53, 0.08),
    coal(0, 1.33, 0.53, 0.08),
    coal(0, 1.48, 0.53, 0.08),
    { at: [0, 1.69, 0], block: 'red_wool', scale: [0.62, 0.12, 0.62] },
    { at: [0, 1.69, 0], block: 'red_wool', scale: [0.6, 0.11, 0.6], rotation: aroundY(Math.PI / 4) },
    { at: [0.2, 1.53, 0.42], block: 'red_wool', scale: [0.14, 0.32, 0.05] },
    { at: [0, 2.245, 0], block: 'black_concrete', scale: [0.52, 0.05, 0.52] },
    { at: [0, 2.43, 0], block: 'black_concrete', scale: [0.34, 0.33, 0.34] },
    { at: [0, 2.31, 0], block: 'red_concrete', scale: [0.35, 0.06, 0.35] },
    { at: [-0.62, 1.48, 0], block: 'spruce_log', scale: [0.7, 0.06, 0.06], rotation: aroundZ(-0.45) },
    { at: [0.62, 1.48, 0], block: 'spruce_log', scale: [0.7, 0.06, 0.06], rotation: aroundZ(0.45) },
  ];
}

/** Kleiner Rodel mit Kufen, auf Wunsch mit zwei Geschenken. */
export function rodel(withPresents: boolean): ModelPart[] {
  const runners = [-0.3, 0.3].flatMap((x): ModelPart[] => [
    { at: [x, 0.035, -0.05], block: 'iron_block', scale: [0.06, 0.07, 1.45] },
    { at: [x, 0.17, 0.74], block: 'iron_block', scale: [0.06, 0.07, 0.36], rotation: aroundX(-0.95) },
  ]);
  const posts = [-0.3, 0.3].flatMap((x) =>
    [-0.45, 0.4].map((z): ModelPart => ({
      at: [x, 0.18, z],
      block: 'spruce_planks',
      scale: [0.06, 0.22, 0.06],
    })),
  );
  const load: ModelPart[] = withPresents
    ? [
        ...shift(present(0.42, 'red_wool', 'gold_block'), [0, 0.35, -0.22]),
        ...shift(present(0.32, 'green_wool', 'white_wool'), [0.05, 0.35, 0.26]),
      ]
    : [{ at: [0, 0.37, -0.2], block: 'red_wool', scale: [0.6, 0.04, 0.62] }];
  return [
    ...runners,
    ...posts,
    { at: [0, 0.32, -0.05], block: 'spruce_planks', scale: [0.72, 0.06, 1.1] },
    ...load,
  ];
}

/** Großer roter Pferdeschlitten mit goldenen Kufen, Sitzbank und Geschenken (ohne Pferd). */
export function grosserSchlitten(): ModelPart[] {
  const gold = 'gold_block';
  const red = 'red_concrete';
  const runners = [-0.62, 0.62].flatMap((x): ModelPart[] => [
    { at: [x, 0.05, -0.15], block: gold, scale: [0.08, 0.1, 2.3] },
    { at: [x, 0.33, 1.18], block: gold, scale: [0.08, 0.1, 0.62], rotation: aroundX(-1.05) },
    { at: [x, 0.62, 1.38], block: gold, scale: [0.08, 0.1, 0.3], rotation: aroundX(-2.1) },
    ...[-0.95, 0, 0.75].map((z): ModelPart => ({ at: [x, 0.28, z], block: gold, scale: [0.07, 0.36, 0.07] })),
  ]);
  const body: ModelPart[] = [
    { at: [0, 0.5, -0.1], block: red, scale: [1.36, 0.12, 2.0] },
    ...[-0.66, 0.66].flatMap((x): ModelPart[] => [
      { at: [x, 0.78, -0.1], block: red, scale: [0.08, 0.5, 2.0] },
      { at: [x, 1.05, -0.1], block: gold, scale: [0.12, 0.06, 2.04] },
    ]),
    { at: [0, 1.15, -1.08], block: red, scale: [1.4, 1.2, 0.1] },
    { at: [0, 1.78, -1.08], block: gold, scale: [1.44, 0.07, 0.14] },
    { at: [0, 0.82, 0.95], block: red, scale: [1.36, 0.55, 0.1], rotation: aroundX(-0.35) },
    { at: [0, 1.1, 1.03], block: gold, scale: [1.4, 0.06, 0.12], rotation: aroundX(-0.35) },
    // Sitzbank mit Polster und Decke
    { at: [0, 0.78, -0.72], block: 'spruce_planks', scale: [1.2, 0.36, 0.6] },
    { at: [0, 1.0, -0.72], block: 'red_wool', scale: [1.18, 0.1, 0.58] },
    { at: [0, 1.06, -0.4], block: 'green_wool', scale: [1.1, 0.05, 0.25], rotation: aroundX(0.6) },
  ];
  const load: ModelPart[] = [
    ...shift(present(0.5, 'white_wool', 'red_wool'), [-0.3, 0.56, 0.25]),
    ...shift(present(0.42, 'green_wool', 'gold_block'), [0.3, 0.56, 0.35]),
    ...shift(present(0.36, 'blue_wool', 'white_wool'), [0.05, 0.56, -0.1]),
    ...shift(present(0.3, 'purple_wool', 'gold_block'), [0.32, 0.98, 0.32]),
    // Sack mit Tannenzweig
    { at: [-0.3, 1.05, 0.1], block: 'brown_wool', scale: [0.42, 0.62, 0.42] },
    { at: [-0.3, 1.42, 0.1], block: 'brown_wool', scale: [0.2, 0.14, 0.2] },
    {
      at: [-0.3, 1.55, 0.1],
      block: 'spruce_leaves',
      scale: [0.34, 0.2, 0.34],
      properties: { persistent: 'true' },
    },
  ];
  return [...runners, ...body, ...load];
}

/**
 * Fünfzackiger Stern (Größe ≈ `size` von Spitze zu Spitze), in drei Ebenen über Kreuz – von jeder Seite ein Stern.
 * Mitte bei (0, 0, 0).
 */
export function stern(size: number, block = 'gold_block'): ModelPart[] {
  const r = size / 2;
  const plane = (yaw: number): ModelPart[] => {
    const turn = aroundY(yaw);
    return range(0, 4).flatMap((k): ModelPart[] => {
      const a = Math.PI / 2 + (k * 2 * Math.PI) / 5;
      const along = (d: number): Vec => {
        const [x, y] = [Math.cos(a) * d, Math.sin(a) * d];
        return [x * Math.cos(yaw), y, -x * Math.sin(yaw)];
      };
      const roll = multiply(turn, aroundZ(a - Math.PI / 2));
      return [
        { at: along(r * 0.42), block, scale: [r * 0.36, r * 0.56, r * 0.12], rotation: roll, glow: true },
        { at: along(r * 0.8), block, scale: [r * 0.18, r * 0.42, r * 0.1], rotation: roll, glow: true },
      ];
    });
  };
  const middle: ModelPart[] = [
    { at: [0, 0, 0], block, scale: [r * 0.5, r * 0.5, r * 0.5], rotation: aroundY(Math.PI / 4), glow: true },
    { at: [0, 0, 0], block, scale: [r * 0.5, r * 0.5, r * 0.5], rotation: aroundX(Math.PI / 4), glow: true },
  ];
  return [...plane(0), ...plane(Math.PI / 3), ...plane((2 * Math.PI) / 3), ...middle];
}

// ---------- Krippe ----------

/** Maria, kniend, im blauen Mantel mit weißem Schleier, die Hände gefaltet. */
export function maria(): ModelPart[] {
  return [
    { at: [0, 0.22, -0.05], block: 'blue_wool', scale: [0.6, 0.44, 0.66] },
    { at: [0, 0.74, -0.02], block: 'light_blue_wool', scale: [0.44, 0.62, 0.32] },
    { at: [0, 0.78, -0.2], block: 'blue_wool', scale: [0.52, 0.8, 0.08] },
    { at: [0, 1.22, 0.01], block: SKIN, scale: [0.3, 0.3, 0.3] },
    { at: [0, 1.27, -0.04], block: 'white_wool', scale: [0.36, 0.38, 0.28] },
    { at: [0, 0.82, 0.2], block: SKIN, scale: [0.12, 0.2, 0.1], rotation: aroundX(-0.3) },
  ];
}

/** Josef, stehend, im braunen Gewand mit grünem Umhang, Bart und Wanderstab. */
export function josef(): ModelPart[] {
  return [
    { at: [0, 0.6, 0], block: 'brown_wool', scale: [0.46, 1.2, 0.34] },
    { at: [0, 0.75, -0.19], block: 'green_wool', scale: [0.54, 1.0, 0.07] },
    { at: [0, 0.9, 0.01], block: 'spruce_planks', scale: [0.48, 0.08, 0.36] },
    { at: [0, 1.39, 0], block: SKIN, scale: [0.32, 0.32, 0.32] },
    { at: [0, 1.56, -0.02], block: 'brown_terracotta', scale: [0.34, 0.08, 0.34] },
    { at: [0, 1.27, 0.15], block: 'light_gray_wool', scale: [0.24, 0.16, 0.06] },
    { at: [0.36, 0.95, 0.12], block: 'spruce_log', scale: [0.07, 1.9, 0.07] },
    { at: [0.36, 1.92, 0.12], block: 'spruce_log', scale: [0.09, 0.1, 0.18] },
    { at: [0.25, 1.0, 0.12], block: SKIN, scale: [0.1, 0.1, 0.1] },
  ];
}

/** Futterkrippe mit Heu, darin das Kind in weißen Windeln – es leuchtet. */
export function krippeMitKind(): ModelPart[] {
  const wood = 'spruce_planks';
  const legs = [-1, 1].flatMap((side) =>
    [-0.25, 0.25].map((z): ModelPart => ({
      at: [side * 0.32, 0.18, z],
      block: 'spruce_log',
      scale: [0.06, 0.42, 0.06],
      rotation: aroundZ(side * 0.35),
    })),
  );
  return [
    ...legs,
    { at: [0, 0.48, 0.26], block: wood, scale: [0.9, 0.3, 0.05], rotation: aroundX(-0.25) },
    { at: [0, 0.48, -0.26], block: wood, scale: [0.9, 0.3, 0.05], rotation: aroundX(0.25) },
    { at: [0.44, 0.48, 0], block: wood, scale: [0.05, 0.3, 0.56] },
    { at: [-0.44, 0.48, 0], block: wood, scale: [0.05, 0.3, 0.56] },
    { at: [0, 0.4, 0], block: wood, scale: [0.84, 0.05, 0.4] },
    { at: [0, 0.57, 0], block: 'hay_block', scale: [0.86, 0.12, 0.5], properties: { axis: 'x' } },
    { at: [-0.04, 0.68, 0], block: 'white_wool', scale: [0.4, 0.14, 0.22], glow: true },
    { at: [0.22, 0.7, 0], block: SKIN, scale: [0.14, 0.14, 0.14], glow: true },
  ];
}

/** Ochse, liegend: braun, helle Schnauze, Hörner. */
export function ochse(): ModelPart[] {
  return [
    { at: [0, 0.3, -0.1], block: 'brown_terracotta', scale: [0.82, 0.56, 1.3] },
    { at: [0, 0.6, 0.72], block: 'brown_terracotta', scale: [0.46, 0.46, 0.46] },
    { at: [0, 0.5, 0.98], block: SKIN, scale: [0.34, 0.22, 0.1] },
    { at: [0, 0.92, 0.7], block: 'white_concrete', scale: [0.62, 0.07, 0.07] },
    { at: [0.33, 0.98, 0.7], block: 'white_concrete', scale: [0.06, 0.14, 0.06] },
    { at: [-0.33, 0.98, 0.7], block: 'white_concrete', scale: [0.06, 0.14, 0.06] },
    { at: [0.38, 0.06, 0.38], block: 'brown_terracotta', scale: [0.2, 0.12, 0.38] },
    { at: [-0.38, 0.06, 0.38], block: 'brown_terracotta', scale: [0.2, 0.12, 0.38] },
  ];
}

/** Esel, liegend: grau, lange Ohren, dunkle Mähne. */
export function esel(): ModelPart[] {
  return [
    { at: [0, 0.26, -0.05], block: 'light_gray_terracotta', scale: [0.62, 0.48, 1.05] },
    {
      at: [0, 0.66, 0.6],
      block: 'light_gray_terracotta',
      scale: [0.32, 0.34, 0.52],
      rotation: aroundX(0.35),
    },
    { at: [0, 0.6, 0.86], block: 'white_terracotta', scale: [0.26, 0.2, 0.12] },
    {
      at: [0.1, 0.98, 0.5],
      block: 'light_gray_terracotta',
      scale: [0.07, 0.32, 0.05],
      rotation: aroundZ(-0.2),
    },
    {
      at: [-0.1, 0.98, 0.5],
      block: 'light_gray_terracotta',
      scale: [0.07, 0.32, 0.05],
      rotation: aroundZ(0.2),
    },
    { at: [0, 0.62, 0.28], block: 'gray_wool', scale: [0.08, 0.2, 0.36] },
  ];
}

/** Schaf, liegend: weiße Wolle, dunkler Kopf. */
export function schaf(): ModelPart[] {
  return [
    { at: [0, 0.28, 0], block: 'white_wool', scale: [0.6, 0.5, 0.8] },
    { at: [0, 0.4, 0.45], block: 'brown_terracotta', scale: [0.26, 0.28, 0.26] },
    { at: [0, 0.5, 0.42], block: 'white_wool', scale: [0.3, 0.1, 0.18] },
  ];
}
