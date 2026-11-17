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

/** `custom_model_data`-Text einer Kugel (`moinmorni:kugel`): nur damit wird der Trockenbeton rund. */
export const KUGEL_KEY = 'moinmorni:kugel';

/**
 * Modelle (Name → JSON) und Gegenstände (Trockenbeton-Gegenstand → JSON) für das Netzwerk-Paket. Rund wird nur ein
 * Trockenbeton-Gegenstand mit unserem Namen (`KUGEL_KEY`) – in Item-Anzeigen der Lobby. Gebauter Trockenbeton und
 * Trockenbeton im Inventar sehen auf jedem Server aus wie immer.
 */
export function schmuckModels(ns: string): {
  readonly models: Readonly<Record<string, Record<string, unknown>>>;
  readonly items: Readonly<Record<string, Record<string, unknown>>>;
} {
  const farben = Object.keys(KUGELN) as KugelFarbe[];
  return {
    models: Object.fromEntries(farben.map((f) => [`kugel_${f}`, kugelModel(f)])),
    items: Object.fromEntries(
      farben.map((f) => [
        KUGELN[f],
        {
          model: {
            type: 'minecraft:select',
            property: 'minecraft:custom_model_data',
            index: 0,
            cases: [
              {
                when: KUGEL_KEY,
                model: { type: 'minecraft:model', model: `${ns}:block/schmuck/kugel_${f}` },
              },
            ],
            fallback: { type: 'minecraft:model', model: `minecraft:block/${KUGELN[f]}` },
          },
        },
      ]),
    ),
  };
}

/**
 * Kugeln (und Ostereier) bauen die Saison-Pläne als Block-Anzeigen aus Trockenbeton – so prüft die Bauplan-Prüfung
 * sie wie alle Deko. Beim Bauen (`lobby/datapack.ts`) wird daraus eine Item-Anzeige desselben Trockenbetons mit
 * unserem Namen (`KUGEL_KEY`): mit Paket rund, ohne Paket der Würfel wie vorher. Item-Anzeigen zeichnen das Modell um
 * die Mitte – die Verschiebung der Block-Anzeige (halbe Größe, mitgedreht) fällt darum weg; Drehung und Größe bleiben.
 * Andere Befehle bleiben, wie sie sind.
 *
 * Passt: "summon block_display 1 2 3 {…,block_state:{Name:'minecraft:red_concrete_powder',id:'minecraft:red_concrete_powder'},transformation:{left_rotation:[…],right_rotation:[0f,0f,0f,1f],translation:[…],scale:[…]}…}"
 * https://regex101.com/?flavor=javascript&regex=%5Esummon%20block_display%20(%5CS%2B%20%5CS%2B%20%5CS%2B)%20%5C%7B(.*)block_state%3A%5C%7BName%3A'minecraft%3A(%5Ba-z_%5D%2Bconcrete_powder)'%5B%5E%7D%5D*%5C%7D%2C(.*)translation%3A%5C%5B%5B%5E%5C%5D%5D*%5C%5D(.*)%24
 */
const KUGEL_BLOCK_DISPLAY =
  /^summon block_display (\S+ \S+ \S+) \{(.*)block_state:\{Name:'minecraft:([a-z_]+concrete_powder)'[^}]*\},(.*)translation:\[[^\]]*\](.*)$/;
const KUGEL_BLOCKS: ReadonlySet<string> = new Set(Object.values(KUGELN));

export function kugelAsItem(command: string): string {
  const m = KUGEL_BLOCK_DISPLAY.exec(command);
  if (!m || !KUGEL_BLOCKS.has(m[3] ?? '')) return command;
  const [, at, before, block, middle, after] = m;
  return (
    `summon item_display ${at} {${before}item:{id:'minecraft:${block}',count:1,components:{'minecraft:custom_model_data':{strings:['${KUGEL_KEY}']}}},` +
    `item_display:'none',${middle}translation:[0f,0f,0f]${after}`
  );
}
