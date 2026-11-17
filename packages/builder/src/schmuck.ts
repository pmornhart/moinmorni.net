/* eslint-disable ts-patterns/no-magic-numbers -- Modell-Maße in 1/16 Block (Minecraft-Modellkoordinaten) */
/**
 * Christbaumkugeln der Winter-Lobby und Ostereier als eigenes kleines Modell im Lobby-Paket (ein Ei ist eine in die Höhe
 * gezogene Kugel).
 *
 * Die Kugeln sind Block-Anzeigen (ohne Hitbox) aus Trockenbeton-Blöcken, die es in der Lobby sonst nirgends gibt.
 * Ohne Paket (oder auf Bedrock) sieht man einen schräg gestellten Würfel in der Farbe – wie ein Edelstein. Mit dem
 * Paket bekommt genau dieser Block eine runde Form: übereinander gestapelte Scheiben, jede aus vier gegeneinander
 * gedrehten Quadraten – von allen Seiten rund, darum stört die schräge Lage nicht.
 *
 * Nur Texturen, die jedes Minecraft schon hat (Beton, Gold, Eisen) – keine Dateien von Mojang im Paket.
 */

type Vec = readonly [number, number, number];

/** Block je Farbe (Trockenbeton – kommt in der Lobby sonst nicht vor, Test in `winter.test.ts`). */
export const KUGELN = {
  rot: 'red_concrete_powder',
  gold: 'yellow_concrete_powder',
  silber: 'light_gray_concrete_powder',
  blau: 'blue_concrete_powder',
  // Ostereier: dieselbe runde Form, in die Höhe gezogen (Anzeige höher als breit)
  rosa: 'pink_concrete_powder',
  gruen: 'lime_concrete_powder',
  hellblau: 'light_blue_concrete_powder',
  lila: 'magenta_concrete_powder',
  orange: 'orange_concrete_powder',
} as const;
export type KugelFarbe = keyof typeof KUGELN;

/** Textur der runden Kugel (aus dem Spiel). */
const TEXTUR: Readonly<Record<KugelFarbe, string>> = {
  rot: 'minecraft:block/red_concrete',
  gold: 'minecraft:block/gold_block',
  silber: 'minecraft:block/iron_block',
  blau: 'minecraft:block/blue_concrete',
  rosa: 'minecraft:block/pink_concrete',
  gruen: 'minecraft:block/lime_concrete',
  hellblau: 'minecraft:block/light_blue_concrete',
  lila: 'minecraft:block/magenta_concrete',
  orange: 'minecraft:block/orange_concrete',
};

const MIDDLE = 8;
/** Scheiben der Kugel: [unten, oben, halbe Breite] – ein Kreis mit Radius 7 um die Mitte. */
const SLICES: readonly (readonly [number, number, number])[] = [
  [1, 3, 3.2],
  [3, 5, 5.2],
  [5, 11, 6.2],
  [11, 13, 5.2],
  [13, 15, 3.2],
];
/** Jede Scheibe aus vier Quadraten, je 22,5° weiter gedreht (Minecraft erlaubt −45 … 45 in diesen Schritten). */
const TURNS: readonly number[] = [0, 22.5, 45, -22.5];
const FACES = ['north', 'south', 'east', 'west', 'up', 'down'] as const;

function slice(y1: number, y2: number, half: number, angle: number): Record<string, unknown> {
  const from: Vec = [MIDDLE - half, y1, MIDDLE - half];
  const to: Vec = [MIDDLE + half, y2, MIDDLE + half];
  return {
    from,
    to,
    ...(angle ? { rotation: { angle, axis: 'y', origin: [MIDDLE, MIDDLE, MIDDLE] } } : {}),
    faces: Object.fromEntries(FACES.map((f) => [f, { texture: '#kugel' }])),
  };
}

/** Block-Modell einer runden Kugel in dieser Farbe. */
export function kugelModel(farbe: KugelFarbe): Record<string, unknown> {
  return {
    textures: { kugel: TEXTUR[farbe], particle: TEXTUR[farbe] },
    elements: SLICES.flatMap(([y1, y2, half]) => TURNS.map((angle) => slice(y1, y2, half, angle))),
  };
}

/** Modelle (Name → JSON) und Blockzustände (Block → JSON) für das Lobby-Paket. */
export function schmuckModels(ns: string): {
  readonly models: Readonly<Record<string, Record<string, unknown>>>;
  readonly blockstates: Readonly<Record<string, unknown>>;
} {
  const farben = Object.keys(KUGELN) as KugelFarbe[];
  return {
    models: Object.fromEntries(farben.map((f) => [`kugel_${f}`, kugelModel(f)])),
    blockstates: Object.fromEntries(
      farben.map((f) => [KUGELN[f], { variants: { '': { model: `${ns}:block/schmuck/kugel_${f}` } } }]),
    ),
  };
}
