import { networkCommand } from '@moinmorni/shared';
import crypto from 'node:crypto';
import type { Command, Actor } from './commands.js';
import type { HubContext } from './context.js';
import { hasRight } from './context.js';
import { mm, text } from './texts.js';
import type { Body, Connection } from './transport.js';

/**
 * Sprachchat über alle Server (Simple Voice Chat + Brücke): Jeder Spielserver hat dieselben Kanäle (Dorfplatz …)
 * mit derselben ID. Was jemand in so einem Kanal sagt, schickt das Plugin als Binär-Rahmen hierher; der Hub prüft
 * (spricht der wirklich von dort? stumm?) und reicht es an die anderen Server weiter, die es ihren Leuten im selben
 * Kanal abspielen. Partys bekommen eine eigene Gruppe über alle Server.
 *
 * Audio-Rahmen: [1 Byte Art = 1][16 Byte Gruppe][16 Byte Sprecher][Opus …].
 */

export const AUDIO = 1;
const UUID_BYTES = 16;
const HEADER = 1 + UUID_BYTES * 2;
// UUID als Text: 8-4-4-4-12 Hex-Zeichen.
// https://regex101.com/?flavor=javascript&regex=-&flags=g&testString=0f6b8a2e-1c4d-4e5f-9a7b-1c2d3e4f5a61
const DASH = /-/g;

const bytesOf = (uuid: string): Buffer => Buffer.from(uuid.replace(DASH, ''), 'hex');
const uuidOf = (b: Buffer): string => {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** Gleiche ID auf jedem Server: aus dem Namen gerechnet (wie Javas UUID.nameUUIDFromBytes, Version 3). */
export function groupId(name: string): string {
  const md5 = crypto.createHash('md5').update(`moinmorni-voice:${name.toLowerCase()}`).digest();
  md5[6] = ((md5[6] ?? 0) & 0x0f) | 0x30;
  md5[8] = ((md5[8] ?? 0) & 0x3f) | 0x80;
  return uuidOf(md5);
}

export function audioFrame(group: string, speaker: string, opus: Buffer): Buffer {
  return Buffer.concat([Buffer.from([AUDIO]), bytesOf(group), bytesOf(speaker), opus]);
}

export interface PartyVoice {
  readonly id: string;
  readonly name: string;
  readonly members: readonly string[];
}

/** Eigene Gruppe über alle Server (`/voice gruppe <name> [passwort]`). */
interface OwnGroup {
  readonly id: string;
  readonly name: string;
  readonly password: string | null;
  readonly owner: string;
  /** Seit wann niemand mehr drin ist (ms), null = gerade jemand drin. */
  emptySince: number | null;
}

/** Leere eigene Gruppen verschwinden nach fünf Minuten. */
const OWN_EMPTY_MS = 5 * 60_000;
const SWEEP_MS = 60_000;
// Name einer eigenen Gruppe: 3–16 Buchstaben, Ziffern, _ oder -, z. B. "Bergsteiger_2".
// https://regex101.com/?flavor=javascript&flags=u&regex=%5E%5B%5Cp%7BL%7D%5Cp%7BN%7D_-%5D%7B3%2C16%7D%24&testString=Bergsteiger_2
const OWN_NAME = /^[\p{L}\p{N}_-]{3,16}$/u;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 32;
const DISTANCE_DEFAULT = 32;

export interface Voice {
  /** Was ein Spielserver über den Sprachchat wissen muss. */
  readonly config: () => Body;
  /** Einstellungen, Stumm-Liste oder Partys geändert → allen Spielservern schicken. */
  readonly broadcast: () => void;
  readonly onAudio: (from: Connection, payload: Buffer) => void;
  /** Spielserver meldet, in welcher Gruppe jemand ist. */
  readonly onGroup: (uuid: string, group: string | null) => void;
  readonly commands: Command[];
  readonly stop: () => void;
}

export function createVoice(
  ctx: HubContext,
  backends: () => Connection[],
  backend: (server: string) => Connection | undefined,
  parties: () => PartyVoice[],
  now: () => number = Date.now,
): Voice {
  const voice = (): Record<string, unknown> => ctx.stores.settings('voice');
  const channels = (): Array<{ id: string; name: string }> =>
    ((voice()['channels'] as string[] | undefined) ?? []).map((name) => ({ id: groupId(name), name }));
  const groups = new Map<string, string>();
  const own = new Map<string, OwnGroup>();
  // Stumm im Sprachchat (/voicemute, Panel): verhängt und aufgehoben über die Moderation (hub/moderation.ts).
  const muted = (): Set<string> => new Set(ctx.punish.activeOf('voice'));
  /** Was die Spielserver zuletzt als Stumm-Liste bekommen haben – läuft eine Strafe ab, ziehen sie nach. */
  const sent = { muted: '' };
  const mutedKey = (): string => [...muted()].sort().join(',');
  const ownAllowed = (): boolean => voice()['ownGroups'] === true;
  const distance = (): number => Number(voice()['distance'] ?? DISTANCE_DEFAULT) || DISTANCE_DEFAULT;
  /** Brücken-Gruppe: Kanal, Party oder eigene Gruppe – das hört man auf allen Servern. */
  const isBridged = (group: string): boolean =>
    channels().some((c) => c.id === group) || parties().some((p) => p.id === group) || own.has(group);
  const ownByName = (name: string): OwnGroup | undefined =>
    [...own.values()].find((g) => g.name.toLowerCase() === name.toLowerCase());
  const members = (group: string): number => [...groups.values()].filter((g) => g === group).length;

  const config = (): Body => ({
    t: 'voice',
    channels: channels(),
    muted: [...muted()],
    parties: voice()['partyVoice'] === true ? parties() : [],
    // Passwörter bleiben im Hub: Spielserver erfahren nur, ob eine Gruppe abgeschlossen ist (beitreten per /voice).
    own: ownAllowed()
      ? [...own.values()].map((g) => ({ id: g.id, name: g.name, locked: g.password !== null }))
      : [],
    ownGroups: ownAllowed(),
    distance: distance(),
  });
  const broadcast = (): void => {
    const body = config();
    sent.muted = mutedKey();
    backends().forEach((c) => c.send(body));
  };

  /**
   * Leere eigene Gruppen nach fünf Minuten weg; alle weg, wenn eigene Gruppen im Panel aus sind. Ist eine Stummschaltung
   * abgelaufen, bekommen die Spielserver die neue Liste (sie halten Stumme selbst zurück).
   */
  const sweep = (): void => {
    const t = now();
    const gone = [...own.values()].filter((g) => {
      if (members(g.id) > 0) g.emptySince = null;
      else g.emptySince ??= t;
      return !ownAllowed() || (g.emptySince !== null && t - g.emptySince >= OWN_EMPTY_MS);
    });
    gone.forEach((g) => own.delete(g.id));
    if (gone.length > 0 || mutedKey() !== sent.muted) broadcast();
  };
  const sweepTimer = setInterval(sweep, SWEEP_MS);
  sweepTimer.unref();

  const say = (actor: Actor, line: string): void => ctx.msg(actor.uuid, line);
  const sendTo = (uuid: string, body: Body): boolean => {
    const server = ctx.presence.get(uuid)?.server;
    const conn = server ? backend(server) : undefined;
    conn?.send(body);
    return Boolean(conn);
  };
  /** /voice gruppe <name> [passwort] | /voice gruppe weg [name] */
  const ownGroup = (actor: Actor, args: readonly string[]): void => {
    const first = args[0] ?? '';
    if (['weg', 'remove', 'löschen', 'loeschen'].includes(first.toLowerCase())) {
      const team = hasRight(actor.role, 'voice-mute');
      const g = args[1] ? ownByName(args[1]) : [...own.values()].find((x) => x.owner === actor.uuid);
      if (!g || (g.owner !== actor.uuid && !team)) {
        say(actor, text(actor.lang, 'voice.own_none'));
        return;
      }
      own.delete(g.id);
      broadcast();
      say(actor, text(actor.lang, 'voice.own_removed', { name: mm(g.name) }));
      return;
    }
    if (!ownAllowed()) {
      say(actor, text(actor.lang, 'voice.own_off'));
      return;
    }
    const password = args[1] ?? null;
    if (!OWN_NAME.test(first)) {
      say(actor, text(actor.lang, 'voice.own_usage'));
      return;
    }
    if (password !== null && (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)) {
      say(actor, text(actor.lang, 'voice.own_password_rule'));
      return;
    }
    const taken = ownByName(first) || channels().some((c) => c.name.toLowerCase() === first.toLowerCase());
    if (taken) {
      say(actor, text(actor.lang, 'voice.own_taken', { name: mm(first) }));
      return;
    }
    const before = [...own.values()].find((x) => x.owner === actor.uuid);
    if (before) own.delete(before.id);
    const g: OwnGroup = {
      id: groupId(`own:${first}`),
      name: first,
      password,
      owner: actor.uuid,
      emptySince: now(),
    };
    own.set(g.id, g);
    broadcast();
    sendTo(actor.uuid, { t: 'voice-join', uuid: actor.uuid, group: g.id, force: true });
    say(
      actor,
      text(actor.lang, password ? 'voice.own_made_locked' : 'voice.own_made', {
        name: mm(g.name),
        password: mm(password ?? ''),
      }),
    );
  };

  const commands: Command[] = [
    {
      ...networkCommand('voice'),
      run: (actor, args) => {
        const word = args[0]?.toLowerCase() ?? '';
        const list = channels();
        if (!word) {
          const counts = [...groups.values()].reduce<Record<string, number>>((acc, g) => {
            acc[g] = (acc[g] ?? 0) + 1;
            return acc;
          }, {});
          const names = list
            .map((c) => text(actor.lang, 'voice.channel', { name: mm(c.name), count: counts[c.id] ?? 0 }))
            .join('<dark_gray>, </dark_gray>');
          say(actor, text(actor.lang, 'voice.list', { channels: names }));
          const mine = [...own.values()].map((g) =>
            text(actor.lang, g.password ? 'voice.own_locked' : 'voice.channel', {
              name: mm(g.name),
              count: counts[g.id] ?? 0,
            }),
          );
          if (mine.length > 0)
            say(
              actor,
              text(actor.lang, 'voice.own_list', { groups: mine.join('<dark_gray>, </dark_gray>') }),
            );
          return;
        }
        if (['gruppe', 'group'].includes(word)) {
          ownGroup(actor, args.slice(1));
          return;
        }
        if (['raus', 'leave', 'verlassen'].includes(word)) {
          sendTo(actor.uuid, { t: 'voice-join', uuid: actor.uuid, group: null });
          say(actor, text(actor.lang, 'voice.left'));
          return;
        }
        if (['zu', 'join', 'folgen'].includes(word)) {
          const right = voice()['teamJoinAny'] === true && hasRight(actor.role, 'voice-join-any');
          if (!right) {
            say(actor, text(actor.lang, 'cmd.no_right'));
            return;
          }
          const t = ctx.presence.byName(args[1] ?? '');
          const g = t ? groups.get(t.uuid) : undefined;
          if (!t || !g) {
            say(actor, text(actor.lang, t ? 'voice.no_group' : 'cmd.offline', { name: mm(args[1] ?? '') }));
            return;
          }
          const bridged = isBridged(g);
          const here = ctx.presence.get(actor.uuid)?.server === t.server;
          if (!bridged && !here) {
            say(actor, text(actor.lang, 'voice.other_server', { name: mm(t.name) }));
            return;
          }
          // Team darf ohne Passwort hinein.
          sendTo(actor.uuid, { t: 'voice-join', uuid: actor.uuid, group: g, force: true });
          say(actor, text(actor.lang, 'voice.followed', { name: mm(t.name) }));
          return;
        }
        const channel = list.find((c) => c.name.toLowerCase() === args.join(' ').toLowerCase());
        const group = channel ? undefined : ownByName(args[0] ?? '');
        if (group) {
          const team = voice()['teamJoinAny'] === true && hasRight(actor.role, 'voice-join-any');
          if (group.password && group.password !== args[1] && !team) {
            say(actor, text(actor.lang, 'voice.own_password', { name: mm(group.name) }));
            return;
          }
          sendTo(actor.uuid, { t: 'voice-join', uuid: actor.uuid, group: group.id, force: true });
          say(actor, text(actor.lang, 'voice.joined', { name: mm(group.name) }));
          return;
        }
        if (!channel) {
          say(actor, text(actor.lang, 'voice.unknown', { name: mm(args.join(' ')) }));
          return;
        }
        sendTo(actor.uuid, { t: 'voice-join', uuid: actor.uuid, group: channel.id });
        say(actor, text(actor.lang, 'voice.joined', { name: mm(channel.name) }));
      },
      complete: (actor, args) => {
        const typed = (args[0] ?? '').toLowerCase();
        const words = [
          'raus',
          ...(ownAllowed() ? ['gruppe'] : []),
          ...(hasRight(actor.role, 'voice-join-any') ? ['zu'] : []),
        ];
        if (args.length <= 1)
          return [...channels().map((c) => c.name), ...[...own.values()].map((g) => g.name), ...words].filter(
            (w) => w.toLowerCase().startsWith(typed),
          );
        return ctx.presence
          .all()
          .map((p) => p.name)
          .filter((n) => n.toLowerCase().startsWith((args[1] ?? '').toLowerCase()));
      },
    },
  ];

  return {
    config,
    broadcast,
    onGroup: (uuid, group) => {
      if (group) groups.set(uuid, group);
      else groups.delete(uuid);
      sweep();
    },
    onAudio: (from, payload) => {
      if (payload.length <= HEADER || payload[0] !== AUDIO) return;
      const group = uuidOf(payload.subarray(1, 1 + UUID_BYTES));
      const speaker = uuidOf(payload.subarray(1 + UUID_BYTES, HEADER));
      // Nur wer wirklich auf diesem Server ist und nicht stumm – kein Server spricht für einen anderen.
      if (ctx.presence.get(speaker)?.server !== from.server || muted().has(speaker)) return;
      if (!isBridged(group)) return;
      // Nur dorthin, wo gerade jemand aus der Gruppe ist – andere Server hören nichts mit.
      const listening = new Set(
        [...groups].filter(([, g]) => g === group).map(([uuid]) => ctx.presence.get(uuid)?.server),
      );
      backends()
        .filter((c) => c.server !== from.server && listening.has(c.server))
        .forEach((c) => c.sendBinary(payload));
    },
    commands,
    stop: () => clearInterval(sweepTimer),
  };
}
