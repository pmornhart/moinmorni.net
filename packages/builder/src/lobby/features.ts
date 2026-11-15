/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: positions in the lobby as the world has them */
/**
 * Was in der Lobby „lebt“, als Daten: Ankunftspunkt, Launchpads, Parkour-Strecke und Stationen des Rundgangs.
 * Der Bau (`dorfplatz.ts`) setzt die Blöcke, MoinMorni schickt dieselben Punkte ans Lobby-Plugin.
 */
import { GROUND } from '../nature.js';

export interface LobbyPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface LobbyView extends LobbyPoint {
  readonly yaw: number;
  readonly pitch: number;
}

export interface Bilingual {
  readonly de: string;
  readonly en: string;
}

export interface Launchpad extends LobbyPoint {
  /** Schub beim Betreten [x, y, z] in Blöcken pro Tick. */
  readonly push: readonly [number, number, number];
}

export interface TourStop extends LobbyView {
  readonly title: Bilingual;
  readonly text: Bilingual;
}

/** Blickrichtung von a nach b (Minecraft: yaw 0 = Süden, 90 = Westen, 180 = Norden). */
function look(from: LobbyPoint, at: LobbyPoint): LobbyView {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const dz = at.z - from.z;
  const yaw = Math.round((Math.atan2(-dx, dz) * 180) / Math.PI);
  const pitch = Math.round((-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI);
  return { ...from, yaw, pitch };
}

const p = (x: number, y: number, z: number): LobbyPoint => ({ x, y, z });

/** Ankunft: in der Gasse südlich vom Dorfmarkt, Blick über die Stände und den Maibaum hinauf zum Schloss. */
export const LOBBY_SPAWN_VIEW: LobbyView = look(p(0.5, GROUND + 1, 20.5), p(0, 92, -120));

/** Launchpads auf dem Vorplatz – schießen schräg zur Mitte auf die Schlosstreppe (Landung etwa bei z −50). */
export const LAUNCHPADS: readonly Launchpad[] = [
  { x: -14, y: GROUND, z: -26, push: [1.15, 1.8, -2.6] },
  { x: 14, y: GROUND, z: -26, push: [-1.15, 1.8, -2.6] },
];

/**
 * Parkour im Nordwesten: Start in der Wiese, dann 24 Sprünge in einer Spirale nach oben (sechs Seiten à vier Sprünge:
 * 2 Blöcke vor + 1 hoch, 3 vor, 2 vor + 1 hoch, 3 vor). Jede Seite endet auf einem Kontrollpunkt.
 */
const PARKOUR_START = p(-56, GROUND, -36);
const HEADINGS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
];
const SIDE: readonly (readonly [number, number])[] = [
  [2, 1],
  [3, 0],
  [2, 1],
  [3, 0],
];
const SIDES = 6;

export interface ParkourCourse {
  /** Blöcke, auf denen man steht (Start = erster, Ziel = letzter). */
  readonly blocks: readonly LobbyPoint[];
  /** Indizes der Kontrollpunkte (ohne Start). */
  readonly checkpoints: readonly number[];
}

export const PARKOUR: ParkourCourse = (() => {
  const blocks = Array.from({ length: SIDES * SIDE.length }).reduce<LobbyPoint[]>(
    (acc, _, i) => {
      const last = acc[acc.length - 1] ?? PARKOUR_START;
      const [hx, hz] = HEADINGS[Math.floor(i / SIDE.length) % HEADINGS.length] ?? [0, 0];
      const [ahead, up] = SIDE[i % SIDE.length] ?? [0, 0];
      return [...acc, p(last.x + hx * ahead, last.y + up, last.z + hz * ahead)];
    },
    [PARKOUR_START],
  );
  const checkpoints = Array.from({ length: SIDES }, (_, s) => (s + 1) * SIDE.length);
  return { blocks, checkpoints };
})();

const stop = (from: LobbyPoint, at: LobbyPoint, title: Bilingual, text: Bilingual): TourStop => ({
  ...look(from, at),
  title,
  text,
});

/** Rundgang für neue Spieler: kurze Stationen durchs Dorf (je ein paar Sekunden). */
export const TOUR: readonly TourStop[] = [
  stop(
    p(9.5, GROUND + 2, 12.5),
    p(0, 80, -60),
    { de: 'Servus in MoinMorni!', en: 'Welcome to MoinMorni!' },
    {
      de: 'Das ist der Dorfplatz – hier geht alles los.',
      en: 'This is the village square – everything starts here.',
    },
  ),
  stop(
    p(0.5, GROUND + 2, -18),
    p(-24, GROUND + 2.5, -33),
    { de: 'Spielmodi', en: 'Game modes' },
    {
      de: 'Jeder Marktstand ist ein Spielmodus. Klick die Figur an – schon geht es los.',
      en: 'Every market stall is a game mode. Click the figure and off you go.',
    },
  ),
  stop(
    p(33, GROUND + 3, -11),
    p(47, GROUND + 1.5, 2),
    { de: 'Biergarten', en: 'Beer garden' },
    {
      de: 'Hier triffst du die anderen – im Sprachchat-Kanal „Biergarten“ hört ihr euch.',
      en: 'Meet the others here – in the voice channel “Biergarten” you can hear each other.',
    },
  ),
  stop(
    p(-48, GROUND + 3, 7),
    p(-104, GROUND + 2, 7),
    { de: 'Alles begehbar', en: 'Walk in anywhere' },
    {
      de: 'Jedes Haus im Dorf kannst du betreten – schau dich ruhig um.',
      en: 'You can enter every house in the village – have a look around.',
    },
  ),
  stop(
    p(-50, GROUND + 4, -28),
    p(-60, GROUND + 8, -42),
    { de: 'Parkour', en: 'Parkour' },
    {
      de: 'Spring die weiß-blaue Spirale hoch – mit Zeitmessung und Bestenliste.',
      en: 'Jump up the white-and-blue spiral – timed, with a leaderboard.',
    },
  ),
  stop(
    p(0.5, GROUND + 3, -16),
    p(14, GROUND + 1, -26),
    { de: 'Launchpads', en: 'Launch pads' },
    {
      de: 'Lauf über die Smaragd-Platten – sie schießen dich Richtung Schloss.',
      en: 'Step on the emerald pads – they launch you towards the castle.',
    },
  ),
  stop(
    p(17, 92, -104),
    p(0, 104, -140),
    { de: 'Das Schloss', en: 'The castle' },
    {
      de: 'Von oben hast du den schönsten Blick übers Tal.',
      en: 'From up here you get the best view of the valley.',
    },
  ),
  stop(
    p(30.5, GROUND + 2, 21),
    p(30, GROUND + 2, 30),
    { de: 'Hilfe', en: 'Help' },
    {
      de: 'Fragen? In der Gäste-Info – oder schreib /hilfe. Viel Spaß!',
      en: 'Questions? Ask at the visitor info – or type /help. Have fun!',
    },
  ),
];
