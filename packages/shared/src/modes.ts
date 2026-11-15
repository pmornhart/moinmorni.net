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
  /** Schlafen, wenn niemand drin ist (startet beim Klick auf die Figur wieder). */
  sleepWhenEmpty: z.boolean(),
  /** Server im Netzwerk (Name in Velocity); null = noch keiner (z. B. „bald“). */
  server: z.string().regex(SERVER_NAME).max(NAME_MAX).nullable(),
});
export type Mode = z.infer<typeof modeSchema>;

export const modePatchSchema = modeSchema.omit({ id: true }).partial();
export type ModePatch = z.infer<typeof modePatchSchema>;

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
    sleepWhenEmpty: true,
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
    sleepWhenEmpty: true,
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
    sleepWhenEmpty: true,
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
    sleepWhenEmpty: true,
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
    sleepWhenEmpty: true,
    server: 'bollwerk',
  },
  {
    id: 'mirni',
    name: t('MorniSMP', 'MorniSMP'),
    description: t(
      'Überleben mit freiem Markt: Stadt mit Marktplatz, Auktionshaus, Aufträgen, eigenen Läden und Zufalls-Teleport.',
      'Survival with a free market: town with market square, auction house, orders, your own shops and random teleport.',
    ),
    state: 'soon',
    access: 'everyone',
    position: 6,
    maxPlayers: 60,
    sleepWhenEmpty: true,
    server: 'smp',
  },
];

/**
 * Repos der Spielmodi: Dort baut GitHub bei jedem Stand auf `main` ein Release mit der Jar, MoinMorni spielt sie auf
 * den Server des Modus (und hält sie aktuell).
 */
export const MODE_REPOS: Readonly<Record<string, string>> = {
  duels: 'pmornhart/MoinMorni-Duels',
  party: 'pmornhart/Morni-Party',
  gipfelsturm: 'pmornhart/Morni-Gipfelsturm',
  burgverlies: 'pmornhart/Morni-Burgverlies',
  bollwerk: 'pmornhart/Morni-Bollwek',
  mirni: 'pmornhart/Morni-SMP',
};

/** Arbeitsspeicher der Modus-Server in MB, wo der Standard (3 GB) nicht reicht – MorniSMP hat eine große Welt. */
export const MODE_MEMORY_MB: Readonly<Record<string, number>> = { mirni: 8192 };

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
}

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
