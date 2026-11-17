/* eslint-disable ts-patterns/no-magic-numbers -- pixel art: colours and pixel rows of the costumes */
/**
 * Die zwölf Modus-Figuren der Lobby (17.11., Philip: „komplett überarbeiten, passender und schöner“). Jede Figur
 * erkennt man an Umriss (Kopfbedeckung, 3D-Teile), Hauptfarbe (= Farbe des Modus), Kostüm und Gegenstand:
 *
 * | Figur       | Kostüm                                                                 |
 * | ----------- | ---------------------------------------------------------------------- |
 * | MorniCraft  | Abenteurerin: Hut mit breiter Krempe, grüner Reiseumhang, Elytra       |
 * | Duels       | Kämpfer: roter Wappenrock mit gekreuzten Schwertern, Kettenhemd        |
 * | Morni Party | Spielleiterin: Federhut, Konfetti-Weste, Fliege, Ringelstrümpfe        |
 * | Gipfelsturm | Kletterer: Helm mit Lampe, Klettergurt, Seil über der Brust und Rolle  |
 * | Burgverlies | Kapuze und langer violetter Umhang, Schlüsselbund, Laterne             |
 * | Bollwerk    | Stadtwache: Eisenhut mit Federbusch, Wappenrock mit Turm, Armbrust     |
 * | MorniSMP    | Kaufmann: Zylinder, grauer Gehrock, Smaragd-Weste, Geldbeutel          |
 * | Wolkenkampf | Ballonfahrerin: Melone mit Fliegerbrille, Lederjacke, langer Schal     |
 * | Versteckerl | Dorfgendarm: Pickelhaube, Uniform, Schnauzbart, Fernrohr               |
 * | Wintersport | Skifahrerin: Bommelmütze, Skibrille, Rennanzug mit Startnummer, Ski    |
 * | Adlerflug   | Flieger: Fliegerhaube, Overall, weißer Schal, große Adlerschwingen     |
 * | Angelkönig  | Fischer: Fischerhut mit Krone, Anglerweste, Wathose, Angel und Fisch   |
 *
 * Ohne Lobby-Paket (und auf Bedrock) trägt der Skin alles allein: Hüte, Umhänge, Schals und Seile sind gemalt (zweite
 * Ebene), das Paket gibt nur dazu, was absteht (`trachten.ts`).
 */
import {
  CLEAR,
  cloth,
  shade,
  type SkinFace as Face,
  type Outfit,
  type Paint,
  type SkinPart as Part,
} from './skins.js';

const SKIN = { light: 0xf1c7a1, fair: 0xf6d2b8, warm: 0xe0ac7e, tan: 0xc68b5e, dark: 0x8d5a3b } as const;
const HAIR = {
  brown: 0x5a3a22,
  blond: 0xd9b45a,
  black: 0x2a2420,
  red: 0xa4482a,
  grey: 0xb8b4ae,
  auburn: 0x7a3b1e,
} as const;
const EYES = { brown: 0x4a2f1c, blue: 0x3a6fb0, green: 0x3f7a4a } as const;
const GOLD = 0xe8b830;
const GOLD_DARK = 0xa87a1c;
const SILVER = 0xd6dbe0;
const WHITE = 0xf2efe6;

// ---------------------------------------------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------------------------------------------

const vertical = (face: Face): boolean => face !== 'top' && face !== 'bottom';
const isSide = (face: Face): boolean => face === 'right' || face === 'left';
const isArm = (part: Part): boolean => part === 'armR' || part === 'armL';
const isLeg = (part: Part): boolean => part === 'legR' || part === 'legL';
/** Außenseite eines Arms oder Beins. */
const outer = (part: Part, face: Face): boolean =>
  part === 'armR' || part === 'legR' ? face === 'right' : face === 'left';
/** Die drei inneren Spalten eines Beins (unter der Körpermitte), vorn bzw. hinten. */
const innerColumns = (part: Part, face: Face, x: number): boolean => {
  if (face === 'front') return part === 'legR' ? x >= 1 : x <= 2;
  if (face === 'back') return part === 'legR' ? x <= 2 : x >= 1;
  return false;
};
/** Mehrere Maler übereinander: der erste, der etwas malt, gilt. */
const layers =
  (...paints: Paint[]): Paint =>
  (part, face, x, y) =>
    paints.reduce<number | undefined>((hit, paint) => hit ?? paint(part, face, x, y), undefined);

/** Hohe Stiefel (erste Ebene der Beine ab Reihe `from`, Stulpe in `cuff`). */
const boots =
  (colour: number, cuff: number, from = 5): Paint =>
  (part, face, x, y) => {
    if (!isLeg(part) || !vertical(face) || y < from || y >= 10) return undefined;
    if (y === from) return cloth(cuff);
    return cloth(face === 'front' && (x === 1 || x === 2) && y === from + 1 ? shade(colour, 1.15) : colour);
  };

/** Handschuhe (erste Ebene der Hände ab Reihe 9). */
const gloves =
  (colour: number): Paint =>
  (part, face, x, y) => {
    if (!isArm(part) || !vertical(face) || y < 9) return undefined;
    if (y === 9) return cloth(shade(colour, 1.12));
    return cloth((x + y) % 3 === 0 ? shade(colour, 0.85) : colour);
  };

/** Gürtel auf der zweiten Ebene (Reihe `row`) mit Schnalle vorn. */
const beltOver =
  (colour: number, buckle: number, row = 9): Paint =>
  (part, face, x, y) => {
    if (part !== 'body' || !vertical(face) || y !== row) return undefined;
    if (face === 'front' && (x === 3 || x === 4)) return x === 3 ? buckle : shade(buckle, 0.75);
    return cloth(x % 3 === 0 ? shade(colour, 0.85) : colour);
  };

/** Wappenrock vorn und hinten (Spalten 1–6 des Körpers, bis über die Knie), Saum in `trim`. */
const tabard =
  (colour: number, trim: number, emblem: (x: number, y: number) => number | undefined): Paint =>
  (part, face, x, y) => {
    if (part === 'body' && (face === 'front' || face === 'back')) {
      if (x < 1 || x > 6) return undefined;
      if (face === 'front' && y === 0 && (x === 3 || x === 4)) return undefined;
      if (y === 11 || x === 1 || x === 6) return cloth(trim);
      if (face === 'front') {
        const e = emblem(x, y);
        if (e !== undefined) return e;
      }
      return cloth(y > 7 ? shade(colour, 0.92) : colour);
    }
    if (isLeg(part) && innerColumns(part, face, x) && y <= 5) {
      if (y === 5) return cloth(trim);
      return cloth((x + y) % 2 === 0 ? colour : shade(colour, 0.9));
    }
    return undefined;
  };

/** Diagonale über die Brust (von oben links nach unten rechts bzw. umgekehrt), zwei Pixel breit. */
const sash =
  (colour: number, dark: number, from: 'left' | 'right', rows = 8): Paint =>
  (part, face, x, y) => {
    if (part !== 'body' || (face !== 'front' && face !== 'back') || y > rows) return undefined;
    const flip = (from === 'right') !== (face === 'back');
    const u = flip ? 7 - x : x;
    if (u === y || u === y - 1) return cloth(y % 2 === 0 ? colour : dark);
    return undefined;
  };

/** Kleiner Hash für verstreute Pixel (Konfetti, Muster). */
const scatter = (part: Part, face: Face, x: number, y: number): number =>
  (x * 7 + y * 13 + part.length * 5 + face.length * 3) % 11;

// ---------------------------------------------------------------------------------------------------------------
// Die zwölf Figuren
// ---------------------------------------------------------------------------------------------------------------

const MORNICRAFT_CLOAK = 0x62bc3c;
const mornicraft: Outfit = {
  skin: SKIN.fair,
  hair: HAIR.auburn,
  hairStyle: 'bun',
  eyes: EYES.green,
  hat: { kind: 'ranger', colour: 0x6b4a2c, accent: 0x6cc644 },
  top: { colour: 0x3a6a2a, sleeves: 'long', accent: 0x2a4e1e },
  belt: 0x5a3a1e,
  bottom: { kind: 'trousers', colour: 0x6b5236 },
  shoes: 0x3e2a1a,
  costume: {
    base: boots(0x4a3220, 0x6b4a2c),
    overlay: layers(
      // Reiseumhang: über den Schultern, den Rücken hinunter, vorn eine goldene Spange
      (part, face, x, y) => {
        if (part === 'body') {
          if (face === 'top') return cloth(MORNICRAFT_CLOAK);
          if (face === 'front' && y === 1 && (x === 2 || x === 5)) return GOLD;
          if (face === 'front' && (y === 0 || (y < 3 && (x < 2 || x > 5)))) return cloth(MORNICRAFT_CLOAK);
          if (face === 'back') return cloth(y === 11 ? shade(MORNICRAFT_CLOAK, 0.75) : MORNICRAFT_CLOAK);
          if (isSide(face) && (y < 3 || x === (face === 'right' ? 0 : 3)))
            return cloth(shade(MORNICRAFT_CLOAK, 0.9));
          return undefined;
        }
        if (isArm(part) && (face === 'top' || (vertical(face) && y < 4)))
          return cloth(y === 3 ? shade(MORNICRAFT_CLOAK, 0.8) : MORNICRAFT_CLOAK);
        return undefined;
      },
      // Tasche am Riemen über der Brust
      sash(0x8a5a32, 0x6b4426, 'right', 7),
      (part, face, x, y) =>
        part === 'body' && face === 'front' && x < 2 && y >= 8 && y <= 10
          ? cloth(y === 8 ? 0x6b4426 : 0x8a6038)
          : undefined,
      beltOver(0x5a3a1e, GOLD),
    ),
  },
};

const DUELS_RED = 0xc8302c;
const duels: Outfit = {
  skin: SKIN.warm,
  hair: HAIR.black,
  hairStyle: 'short',
  eyes: EYES.brown,
  hat: { kind: 'band', colour: DUELS_RED },
  top: { colour: 0x8e959c, sleeves: 'long', accent: 0x6f767c },
  belt: 0x2a1f1a,
  bottom: { kind: 'trousers', colour: 0x3a3a40 },
  shoes: 0x2b2622,
  gear: { pauldrons: 0xb8c0c8 },
  costume: {
    base: layers(
      gloves(0x4a2f1c),
      boots(0x2b2622, 0x4a2f1c, 6),
      // Kettenhemd: Arme und Seiten im Ringmuster
      (part, face, x, y) => {
        const mail = (isArm(part) && y < 9) || (part === 'body' && isSide(face));
        if (!mail || !vertical(face)) return undefined;
        return (x + y) % 2 === 0 ? 0xa3aab1 : 0x7a8188;
      },
    ),
    overlay: layers(
      beltOver(0x2a1f1a, SILVER),
      // Wappenrock: zwei gekreuzte Schwerter (silberne Klingen, goldene Parierstangen)
      tabard(DUELS_RED, 0xe0b040, (x, y) => {
        const blade = (x === 7 - y && y >= 2 && y <= 4) || (x === y && y >= 2 && y <= 4);
        if (blade) return SILVER;
        if (y === 5 && (x === 2 || x === 5)) return GOLD;
        if (y === 6 && (x === 2 || x === 5)) return 0x5a3a1e;
        return undefined;
      }),
    ),
  },
};

const PARTY_YELLOW = 0xf2c230;
const CONFETTI = [0xe0457b, 0x3fc6e8, 0x52c84a, 0x8e4fe0, 0xffffff] as const;
const party: Outfit = {
  skin: SKIN.fair,
  hair: HAIR.blond,
  hairStyle: 'long',
  eyes: EYES.green,
  hat: { kind: 'feather', colour: 0x8e3fc8, accent: PARTY_YELLOW },
  top: { colour: WHITE, sleeves: 'long', accent: 0xffffff },
  vest: PARTY_YELLOW,
  bottom: { kind: 'skirt', colour: 0xe0457b },
  socks: 0xffffff,
  shoes: 0x8e3fc8,
  costume: {
    base: (part, face, _x, y) => {
      // Ringelstrümpfe unter dem Rock
      if (isLeg(part) && vertical(face) && y >= 6 && y < 10) return cloth(y % 2 === 0 ? 0xe0457b : 0xffffff);
      // Puffärmel mit Streifen
      if (isArm(part) && vertical(face) && y < 8)
        return cloth(y % 2 === 0 ? 0xffffff : shade(PARTY_YELLOW, 1.05));
      return undefined;
    },
    overlay: (part, face, x, y) => {
      if (part === 'body' && face === 'front' && y < 2 && x > 1 && x < 6)
        return x === 2 || x === 5 ? 0xe0457b : 0xa82a5a; // Fliege
      // Konfetti auf der Weste (wo die Weste liegt: vorn außen, Seiten, Rücken)
      const vest = part === 'body' && vertical(face) && y < 9 && !(face === 'front' && x > 1 && x < 6);
      if (vest && scatter(part, face, x, y) === 0) return CONFETTI[(x + y) % CONFETTI.length];
      if (isArm(part) && vertical(face) && y < 2) return cloth(PARTY_YELLOW);
      if (isArm(part) && vertical(face) && y === 2 && scatter(part, face, x, y) < 4)
        return CONFETTI[(x + 2 * y) % CONFETTI.length];
      return undefined;
    },
  },
};

const HARNESS = 0xd0342a;
const gipfelsturm: Outfit = {
  skin: SKIN.light,
  hair: HAIR.auburn,
  hairStyle: 'short',
  eyes: EYES.blue,
  beard: 0x7a3b1e,
  hat: { kind: 'climb', colour: 0x4cb4f0, accent: 0x2f6fae },
  top: { colour: 0x3f9ad8, sleeves: 'long', accent: 0x245f98 },
  bottom: { kind: 'trousers', colour: 0x55585e },
  shoes: 0xd06a2a,
  gear: { rope: 0xf0a83a },
  costume: {
    base: layers(gloves(0x3a3d44), (part, face, x, y) =>
      isLeg(part) && face === 'front' && (y === 4 || y === 5) && x > 0 && x < 3 ? cloth(0x44474c) : undefined,
    ),
    overlay: layers(
      // Seil quer über die Brust
      sash(0xf0a83a, 0xc07a22, 'left', 8),
      // Klettergurt: Hüftgurt, Beinschlaufen, Sicherungsring
      (part, face, x, y) => {
        if (part === 'body' && vertical(face) && y === 9) return cloth(HARNESS);
        if (part === 'body' && face === 'front' && y === 10 && (x === 3 || x === 4)) return SILVER;
        if (part === 'body' && isSide(face) && y === 10 && x === 1) return 0x9aa1a8; // Karabiner
        if (isLeg(part) && vertical(face) && y === 1) return cloth(HARNESS);
        return undefined;
      },
    ),
  },
};

const DUNGEON_PURPLE = 0x5a2a88;
const burgverlies: Outfit = {
  skin: SKIN.tan,
  hair: HAIR.black,
  hairStyle: 'short',
  eyes: EYES.green,
  hat: { kind: 'hood', colour: 0x4a2270, accent: 0x24103a },
  top: { colour: 0x3b2a22, sleeves: 'long', accent: 0x5a4030 },
  belt: 0x1f1612,
  bottom: { kind: 'trousers', colour: 0x2b2430 },
  shoes: 0x2b2622,
  gear: { cape: 0x4a2270 },
  costume: {
    base: boots(0x2b2622, 0x3b2a22, 6),
    overlay: (part, face, x, y) => {
      const hem = (c: number, last: number): number => cloth(y === last ? shade(c, 0.7) : c);
      if (part === 'body') {
        if (face === 'top') return cloth(DUNGEON_PURPLE);
        if (face === 'front') {
          if (y === 3 && (x === 3 || x === 4)) return 0xc070ff; // Amulett
          if (y === 2 && (x === 3 || x === 4)) return GOLD_DARK;
          if (x === 5 && y === 9) return GOLD; // Schlüsselbund
          if (x === 5 && y === 10) return GOLD_DARK;
          if (x < 2 || x > 5) return hem(x === 1 || x === 6 ? 0x7a44b0 : DUNGEON_PURPLE, 11);
          return undefined;
        }
        return hem(DUNGEON_PURPLE, 11);
      }
      if (
        isArm(part) &&
        (face === 'top' || outer(part, face) || face === 'back' || (face === 'front' && y < 3))
      )
        return hem(DUNGEON_PURPLE, 10);
      if (isLeg(part) && (face === 'back' || outer(part, face)) && y < 9) return hem(DUNGEON_PURPLE, 8);
      if (part === 'legL' && face === 'front' && x === 0 && y < 2) return y === 0 ? GOLD : SILVER; // Schlüssel
      return undefined;
    },
  },
};

const BOLLWERK_ORANGE = 0xf08a24;
const bollwerk: Outfit = {
  skin: SKIN.dark,
  hair: HAIR.black,
  hairStyle: 'short',
  eyes: EYES.brown,
  hat: { kind: 'kettle', colour: 0xaab1b8, accent: 0x6f777e },
  top: { colour: 0x5a524a, sleeves: 'long', accent: 0x3e3832 },
  belt: 0x2a1f1a,
  bottom: { kind: 'trousers', colour: 0x3b3530 },
  shoes: 0x2b2622,
  costume: {
    base: layers(
      gloves(0x5a3a22),
      boots(0x2b2622, 0x4a3020, 6),
      // Gesteppter Waffenrock: Arme und Seiten mit Steppnähten
      (part, face, x, y) => {
        const quilt = (isArm(part) && y < 9) || (part === 'body' && isSide(face));
        if (!quilt || !vertical(face)) return undefined;
        return cloth(y % 3 === 0 || (x + y) % 4 === 0 ? 0x433d37 : 0x5e564e);
      },
    ),
    overlay: layers(
      beltOver(0x2a1f1a, SILVER),
      // Wappenrock: weißes Schild mit dunklem Turm
      tabard(BOLLWERK_ORANGE, 0x9a4a10, (x, y) => {
        if (x < 2 || x > 5 || y < 2 || y > 7) return undefined;
        const tower = (x === 3 || x === 4) && y >= 4 && y <= 7;
        const crenel = (x === 2 || x === 5 || x === 3) && y === 3;
        if (tower || crenel) return 0x3a3a3e;
        if (y === 7 && (x === 2 || x === 5)) return BOLLWERK_ORANGE;
        return WHITE;
      }),
    ),
  },
};

const COAT = 0x8e9aa2;
const EMERALD = 0x2f9a58;
const mirni: Outfit = {
  skin: SKIN.warm,
  hair: HAIR.brown,
  hairStyle: 'short',
  eyes: EYES.brown,
  hat: { kind: 'tophat', colour: 0x3a3d44, accent: EMERALD },
  top: { colour: WHITE, sleeves: 'long', accent: 0xffffff },
  bottom: { kind: 'trousers', colour: 0x3a3d44 },
  shoes: 0x1e1c1a,
  costume: {
    base: (part, face, x, y) => {
      // Schnauzbart
      if (part === 'head' && face === 'front' && y === 6 && x > 0 && x < 7) return cloth(0x4a2f1c);
      if (part === 'body' && face === 'front') {
        if (y < 2 && (x === 3 || x === 4)) return y === 0 ? WHITE : 0x1e1c1a; // Kragen, Halsbinde
        if (x > 1 && x < 6 && y < 9) {
          if (x === 3 && y % 2 === 1 && y > 2) return GOLD; // Westenknöpfe
          if (y === 6 && (x === 4 || x === 5)) return GOLD; // Uhrkette
          return cloth(y < 2 ? WHITE : EMERALD);
        }
        if (y < 9 && (x === 1 || x === 6) && y > 0 && y < 5) return cloth(shade(COAT, 0.72)); // Revers
      }
      if (part === 'body' && vertical(face) && y < 9) return cloth(COAT);
      if (isArm(part) && vertical(face) && y < 9) return cloth(y === 8 ? shade(COAT, 0.75) : COAT);
      if (isLeg(part) && vertical(face) && y < 10) return cloth(x % 2 === 0 ? 0x3a3d44 : 0x4a4e56);
      return undefined;
    },
    overlay: (part, face, x, y) => {
      if (part === 'body' && face === 'front') {
        if ((x === 0 || x === 7) && y < 11) return cloth(COAT);
        if ((x === 1 || x === 6) && (y === 4 || y === 7)) return GOLD;
        if (x === 6 && (y === 9 || y === 10)) return y === 9 ? GOLD_DARK : 0x8a6038; // Geldbeutel
        if (x === 7 && y === 10) return 0x8a6038;
        return undefined;
      }
      if (part === 'body' && face === 'back' && y > 7) return cloth(shade(COAT, 0.92));
      // Rockschöße hinten und an den Seiten
      if (isLeg(part) && (face === 'back' || outer(part, face)) && y < 6)
        return cloth(y === 5 ? shade(COAT, 0.75) : COAT);
      return undefined;
    },
  },
};

const LEATHER = 0x7a4a2a;
const FUR = 0xe8dcc0;
/** Ärmel der Lederjacke: oben heller, unten Fellbündchen. */
const SLEEVE_ROWS: Readonly<Record<number, number>> = { 0: shade(LEATHER, 1.1), 8: FUR };
const wolkenkampf: Outfit = {
  skin: SKIN.fair,
  hair: HAIR.red,
  hairStyle: 'braids',
  eyes: EYES.green,
  hat: { kind: 'bowler', colour: 0x5a3a22, accent: 0x8a6a40 },
  top: { colour: 0x3fc6cf, sleeves: 'long', accent: 0x2a9aa4 },
  belt: 0x3e2410,
  bottom: { kind: 'trousers', colour: 0x8a7a5a },
  shoes: 0x3e2a1a,
  gear: { scarf: 0x53dbe3 },
  costume: {
    base: boots(0x5a3a22, 0x7a5232),
    overlay: (part, face, x, y) => {
      if (part === 'body') {
        if (face === 'top') return cloth(FUR);
        // Schal (gemalt, mit Paket kommt das lange Ende in 3D dazu)
        if (face === 'front' && y === 1 && x > 1 && x < 6) return cloth(0x53dbe3);
        if (face === 'front' && (x === 5 || x === 6) && y > 1 && y < 7)
          return cloth(y === 6 ? 0x2fb0ba : 0x53dbe3);
        if (vertical(face) && y === 0) return cloth(FUR); // Fellkragen
        if (y > 9) return undefined;
        if (face === 'front') {
          if (x === 1 && y > 2 && y % 2 === 1) return 0xc9a050; // Knöpfe
          return x < 2 || x > 5 ? cloth(y === 9 ? shade(LEATHER, 0.8) : LEATHER) : undefined;
        }
        return cloth(y === 9 ? shade(LEATHER, 0.8) : LEATHER);
      }
      if (isArm(part) && (face === 'top' || (vertical(face) && y < 9)))
        return cloth(SLEEVE_ROWS[y] ?? LEATHER);
      return undefined;
    },
  },
};

const UNIFORM = 0x3f8a3a;
/** Trillerpfeife an der Brust (Kette golden, Pfeife silbern). */
const WHISTLE: Readonly<Record<number, number>> = { 3: GOLD, 4: SILVER };
const versteckerl: Outfit = {
  skin: SKIN.warm,
  hair: HAIR.brown,
  hairStyle: 'short',
  eyes: EYES.brown,
  hat: { kind: 'pickel', colour: 0x24221e, accent: 0xe0b840 },
  top: { colour: UNIFORM, sleeves: 'long', accent: 0x2f6a2c },
  bottom: { kind: 'trousers', colour: 0x2e3a30 },
  shoes: 0x1e1c1a,
  costume: {
    base: layers(boots(0x1e1c1a, 0x2e2a26), (part, face, x, y) => {
      // großer Schnauzbart mit Spitzen
      if (
        part === 'head' &&
        face === 'front' &&
        ((y === 6 && x > 0 && x < 7) || (y === 5 && (x === 1 || x === 6)))
      )
        return cloth(0x4a2f1c);
      if (part === 'body' && face === 'front') {
        if (y === 0 && (x === 1 || x === 2 || x === 5 || x === 6)) return 0xc0302a; // Kragenspiegel
        if ((x === 2 || x === 5) && y > 1 && y < 9 && y % 2 === 0) return GOLD; // zwei Knopfreihen
      }
      // rote Biese außen an der Hose
      if (isLeg(part) && outer(part, face) && y < 5 && x === 1) return 0xc0302a;
      return undefined;
    }),
    overlay: layers(beltOver(0x1e1a16, GOLD), sash(0xeeeae0, 0xd8d2c4, 'right', 8), (part, face, x, y) =>
      part === 'body' && face === 'front' && x === 1 ? WHISTLE[y] : undefined,
    ),
  },
};

const SUIT = 0xbfe0ff;
const NAVY = 0x1e3a6a;
const wintersport: Outfit = {
  skin: SKIN.light,
  hair: HAIR.blond,
  hairStyle: 'bun',
  eyes: EYES.blue,
  hat: { kind: 'skibeanie', colour: 0xf4f1ea, accent: 0x7fb8f0 },
  top: { colour: SUIT, sleeves: 'long', accent: NAVY },
  bottom: { kind: 'trousers', colour: SUIT },
  shoes: 0xe4e6ea,
  gear: { skis: 0xd0342a },
  costume: {
    base: layers(gloves(0xd0342a), (part, face, x, y) => {
      if (!vertical(face)) return undefined;
      // Streifen über Brust und Ärmel
      if ((part === 'body' && (y === 3 || y === 4)) || (isArm(part) && (y === 2 || y === 3)))
        return cloth(y % 2 === 1 ? WHITE : NAVY);
      // Skischuhe mit Schnallen
      if (isLeg(part) && y >= 6) {
        if (y === 6) return cloth(0xd0342a);
        if (face === 'front' && (y === 7 || y === 9) && x > 0 && x < 3) return 0x3a3a46;
        return y >= 10 ? undefined : 0xe4e6ea;
      }
      return undefined;
    }),
    overlay: (part, face, x, y) => {
      if (part === 'body' && vertical(face) && y === 0) return cloth(NAVY);
      // Startnummer „1“
      if (part === 'body' && (face === 'front' || face === 'back') && x > 0 && x < 7 && y > 4 && y < 9) {
        const one = (x === 4 && y > 4) || (x === 3 && y === 6) || (y === 8 && x > 2 && x < 6);
        return one ? 0xd0342a : WHITE;
      }
      return undefined;
    },
  },
};

const FLIGHT = 0xd04aac;
const WING_BROWN = 0x7a5232;
const adlerflug: Outfit = {
  skin: SKIN.tan,
  hair: HAIR.black,
  hairStyle: 'short',
  eyes: EYES.brown,
  hat: { kind: 'aviator', colour: 0x6b4426, accent: 0xd9b45a },
  top: { colour: FLIGHT, sleeves: 'long', accent: 0x8a2a72 },
  belt: 0x4a3020,
  bottom: { kind: 'trousers', colour: FLIGHT },
  shoes: 0x3e2a1a,
  gear: { wings: WING_BROWN, scarf: WHITE },
  costume: {
    base: layers(boots(0x5a3a22, 0x7a5232, 6), gloves(0x6b4426), (part, face, x, y) => {
      if (part !== 'body' || face !== 'front') return undefined;
      if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return cloth(0x9a2a80); // Brusttaschen
      return undefined;
    }),
    overlay: (part, face, x, y) => {
      if (part === 'body') {
        if (face === 'front' && y < 2 && x > 1 && x < 6) return cloth(WHITE); // Schal
        if (face === 'front' && (x === 5 || x === 6) && y > 1 && y < 6)
          return cloth(y === 5 ? 0xd8d2c4 : WHITE);
        // Gefaltete Schwingen auf dem Rücken (ohne Paket)
        if (face === 'back' && y > 0 && y < 11) {
          const v = Math.abs(x - 3.5);
          if (y < 9 && v > 3 - y / 3) return undefined;
          if (y >= 8) return cloth(0xf2ead2);
          return cloth((x + y) % 2 === 0 ? WING_BROWN : shade(WING_BROWN, 0.82));
        }
        return undefined;
      }
      if (isArm(part) && vertical(face) && y >= 6 && y < 9) return cloth(0x6b4426); // Stulpen
      return undefined;
    },
  },
};

const VEST = 0x3a6fd8;
const WADERS = 0x5a6a3a;
const angelkoenig: Outfit = {
  skin: SKIN.light,
  hair: HAIR.grey,
  hairStyle: 'short',
  eyes: EYES.blue,
  beard: 0xd8d4ce,
  hat: { kind: 'bucket', colour: 0x4a7ad8, accent: 0x24448a },
  top: { colour: 0xc8403a, sleeves: 'long', accent: 0x8a2a26 },
  bottom: { kind: 'trousers', colour: WADERS },
  shoes: 0x2e3a22,
  costume: {
    base: (part, face, x, y) => {
      if (!vertical(face)) return undefined;
      // Wathose bis zur Brust, Gummistiefel
      if (part === 'body' && y >= 6) return cloth(y === 6 ? shade(WADERS, 0.85) : WADERS);
      if (isLeg(part) && y < 7) return cloth(WADERS);
      if (isLeg(part)) return y < 10 ? cloth(0x3a4a2a) : undefined;
      // Karohemd
      if ((part === 'body' && y < 6) || (isArm(part) && y < 9)) {
        // Karo: dunkle Kreuzungen, dünne helle Linien, sonst Rot
        if (x % 2 === 0 && y % 2 === 0) return cloth(0x8a2420);
        if (x % 4 === 3 || y % 4 === 3) return cloth(0xe0b8a8);
        return cloth(0xc8403a);
      }
      return undefined;
    },
    overlay: (part, face, x, y) => {
      if (part !== 'body' || !vertical(face) || y > 8) return undefined;
      if (face === 'front') {
        if (x === 2 || x === 5) return cloth(shade(WADERS, 0.8)); // Träger der Wathose
        if (x > 2 && x < 5) return undefined;
        if (y === 2 && x === 0) return 0xf2d02a; // Köder
        if (y === 2 && x === 7) return 0xe0402a;
        if ((y === 4 || y === 7) && (x === 1 || x === 6)) return cloth(0x6a9af0); // Taschen
      }
      return cloth(y === 8 ? shade(VEST, 0.8) : VEST);
    },
  },
};

/** Die Modus-Figuren (Kennung des Modus → Kostüm). */
export const MODE_FIGURES = {
  mornicraft,
  duels,
  party,
  gipfelsturm,
  burgverlies,
  bollwerk,
  mirni,
  wolkenkampf,
  versteckerl,
  wintersport,
  adlerflug,
  angelkoenig,
} as const satisfies Readonly<Record<string, Outfit>>;
