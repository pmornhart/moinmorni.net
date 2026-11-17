/* eslint-disable ts-patterns/no-magic-numbers -- default player limits per mode */
import { z } from 'zod';
import type { Text } from './settings.js';

/**
 * Spielmodi: was in der Lobby als Figur steht, auf der Webseite als Karte und im Discord im Status. Jeder Modus
 * lässt sich im Panel an- und ausschalten, in Wartung setzen, umbenennen, umsortieren und begrenzen.
 */

export const MODE_STATES = ['on', 'off', 'maintenance', 'soon'] as const;
export type ModeState = (typeof MODE_STATES)[number];

/** Wer hinein darf: alle, oder nur Leute auf der Whitelist (MorniCraft). */
export const MODE_ACCESS = ['everyone', 'whitelist'] as const;
export type ModeAccess = (typeof MODE_ACCESS)[number];

const NAME_MAX = 32;
const DESCRIPTION_MAX = 240;
const PLAYERS_MAX = 500;
// Name des Servers im Netzwerk (Velocity): "duels", "morni-party"; nicht "Duels" oder "zwei wörter".
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-z0-9%5D%5Ba-z0-9_-%5D*%24&testString=morni-party
const SERVER_NAME = /^[a-z0-9][a-z0-9_-]*$/;

export const modeSchema = z.object({
  id: z.string().regex(SERVER_NAME).max(NAME_MAX),
  name: z.object({ de: z.string().min(1).max(NAME_MAX), en: z.string().min(1).max(NAME_MAX) }),
  description: z.object({ de: z.string().max(DESCRIPTION_MAX), en: z.string().max(DESCRIPTION_MAX) }),
  state: z.enum(MODE_STATES),
  access: z.enum(MODE_ACCESS),
  /** Reihenfolge in der Lobby und auf der Webseite (kleiner = weiter vorne). */
  position: z.number().int().min(0),
  maxPlayers: z.number().int().min(1).max(PLAYERS_MAX),
  /**
   * Schlafen, wenn niemand drin ist: Der Server geht ganz aus (kein Arbeitsspeicher) und startet beim Klick auf die
   * Figur wieder (dauert etwa eine halbe Minute). Aus (Standard seit 16.11.): immer online – im Leerlauf hält Minecraft
   * die Welt an und Java gibt ungenutzten Arbeitsspeicher zurück („Arbeitsspeicher im Leerlauf freigeben“ im Motor).
   */
  sleepWhenEmpty: z.boolean(),
  /** Server im Netzwerk (Name in Velocity); null = noch keiner (z. B. „bald“). */
  server: z.string().regex(SERVER_NAME).max(NAME_MAX).nullable(),
});
export type Mode = z.infer<typeof modeSchema>;

export const modePatchSchema = modeSchema.omit({ id: true }).partial();
export type ModePatch = z.infer<typeof modePatchSchema>;

/**
 * Ruhezustand eines Modus (Panel → Modi): Gibt sein Server im Leerlauf Arbeitsspeicher frei („Arbeitsspeicher im
 * Leerlauf freigeben“ im Motor)? null = noch kein Server (oder ein Motor ohne diesen Schalter).
 */
export interface ModeRest {
  readonly on: boolean | null;
  /** Geändert, gilt aber erst nach dem Neustart – der kommt, sobald niemand drin ist. */
  readonly restartPending: boolean;
}

/** Was mit einem leeren Modus passiert: Ruhezustand (Standard), ganz schlafen oder voll wach bleiben. */
export const MODE_IDLE = ['rest', 'sleep', 'awake'] as const;
export type ModeIdle = (typeof MODE_IDLE)[number];

/** Aus „schlafen, wenn leer“ (`sleepWhenEmpty`) und dem Ruhezustand des Servers: was die Modi-Seite anzeigt. */
export function modeIdleOf(sleepWhenEmpty: boolean, restOn: boolean | null): ModeIdle {
  if (sleepWhenEmpty) return 'sleep';
  return restOn === false ? 'awake' : 'rest';
}

const t = (de: string, en: string): Text => ({ de, en });

/** Die Modi, mit denen MoinMorni startet (Philip, 14.11.). */
export const DEFAULT_MODES: readonly Mode[] = [
  {
    id: 'mornicraft',
    name: t('MorniCraft', 'MorniCraft'),
    description: t(
      'Unser Freunde-Survival mit Clans, Gräbern und einem mächtigen Drachen – nur auf Einladung.',
      'Our friends’ survival with clans, graves and a mighty dragon – invitation only.',
    ),
    state: 'off',
    access: 'whitelist',
    position: 0,
    maxPlayers: 40,
    sleepWhenEmpty: false,
    server: 'mornicraft',
  },
  {
    id: 'duels',
    name: t('Duels', 'Duels'),
    description: t(
      '20 Kampfarten von Klassisch mit Suppe bis Sumo, Spleef und Brücke. 1 gegen 1, 2 gegen 2 und Party-Kämpfe, gewertet oder locker.',
      '20 fighting styles from classic with soup to Sumo, Spleef and Bridge. 1v1, 2v2 and party fights, ranked or casual.',
    ),
    state: 'on',
    access: 'everyone',
    position: 1,
    maxPlayers: 100,
    sleepWhenEmpty: false,
    server: 'duels',
  },
  {
    id: 'party',
    name: t('Morni Party', 'Morni Party'),
    description: t(
      'Würfeln, Taler sammeln, Edelweiß kaufen – und zwischendurch schnelle Minispiele. Für 2–8 Spieler.',
      'Roll the dice, collect coins, buy edelweiss – with quick minigames in between. For 2–8 players.',
    ),
    state: 'on',
    access: 'everyone',
    position: 2,
    maxPlayers: 64,
    sleepWhenEmpty: false,
    server: 'party',
  },
  {
    id: 'gipfelsturm',
    name: t('Gipfelsturm', 'Summit Rush'),
    description: t(
      'Parkour-Strecken von leicht bis extrem, mit Bestzeiten und Strecke der Woche.',
      'Parkour courses from easy to extreme, with best times and a course of the week.',
    ),
    state: 'on',
    access: 'everyone',
    position: 3,
    maxPlayers: 60,
    sleepWhenEmpty: false,
    server: 'gipfelsturm',
  },
  {
    id: 'burgverlies',
    name: t('Burgverlies', 'Castle Dungeon'),
    description: t(
      'Koop-Dungeon für 1–4: Fallen, Schätze und ein Endboss tief unter der Burg.',
      'Co-op dungeon for 1–4: traps, treasure and a final boss deep below the castle.',
    ),
    state: 'on',
    access: 'everyone',
    position: 4,
    maxPlayers: 40,
    sleepWhenEmpty: false,
    server: 'burgverlies',
  },
  {
    id: 'bollwerk',
    name: t('Bollwerk', 'Bulwark'),
    description: t(
      'Verteidigt das Dorf gegen Welle um Welle – zwischen den Wellen wird aufgerüstet.',
      'Defend the village against wave after wave – gear up between the waves.',
    ),
    state: 'on',
    access: 'everyone',
    position: 5,
    maxPlayers: 40,
    sleepWhenEmpty: false,
    server: 'bollwerk',
  },
  {
    id: 'mirni',
    name: t('MorniSMP', 'MorniSMP'),
    description: t(
      'Überleben mit freiem Markt: Stadt mit Marktplatz, Auktionshaus, Aufträgen, eigenen Läden und Zufalls-Teleport.',
      'Survival with a free market: town with market square, auction house, orders, your own shops and random teleport.',
    ),
    state: 'on',
    access: 'everyone',
    position: 6,
    maxPlayers: 60,
    sleepWhenEmpty: false,
    server: 'smp',
  },
  {
    id: 'wolkenkampf',
    name: t('Wolkenkampf', 'Cloud Clash'),
    description: t(
      'Jeder startet auf seiner eigenen Insel in den Wolken: Truhen plündern, Brücken bauen, kämpfen – wer zuletzt steht, gewinnt. Für 2–12, allein oder zu zweit.',
      'Everyone starts on their own island in the clouds: loot chests, build bridges, fight – the last one standing wins. For 2–12, solo or in pairs.',
    ),
    state: 'on',
    access: 'everyone',
    position: 7,
    maxPlayers: 48,
    sleepWhenEmpty: false,
    server: 'wolkenkampf',
  },
  {
    id: 'versteckerl',
    name: t('Versteckerl', 'Hide & Seek'),
    description: t(
      'Verstecken mit Verwandlung: Werde zum Heuballen, Fass oder Blumentopf – die Dorfgendarmen suchen dich. Für 4–16.',
      'Hide and seek with a twist: turn into a hay bale, barrel or flower pot – the village constables are looking for you. For 4–16.',
    ),
    state: 'on',
    access: 'everyone',
    position: 8,
    maxPlayers: 48,
    sleepWhenEmpty: false,
    server: 'versteckerl',
  },
  {
    id: 'wintersport',
    name: t('Wintersport', 'Winter Games'),
    description: t(
      'Riesenslalom, Biathlon und Bobbahn im verschneiten Bergdorf – um Gold, Silber und Bronze. Für 2–12, jede Disziplin auch einzeln.',
      'Giant slalom, biathlon and bobsleigh in a snowy mountain village – for gold, silver and bronze. For 2–12, every event also on its own.',
    ),
    state: 'on',
    access: 'everyone',
    position: 9,
    maxPlayers: 36,
    sleepWhenEmpty: false,
    server: 'wintersport',
  },
  {
    id: 'adlerflug',
    name: t('Adlerflug', 'Eagle Flight'),
    description: t(
      'Mit Flügeln von der Schanze und auf Zeit durch Ringe in den Bergen fliegen – mit Medaillen, Bestzeiten und Strecke der Woche.',
      'Glide off the ski jump and race against the clock through rings in the mountains – with medals, best times and a course of the week.',
    ),
    state: 'on',
    access: 'everyone',
    position: 10,
    maxPlayers: 40,
    sleepWhenEmpty: false,
    server: 'adlerflug',
  },
  {
    id: 'angelkoenig',
    name: t('Angelkönig', 'Angler King'),
    description: t(
      'Gemütlich angeln im Alpen-Tal: seltene Fische fangen, beim Fischhändler verkaufen und beim Turnier zum Angelkönig werden.',
      'Relaxed fishing in an alpine valley: catch rare fish, sell them at the fishmonger and become Angler King at the tournament.',
    ),
    state: 'on',
    access: 'everyone',
    position: 11,
    maxPlayers: 40,
    sleepWhenEmpty: false,
    server: 'angelkoenig',
  },
  {
    id: 'maibaumklau',
    name: t('Maibaumklau', 'Maypole Raid'),
    description: t(
      'Zwei Dörfer, zwei Maibäume: Den fremden Baum umlegen und heimtragen, den eigenen bewachen – ganz ohne Waffen. Für 2–16.',
      'Two villages, two maypoles: knock over the other village’s pole and carry it home while guarding your own – no weapons at all. For 2–16.',
    ),
    state: 'on',
    access: 'everyone',
    position: 12,
    maxPlayers: 48,
    sleepWhenEmpty: false,
    server: 'maibaumklau',
  },
  {
    id: 'dorfkrimi',
    name: t('Dorfkrimi', 'Village Mystery'),
    description: t(
      'Im Dorf treibt ein Wilderer sein Unwesen – Spuren finden, Dorfversammlung rufen, den Richtigen festnehmen. Geheime Rollen für 4–16.',
      'A poacher is up to no good in the village – find clues, call a village meeting, arrest the right one. Secret roles for 4–16.',
    ),
    state: 'on',
    access: 'everyone',
    position: 13,
    maxPlayers: 48,
    sleepWhenEmpty: false,
    server: 'dorfkrimi',
  },
  {
    id: 'baumeister',
    name: t('Baumeister', 'Master Builder'),
    description: t(
      'Ein Thema, eine Parzelle – die Zeit läuft! Baut um die Wette und bewertet die Bauten der anderen. Für 2–16, allein oder zu zweit.',
      'One theme, one plot – the clock is ticking! Build against each other and rate everyone else’s builds. For 2–16, solo or in pairs.',
    ),
    state: 'on',
    access: 'everyone',
    position: 14,
    maxPlayers: 48,
    sleepWhenEmpty: false,
    server: 'baumeister',
  },
  {
    id: 'sommerspiele',
    name: t('Sommerspiele', 'Summer Games'),
    description: t(
      'Almlauf, Bogenschießen, Ruderregatta und Seifenkistenrennen im Dorf am Bergsee – um Gold, Silber und Bronze. Für 2–12, von April bis November.',
      'Alpine run, archery, rowing regatta and soapbox race in the village by the mountain lake – for gold, silver and bronze. For 2–12, April to November.',
    ),
    state: 'on',
    access: 'everyone',
    position: 15,
    maxPlayers: 36,
    sleepWhenEmpty: false,
    server: 'sommerspiele',
  },
];

/**
 * Repos der Spielmodi: Dort baut GitHub bei jedem Stand auf `main` ein Release mit der Jar, MoinMorni spielt sie auf
 * den Server des Modus (und hält sie aktuell).
 */
export const MODE_REPOS: Readonly<Record<string, string>> = {
  // MorniCraft läuft auch allein und unter MorniHosting; im Netzwerk schaltet es selbst in den Netzwerk-Modus.
  mornicraft: 'pmornhart/MorniCraft',
  duels: 'pmornhart/MoinMorni-Duels',
  party: 'pmornhart/Morni-Party',
  gipfelsturm: 'pmornhart/Morni-Gipfelsturm',
  burgverlies: 'pmornhart/Morni-Burgverlies',
  bollwerk: 'pmornhart/Morni-Bollwek',
  mirni: 'pmornhart/Morni-SMP',
  wolkenkampf: 'pmornhart/morni-wolkenkampf',
  versteckerl: 'pmornhart/Morni-Versteckerl',
  wintersport: 'pmornhart/morni-wintersport',
  adlerflug: 'pmornhart/morni-adlerflug',
  angelkoenig: 'pmornhart/morni-angelkoenig',
  maibaumklau: 'pmornhart/morni-maibaumklau',
  dorfkrimi: 'pmornhart/morni-dorfkrimi',
  baumeister: 'pmornhart/morni-baumeister',
  sommerspiele: 'pmornhart/morni-sommerspiele',
};

/**
 * Name der Jar im Release jedes Modus-Repos (so baut sie dessen Workflow). MoinMorni lädt sie direkt von der
 * Release-Seite (`github.com/<Repo>/releases/download/<Tag>/<Jar>`) – ohne API-Frage. Fehlt ein Modus hier, heißt die
 * Jar wie das Repo; stimmt der Name einmal nicht, fragt MoinMorni die API (sparsam) nach der richtigen Datei.
 */
export const MODE_JARS: Readonly<Record<string, string>> = {
  mornicraft: 'MorniCraft.jar',
  duels: 'MoinMorni-Duels.jar',
  party: 'Morni-Party.jar',
  gipfelsturm: 'Morni-Gipfelsturm.jar',
  burgverlies: 'Morni-Burgverlies.jar',
  // Repo „Morni-Bollwek“ (so gewollt), die Jar heißt richtig.
  bollwerk: 'Morni-Bollwerk.jar',
  mirni: 'Morni-SMP.jar',
  wolkenkampf: 'Morni-Wolkenkampf.jar',
  versteckerl: 'Morni-Versteckerl.jar',
  wintersport: 'Morni-Wintersport.jar',
  adlerflug: 'Morni-Adlerflug.jar',
  angelkoenig: 'Morni-Angelkoenig.jar',
  maibaumklau: 'Morni-Maibaumklau.jar',
  dorfkrimi: 'Morni-Dorfkrimi.jar',
  baumeister: 'Morni-Baumeister.jar',
  sommerspiele: 'Morni-Sommerspiele.jar',
};

/**
 * Arbeitsspeicher der Modus-Server in MB, wo der Standard (1,5 GB) nicht reicht: MorniSMP und MorniCraft haben große
 * Welten, Morni Party baut große Spielbretter; die drei Modi vom 17.11. (Maibaumklau, Dorfkrimi, Baumeister) haben
 * kleine Welten und bekommen 1 GB. Wintersport und Sommerspiele teilen sich das Jahr (einer hat immer Pause, sein Dorf
 * ist dann nur zum Anschauen offen) und bekommen je 1 GB – so passen weiter alle Server zugleich in einen Container
 * mit 32 GB: Proxy 1 + Lobby 3 + Wartungs-Lobby 0,75 + Bau 1,5 + MorniSMP 3 + MorniCraft 3 + Party 2 + acht Modi je
 * 1,5 + fünf Modi je 1 = 31,25 GB (dazu 0,75 GB Reserve des Motors). Im Leerlauf (Ruhezustand) braucht ein leerer Modus nur etwa 0,7–0,9 GB; reicht der
 * Speicher beim Start trotzdem nicht, schlafen leere Modi zuerst (`sleep.makeRoom`). Im Panel je Server änderbar.
 */
export const MODE_MEMORY_MB: Readonly<Record<string, number>> = {
  mirni: 3072,
  mornicraft: 3072,
  party: 2048,
  maibaumklau: 1024,
  dorfkrimi: 1024,
  baumeister: 1024,
  wintersport: 1024,
  sommerspiele: 1024,
};

/** Was Webseite, Lobby und Discord über einen Modus zeigen. */
export interface ModeStatus {
  readonly id: string;
  readonly name: Text;
  readonly description: Text;
  readonly state: ModeState;
  readonly access: ModeAccess;
  readonly players: number;
  readonly maxPlayers: number;
  /** Server läuft gerade (sonst schläft er oder ist aus). */
  readonly awake: boolean;
  /** Name im Netzwerk (für `/server <name>`); null = noch keiner. */
  readonly server: string | null;
  /**
   * Was der Modus gerade meldet („waiting“, „running“, „open“ …) – nur solange sein Server wach ist (ein schlafender
   * Server meldet nichts, sein letzter Zustand gilt dann nicht mehr). `closed` = er hat gerade zu (siehe `modePause`).
   * null = nichts gemeldet oder Server schläft.
   */
  readonly phase: string | null;
}

/** Zustand, den ein Modus meldet, wenn er gerade zu hat (Wintersport außerhalb der Saison, ein Modus beim Beenden). */
export const MODE_PHASE_PAUSE = 'closed';
/** Saison-Pause eines Modus: Sommerpause (Wintersport) oder Winterpause (Sommerspiele). */
export type ModeSeasonBreak = 'summer' | 'winter';
/** Wie ein Modus gerade zu hat: Saison-Pause oder schlicht geschlossen (`closed`). */
export type ModePause = ModeSeasonBreak | 'closed';

/**
 * Modi, deren „zu“ eine Saison-Pause ist – das Dorf bleibt zum Anschauen offen: Wintersport hat außerhalb des Winters
 * Sommerpause, Sommerspiele haben außerhalb des Sommers Winterpause.
 */
export const MODE_SEASON_BREAKS: Readonly<Record<string, ModeSeasonBreak>> = {
  wintersport: 'summer',
  sommerspiele: 'winter',
};
/** Die Modi mit Saison-Pause (wie `MODE_SEASON_BREAKS`). */
export const MODE_SEASON_BREAK: ReadonlySet<string> = new Set(Object.keys(MODE_SEASON_BREAKS));

/**
 * Saison der beiden Sport-Modi (Monate, jeweils ganz): Wintersport vom 1. Dezember bis 31. März, Sommerspiele vom
 * 1. April bis 30. November – so ist immer genau einer offen. So steht es in der mitgelieferten config.yml der Modi;
 * was der Modus selbst meldet (`closed`), geht vor.
 */
export const SPORT_SEASONS = {
  wintersport: { from: 12, to: 3 },
  sommerspiele: { from: 4, to: 11 },
} as const;
export type SportMode = keyof typeof SPORT_SEASONS;
export const SPORT_MODES: readonly SportMode[] = ['wintersport', 'sommerspiele'];

/** Liegt der Monat (1–12) in der Saison von … bis … (auch über den Jahreswechsel)? */
export function inSeason(month: number, from: number, to: number): boolean {
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

/** Welcher Sport-Modus hat nach dem Kalender gerade Saison (Monat 1–12)? */
export function sportModeByMonth(month: number): SportMode {
  const { from, to } = SPORT_SEASONS.wintersport;
  return inSeason(month, from, to) ? 'wintersport' : 'sommerspiele';
}

/** Wer am Sport-Stand steht: von selbst (Saison) oder fest eine Seite (Panel → Lobby, für Tests und Events). */
export const SPORT_STAND_CHOICES = ['auto', 'wintersport', 'sommerspiele'] as const;
export type SportStandChoice = (typeof SPORT_STAND_CHOICES)[number];

/** Was der Sport-Stand über einen der beiden Modi wissen muss. */
export interface SportStandMode {
  /** Hat er einen Server (sonst kommt er erst noch, z. B. ohne Release)? */
  readonly hasServer: boolean;
  /** Saison-Pause, wie `modePause` sie sagt (null = offen oder nichts gemeldet). */
  readonly pause: ModePause | null;
}

/**
 * Wer steht am gemeinsamen Sport-Stand am Schlossmarkt? Fest eingestellt geht vor; sonst der, der gerade offen ist –
 * hat genau einer der beiden Saison-Pause, steht der andere da; hat nur einer schon einen Server, der. Sonst (beide
 * offen, z. B. Wintersport mit „das ganze Jahr“, oder noch nichts gemeldet) entscheidet der Kalender (`SPORT_SEASONS`).
 */
export function sportStand(
  choice: SportStandChoice,
  modes: Readonly<Record<SportMode, SportStandMode | undefined>>,
  month: number,
): SportMode {
  if (choice !== 'auto') return choice;
  const winter = modes.wintersport;
  const summer = modes.sommerspiele;
  const breaks = (m: SportStandMode | undefined): boolean => m?.pause === 'summer' || m?.pause === 'winter';
  if (breaks(winter) && !breaks(summer) && summer?.hasServer) return 'sommerspiele';
  if (breaks(summer) && !breaks(winter) && winter?.hasServer) return 'wintersport';
  if (winter?.hasServer && !summer?.hasServer) return 'wintersport';
  if (summer?.hasServer && !winter?.hasServer) return 'sommerspiele';
  return sportModeByMonth(month);
}

/**
 * Wintersport und Sommerspiele sind EIN Platz im Netzwerk: Wer gerade am Sport-Stand steht (`sportStand`), ist überall
 * zu sehen – auf der Webseite, im Kompass, im Discord. Der andere ist dann „durch ihn ersetzt“. Liefert den Modus, der
 * statt `id` gerade dran ist, oder null (kein Sport-Modus, er selbst ist dran, oder es ist nichts bekannt).
 */
export function sportReplacedBy(id: string, sport: SportMode | null | undefined): SportMode | null {
  if (!sport || id === sport) return null;
  return (SPORT_MODES as readonly string[]).includes(id) ? sport : null;
}

/** Die Modi, die gerade zu sehen sind: alle außer dem Sport-Modus, der gerade nicht dran ist (Reihenfolge bleibt). */
export function modesNow<T extends { readonly id: string }>(
  modes: readonly T[],
  sport: SportMode | null | undefined,
): T[] {
  return modes.filter((m) => sportReplacedBy(m.id, sport) === null);
}

/** Monat (1–12) eines Zeitpunkts in einer Zeitzone (z. B. „Europe/Berlin“). */
export function monthIn(timeZone: string, at: number): number {
  const month = new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric' }).format(new Date(at));
  return Number(month);
}

/**
 * Hat ein Modus gerade zu? `summer` = Sommerpause (Wintersport), `winter` = Winterpause (Sommerspiele), `closed` =
 * gerade geschlossen (andere Modi, z. B. während der Server beendet wird), null = nein. Gilt nur, solange sein Server
 * wach ist – ein schlafender Modus ist nicht geschlossen, er wacht auf, sobald jemand kommt.
 */
export function modePause(
  mode: Pick<ModeStatus, 'id' | 'state' | 'server' | 'awake' | 'phase'>,
): ModePause | null {
  if (mode.state !== 'on' || !mode.server || !mode.awake || mode.phase !== MODE_PHASE_PAUSE) return null;
  return MODE_SEASON_BREAKS[mode.id] ?? 'closed';
}

/**
 * Wichtigster Wert eines Modus für die Bestenliste (Top 3 auf der Modus-Seite), wenn es nicht „Siege“ o. Ä. sein soll.
 * Zeiten (…_ms) zählen kleiner = besser.
 */
export const MODE_HEADLINE_STATS: Readonly<Record<string, string>> = {
  // Kein Spielmodus, aber mit Statistik: das Jump and Run der Lobby.
  lobby: 'jump_best',
  versteckerl: 'points',
  wintersport: 'gold',
  adlerflug: 'finishes',
  angelkoenig: 'heaviest_g',
  maibaumklau: 'captures',
  dorfkrimi: 'wins',
  baumeister: 'wins',
  sommerspiele: 'gold',
};

export interface NetworkStatus {
  readonly online: boolean;
  readonly players: number;
  readonly maxPlayers: number;
  readonly javaAddress: string;
  readonly bedrockAddress: string;
  readonly bedrockPort: number;
  readonly modes: readonly ModeStatus[];
  /**
   * Welcher Sport-Modus gerade dran ist (am Sport-Stand der Lobby, im Kompass, auf der Webseite) – der andere ist so
   * lange durch ihn ersetzt (`modesNow`). Dieselbe Entscheidung wie im Hub (`sportStand`).
   */
  readonly sport: SportMode;
  readonly updatedAt: string;
}
