import crypto from 'node:crypto';
import type { Command, Actor } from './commands.js';
import type { HubContext } from './context.js';
import { hasRight } from './context.js';
import { parseDuration } from './punish.js';
import { mm, text, type Lang } from './texts.js';
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

export interface Voice {
  /** Was ein Spielserver über den Sprachchat wissen muss. */
  readonly config: () => Body;
  /** Einstellungen, Stumm-Liste oder Partys geändert → allen Spielservern schicken. */
  readonly broadcast: () => void;
  readonly onAudio: (from: Connection, payload: Buffer) => void;
  /** Spielserver meldet, in welcher Gruppe jemand ist. */
  readonly onGroup: (uuid: string, group: string | null) => void;
  readonly commands: Command[];
}

export function createVoice(
  ctx: HubContext,
  backends: () => Connection[],
  backend: (server: string) => Connection | undefined,
  parties: () => PartyVoice[],
): Voice {
  const voice = (): Record<string, unknown> => ctx.stores.settings('voice');
  const channels = (): Array<{ id: string; name: string }> =>
    ((voice()['channels'] as string[] | undefined) ?? []).map((name) => ({ id: groupId(name), name }));
  const groups = new Map<string, string>();
  const muted = (): Set<string> => new Set(ctx.punish.activeOf('voice'));

  const config = (): Body => ({
    t: 'voice',
    channels: channels(),
    muted: [...muted()],
    parties: voice()['partyVoice'] === true ? parties() : [],
  });
  const broadcast = (): void => {
    const body = config();
    backends().forEach((c) => c.send(body));
  };

  const say = (actor: Actor, line: string): void => ctx.msg(actor.uuid, line);
  const sendTo = (uuid: string, body: Body): boolean => {
    const server = ctx.presence.get(uuid)?.server;
    const conn = server ? backend(server) : undefined;
    conn?.send(body);
    return Boolean(conn);
  };
  const until = (lang: Lang, iso: string | null): string =>
    iso
      ? text(lang, 'punish.until', { date: iso.slice(0, 16).replace('T', ' ') })
      : text(lang, 'punish.forever');

  const commands: Command[] = [
    {
      name: 'voice',
      aliases: ['sprachchat', 'vc'],
      usage: { de: '/voice [kanal|raus|zu <spieler>]', en: '/voice [channel|leave|join <player>]' },
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
          const bridged = list.some((c) => c.id === g) || parties().some((p) => p.id === g);
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
        if (!channel) {
          say(actor, text(actor.lang, 'voice.unknown', { name: mm(args.join(' ')) }));
          return;
        }
        sendTo(actor.uuid, { t: 'voice-join', uuid: actor.uuid, group: channel.id });
        say(actor, text(actor.lang, 'voice.joined', { name: mm(channel.name) }));
      },
      complete: (actor, args) => {
        const typed = (args[0] ?? '').toLowerCase();
        const words = ['raus', ...(hasRight(actor.role, 'voice-join-any') ? ['zu'] : [])];
        if (args.length <= 1)
          return [...channels().map((c) => c.name), ...words].filter((w) =>
            w.toLowerCase().startsWith(typed),
          );
        return ctx.presence
          .all()
          .map((p) => p.name)
          .filter((n) => n.toLowerCase().startsWith((args[1] ?? '').toLowerCase()));
      },
    },
    {
      name: 'voicemute',
      aliases: ['sprachstumm'],
      right: 'voice-mute',
      usage: { de: '/voicemute <spieler> [dauer] [grund]', en: '/voicemute <player> [duration] [reason]' },
      run: (actor, args) => {
        const t = ctx.presence.byName(args[0] ?? '') ?? ctx.players.byName(args[0] ?? '');
        if (!t) {
          say(actor, text(actor.lang, 'cmd.unknown_player', { name: mm(args[0] ?? '') }));
          return;
        }
        if (ctx.players.roleOf(t.uuid).position <= actor.role.position) {
          say(actor, text(actor.lang, 'cmd.higher', { name: mm(t.name) }));
          return;
        }
        const minutes = parseDuration(args[1]);
        const reason =
          (minutes === undefined ? args.slice(1) : args.slice(2)).join(' ').trim() ||
          text(actor.lang, 'punish.no_reason');
        const p = ctx.punish.add({
          uuid: t.uuid,
          kind: 'voice',
          reason,
          by: actor.name,
          minutes: minutes ?? null,
        });
        broadcast();
        const target = ctx.presence.get(t.uuid);
        if (target)
          ctx.msg(
            t.uuid,
            text(target.lang, 'voice.muted_you', {
              until: until(target.lang, p.expiresAt),
              reason: mm(reason),
            }),
          );
        ctx.team('voice-mute', (lang) =>
          text(lang, 'team.voicemute', {
            actor: mm(actor.name),
            name: mm(t.name),
            reason: mm(reason),
            until: until(lang, p.expiresAt),
          }),
        );
      },
      complete: (_actor, args) =>
        args.length <= 1
          ? ctx.presence
              .all()
              .map((p) => p.name)
              .filter((n) => n.toLowerCase().startsWith((args[0] ?? '').toLowerCase()))
          : [],
    },
    {
      name: 'voiceunmute',
      aliases: ['sprachfrei'],
      right: 'voice-mute',
      usage: { de: '/voiceunmute <spieler>', en: '/voiceunmute <player>' },
      run: (actor, args) => {
        const t = ctx.presence.byName(args[0] ?? '') ?? ctx.players.byName(args[0] ?? '');
        if (!t || !ctx.punish.revoke(t.uuid, 'voice', actor.name)) {
          say(actor, text(actor.lang, 'voice.not_muted', { name: mm(args[0] ?? '') }));
          return;
        }
        broadcast();
        const target = ctx.presence.get(t.uuid);
        if (target) ctx.msg(t.uuid, text(target.lang, 'voice.unmuted_you'));
        ctx.team('voice-mute', (lang) =>
          text(lang, 'team.voiceunmute', { actor: mm(actor.name), name: mm(t.name) }),
        );
      },
    },
  ];

  return {
    config,
    broadcast,
    onGroup: (uuid, group) => {
      if (group) groups.set(uuid, group);
      else groups.delete(uuid);
    },
    onAudio: (from, payload) => {
      if (payload.length <= HEADER || payload[0] !== AUDIO) return;
      const group = uuidOf(payload.subarray(1, 1 + UUID_BYTES));
      const speaker = uuidOf(payload.subarray(1 + UUID_BYTES, HEADER));
      // Nur wer wirklich auf diesem Server ist und nicht stumm – kein Server spricht für einen anderen.
      if (ctx.presence.get(speaker)?.server !== from.server || muted().has(speaker)) return;
      const bridged = channels().some((c) => c.id === group) || parties().some((p) => p.id === group);
      if (!bridged) return;
      backends()
        .filter((c) => c.server !== from.server)
        .forEach((c) => c.sendBinary(payload));
    },
    commands,
  };
}
