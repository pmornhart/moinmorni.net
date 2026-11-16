/* eslint-disable ts-patterns/no-magic-numbers -- pixel art: sizes, rows and colours as drawn */
import type { Role } from './roles.js';
import type { Text } from './settings.js';

/**
 * Rang-Abzeichen: kleine Pixel-Schilder mit Symbol und Rang-Namen – „OWNER“ rot mit Krone, „MODERATOR“ blau mit
 * Schwert … Philip kennt sie aus MorniCraft; dort zeichnet MorniHosting sie
 * (vendor/mornihosting/apps/server/src/craftattack/badges.ts). Schrift, Symbole und Maße stammen von dort, hier für die
 * Ränge aus dem Panel – alles eigene Zeichnungen, nichts von Minecraft oder anderen.
 *
 * Minecraft zeigt Bilder im Text nur als Zeichen einer Schrift. Darum steht ein Rang im Spiel als Übersetzung mit
 * dem Schlüssel „Symbol + Leerzeichen“ (`badgeKeys`): Ohne Paket kennt Minecraft den Schlüssel nicht und zeigt ihn
 * selbst – also wie bisher Symbol und Farbe (auch Bedrock über Geyser und Minecraft vor 1.20.3). Das Abzeichen-Paket
 * (apps/server/src/badges/pack.ts) übersetzt den Schlüssel in ein eigenes Zeichen, und das Zeichen ist das Schild.
 * So entscheidet jeder Client selbst – pro Betrachter, im Chat, in der Tab-Liste und über dem Kopf.
 */

/** Ein Abzeichen ist so hoch wie eine Zeile im Chat (9 Pixel); das Schild lässt oben und unten eine Reihe frei. */
export const BADGE_HEIGHT = 9;
const TAG_TOP = 1;
const TAG_BOTTOM = 7;
/** Der Name beginnt eine Reihe unter der Oberkante des Schilds (5 Reihen hoch). */
const TEXT_TOP = 2;
const TEXT_ROWS = 5;
const PAD = 2;
const ICON = 7;
/** So dunkel ist das Schild im Vergleich zur Farbe des Rangs (der Name bleibt in Weiß gut lesbar). */
const SHADE = 0.5;
/** Längster Name auf einem Abzeichen. */
export const BADGE_MAX_LETTERS = 16;

type Rgb = readonly [number, number, number];
const WHITE: Rgb = [255, 255, 255];
const GREY: Rgb = [170, 170, 170];

/**
 * Kleine Großbuchstaben, 5 Pixel hoch (meist 3 breit; M, N und W breiter): Der Name sitzt mit einer Reihe Luft
 * oben und unten im Schild, die Schilder zweier Chat-Zeilen berühren sich nicht.
 */
const FONT: Readonly<Record<string, readonly string[]>> = {
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
  C: ['.XX', 'X..', 'X..', 'X..', '.XX'],
  D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  F: ['XXX', 'X..', 'XX.', 'X..', 'X..'],
  G: ['.XX', 'X..', 'X.X', 'X.X', '.XX'],
  H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
  I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
  J: ['..X', '..X', '..X', 'X.X', '.X.'],
  K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'],
  L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
  N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
  O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
  Q: ['.X.', 'X.X', 'X.X', 'XXX', '.XX'],
  R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
  S: ['.XX', 'X..', '.X.', '..X', 'XX.'],
  T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
  U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
  V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
  W: ['X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'],
  X: ['X.X', 'X.X', '.X.', 'X.X', 'X.X'],
  Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
  Z: ['XXX', '..X', '.X.', 'X..', 'XXX'],
  // Ä und Ö: Punkte auf der Oberkante des Schilds (6 Reihen, eine höher), darunter der volle Buchstabe – Ö rund,
  // damit die Punkte frei stehen. Ü: Punkte, Luft, kleines u. So sieht keiner wie ein X aus.
  Ä: ['X.X', '.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  Ö: ['X.X', '.X.', 'X.X', 'X.X', 'X.X', '.X.'],
  Ü: ['X.X', '...', 'X.X', 'X.X', 'XXX'],
  '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  '2': ['XX.', '..X', '.X.', 'X..', 'XXX'],
  '3': ['XX.', '..X', '.X.', '..X', 'XX.'],
  '4': ['X.X', 'X.X', 'XXX', '..X', '..X'],
  '5': ['XXX', 'X..', 'XX.', '..X', 'XX.'],
  '6': ['.XX', 'X..', 'XXX', 'X.X', 'XXX'],
  '7': ['XXX', '..X', '.X.', '.X.', '.X.'],
  '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  '9': ['XXX', 'X.X', 'XXX', '..X', 'XX.'],
  '-': ['...', '...', 'XXX', '...', '...'],
  '+': ['...', '.X.', 'XXX', '.X.', '...'],
  ' ': ['..', '..', '..', '..', '..'],
};

/** Farben der Symbole (ein Buchstabe pro Pixel). */
const INK: Readonly<Record<string, Rgb>> = {
  Y: [255, 205, 60],
  O: [214, 150, 30],
  R: [230, 60, 60],
  B: [70, 150, 255],
  W: [255, 255, 255],
  o: [255, 159, 26],
  S: [176, 184, 196],
  s: [112, 120, 134],
  H: [176, 124, 78],
  G: [85, 230, 110],
  g: [40, 150, 60],
  P: [255, 106, 213],
  L: [140, 210, 255],
};

/**
 * Symbole, 7 × 7. Die ersten zehn stammen aus MorniHosting; Kette (Gefängnis), Blume und Kleeblatt (aus den
 * Symbol-Vorschlägen im Panel) sind neu.
 */
const ICONS: Readonly<Record<string, readonly string[]>> = {
  crown: ['Y..Y..Y', 'Y..Y..Y', 'YY.Y.YY', 'YYYYYYY', 'YRYBYRY', 'YYYYYYY', 'OOOOOOO'],
  shield: ['ooooooo', 'oooWooo', 'oWWWWWo', 'ooWWWoo', 'oWoooWo', '.ooooo.', '..ooo..'],
  sword: ['......L', '.....LL', '....LL.', 'B..LL..', '.BLL...', '..BB...', '.B..B..'],
  plus: ['..GGG..', '..GWG..', 'GGGWGGG', 'GWWWWWG', 'GGGWGGG', '..GWG..', '..GGG..'],
  hammer: ['.SSSSS.', 'SSSSSSS', '.SSSSS.', '...H...', '...H...', '...H...', '...H...'],
  play: ['PPPPPPP', 'PPWPPPP', 'PPWWPPP', 'PPWWWPP', 'PPWWPPP', 'PPWPPPP', 'PPPPPPP'],
  star: ['...Y...', '...Y...', 'YYYYYYY', '.YYYYY.', '..YYY..', '.YY.YY.', '.Y...Y.'],
  heart: ['.RR.RR.', 'RWRRRRR', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'],
  bolt: ['...YY..', '..YY...', '.YYYY..', '...YY..', '..YY...', '.YY....', '.Y.....'],
  gem: ['..LLL..', '.LWLLL.', 'LLLLLLL', '.LLLLL.', '..LLL..', '...L...', '.......'],
  // Zwei verhakte Kettenglieder, schräg (Gefängnis).
  chain: ['....WS.', '...W..S', '...S..s', '.WSWSs.', 'W..s...', 'S..s...', '.Ss....'],
  // Fünf weiße Blütenblätter um eine gelbe Mitte.
  flower: ['...W...', '.W.W.W.', '..WWW..', 'WWWYWWW', '..WWW..', '.W.W.W.', '...W...'],
  // Drei Blätter und ein Stiel.
  clover: ['..GGG..', '..GgG..', 'GG.G.GG', 'GgGgGgG', '.GGgGG.', '...g...', '...g...'],
};

/** Welches Symbol aus dem Panel zu welchem Bild führt (unbekannte bekommen den Edelstein). */
const ICON_OF: Readonly<Record<string, string>> = {
  '♛': 'crown',
  '✦': 'shield',
  '⚔': 'sword',
  '✚': 'plus',
  '⚒': 'hammer',
  '▶': 'play',
  '★': 'star',
  '❤': 'heart',
  '⚡': 'bolt',
  '⛓': 'chain',
  '✿': 'flower',
  '☘': 'clover',
};

/** Name des Bilds zu einem Symbol – leeres Symbol, kein Bild (z. B. „Spieler“). */
export function badgeIconOf(symbol: string): string | null {
  const s = symbol.trim();
  if (!s) return null;
  return ICON_OF[s] ?? 'gem';
}

/** Ein Abzeichen als Pixel: Breite × Höhe, RGBA Reihe für Reihe. */
export interface BadgePicture {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** Was ein Abzeichen zeigt: Name, Symbol und Farbe (#rrggbb) des Rangs. */
export interface BadgeLook {
  readonly text: string;
  readonly symbol: string;
  readonly colour: string;
}

// "#ff5555" → 255, 85, 85.
// https://regex101.com/?flavor=javascript&regex=%5E%23(%5B0-9a-f%5D%7B2%7D)(%5B0-9a-f%5D%7B2%7D)(%5B0-9a-f%5D%7B2%7D)%24&flags=i&testString=%23ff5555
const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
function rgbOf(hex: string): Rgb {
  const m = HEX.exec(hex);
  return m ? [parseInt(m[1] ?? '0', 16), parseInt(m[2] ?? '0', 16), parseInt(m[3] ?? '0', 16)] : GREY;
}

// Zeichen mit Akzent, die die Schrift nicht kennt: "É" → "E" + Akzent (der Akzent fällt danach weg).
// https://regex101.com/?flavor=javascript&regex=%5Cp%7BM%7D&flags=gu&testString=E%CC%81
const MARKS = /\p{M}/gu;
const KEEP_UMLAUTS: Readonly<Record<string, string>> = { Ä: '\u0001', Ö: '\u0002', Ü: '\u0003' };
const BACK_UMLAUTS: Readonly<Record<string, string>> = { '\u0001': 'Ä', '\u0002': 'Ö', '\u0003': 'Ü' };

/**
 * Die Buchstaben eines Namens, wie das Abzeichen sie zeigt: groß, Umlaute bleiben, andere Akzente fallen weg
 * („Média“ → MEDIA), nur was die Schrift kennt, höchstens 16.
 */
export function badgeLetters(name: string): string[] {
  const upper = [...name.toUpperCase()].map((ch) => KEEP_UMLAUTS[ch] ?? ch).join('');
  return [...upper.normalize('NFD').replace(MARKS, '')]
    .map((ch) => BACK_UMLAUTS[ch] ?? ch)
    .filter((ch) => FONT[ch] !== undefined)
    .slice(0, BADGE_MAX_LETTERS);
}

/**
 * Ein Abzeichen: Schild in der (abgedunkelten) Farbe des Rangs mit abgerundeten Ecken und einer Linie in der
 * vollen Farbe unten, links das Symbol, daneben der Name in Weiß. Nichts zu zeigen (kein Buchstabe, kein Symbol)
 * → null.
 */
export function drawBadge(look: BadgeLook): BadgePicture | null {
  const iconName = badgeIconOf(look.symbol);
  const icon = iconName ? (ICONS[iconName] ?? null) : null;
  const glyphs = badgeLetters(look.text).map((ch) => FONT[ch] ?? []);
  if (!icon && !glyphs.length) return null;
  const textWidth = glyphs.reduce((sum, g) => sum + (g[0]?.length ?? 0) + 1, 0) - (glyphs.length ? 1 : 0);
  const iconWidth = icon ? ICON + (glyphs.length ? PAD : 0) : 0;
  const width = PAD + iconWidth + textWidth + PAD;
  const rgba = new Uint8Array(width * BADGE_HEIGHT * 4);
  const put = (x: number, y: number, [r, g, b]: Rgb): void => rgba.set([r, g, b, 255], (y * width + x) * 4);
  const colour = rgbOf(look.colour);
  const [r, g, b] = colour;
  const tag: Rgb = [Math.round(r * SHADE), Math.round(g * SHADE), Math.round(b * SHADE)];
  const corner = (x: number, y: number): boolean =>
    (x === 0 || x === width - 1) && (y === TAG_TOP || y === TAG_BOTTOM);
  Array.from({ length: TAG_BOTTOM - TAG_TOP + 1 }, (_, i) => TAG_TOP + i).forEach((y) =>
    Array.from({ length: width }, (_, x) => x)
      .filter((x) => !corner(x, y))
      .forEach((x) => put(x, y, tag)),
  );
  // Eine dünne Linie in der Farbe des Rangs unten hebt das Schild vom Hintergrund des Chats ab.
  Array.from({ length: width - 2 }, (_, x) => x + 1).forEach((x) => put(x, TAG_BOTTOM, colour));
  (icon ?? []).forEach((row, y) =>
    [...row].forEach((cell, x) => {
      const ink = INK[cell];
      if (ink) put(PAD + x, TAG_TOP + y, ink);
    }),
  );
  glyphs.reduce((left, glyph) => {
    // Höhere Buchstaben (Ä, Ö) beginnen entsprechend weiter oben.
    const top = TEXT_TOP - (glyph.length - TEXT_ROWS);
    glyph.forEach((row, y) =>
      [...row].forEach((cell, x) => {
        if (cell === 'X') put(left + x, top + y, WHITE);
      }),
    );
    return left + (glyph[0]?.length ?? 0) + 1;
  }, PAD + iconWidth);
  return { width, height: BADGE_HEIGHT, rgba };
}

/** Wie ein Rang auf seinem Abzeichen aussieht – Name je Sprache (Minecraft-Sprache des Spielers entscheidet). */
export function roleBadgeLook(role: Pick<Role, 'name' | 'symbol' | 'colour'>, lang: keyof Text): BadgeLook {
  return { text: role.name[lang], symbol: role.symbol, colour: role.colour };
}

/**
 * Gefängnis: kein Rang, aber ein eigenes Abzeichen vor Nachrichten aus der Zelle (die liest nur das Team). Der
 * Schlüssel nimmt drei Teile auf – ohne Paket zeigt Minecraft daraus wie bisher „[⛓ Gefängnis]“ in zwei Grautönen.
 */
export const JAIL_BADGE = {
  key: '%1$s%2$s%3$s ',
  symbol: '⛓',
  colour: '#8a95a5',
  name: { de: 'Gefängnis', en: 'Jail' },
} as const;

/**
 * Schlüssel jedes Rangs (nach Rang sortiert vergeben): Symbol + Leerzeichen („♛ “), ohne Symbol leer. Haben zwei
 * Ränge dasselbe Symbol, bekommt der untere ein Leerzeichen mehr – sonst hätten beide dasselbe Abzeichen.
 */
export function badgeKeys(
  roles: readonly Pick<Role, 'id' | 'symbol' | 'position'>[],
): Readonly<Record<string, string>> {
  const taken = new Set<string>([JAIL_BADGE.key]);
  const free = (key: string): string => (taken.has(key) ? free(`${key} `) : key);
  return Object.fromEntries(
    [...roles]
      .sort((a, b) => a.position - b.position)
      .map((role) => {
        const symbol = role.symbol.trim();
        const key = free(symbol ? `${symbol} ` : '');
        taken.add(key);
        return [role.id, key] as const;
      }),
  );
}
