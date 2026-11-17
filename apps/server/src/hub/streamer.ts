import { and, eq } from 'drizzle-orm';
import {
  networkCommand,
  STREAMER_OFF,
  STREAMER_PARTS,
  mayStream,
  streamerAccess,
  streamerActive,
  streamerHosts,
  streamerPartsAllowed,
  type StreamerPart,
  type StreamerState,
} from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import { settingValues } from '../db/schema.js';
import type { Stores } from '../panel/stores.js';
import type { Command } from './commands.js';
import type { HubContext } from './context.js';
import { normalUuid, type PlayerService } from './players.js';
import { mm, type Lang } from './texts.js';
import type { Body } from './transport.js';

/**
 * Streamer-Modus im ganzen Netzwerk (/streamer, docs/hub-protokoll.md): Der Hub merkt sich je Spieler, ob er streamt und
 * welche Teile er für sich abgeschaltet hat (in `setting_values` unter einem Bereich, den es im Katalog nicht gibt –
 * keine eigene Tabelle). Was gilt, geht im Profil an den Server, auf dem er gerade ist (`streamer: {on, parts}`); das
 * Netzwerk-Plugin verdeckt danach für ihn, hängt den anderen „● LIVE“ an seinen Namen und reicht den Zustand an Modi
 * wie MorniCraft weiter (Metadaten `moinmorni:streamer`). Private Nachrichten deckt der Hub selbst ab.
 */

const STORE_AREA = '_streamer';
const MINUTE_MS = 60_000;
const ANNOUNCE_GAP_MINUTES = 10;
/** So oft höchstens die Ansage „… streamt jetzt“ je Spieler. */
const ANNOUNCE_GAP_MS = ANNOUNCE_GAP_MINUTES * MINUTE_MS;

const P = '<dark_gray>[<gradient:#3ddc84:#1fa463>MoinMorni</gradient>]</dark_gray> ';
const LIVE = '<red>● LIVE</red>';

const TEXTS = {
  title: { de: 'Streamer-Modus', en: 'Streamer mode' },
  on: { de: 'An', en: 'On' },
  off: { de: 'Aus', en: 'Off' },
  turnOn: { de: 'Einschalten', en: 'Turn on' },
  turnOff: { de: 'Ausschalten', en: 'Turn off' },
  click: { de: 'Klick: umschalten', en: 'Click: switch' },
  'part.ip': { de: 'IPs & Adressen verdecken', en: 'Hide IPs & addresses' },
  'part.ip.hover': {
    de: 'IP-Adressen und die Adressen des Netzwerks werden im Chat und in Nachrichten zu •••',
    en: 'IP addresses and the network addresses turn into ••• in chat and messages',
  },
  'part.coords': { de: 'Koordinaten verstecken', en: 'Hide coordinates' },
  'part.coords.hover': {
    de: 'Wo ein Modus Koordinaten zeigt (z. B. MorniCraft), siehst du sie nur mit der Maus',
    en: 'Where a mode shows coordinates (e.g. MorniCraft), you only see them with the mouse',
  },
  'part.msg': { de: 'Private Nachrichten verdecken', en: 'Cover private messages' },
  'part.msg.hover': {
    de: '/msg und /r (in MorniCraft auch die Post) sind nur mit der Maus lesbar',
    en: '/msg and /r (and mail in MorniCraft) can only be read with the mouse',
  },
  'part.live': { de: '● LIVE für die anderen', en: '● LIVE for the others' },
  'part.live.hover': {
    de: 'Die anderen sehen ● LIVE an deinem Namen: im Chat, in der Tab-Liste und über dem Kopf',
    en: 'The others see ● LIVE at your name: in chat, in the tab list and above your head',
  },
  tip: {
    de: 'Tipp: Die F3-Koordinaten blendest du selbst aus – Optionen → Chat → <yellow>Reduzierte Debug-Infos</yellow>',
    en: 'Tip: hide the F3 coordinates yourself – Options → Chat → <yellow>Reduced Debug Info</yellow>',
  },
  everywhere: {
    de: 'Gilt auf jedem Server des Netzwerks – auch nach einem Wechsel.',
    en: 'Works on every server of the network – also after switching.',
  },
  'now.on': {
    de: `${P}<green>Streamer-Modus ist an – viel Spaß beim Streamen!</green>`,
    en: `${P}<green>Streamer mode is on – have fun streaming!</green>`,
  },
  'now.off': { de: `${P}<gray>Streamer-Modus ist aus.`, en: `${P}<gray>Streamer mode is off.` },
  disabled: {
    de: `${P}<red>Den Streamer-Modus gibt es im Netzwerk gerade nicht.`,
    en: `${P}<red>Streamer mode is switched off in the network right now.`,
  },
  'no-right': {
    de: `${P}<red>Den Streamer-Modus darf dein Rang nicht.</red> <gray>Er braucht das Recht „Streamer-Modus“ (z. B. Media).`,
    en: `${P}<red>Your rank can't use streamer mode.</red> <gray>It needs the right “Streamer mode” (e.g. Media).`,
  },
  'part.unavailable': {
    de: `${P}<gray>Diesen Teil des Streamer-Modus gibt es im Netzwerk gerade nicht.`,
    en: `${P}<gray>This part of streamer mode is switched off in the network right now.`,
  },
  usage: {
    de: `${P}<gray>So geht's: <yellow>/streamer [an|aus|ip|koordinaten|nachrichten|live]`,
    en: `${P}<gray>Usage: <yellow>/streamer [on|off|ip|coords|messages|live]`,
  },
  broadcast: {
    de: `${LIVE} <white>{name}</white> <gray>streamt jetzt – alles hier kann im Stream landen.`,
    en: `${LIVE} <white>{name}</white> <gray>is streaming now – anything here may end up on stream.`,
  },
  hidden: { de: 'versteckt – Maus drauf zum Lesen', en: 'hidden – hover to read' },
} as const satisfies Record<string, Record<Lang, string>>;
type Key = keyof typeof TEXTS;

const say = (lang: Lang, key: Key, vars: Readonly<Record<string, string>> = {}): string =>
  Object.entries(vars).reduce<string>((acc, [k, v]) => acc.replaceAll(`{${k}}`, v), TEXTS[key][lang]);

// Wert in einem Argument mit Anführungszeichen ("…") eines MiniMessage-Tags: \ und " davor mit \ entschärfen.
// https://regex101.com/?flavor=javascript&regex=%5B%5C%5C%22%5D&flags=g&testString=a%5Cb%20%22x%22
const QUOTED_SPECIAL = /[\\"]/g;
/** MiniMessage-Text als Argument in "…" (z. B. für <hover:show_text:"…">). */
const quoted = (miniMessage: string): string => miniMessage.replace(QUOTED_SPECIAL, '\\$&');

/** Text eines Spielers, nur mit der Maus lesbar („versteckt – Maus drauf zum Lesen“). */
export function coveredText(lang: Lang, raw: string): string {
  return `<hover:show_text:"<white>${quoted(mm(raw))}</white>"><italic>${say(lang, 'hidden')}</italic></hover>`;
}

/** Wörter nach /streamer → Teil (Deutsch und Englisch, wie in MorniCraft). */
const WORDS: Readonly<Record<string, StreamerPart>> = {
  ip: 'ip',
  ips: 'ip',
  adressen: 'ip',
  addresses: 'ip',
  koordinaten: 'coords',
  coords: 'coords',
  coordinates: 'coords',
  nachrichten: 'msg',
  msg: 'msg',
  messages: 'msg',
  live: 'live',
};
const ON = new Set(['an', 'on', 'ein']);
const OFF = new Set(['aus', 'off']);
const PART_WORD: Readonly<Record<StreamerPart, string>> = {
  ip: 'ip',
  coords: 'koordinaten',
  msg: 'nachrichten',
  live: 'live',
};

const isPart = (v: unknown): v is StreamerPart => STREAMER_PARTS.some((p) => p === v);

export interface StreamerView {
  readonly on: boolean;
  readonly parts: readonly StreamerPart[];
}

export interface Streamers {
  /** Was der Spieler gespeichert hat. */
  readonly state: (uuid: string) => StreamerState;
  readonly save: (uuid: string, state: StreamerState) => void;
  /** Was gerade gilt (Panel-Einstellung und Rang schon eingerechnet). */
  readonly active: (uuid: string) => StreamerView;
  /** Teile, die gerade für den Spieler gelten (leer = aus). */
  readonly parts: (uuid: string) => readonly StreamerPart[];
  /** Für Proxy und Spielserver: welche Adressen verdeckt werden. */
  readonly config: () => Body;
}

export function createStreamers(db: Db, stores: Stores, players: PlayerService, domain: string): Streamers {
  const cache = new Map<string, StreamerState>();
  const state = (uuid: string): StreamerState => {
    const id = normalUuid(uuid);
    const known = cache.get(id);
    if (known) return known;
    const row = db
      .select()
      .from(settingValues)
      .where(and(eq(settingValues.area, STORE_AREA), eq(settingValues.key, id)))
      .get();
    const value = row?.value as { on?: unknown; off?: unknown } | undefined;
    const loaded: StreamerState = value
      ? { on: value.on === true, off: Array.isArray(value.off) ? value.off.filter(isPart) : [] }
      : STREAMER_OFF;
    cache.set(id, loaded);
    return loaded;
  };
  const save = (uuid: string, next: StreamerState): void => {
    const id = normalUuid(uuid);
    const value = { on: next.on, off: [...next.off] };
    const updatedAt = new Date().toISOString();
    db.insert(settingValues)
      .values({ area: STORE_AREA, key: id, value, updatedAt })
      .onConflictDoUpdate({ target: [settingValues.area, settingValues.key], set: { value, updatedAt } })
      .run();
    cache.set(id, value);
  };
  const active = (uuid: string): StreamerView =>
    streamerActive(stores.settings('network'), players.roleOf(uuid), state(uuid));
  return {
    state,
    save,
    active,
    parts: (uuid) => active(uuid).parts,
    config: () => ({ t: 'streamer-config', hosts: streamerHosts(stores.settings('network'), domain) }),
  };
}

export interface StreamerCommandOptions {
  readonly now: () => number;
  /** Zustand hat sich geändert: Profil an den Server des Spielers (Metadaten, LIVE, Verdecken). */
  readonly changed: (uuid: string) => void;
}

/** /streamer [an|aus|ip|koordinaten|nachrichten|live] – ohne Wort das Menü mit Schaltern zum Anklicken. */
export function createStreamerCommand(
  ctx: HubContext,
  streamers: Streamers,
  options: StreamerCommandOptions,
): Command {
  const announced = new Map<string, number>();
  const network = (): Readonly<Record<string, unknown>> => ctx.stores.settings('network');

  const menu = (uuid: string, lang: Lang): void => {
    const net = network();
    const own = streamers.state(uuid);
    const on = streamers.active(uuid).on;
    const button = (label: string, colour: string, command: string): string =>
      `<click:run_command:"${command}"><hover:show_text:"${say(lang, 'click')}"><dark_gray>[</dark_gray><${colour}>${label}</${colour}><dark_gray>]</dark_gray></hover></click>`;
    const state = on
      ? `<red>●</red> <gray>${say(lang, 'title')}:</gray> <white>${say(lang, 'on')}</white>`
      : `<gray>○ ${say(lang, 'title')}:</gray> <white>${say(lang, 'off')}</white>`;
    const toggle = on
      ? button(say(lang, 'turnOff'), 'red', '/streamer aus')
      : button(say(lang, 'turnOn'), 'green', '/streamer an');
    ctx.msg(uuid, `${P}${state}  ${toggle}`);
    streamerPartsAllowed(net).forEach((part) => {
      const wanted = !own.off.includes(part);
      const mark = wanted ? '<green>✔</green>' : '<dark_gray>✖</dark_gray>';
      const label = wanted
        ? `<white>${say(lang, `part.${part}`)}</white>`
        : `<gray>${say(lang, `part.${part}`)}</gray>`;
      const hover = `${say(lang, `part.${part}.hover`)}<newline><gray>${say(lang, 'click')}`;
      ctx.msg(
        uuid,
        `  <click:run_command:"/streamer ${PART_WORD[part]}"><hover:show_text:"${hover}">${mark} ${label}</hover></click>`,
      );
    });
    ctx.msg(uuid, `  <gray>ℹ ${say(lang, 'tip')}`);
    ctx.msg(uuid, `  <dark_gray>${say(lang, 'everywhere')}`);
  };

  /** „<name> streamt jetzt“ für alle auf demselben Server – nur mit ● LIVE, höchstens alle 10 Minuten. */
  const announce = (uuid: string): void => {
    const me = ctx.presence.get(uuid);
    if (!me?.server || network()['streamerAnnounce'] === false) return;
    if (!streamers.parts(uuid).includes('live')) return;
    const last = announced.get(me.uuid) ?? 0;
    if (options.now() - last < ANNOUNCE_GAP_MS) return;
    announced.set(me.uuid, options.now());
    ctx.presence
      .on(me.server)
      .filter((p) => p.uuid !== me.uuid)
      .forEach((p) => ctx.msg(p.uuid, say(p.lang, 'broadcast', { name: mm(me.name) })));
  };

  return {
    ...networkCommand('streamer'),
    run: (actor, args) => {
      const net = network();
      const word = args[0]?.toLowerCase() ?? '';
      const own = streamers.state(actor.uuid);
      // Ausschalten geht immer – auch wer das Recht verloren hat, räumt so seinen Zustand auf.
      if (OFF.has(word)) {
        if (own.on) {
          streamers.save(actor.uuid, { ...own, on: false });
          options.changed(actor.uuid);
        }
        ctx.msg(actor.uuid, say(actor.lang, 'now.off'));
        return;
      }
      if (streamerAccess(net) === 'off') {
        ctx.msg(actor.uuid, say(actor.lang, 'disabled'));
        return;
      }
      if (!mayStream(net, actor.role)) {
        ctx.msg(actor.uuid, say(actor.lang, 'no-right'));
        return;
      }
      if (ON.has(word)) {
        if (!own.on) {
          streamers.save(actor.uuid, { ...own, on: true });
          options.changed(actor.uuid);
          ctx.msg(actor.uuid, say(actor.lang, 'now.on'));
          announce(actor.uuid);
        }
        menu(actor.uuid, actor.lang);
        return;
      }
      const part = Object.hasOwn(WORDS, word) ? WORDS[word] : undefined;
      if (part) {
        if (!streamerPartsAllowed(net).includes(part)) {
          ctx.msg(actor.uuid, say(actor.lang, 'part.unavailable'));
          return;
        }
        const off = own.off.includes(part) ? own.off.filter((p) => p !== part) : [...own.off, part];
        streamers.save(actor.uuid, { ...own, off });
        options.changed(actor.uuid);
        if (own.on && part === 'live' && !off.includes('live')) announce(actor.uuid);
        menu(actor.uuid, actor.lang);
        return;
      }
      if (word && word !== 'menu' && word !== 'menü') {
        ctx.msg(actor.uuid, say(actor.lang, 'usage'));
        return;
      }
      menu(actor.uuid, actor.lang);
    },
    complete: (actor, args) => {
      if (args.length > 1) return [];
      const typed = (args[0] ?? '').toLowerCase();
      const parts = mayStream(network(), actor.role)
        ? streamerPartsAllowed(network()).map((p) => PART_WORD[p])
        : [];
      return ['an', 'aus', ...parts].filter((w) => w.startsWith(typed));
    },
  };
}
