/* eslint-disable ts-patterns/no-magic-numbers -- Modell-Maße in Skin-Pixeln bzw. 1/16 Block (Minecraft-Modellkoordinaten) */
/**
 * Trachten in 3D für die Figuren der Lobby (Ressourcenpaket): Hüte, Bärte und Dutt am Kopf, Dirndl-Rock mit Schürze
 * und langes Haar bzw. Zöpfe am Körper – nur, was über die Figur hinausragt. Alles Flache (Haar auf dem Kopf, Mieder,
 * Westen, Hosenträger, gemalte Hüte) zeichnet der Skin selbst, auch auf seiner zweiten Ebene (`skins.ts`).
 *
 * Der Kniff: Alle Teile sind Gegenstände mit dem Modell `minecraft:air` – das ist in Minecraft leer. Ohne unser Paket
 * (oder auf Bedrock) sieht man also gar nichts davon, nur den gewohnten Skin. Unser Paket ersetzt `items/air.json`:
 * Dort wählt `custom_model_data` (Texte) die Teile aus, die Farben kommen aus `custom_model_data` (Farben) – so reicht
 * ein Modell pro Hut/Kleidungsstück für alle Farben der Figuren.
 *
 * - Kopf: im Kopf-Platz der Figur; dreht und nickt mit dem Kopf. Modellraum: der Kopf liegt in [1,6 … 14,4], vorne = z
 *   klein, ein Skin-Pixel = 1,6. Die Hüte umschließen die drei obersten Reihen, auf die der Skin seinen Hut malt.
 * - Körper: ein Anzeige-Objekt, das auf der Figur „mitfährt“ (Passagier). Modellraum = Skin-Pixel, Füße bei y 0,
 *   Körper x 4…12, z 6…10, vorne = z klein. Stehende Figuren drehen nur den Kopf (der Körper bleibt, wo er ist); bei
 *   laufenden Figuren dreht das Lobby-Plugin den Körper-Teil mit.
 *
 * Alles hier ist selbst gezeichnet (Texturen als Pixel-Muster), nichts von Mojang.
 */
import type { Outfit } from './skins.js';
import { Picture } from './png.js';
import { random } from './noise.js';

type Vec = readonly [number, number, number];
type Face = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
const FACES: readonly Face[] = ['north', 'south', 'east', 'west', 'up', 'down'];
export const TRACHT_NS = 'moinmorni';

/** Eigene Texturen (16×16), hell gezeichnet – die Farbe kommt beim Zeichnen dazu (`tint`). */
type TexName =
  | 'haar'
  | 'filz'
  | 'stroh'
  | 'stoff'
  | 'schuerze'
  | 'feder'
  | 'metall'
  | 'band'
  | 'glas'
  // Modus-Figuren (17.11.): eingefärbt (`seil`, `schwinge`, `ski`) bzw. fertig gefärbt (alle anderen)
  | 'seil'
  | 'schwinge'
  | 'ski'
  | 'feder_rosa'
  | 'feder_blau'
  | 'feder_gruen'
  | 'busch_orange'
  | 'busch_weiss'
  | 'lampe'
  | 'skiglas'
  | 'gold'
  | 'gurt';
interface Part {
  readonly from: Vec;
  readonly to: Vec;
  readonly tex: TexName;
  /** Welche Farbe der Figur (Index in den Farben des Teils); ohne = Textur so wie sie ist. */
  readonly tint?: number;
  readonly rotation?: { readonly angle: number; readonly axis: 'x' | 'y' | 'z'; readonly origin: Vec };
}
const p = (from: Vec, to: Vec, tex: TexName, tint?: number, rotation?: Part['rotation']): Part => ({
  from,
  to,
  tex,
  ...(tint === undefined ? {} : { tint }),
  ...(rotation ? { rotation } : {}),
});

// ---------------------------------------------------------------------------------------------------------------
// Kopf: ein Skin-Pixel = 1,6 Einheiten, der Kopf liegt in [1,6 … 14,4]. `h(px)` = Kante bei Pixel px (0 … 8, von
// unten bzw. links/vorn gezählt).
// Die zweite Ebene des Skins liegt 0,8 außerhalb des Kopfs (dort sind Haare und gemalte Hüte). Was das Paket dazu
// gibt, liegt nie genau dort (sonst flimmert es): Hüte umschließen die Ebene mit 1,0 Abstand, Bart und Dutt liegen
// davor bzw. dahinter. Haare auf dem Kopf malt der Skin selbst (zweite Ebene) – im Paket nur, was absteht.
// ---------------------------------------------------------------------------------------------------------------
const PX = 1.6;
const LO = 1.6;
const HI = 14.4;
const h = (px: number): number => LO + px * PX;
/** Abstand der Hutwände zum Kopf – außerhalb der zweiten Ebene (0,8). */
const HAT = 1.0;
/** Unterkante der Hüte: knapp unter der dritten Reihe von oben (so weit malt der Skin den Hut). */
const BRIM = h(5) - 0.24;
const X0 = LO - HAT;
const X1 = HI + HAT;

/** Dutt am Hinterkopf (ohne Hut oben, mit Hut tiefer im Nacken), Haarnadel in Farbe 1. */
const BUN = (top: number): Part[] => [
  p([h(2.6), top - 4.4, HI + HAT], [h(5.4), top, HI + 3.4], 'haar', 0),
  p([h(3.1), top - 3.9, HI + 3.4], [h(4.9), top - 0.5, HI + 4.2], 'haar', 0),
  p([h(1.8), top - 2.4, HI + 2.0], [h(6.2), top - 1.9, HI + 2.4], 'band', 1),
];
const HAIR: Readonly<Record<'bun' | 'bun_low', readonly Part[]>> = {
  bun: BUN(h(7.8)),
  bun_low: BUN(h(4.6)),
};

/** Bart: Schnurrbart, Kinnbart mit Lücke für den Mund, Koteletten (Farbe 0). */
const BEARD: readonly Part[] = [
  p([h(1.5), h(1.0), LO - 0.6], [h(6.5), h(2.0), LO], 'haar', 0), // Schnurrbart
  p([h(0.6), LO - 0.9, LO - 0.6], [h(3), h(1.0), LO], 'haar', 0), // Kinn links
  p([h(5), LO - 0.9, LO - 0.6], [h(7.4), h(1.0), LO], 'haar', 0), // Kinn rechts
  p([h(3), LO - 0.9, LO - 0.6], [h(5), h(0.3), LO], 'haar', 0), // unter dem Mund
  p([h(0.6), LO - 0.9, LO], [h(7.4), LO, h(4)], 'haar', 0), // unterm Kinn
  p([LO - 0.6, h(1.0), LO], [LO, h(4), h(3)], 'haar', 0), // Koteletten
  p([HI, h(1.0), LO], [HI + 0.6, h(4), h(3)], 'haar', 0),
];

/** Hüte: Farbe 0 = Hut, Farbe 1 = Band/Zierde. Krone und Wände umschließen die gemalten Hutreihen des Skins. */
const HATS: Readonly<Record<string, readonly Part[]>> = {
  tyrol: [
    p([LO - 2.6, BRIM, LO - 2.6], [HI + 2.6, BRIM + 0.6, HI + 2.6], 'filz', 0), // Krempe
    p([X0, BRIM + 0.6, X0], [X1, HI + 3.4, X1], 'filz', 0), // Kopf
    p([X0 + 1.6, HI + 3.4, X0 + 2.4], [X1 - 1.6, HI + 4.2, X1 - 2.4], 'filz', 0), // Kniff oben
    p([X0 - 0.2, BRIM + 0.6, X0 - 0.2], [X1 + 0.2, BRIM + 1.8, X1 + 0.2], 'band', 1), // Hutband
    p([X1 + 0.2, BRIM + 1.0, 8.4], [X1 + 1.8, BRIM + 6.6, 10.8], 'feder', undefined, {
      angle: -22.5,
      axis: 'z',
      origin: [X1 + 0.4, BRIM + 1.2, 9.6],
    }), // Gamsbart
  ],
  straw: [
    p([LO - 4, BRIM, LO - 4], [HI + 4, BRIM + 0.6, HI + 4], 'stroh'),
    p([X0, BRIM + 0.6, X0], [X1, HI + 2.6, X1], 'stroh'),
    p([X0 - 0.2, BRIM + 0.6, X0 - 0.2], [X1 + 0.2, BRIM + 1.6, X1 + 0.2], 'band', 1),
  ],
  chef: [
    p([X0, BRIM, X0], [X1, HI + 2, X1], 'stoff', 0),
    p([LO - 2, HI + 2, LO - 2], [HI + 2, HI + 7.6, HI + 2], 'stoff', 0),
    p([LO - 1, HI + 7.6, LO - 1], [HI + 1, HI + 8.4, HI + 1], 'stoff', 0),
  ],
  beanie: [
    p([X0, BRIM, X0], [X1, HI + 1.8, X1], 'filz', 0),
    p([X0 - 0.3, BRIM, X0 - 0.3], [X1 + 0.3, BRIM + 1.6, X1 + 0.3], 'filz', 1), // Umschlag
    p([LO + 0.8, HI + 1.8, LO + 0.8], [HI - 0.8, HI + 2.6, HI - 0.8], 'filz', 0),
    p([6, HI + 2.6, 6], [10, HI + 5.4, 10], 'filz', 1), // Bommel
  ],
  cap: [
    p([X0, BRIM, X0], [X1, HI + 1.8, X1], 'filz', 0),
    p([LO + 0.4, HI + 1.8, LO + 0.4], [HI - 0.4, HI + 2.4, HI - 0.4], 'filz', 0),
    p([LO, BRIM, X0 - 4.4], [HI, BRIM + 0.6, X0], 'filz', 1), // Schirm
  ],
  scarf: [
    p([X0, h(4.6), LO + 2.4], [X1, HI + 1.2, X1], 'stoff', 0), // über Seiten und Hinterkopf
    p([X0, h(6), X0], [X1, HI + 1.2, LO + 2.4], 'stoff', 0), // über der Stirn
    p([X0, h(2.6), HI - 1], [X1, h(4.6), X1], 'stoff', 0), // im Nacken
    p([6.4, h(2), X1], [9.6, h(3.4), X1 + 1.6], 'stoff', 1), // Knoten
  ],
  crown: [
    p([X0, h(5.8), X0], [X1, HI + 2, X1], 'metall', 0),
    ...[X0, 7.2, X1 - 1.6].flatMap((x) => [
      p([x, HI + 2, X0], [x + 1.6, HI + 4, X0 + 1.6], 'metall', 0),
      p([x, HI + 2, X1 - 1.6], [x + 1.6, HI + 4, X1], 'metall', 0),
    ]),
    p([7.2, h(6.6), X0 - 0.3], [8.8, h(7.4), X0], 'metall', 1), // Stein vorn
  ],
  party: [
    p([X0, h(5.8), X0], [X1, HI + 1.6, X1], 'stoff', 0),
    p([LO + 1.4, HI + 1.6, LO + 1.4], [HI - 1.4, HI + 3.8, HI - 1.4], 'stoff', 1),
    p([LO + 3.4, HI + 3.8, LO + 3.4], [HI - 3.4, HI + 6, HI - 3.4], 'stoff', 0),
    p([7, HI + 6, 7], [9, HI + 7.6, 9], 'stoff', 1),
  ],
  helmet: [
    p([X0, h(4.6), X0], [X1, HI + 1.6, X1], 'metall', 0), // Glocke
    p([X0 - 0.2, h(4.6), X0 - 0.2], [X1 + 0.2, h(4.6) + 1, X1 + 0.2], 'metall', 1), // Rand
    p([7.2, HI + 1.6, X0], [8.8, HI + 3, X1], 'metall', 1), // Kamm
    p([h(3), h(3.4), X0 - 0.5], [h(5), h(4.6), X0], 'metall', 1), // Nasenschutz (endet zwischen den Augen)
  ],
  // Fliegerhaube: Leder (Farbe 0), Brille auf der Stirn mit Rahmen (Farbe 1) und hellen Gläsern, Ohrenklappen
  aviator: [
    p([X0, BRIM, X0], [X1, HI + 1.4, X1], 'filz', 0),
    p([LO + 0.6, HI + 1.4, LO + 0.6], [HI - 0.6, HI + 2, HI - 0.6], 'filz', 0),
    p([X0 - 0.2, BRIM + 0.4, X0 - 0.2], [X1 + 0.2, BRIM + 1.4, X1 + 0.2], 'band', 1), // Brillenband
    p([h(0.7), BRIM, X0 - 1.0], [h(3.5), BRIM + 2.2, X0 - 0.2], 'metall', 1), // Rahmen links
    p([h(4.5), BRIM, X0 - 1.0], [h(7.3), BRIM + 2.2, X0 - 0.2], 'metall', 1), // Rahmen rechts
    p([h(1.0), BRIM + 0.3, X0 - 1.2], [h(3.2), BRIM + 1.9, X0 - 1.0], 'glas'), // Glas links
    p([h(4.8), BRIM + 0.3, X0 - 1.2], [h(7.0), BRIM + 1.9, X0 - 1.0], 'glas'), // Glas rechts
    p([X0 - 0.3, h(1.4), h(2.6)], [X0, BRIM, h(5.4)], 'filz', 0), // Ohrenklappe rechts
    p([X1, h(1.4), h(2.6)], [X1 + 0.3, BRIM, h(5.4)], 'filz', 0), // Ohrenklappe links
  ],
  hood: [
    p([LO - 1.2, LO - 1, LO + 1.6], [HI + 1.2, HI + 1.2, HI + 1.2], 'stoff', 0),
    p([LO - 1.2, h(6), LO - 1.2], [HI + 1.2, HI + 1.2, LO + 1.6], 'stoff', 0),
  ],
  ...MODE_HATS(),
};

/** Kopfbedeckungen der Modus-Figuren (17.11.): jede mit eigenem Umriss. */
function MODE_HATS(): Record<string, readonly Part[]> {
  /** Feder schräg nach hinten oben: Fuß bei (x, y, z), `angle` um z – breite Fahne mit schmaler Spitze. */
  const plume = (x: number, y: number, z: number, tex: TexName, angle: number, len = 9): Part[] => {
    const rotation = { angle, axis: 'z' as const, origin: [x, y, z] as Vec };
    return [
      p([x - 0.4, y, z - 0.2], [x + 0.4, y + 2, z + 0.2], tex, undefined, rotation),
      p([x - 1.3, y + 2, z - 0.25], [x + 1.3, y + len - 2, z + 0.25], tex, undefined, rotation),
      p([x - 0.7, y + len - 2, z - 0.25], [x + 0.7, y + len, z + 0.25], tex, undefined, rotation),
    ];
  };
  return {
    // Abenteurer-Hut: breite Krempe, Hutband (Farbe 1), Feder in Farbe 1 an der Seite
    ranger: [
      p([LO - 4.4, BRIM, LO - 4.4], [HI + 4.4, BRIM + 0.6, HI + 4.4], 'filz', 0),
      p([X0, BRIM + 0.6, X0], [X1, HI + 3, X1], 'filz', 0),
      p([X0 + 1.6, HI + 3, X0 + 2.8], [X1 - 1.6, HI + 3.8, X1 - 2.8], 'filz', 0),
      p([X0 - 0.2, BRIM + 0.6, X0 - 0.2], [X1 + 0.2, BRIM + 1.8, X1 + 0.2], 'band', 1),
      p([X1 + 0.2, BRIM + 1.0, 6.4], [X1 + 1.2, BRIM + 9.4, 8.2], 'band', 1, {
        angle: -22.5,
        axis: 'x',
        origin: [X1 + 0.6, BRIM + 1.2, 7.2],
      }),
    ],
    // Stirnband: hinten ein Knoten mit zwei Enden
    band: [
      p([h(3.1), h(4.6), HI + 1.0], [h(4.9), h(5.8), HI + 2.0], 'band', 0),
      p([h(2.4), h(2.0), HI + 1.2], [h(3.4), h(4.6), HI + 1.8], 'band', 0, {
        angle: 22.5,
        axis: 'z',
        origin: [h(3.2), h(4.6), HI + 1.5],
      }),
      p([h(4.6), h(1.6), HI + 1.2], [h(5.6), h(4.6), HI + 1.8], 'band', 0, {
        angle: -22.5,
        axis: 'z',
        origin: [h(4.8), h(4.6), HI + 1.5],
      }),
    ],
    // Hut der Spielleiterin: kleine Krempe, Band, drei bunte Federn
    feather: [
      p([LO - 1.8, BRIM, LO - 1.8], [HI + 1.8, BRIM + 0.6, HI + 1.8], 'filz', 0),
      p([X0, BRIM + 0.6, X0], [X1, HI + 2.4, X1], 'filz', 0),
      p([X0 - 0.2, BRIM + 0.6, X0 - 0.2], [X1 + 0.2, BRIM + 2.2, X1 + 0.2], 'band', 1),
      ...plume(5.0, HI + 1.6, 11, 'feder_rosa', 22.5),
      ...plume(8.0, HI + 2.0, 12.2, 'feder_blau', 0, 10),
      ...plume(11.0, HI + 1.6, 13.4, 'feder_gruen', -22.5),
    ],
    // Kletterhelm: Schale, heller Streifen, Stirnlampe
    climb: [
      p([X0, BRIM, X0], [X1, HI + 1.8, X1], 'metall', 0),
      p([LO + 0.6, HI + 1.8, LO + 0.6], [HI - 0.6, HI + 2.8, HI - 0.6], 'metall', 0),
      p([7.0, HI + 2.8, LO + 1.2], [9.0, HI + 3.2, HI - 1.2], 'band'),
      p([X0 - 0.2, BRIM - 0.4, X0 - 0.2], [X1 + 0.2, BRIM + 0.6, X1 + 0.2], 'metall', 1),
      p([h(2.8), BRIM + 1.4, X0 - 1.4], [h(5.2), BRIM + 3.2, X0], 'lampe'),
      p([h(2.6), BRIM + 1.2, X0 - 0.4], [h(5.4), BRIM + 3.4, X0], 'gurt'),
    ],
    // Eisenhut mit breiter Krempe und Federbusch (orange und weiß)
    kettle: [
      p([LO - 3.6, BRIM - 0.4, LO - 3.6], [HI + 3.6, BRIM + 0.4, HI + 3.6], 'metall', 1),
      p([X0, BRIM + 0.4, X0], [X1, HI + 2.2, X1], 'metall', 0),
      p([LO + 1.4, HI + 2.2, LO + 1.4], [HI - 1.4, HI + 3.4, HI - 1.4], 'metall', 0),
      p([7.0, HI + 3.4, LO + 2], [9.0, HI + 4.2, HI - 2], 'metall', 1),
      // Großer Federbusch: steht vorn hoch auf und fällt in einem Bogen nach hinten über den Nacken
      p([5.4, HI + 3.4, 4.6], [10.6, HI + 9.0, 9.4], 'busch_orange'),
      p([5.0, HI + 7.0, 3.4], [11.0, HI + 10.4, 8.4], 'busch_weiss'),
      p([5.6, HI + 6.0, 9.0], [10.4, HI + 9.6, 14.6], 'busch_orange'),
      p([5.8, HI + 3.0, 14.0], [10.2, HI + 7.6, 18.6], 'busch_orange'),
      p([6.2, HI - 0.6, 17.6], [9.8, HI + 3.6, 20.4], 'busch_weiss'),
    ],
    // Zylinder mit Band (Farbe 1)
    tophat: [
      p([LO - 2.4, BRIM, LO - 2.4], [HI + 2.4, BRIM + 0.6, HI + 2.4], 'filz', 0),
      p([X0, BRIM + 0.6, X0], [X1, HI + 9.0, X1], 'filz', 0),
      p([X0 - 0.2, BRIM + 0.6, X0 - 0.2], [X1 + 0.2, BRIM + 2.6, X1 + 0.2], 'band', 1),
    ],
    // Melone, darum eine Fliegerbrille (Rahmen Farbe 1)
    bowler: [
      p([LO - 2.2, BRIM, LO - 2.2], [HI + 2.2, BRIM + 0.5, HI + 2.2], 'filz', 0),
      p([X0, BRIM + 0.5, X0], [X1, HI + 2.4, X1], 'filz', 0),
      p([LO + 0.8, HI + 2.4, LO + 0.8], [HI - 0.8, HI + 3.6, HI - 0.8], 'filz', 0),
      p([X0 - 0.2, BRIM + 0.8, X0 - 0.2], [X1 + 0.2, BRIM + 1.8, X1 + 0.2], 'gurt'),
      p([h(0.7), BRIM + 0.4, X0 - 1.0], [h(3.5), BRIM + 2.6, X0 - 0.2], 'metall', 1),
      p([h(4.5), BRIM + 0.4, X0 - 1.0], [h(7.3), BRIM + 2.6, X0 - 0.2], 'metall', 1),
      p([h(1.0), BRIM + 0.7, X0 - 1.2], [h(3.2), BRIM + 2.3, X0 - 1.0], 'glas'),
      p([h(4.8), BRIM + 0.7, X0 - 1.2], [h(7.0), BRIM + 2.3, X0 - 1.0], 'glas'),
    ],
    // Pickelhaube: Lederhelm, Schirm vorn und hinten, goldenes Schild und Spitz (Farbe 1)
    pickel: [
      p([X0, BRIM, X0], [X1, HI + 2.2, X1], 'filz', 0),
      p([LO + 1.2, HI + 2.2, LO + 1.2], [HI - 1.2, HI + 3.2, HI - 1.2], 'filz', 0),
      p([X0, BRIM - 0.2, X0 - 2.8], [X1, BRIM + 0.4, X0], 'filz', 0),
      p([X0 + 1, BRIM - 0.2, X1], [X1 - 1, BRIM + 0.4, X1 + 1.6], 'filz', 0),
      p([h(2.4), BRIM + 1.0, X0 - 0.4], [h(5.6), HI + 1.4, X0], 'metall', 1),
      p([6.2, HI + 3.2, 6.2], [9.8, HI + 4.2, 9.8], 'metall', 1),
      p([7.1, HI + 4.2, 7.1], [8.9, HI + 8.4, 8.9], 'metall', 1),
      p([7.5, HI + 8.4, 7.5], [8.5, HI + 9.4, 8.5], 'metall', 1),
    ],
    // Bommelmütze mit Umschlag (Farbe 1) und Skibrille auf der Stirn
    skibeanie: [
      p([X0, BRIM, X0], [X1, HI + 1.8, X1], 'filz', 0),
      p([X0 - 0.3, BRIM + 1.4, X0 - 0.3], [X1 + 0.3, BRIM + 2.6, X1 + 0.3], 'filz', 1),
      p([LO + 0.8, HI + 1.8, LO + 0.8], [HI - 0.8, HI + 2.6, HI - 0.8], 'filz', 0),
      p([5.6, HI + 2.6, 5.6], [10.4, HI + 6.8, 10.4], 'filz', 1),
      p([X0 - 0.5, BRIM - 0.2, X0 - 0.5], [X1 + 0.5, BRIM + 1.2, X1 + 0.5], 'gurt'),
      p([h(0.4), BRIM - 0.6, X0 - 1.6], [h(7.6), BRIM + 1.8, X0 - 0.5], 'skiglas'),
    ],
    // Fischerhut: Krempe nach unten, Band (Farbe 1), oben eine kleine goldene Krone
    bucket: [
      p([LO - 2.6, BRIM - 1.2, LO - 2.6], [HI + 2.6, BRIM - 0.4, HI + 2.6], 'filz', 0),
      p([X0, BRIM - 0.4, X0], [X1, HI + 2.4, X1], 'filz', 0),
      p([LO + 0.6, HI + 2.4, LO + 0.6], [HI - 0.6, HI + 3.0, HI - 0.6], 'filz', 0),
      p([X0 - 0.2, BRIM, X0 - 0.2], [X1 + 0.2, BRIM + 1.2, X1 + 0.2], 'band', 1),
      p([5.2, HI + 3.0, 5.2], [10.8, HI + 4.0, 10.8], 'gold'),
      ...[5.2, 7.4, 9.6].flatMap((x) => [
        p([x, HI + 4.0, 5.2], [x + 1.2, HI + 5.6, 6.4], 'gold'),
        p([x, HI + 4.0, 9.6], [x + 1.2, HI + 5.6, 10.8], 'gold'),
      ]),
      p([X1 + 0.2, BRIM + 0.2, 7.2], [X1 + 0.8, BRIM + 1.0, 8.4], 'busch_orange'), // Köder am Band
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Körper: Modellraum = Skin-Pixel, Füße bei 0, Körper x 4…12 / z 6…10 / y 12…24, Beine y 0…12, vorne = z klein.
// Nur, was über den Körper hinausragt: Rock mit Schürze (weiter als die Beine) und langes Haar bzw. Zöpfe den Rücken
// hinunter (bleiben beim Kopfdrehen am Rücken). Mieder, Westen und Hosenträger malt der Skin (zweite Ebene).
// ---------------------------------------------------------------------------------------------------------------

/** Rock: ab der Taille in Stufen weiter werdend (Farbe 0). Die Hände hängen außen daneben (oberste Stufe schmal). */
const ROCK: readonly Part[] = [
  p([3.9, 12, 5.6], [12.1, 15.4, 10.4], 'stoff', 0),
  p([3.2, 9.6, 5], [12.8, 12, 11], 'stoff', 0),
  p([2.7, 6.4, 4.6], [13.3, 9.6, 11.4], 'stoff', 0),
  p([2.3, 4, 4.2], [13.7, 6.4, 11.8], 'stoff', 0),
  p([2.1, 3.4, 4], [13.9, 4, 12], 'stoff', 0), // Saum
];
/** Schürze vorne auf dem Rock (je Stufe knapp davor), Bund rundherum und Schleife (Farbe 0). */
const SCHUERZE: readonly Part[] = [
  p([3.9, 14.6, 5.45], [12.1, 15.6, 10.55], 'schuerze', 0), // Bund
  p([5, 12, 5.3], [11, 14.6, 5.55], 'schuerze', 0),
  p([5, 9.6, 4.7], [11, 12, 4.95], 'schuerze', 0),
  p([5, 6.4, 4.3], [11, 9.6, 4.55], 'schuerze', 0),
  p([5, 4.4, 3.9], [11, 6.4, 4.15], 'schuerze', 0),
  p([9.8, 13.6, 5], [11.4, 15.2, 5.4], 'schuerze', 0), // Schleife
];
/** Langes Haar den Rücken hinunter (Farbe 0). */
const HAAR_LANG: readonly Part[] = [
  p([4.4, 18, 10], [11.6, 24.4, 10.8], 'haar', 0),
  p([5.2, 16.8, 10], [10.8, 18, 10.6], 'haar', 0),
];
/** Zwei Zöpfe den Rücken hinunter, Glieder versetzt, unten eine Schleife (Farbe 1). */
function braidOnBack(x: number, side: 1 | -1): Part[] {
  const links = Array.from({ length: 5 }, (_, i) => {
    const top = 24.2 - i * 1.8;
    const shift = i % 2 === 0 ? 0 : 0.3 * side;
    return p([x + shift, top - 1.9, 10], [x + shift + 1.6, top, 11.2], 'haar', 0);
  });
  return [...links, p([x - 0.3, 14.6, 9.9], [x + 1.9, 15.6, 11.4], 'band', 1)];
}
const ZOEPFE: readonly Part[] = [...braidOnBack(5, -1), ...braidOnBack(9.4, 1)];

// Modus-Figuren (17.11.): Umhang, Seilrolle, Schal, Adlerschwingen, Ski, Schulterstücke

/** Langer Umhang hinter dem Rücken, unten etwas weiter (Farbe 0). */
const UMHANG: readonly Part[] = [
  p([3.4, 9, 10.6], [12.6, 23.8, 11.4], 'stoff', 0),
  p([2.8, 2.6, 10.8], [13.2, 9, 11.8], 'stoff', 0),
];
/** Seilrolle auf dem Rücken: zwei Ringe übereinander (Farbe 0). */
function ring(x0: number, y0: number, x1: number, y1: number, z: number, t = 1.3): Part[] {
  return [
    p([x0 + t, y1 - t, z], [x1 - t, y1, z + 1.3], 'seil', 0),
    p([x0 + t, y0, z], [x1 - t, y0 + t, z + 1.3], 'seil', 0),
    p([x0, y0 + 0.6, z], [x0 + t, y1 - 0.6, z + 1.3], 'seil', 0),
    p([x1 - t, y0 + 0.6, z], [x1, y1 - 0.6, z + 1.3], 'seil', 0),
  ];
}
const SEIL: readonly Part[] = [...ring(4.4, 13.6, 11.6, 22.6, 10.6), ...ring(5.0, 14.4, 12.2, 23.2, 11.9)];
/** Schal: Knoten am Hals, ein langes Ende vorn (Farbe 0). */
const SCHAL: readonly Part[] = [
  p([6.2, 22.2, 5.1], [10.0, 23.9, 5.6], 'stoff', 0),
  p([8.4, 13.2, 5.2], [10.6, 22.2, 5.6], 'stoff', 0),
  p([8.2, 12.2, 5.15], [10.8, 13.2, 5.65], 'band', 0),
];
/**
 * Adlerschwinge rechts (x > 8), leicht nach hinten geschwungen: oben die Deckfedern als Bogen, darunter die
 * Armschwingen mit Lücken, außen die langen Handschwingen wie Finger. Federn in Farbe 0, Deckfedern hell (Farbe 1).
 */
const WING_RIGHT: readonly (readonly [Vec, Vec, number])[] = [
  // Deckfedern: Bogen von der Schulter nach außen oben
  [[8.6, 21.4, 11.0], [15.0, 24.4, 12.0], 1],
  [[14.6, 22.6, 11.1], [21.0, 25.8, 12.0], 1],
  [[20.6, 23.6, 11.2], [25.6, 26.8, 12.0], 1],
  // Armschwingen: hängen nach unten, je kürzer nach innen
  ...[0, 1, 2, 3, 4].map((i): readonly [Vec, Vec, number] => [
    [9.2 + i * 2.6, 12.6 + i * 0.9, 11.2 + i * 0.05],
    [11.4 + i * 2.6, 22.6 + i * 0.6, 11.8 + i * 0.05],
    0,
  ]),
  // Handschwingen: lange Finger außen, gefächert
  [[22.0, 13.0, 11.3], [23.8, 24.6, 11.9], 0],
  [[24.0, 15.0, 11.4], [25.8, 26.4, 12.0], 0],
  [[26.0, 17.4, 11.5], [27.6, 27.6, 12.1], 0],
  [[27.8, 20.4, 11.6], [29.2, 28.0, 12.2], 0],
];
const WING_SWEEP = 22.5;
const FLUEGEL: readonly Part[] = WING_RIGHT.flatMap(([from, to, tint]) => [
  p(from, to, 'schwinge', tint, { angle: -WING_SWEEP, axis: 'y', origin: [8.6, 18, 11] }),
  p([16 - to[0], from[1], from[2]], [16 - from[0], to[1], to[2]], 'schwinge', tint, {
    angle: WING_SWEEP,
    axis: 'y',
    origin: [7.4, 18, 11],
  }),
]);
/** Zwei Ski über Kreuz hinter dem Rücken, Spitzen über dem Kopf (Farbe 0). */
const SKIER: readonly Part[] = [
  p([7.1, 1.0, 10.7], [8.9, 31.0, 11.2], 'ski', 0, { angle: 22.5, axis: 'z', origin: [8, 16, 11] }),
  p([7.1, 1.0, 11.4], [8.9, 31.0, 11.9], 'ski', 0, { angle: -22.5, axis: 'z', origin: [8, 16, 11.6] }),
];
/** Schulterstücke aus Metall: auf den Schultern, über den Armen (Farbe 0). */
const SCHULTER: readonly Part[] = [
  p([-0.8, 24.4, 5.4], [3.4, 25.4, 10.6], 'metall', 0),
  p([-0.3, 25.4, 6.0], [3.0, 26.0, 10.0], 'metall', 0),
  p([12.6, 24.4, 5.4], [16.8, 25.4, 10.6], 'metall', 0),
  p([13.0, 25.4, 6.0], [16.3, 26.0, 10.0], 'metall', 0),
];

const BODY_PARTS = {
  rock: ROCK,
  schuerze: SCHUERZE,
  haar_lang: HAAR_LANG,
  zoepfe: ZOEPFE,
  umhang: UMHANG,
  seil: SEIL,
  schal: SCHAL,
  fluegel: FLUEGEL,
  skier: SKIER,
  schulter: SCHULTER,
};
export type BodyPart = keyof typeof BODY_PARTS;
const BODY_ORDER: readonly BodyPart[] = [
  'rock',
  'schuerze',
  'haar_lang',
  'zoepfe',
  'umhang',
  'seil',
  'schal',
  'fluegel',
  'skier',
  'schulter',
];
/** Wie viele Farben jedes Körperteil braucht (sie liegen hintereinander in `custom_model_data`). */
const BODY_COLOURS: Readonly<Record<BodyPart, number>> = {
  rock: 1,
  schuerze: 1,
  haar_lang: 1,
  zoepfe: 2,
  umhang: 1,
  seil: 1,
  schal: 1,
  fluegel: 2,
  skier: 1,
  schulter: 1,
};
/** Deckfedern der Adlerschwingen (heller als die Schwungfedern). */
const WING_TIPS = 0xc89a62;

// ---------------------------------------------------------------------------------------------------------------
// Was eine Figur trägt
// ---------------------------------------------------------------------------------------------------------------

export interface TrachtItems {
  /** Gegenstand für den Kopf-Platz (Hut, Bart, Dutt) – null, wenn es nichts zu zeigen gibt. */
  readonly head: string | null;
  /** Gegenstand für das Anzeige-Objekt am Körper – null ohne Rock und ohne langes Haar. */
  readonly body: string | null;
}

const HAIR_SLOT = 0;
const HAT_SLOT = 1;
const BEARD_SLOT = 2;
const NONE = '-';
const SNBT_COLOUR = (c: number): string => `${c | 0}`;

function itemSnbt(strings: readonly string[], colours: readonly number[]): string {
  const s = strings.map((t) => `'${t}'`).join(',');
  const c = colours.map(SNBT_COLOUR).join(',');
  return `{id:'minecraft:paper',count:1,components:{'minecraft:item_model':'minecraft:air','minecraft:custom_model_data':{strings:[${s}],colors:[${c}]}}}`;
}

/** Welche Körperteile eine Tracht hat. */
export function bodyParts(o: Outfit): BodyPart[] {
  const skirt = o.bottom.kind === 'skirt';
  return BODY_ORDER.filter((part) => {
    const has: Readonly<Record<BodyPart, boolean>> = {
      rock: skirt,
      schuerze: skirt && o.apron !== undefined,
      haar_lang: o.hairStyle === 'long',
      zoepfe: o.hairStyle === 'braids',
      umhang: o.gear?.cape !== undefined,
      seil: o.gear?.rope !== undefined,
      schal: o.gear?.scarf !== undefined,
      fluegel: o.gear?.wings !== undefined,
      skier: o.gear?.skis !== undefined,
      schulter: o.gear?.pauldrons !== undefined,
    };
    return has[part];
  });
}

/** Frisur-Teil für den Kopf: nur der Dutt steht ab (mit Hut sitzt er tiefer im Nacken). */
function headHair(o: Outfit): string {
  if (o.hairStyle !== 'bun') return NONE;
  return o.hat && HATS[o.hat.kind] ? 'bun_low' : 'bun';
}

/** Die Gegenstände (als SNBT) für eine Figur. Sitzend ohne Körper-Teil (Rock und Haar passen dann nicht). */
export function trachtItems(o: Outfit, seated = false): TrachtItems {
  const hair = headHair(o);
  const hat = o.hat && HATS[o.hat.kind] ? o.hat.kind : NONE;
  const beard = o.beard === undefined ? NONE : 'bart';
  const ribbon = o.bodice?.lacing ?? o.apron ?? 0xb02a2a;
  const head =
    hair === NONE && hat === NONE && beard === NONE
      ? null
      : itemSnbt(
          [hair, hat, beard],
          [o.hair, o.hat?.colour ?? 0, o.hat?.accent ?? ribbon, o.beard ?? o.hair, ribbon],
        );
  const parts = seated ? [] : bodyParts(o);
  const colourOf: Readonly<Record<BodyPart, readonly number[]>> = {
    rock: [o.bottom.colour],
    schuerze: [o.apron ?? 0xffffff],
    haar_lang: [o.hair],
    zoepfe: [o.hair, ribbon],
    umhang: [o.gear?.cape ?? 0],
    seil: [o.gear?.rope ?? 0],
    schal: [o.gear?.scarf ?? 0],
    fluegel: [o.gear?.wings ?? 0, WING_TIPS],
    skier: [o.gear?.skis ?? 0],
    schulter: [o.gear?.pauldrons ?? 0],
  };
  const body =
    parts.length === 0
      ? null
      : itemSnbt(
          BODY_ORDER.map((part) => (parts.includes(part) ? part : NONE)),
          BODY_ORDER.flatMap((part) => colourOf[part]),
        );
  return { head, body };
}

/** Wo die Farben eines Körperteils in der Liste beginnen. */
function bodyColourStart(part: BodyPart): number {
  return BODY_ORDER.slice(0, BODY_ORDER.indexOf(part)).reduce((sum, q) => sum + BODY_COLOURS[q], 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Ressourcenpaket: Modelle, Texturen, items/air.json
// ---------------------------------------------------------------------------------------------------------------

function element(part: Part): Record<string, unknown> {
  return {
    from: part.from,
    to: part.to,
    ...(part.rotation ? { rotation: part.rotation } : {}),
    faces: Object.fromEntries(
      FACES.map((f) => [
        f,
        {
          uv: [0, 0, 16, 16],
          texture: `#${part.tex}`,
          ...(part.tint === undefined ? {} : { tintindex: part.tint }),
        },
      ]),
    ),
  };
}

function modelOf(parts: readonly Part[]): Record<string, unknown> {
  const used = [...new Set(parts.map((q) => q.tex))];
  return {
    textures: {
      particle: `${TRACHT_NS}:item/tracht/${used[0] ?? 'stoff'}`,
      ...Object.fromEntries(used.map((t) => [t, `${TRACHT_NS}:item/tracht/${t}`])),
    },
    elements: parts.map(element),
  };
}

/** Alle Modelle: Name → Modell-JSON (unter `models/item/tracht/`). */
export function trachtModels(): Record<string, Record<string, unknown>> {
  return {
    ...Object.fromEntries(Object.entries(HAIR).map(([k, v]) => [`haar_${k}`, modelOf(v)])),
    bart: modelOf(BEARD),
    ...Object.fromEntries(Object.entries(HATS).map(([k, v]) => [`hut_${k}`, modelOf(v)])),
    ...Object.fromEntries(Object.entries(BODY_PARTS).map(([k, v]) => [`koerper_${k}`, modelOf(v)])),
  };
}

const model = (name: string): string => `${TRACHT_NS}:item/tracht/${name}`;
const AIR = 'minecraft:item/air';
const cmdTint = (index: number): Record<string, unknown> => ({
  type: 'minecraft:custom_model_data',
  index,
  default: -1,
});
const empty = { type: 'minecraft:model', model: AIR };

/** Auswahl über einen Text in `custom_model_data`, Farben aus `colours` (Index je `tintindex`). */
function selectPart(
  index: number,
  cases: Record<string, string>,
  colours: readonly number[],
): Record<string, unknown> {
  return {
    type: 'minecraft:select',
    property: 'minecraft:custom_model_data',
    index,
    cases: Object.entries(cases).map(([when, name]) => ({
      when,
      model: { type: 'minecraft:model', model: model(name), tints: colours.map(cmdTint) },
    })),
    fallback: empty,
  };
}

/**
 * `assets/minecraft/items/air.json`: Kopf-Teile (Frisur, Hut, Bart) oder Körper-Teile, je nach erstem Text; sonst leer
 * wie in Minecraft.
 */
export function airItemDefinition(): Record<string, unknown> {
  const hairCases = Object.fromEntries(Object.keys(HAIR).map((k) => [k, `haar_${k}`]));
  const hatCases = Object.fromEntries(Object.keys(HATS).map((k) => [k, `hut_${k}`]));
  const head = {
    type: 'minecraft:composite',
    models: [
      selectPart(HAIR_SLOT, hairCases, [0, 4]),
      selectPart(HAT_SLOT, hatCases, [1, 2]),
      selectPart(BEARD_SLOT, { bart: 'bart' }, [3]),
    ],
  };
  const body = {
    type: 'minecraft:composite',
    models: BODY_ORDER.map((part, i) =>
      selectPart(
        i,
        { [part]: `koerper_${part}` },
        Array.from({ length: BODY_COLOURS[part] }, (_, k) => bodyColourStart(part) + k),
      ),
    ),
  };
  // Kopf-Gegenstände haben drei Texte, Körper-Gegenstände fünf: Gibt es einen vierten Text, ist es der Körper.
  return {
    model: {
      type: 'minecraft:select',
      property: 'minecraft:custom_model_data',
      index: 3,
      cases: [{ when: [...BODY_ORDER.slice(3), NONE], model: body }],
      fallback: head,
    },
  };
}

/** Eigene Texturen: hell, damit die Farbe der Figur durchkommt. */
export function trachtTextures(): Record<TexName, Buffer> {
  const pic = (draw: (x: number, y: number, r: () => number) => number, seed: number): Buffer => {
    const img = new Picture(16, 16);
    const r = random(seed);
    Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => img.set(x, y, draw(x, y, r))));
    return img.png();
  };
  const grey = (v: number): number => {
    const c = Math.max(0, Math.min(255, Math.round(v)));
    return (c << 16) | (c << 8) | c;
  };
  const strands = Array.from({ length: 16 }, (_, x) => 200 + ((x * 37) % 5) * 9);
  const shadeHex = (c: number, f: number): number => {
    const ch = (s: number): number => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * f)));
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  };
  // Feder: Schaft in der Mitte, Fahne zur Spitze heller
  const feather = (c: number, tip: number, seed: number): Buffer =>
    pic((x, y, r) => {
      if (x === 7 || x === 8) return shadeHex(tip, 0.95);
      const t = y / 15;
      return shadeHex(t < 0.3 ? tip : c, 0.88 + ((x + y) % 3) * 0.05 + r() * 0.05);
    }, seed);
  return {
    // Haare: senkrechte Strähnen
    haar: pic((x, y, r) => grey(strands[x]! - (y % 5 === 0 ? 18 : 0) + r() * 14), 11),
    // Filz: ruhig mit leichtem Rauschen
    filz: pic((_x, _y, r) => grey(205 + r() * 22), 12),
    // Stroh: gelbliches Geflecht (nicht eingefärbt)
    stroh: pic((x, y, r) => {
      const weave = (x + y) % 4 < 2 ? 0 : -24;
      const v = 215 + weave + r() * 16;
      return (Math.round(v) << 16) | (Math.round(v * 0.86) << 8) | Math.round(v * 0.52);
    }, 13),
    // Stoff: feines Gewebe
    stoff: pic((x, y, r) => grey(225 - ((x + y) % 2) * 10 + r() * 10), 14),
    // Schürze: zartes Karo
    schuerze: pic((x, y, r) => grey(236 - (x % 4 === 0 || y % 4 === 0 ? 26 : 0) + r() * 8), 15),
    // Gamsbart: dunkel mit hellen Spitzen (nicht eingefärbt)
    feder: pic((x, y, r) => grey((y < 4 ? 210 : 70) + r() * 30 - (x % 3 === 0 ? 20 : 0)), 17),
    metall: pic((x, y, r) => grey(230 - (x === 0 || y === 0 ? 40 : 0) + r() * 12), 18),
    band: pic((_x, y, r) => grey(232 - (y % 3 === 0 ? 30 : 0) + r() * 8), 19),
    // Brillenglas: hellblau mit Glanz oben links (nicht eingefärbt)
    glas: pic((x, y) => (x + y < 9 && (x + y) % 5 < 2 ? 0xe4f6fb : 0x86c6dc - ((y >> 2) << 18)), 20),
    // Seil: gedreht (schräge Streifen)
    seil: pic((x, y, r) => grey(220 - ((x + y) % 4 < 2 ? 0 : 38) + r() * 10), 21),
    // Feder: heller Schaft in der Mitte, Fahne schräg gestreift, zum Ende dunkler
    schwinge: pic((x, y, r) => {
      if (x === 7 || x === 8) return grey(240 - y * 2);
      const barb = (x + (x < 8 ? y : -y)) % 3 === 0 ? -22 : 0;
      return grey(222 - y * 5 + barb - (x === 0 || x === 15 ? 30 : 0) + r() * 10);
    }, 22),
    // Ski: heller Streifen in der Mitte
    ski: pic((x, _y, r) => grey((x > 5 && x < 10 ? 250 : 200) + r() * 6), 23),
    feder_rosa: feather(0xff6fae, 0xffd1e6, 24),
    feder_blau: feather(0x3f8ff0, 0xbfe0ff, 25),
    feder_gruen: feather(0x52c84a, 0xd2f5c8, 26),
    busch_orange: pic((x, y, r) => shadeHex(0xf28a1e, 0.85 + ((x * 3 + y) % 5) * 0.05 + r() * 0.05), 27),
    busch_weiss: pic((x, y, r) => shadeHex(0xf4f1ea, 0.88 + ((x * 3 + y) % 5) * 0.03 + r() * 0.03), 28),
    lampe: pic((x, y) => (Math.hypot(x - 7.5, y - 7.5) < 5 ? 0xfff6c0 : 0xd9c46a), 29),
    // Skibrille: orange mit Glanz
    skiglas: pic(
      (x, y) => (x + y < 10 && (x + y) % 6 < 2 ? 0xffe8b8 : shadeHex(0xf0902a, 1.1 - y * 0.02)),
      30,
    ),
    gold: pic((x, y, r) => shadeHex(0xe8b830, 0.9 + (x + y === 4 ? 0.3 : 0) + r() * 0.12), 31),
    // Gurt: dunkles Band mit Naht
    gurt: pic((_x, y, r) => grey((y % 5 === 0 ? 70 : 46) + r() * 10), 32),
  };
}
