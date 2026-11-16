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
      '1 gegen 1 und 2 gegen 2: Klassisch mit Suppe, Modern oder mit Fähigkeiten. Gewertet oder locker.',
      '1v1 and 2v2: classic with soup, modern or with abilities. Ranked or casual.',
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
};

/**
 * Arbeitsspeicher der Modus-Server in MB, wo der Standard (1,5 GB) nicht reicht: MorniSMP und MorniCraft haben große
 * Welten, Morni Party baut große Spielbretter. So laufen alle Server zugleich in einem Container mit 32 GB:
 * Proxy 1 + Lobby 3 + Bau 1,5 + MorniSMP 3 + MorniCraft 3 + Party 2 + neun Modi je 1,5 = 27 GB, dazu Luft für Java
 * selbst. Im Panel je Server änderbar.
 */
export const MODE_MEMORY_MB: Readonly<Record<string, number>> = {
  mirni: 3072,
  mornicraft: 3072,
  party: 2048,
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
   * Was der Modus selbst zuletzt gemeldet hat („waiting“, „running“, „open“ …); `closed` = er hat gerade Pause
   * (Wintersport außerhalb der Saison – das Dorf ist trotzdem offen). null = noch nichts gemeldet.
   */
  readonly phase: string | null;
}

/** Zustand, den ein Modus meldet, wenn er gerade Pause hat (Wintersport im Sommer). */
export const MODE_PHASE_PAUSE = 'closed';

/**
 * Wichtigster Wert eines Modus für die Bestenliste (Top 3 auf der Modus-Seite), wenn es nicht „Siege“ o. Ä. sein soll.
 * Zeiten (…_ms) zählen kleiner = besser.
 */
export const MODE_HEADLINE_STATS: Readonly<Record<string, string>> = {
  versteckerl: 'points',
  wintersport: 'gold',
  adlerflug: 'finishes',
  angelkoenig: 'heaviest_g',
};

export interface NetworkStatus {
  readonly online: boolean;
  readonly players: number;
  readonly maxPlayers: number;
  readonly javaAddress: string;
  readonly bedrockAddress: string;
  readonly bedrockPort: number;
  readonly modes: readonly ModeStatus[];
  readonly updatedAt: string;
}
