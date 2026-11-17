import { networkCommand } from '@moinmorni/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { modePlayers } from '../db/schema.js';
import type { Command, Actor } from './commands.js';
import type { HubContext } from './context.js';
import { normalUuid } from './players.js';
import { mm, type Lang } from './texts.js';
import type { Body, Connection } from './transport.js';

/**
 * Lobbymusik je Spieler: `/musik an|aus|leiser|lauter|<0–100>|weiter`. Der Wunsch bleibt gespeichert (Tabelle
 * `mode_players` unter `_musik` – keine eigene Tabelle nötig) und geht mit dem Profil an den Spielserver; das
 * Lobby-Plugin richtet sich danach. Ob jemand das Lobby-Paket geladen hat (dann spielt die Kapelle, sonst
 * Notenblöcke), meldet der Proxy mit `pack` – der Spielserver selbst erfährt es nicht, weil Minecraft das Paket schon
 * vor dem Betreten lädt.
 */

const AREA = '_musik';
const LOBBY = 'lobby';
const FULL = 100;
const QUIETEST = 15;
const QUIET = 30;
const HALF = 50;
const THREE_QUARTERS = 75;
/** Stufen für leiser/lauter in Prozent. */
const STEPS = [QUIETEST, QUIET, HALF, THREE_QUARTERS, FULL] as const;
const UUID_MAX = 40;

export interface MusicPref {
  readonly on: boolean;
  /** Eigene Lautstärke 0–100 % (zusätzlich zur Lautstärke im Panel). */
  readonly volume: number;
}

/** Was das Lobby-Plugin im Profil bekommt. */
export interface MusicProfile extends MusicPref {
  /** Lobby-Paket geladen → die Klangdateien der Kapelle; sonst Notenblöcke. */
  readonly pack: boolean;
  /** Zählt bei jedem `/musik weiter` hoch – das Plugin springt dann zum nächsten Stück. */
  readonly skip: number;
}

const DEFAULT_PREF: MusicPref = { on: true, volume: FULL };
const prefSchema = z.object({ on: z.boolean(), volume: z.number().int().min(0).max(FULL) });
const packSchema = z.object({ uuid: z.string().min(1).max(UUID_MAX), loaded: z.boolean() });

const TAG = '<dark_gray>[<gold>♪ Musik</gold>]</dark_gray> ';
const TAG_EN = '<dark_gray>[<gold>♪ Music</gold>]</dark_gray> ';
const TEXTS = {
  status: {
    de: `${TAG}<gray>Lobbymusik: {state}<gray>, Lautstärke <white>{volume} %</white>. <yellow>/musik an</yellow>, <yellow>aus</yellow>, <yellow>leiser</yellow>, <yellow>lauter</yellow>, <yellow>weiter</yellow> oder eine Zahl von 0 bis 100.`,
    en: `${TAG_EN}<gray>Lobby music: {state}<gray>, volume <white>{volume} %</white>. <yellow>/music on</yellow>, <yellow>off</yellow>, <yellow>quieter</yellow>, <yellow>louder</yellow>, <yellow>next</yellow> or a number from 0 to 100.`,
  },
  on: { de: '<green>an</green>', en: '<green>on</green>' },
  off: { de: '<red>aus</red>', en: '<red>off</red>' },
  turnedOn: {
    de: `${TAG}<gray>Die Lobbymusik spielt wieder für dich (<white>{volume} %</white>).`,
    en: `${TAG_EN}<gray>The lobby music plays for you again (<white>{volume} %</white>).`,
  },
  turnedOff: {
    de: `${TAG}<gray>Die Lobbymusik ist für dich aus. Wieder an: <yellow>/musik an</yellow>`,
    en: `${TAG_EN}<gray>The lobby music is off for you. Back on: <yellow>/music on</yellow>`,
  },
  volume: {
    de: `${TAG}<gray>Lautstärke der Lobbymusik: <white>{volume} %</white>.`,
    en: `${TAG_EN}<gray>Lobby music volume: <white>{volume} %</white>.`,
  },
  skip: {
    de: `${TAG}<gray>Gleich kommt das nächste Stück.`,
    en: `${TAG_EN}<gray>The next piece is coming up.`,
  },
  elsewhere: {
    de: `${TAG}<gray>Gilt in der Lobby – dort spielt die Musik.`,
    en: `${TAG_EN}<gray>This applies in the lobby – that's where the music plays.`,
  },
  usage: {
    de: `${TAG}<red>Das kenne ich nicht: <white>{value}</white>. So geht's: <yellow>/musik an|aus|leiser|lauter|weiter|0–100</yellow>`,
    en: `${TAG_EN}<red>I don't know <white>{value}</white>. Usage: <yellow>/music on|off|quieter|louder|next|0–100</yellow>`,
  },
} as const satisfies Record<string, Record<Lang, string>>;

const fill = (
  lang: Lang,
  key: keyof typeof TEXTS,
  vars: Readonly<Record<string, string | number>> = {},
): string =>
  Object.entries(vars).reduce<string>(
    (line, [k, v]) => line.replaceAll(`{${k}}`, String(v)),
    TEXTS[key][lang],
  );

const WORDS: Readonly<Record<string, 'on' | 'off' | 'down' | 'up' | 'skip'>> = {
  an: 'on',
  on: 'on',
  ein: 'on',
  aus: 'off',
  off: 'off',
  leiser: 'down',
  quieter: 'down',
  down: 'down',
  lauter: 'up',
  louder: 'up',
  up: 'up',
  weiter: 'skip',
  next: 'skip',
  skip: 'skip',
};
const SUGGEST: Readonly<Record<Lang, readonly string[]>> = {
  de: ['an', 'aus', 'leiser', 'lauter', 'weiter'],
  en: ['on', 'off', 'quieter', 'louder', 'next'],
};

export interface Music {
  readonly commands: readonly Command[];
  readonly profileOf: (uuid: string) => MusicProfile;
  /** Nachricht `pack` vom Proxy. */
  readonly onPack: (conn: Connection, body: Body) => void;
  readonly left: (uuid: string) => void;
}

export function createMusic(ctx: HubContext, db: Db): Music {
  const packs = new Map<string, boolean>();
  const skips = new Map<string, number>();

  const prefOf = (uuid: string): MusicPref => {
    const row = db
      .select()
      .from(modePlayers)
      .where(and(eq(modePlayers.mode, AREA), eq(modePlayers.uuid, normalUuid(uuid))))
      .get();
    const parsed = prefSchema.safeParse(row?.data);
    return parsed.success ? parsed.data : DEFAULT_PREF;
  };
  const save = (uuid: string, pref: MusicPref): void => {
    const data = { on: pref.on, volume: pref.volume };
    const updatedAt = new Date().toISOString();
    db.insert(modePlayers)
      .values({ mode: AREA, uuid: normalUuid(uuid), data, updatedAt })
      .onConflictDoUpdate({ target: [modePlayers.mode, modePlayers.uuid], set: { data, updatedAt } })
      .run();
  };
  const say = (actor: Actor, line: string): void => ctx.msg(actor.uuid, line);

  const run = (actor: Actor, args: readonly string[]): void => {
    const now = prefOf(actor.uuid);
    const word = (args[0] ?? '').toLowerCase();
    if (!word) {
      say(
        actor,
        fill(actor.lang, 'status', { state: fill(actor.lang, now.on ? 'on' : 'off'), volume: now.volume }),
      );
      return;
    }
    const action = WORDS[word];
    // Lautstärke als Zahl: passt auf "60" und "0", nicht auf "60%" oder "-5".
    // https://regex101.com/?flavor=javascript&regex=%5E%5Cd%7B1%2C3%7D%24&testString=60
    const number = /^\d{1,3}$/.test(word) ? Number(word) : NaN;
    if (!action && !(number >= 0 && number <= FULL)) {
      say(actor, fill(actor.lang, 'usage', { value: mm(word) }));
      return;
    }
    if (action === 'skip') {
      skips.set(normalUuid(actor.uuid), (skips.get(normalUuid(actor.uuid)) ?? 0) + 1);
      ctx.refreshProfile(actor.uuid);
      say(actor, fill(actor.lang, 'skip'));
      return;
    }
    const lower = [...STEPS].reverse().find((v) => v < now.volume) ?? QUIETEST;
    const higher = STEPS.find((v) => v > now.volume) ?? FULL;
    const changes: Readonly<Record<'on' | 'off' | 'down' | 'up', MusicPref>> = {
      on: { on: true, volume: now.volume || FULL },
      off: { on: false, volume: now.volume },
      down: { on: true, volume: lower },
      up: { on: true, volume: higher },
    };
    const next: MusicPref = action ? changes[action] : { on: number > 0, volume: number };
    save(actor.uuid, next);
    ctx.refreshProfile(actor.uuid);
    const turnedOn = action === 'on' ? 'turnedOn' : 'volume';
    say(actor, fill(actor.lang, next.on ? turnedOn : 'turnedOff', { volume: next.volume }));
    if (ctx.presence.get(actor.uuid)?.server !== LOBBY) say(actor, fill(actor.lang, 'elsewhere'));
  };

  return {
    commands: [
      {
        ...networkCommand('musik'),
        run,
        complete: (actor, args) =>
          args.length <= 1
            ? SUGGEST[actor.lang].filter((w) => w.startsWith((args[0] ?? '').toLowerCase()))
            : [],
      },
    ],
    profileOf: (uuid) => ({
      ...prefOf(uuid),
      pack: packs.get(normalUuid(uuid)) ?? false,
      skip: skips.get(normalUuid(uuid)) ?? 0,
    }),
    onPack: (_conn, body) => {
      const m = packSchema.parse(body);
      const id = normalUuid(m.uuid);
      if (packs.get(id) === m.loaded) return;
      packs.set(id, m.loaded);
      ctx.refreshProfile(id);
    },
    left: (uuid) => {
      packs.delete(normalUuid(uuid));
      skips.delete(normalUuid(uuid));
    },
  };
}
