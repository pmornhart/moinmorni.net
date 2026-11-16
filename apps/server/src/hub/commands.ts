import { mayAssign, type GameRight, type Role } from '@morninet/shared';
import type { HubContext } from './context.js';
import { hasRight } from './context.js';
import { JAIL_DEFAULT_MINUTES, type Moderation, type Target } from './moderation.js';
import { parseDuration, type PunishKind } from './punish.js';
import { dateText, LANGS, mm, text, type Lang, type TextKey } from './texts.js';

/**
 * Befehle im ganzen Netzwerk. Der Proxy meldet sie nur an und reicht sie weiter; was passiert, steht hier.
 * Antworten gehen als Nachricht an den Spieler.
 */

export interface Actor {
  readonly uuid: string;
  readonly name: string;
  readonly lang: Lang;
  readonly role: Role;
}

export interface Command {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly usage: Readonly<Record<Lang, string>>;
  readonly right?: GameRight;
  /** Eigene Antwort, wenn das Recht fehlt (sonst die allgemeine). */
  readonly noRight?: TextKey;
  readonly run: (actor: Actor, args: readonly string[]) => void;
  readonly complete?: (actor: Actor, args: readonly string[]) => string[];
}

const LOBBY = 'lobby';
const DURATIONS = ['30m', '1h', '1d', '7d', '30d', 'perm'];
const NOT_PUNISHED = {
  ban: 'punish.not_banned',
  mute: 'punish.not_muted',
  jail: 'punish.not_jailed',
} as const;
const REMOVE = new Set(['weg', 'keiner', 'none', 'remove']);

export function createCommands(ctx: HubContext, mod: Moderation): Command[] {
  const target = mod.target;
  const say = (actor: Actor, ...lines: string[]): void => lines.forEach((line) => ctx.msg(actor.uuid, line));
  const onlineNames = (prefix = ''): string[] =>
    ctx.presence
      .all()
      .map((p) => p.name)
      .filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase()))
      .sort();
  const until = mod.untilText;

  /** Ziel suchen und prüfen: bekannt, nicht man selbst, niedrigerer Rang. */
  const victim = (actor: Actor, name: string | undefined): Target | null => {
    const t = target(name);
    if (!t) {
      say(actor, text(actor.lang, 'cmd.unknown_player', { name: mm(name ?? '') }));
      return null;
    }
    if (t.uuid === actor.uuid) {
      say(actor, text(actor.lang, 'cmd.self'));
      return null;
    }
    if (ctx.players.roleOf(t.uuid).position <= actor.role.position) {
      say(actor, text(actor.lang, 'cmd.higher', { name: mm(t.name) }));
      return null;
    }
    return t;
  };

  /** Bann und Stumm: `<spieler> [dauer] [grund…]`. */
  const punishing =
    (kind: Extract<PunishKind, 'ban' | 'mute' | 'jail'>) =>
    (actor: Actor, args: readonly string[]): void => {
      const t = victim(actor, args[0]);
      if (!t) return;
      const minutes = parseDuration(args[1]);
      const reasonParts = minutes === undefined ? args.slice(1) : args.slice(2);
      const reason = reasonParts.join(' ').trim() || text(t.lang, 'punish.no_reason');
      // Ohne Dauer: Bann und Stumm für immer, Gefängnis zehn Minuten.
      const fallback = kind === 'jail' ? JAIL_DEFAULT_MINUTES : null;
      mod.punish(t, kind, minutes === undefined ? fallback : minutes, reason, actor.name);
    };

  const lifting =
    (kind: Extract<PunishKind, 'ban' | 'mute' | 'jail'>) =>
    (actor: Actor, args: readonly string[]): void => {
      const t = target(args[0]);
      if (!t) {
        say(actor, text(actor.lang, 'cmd.unknown_player', { name: mm(args[0] ?? '') }));
        return;
      }
      if (!mod.lift(t, kind, actor.name))
        say(actor, text(actor.lang, NOT_PUNISHED[kind], { name: mm(t.name) }));
    };

  const playerArg = (_: Actor, args: readonly string[]): string[] =>
    args.length <= 1 ? onlineNames(args[0]) : [];
  const punishArgs = (_: Actor, args: readonly string[]): string[] => {
    if (args.length <= 1) return onlineNames(args[0]);
    return args.length === 2 ? DURATIONS.filter((d) => d.startsWith(args[1] ?? '')) : [];
  };

  const whisper = (actor: Actor, to: string | null, message: string): void => {
    const t = to ? ctx.presence.get(to) : undefined;
    if (!t) {
      say(actor, text(actor.lang, to ? 'cmd.offline' : 'msg.nobody', { name: mm(to ?? '') }));
      return;
    }
    const mute = ctx.punish.active(actor.uuid, 'mute');
    if (mute) {
      say(
        actor,
        text(actor.lang, 'msg.muted', { until: until(actor.lang, mute.expiresAt), reason: mm(mute.reason) }),
      );
      return;
    }
    // Aus dem Gefängnis nur ans Team (wer einsperren darf).
    if (ctx.punish.active(actor.uuid, 'jail') && !hasRight(ctx.players.roleOf(t.uuid), 'jail')) {
      say(actor, text(actor.lang, 'jail.msg_team_only'));
      return;
    }
    say(actor, text(actor.lang, 'msg.to', { name: mm(t.name), text: mm(message) }));
    ctx.msg(t.uuid, text(t.lang, 'msg.from', { name: mm(actor.name), text: mm(message) }));
    const self = ctx.presence.get(actor.uuid);
    if (self) self.replyTo = t.uuid;
    t.replyTo = actor.uuid;
  };

  return [
    {
      name: 'sprache',
      aliases: ['language', 'lang'],
      usage: { de: '/sprache <de|en>', en: '/language <de|en>' },
      run: (actor, args) => {
        const lang = LANGS.find((l) => l === args[0]?.toLowerCase());
        if (!lang) {
          say(actor, text(actor.lang, 'lang.usage'));
          return;
        }
        ctx.players.setLanguage(actor.uuid, lang);
        const self = ctx.presence.get(actor.uuid);
        if (self) self.lang = lang;
        ctx.refreshProfile(actor.uuid);
        say(actor, text(lang, 'lang.set'));
      },
      complete: (_, args) => (args.length <= 1 ? LANGS.filter((l) => l.startsWith(args[0] ?? '')) : []),
    },
    {
      name: 'msg',
      aliases: ['tell', 'w', 'm', 'whisper'],
      usage: { de: '/msg <spieler> <nachricht>', en: '/msg <player> <message>' },
      run: (actor, args) => {
        const message = args.slice(1).join(' ').trim();
        const t = ctx.presence.byName(args[0] ?? '');
        if (!args[0] || !message) {
          say(actor, text(actor.lang, 'cmd.usage', { usage: '/msg <spieler> <nachricht>' }));
          return;
        }
        if (!t) {
          say(actor, text(actor.lang, 'cmd.offline', { name: mm(args[0]) }));
          return;
        }
        whisper(actor, t.uuid, message);
      },
      complete: playerArg,
    },
    {
      name: 'r',
      aliases: ['reply'],
      usage: { de: '/r <nachricht>', en: '/r <message>' },
      run: (actor, args) => {
        const message = args.join(' ').trim();
        if (!message) {
          say(actor, text(actor.lang, 'cmd.usage', { usage: '/r <nachricht>' }));
          return;
        }
        whisper(actor, ctx.presence.get(actor.uuid)?.replyTo ?? null, message);
      },
    },
    {
      name: 'profil',
      aliases: ['profile'],
      usage: { de: '/profil [privat|öffentlich]', en: '/profile [private|public]' },
      run: (actor, args) => {
        const word = args[0]?.toLowerCase() ?? '';
        const url = `https://${ctx.domain}/spieler/${encodeURIComponent(actor.name)}`;
        if (['privat', 'private'].includes(word)) {
          ctx.players.setPrivate(actor.uuid, true);
          say(actor, text(actor.lang, 'profile.private'));
        } else if (['öffentlich', 'oeffentlich', 'public'].includes(word)) {
          ctx.players.setPrivate(actor.uuid, false);
          say(actor, text(actor.lang, 'profile.public', { url: mm(url) }));
        } else say(actor, text(actor.lang, 'profile.usage', { url: mm(url) }));
      },
      complete: (_, args) =>
        args.length <= 1 ? ['privat', 'öffentlich'].filter((w) => w.startsWith(args[0] ?? '')) : [],
    },
    {
      name: 'lobby',
      aliases: ['hub', 'l'],
      usage: { de: '/lobby', en: '/lobby' },
      run: (actor) => {
        say(actor, text(actor.lang, ctx.connect(actor.uuid, LOBBY) ? 'lobby.going' : 'lobby.missing'));
      },
    },
    {
      name: 'bau',
      aliases: ['build', 'bauserver'],
      right: 'build',
      noRight: 'build.no_right',
      usage: { de: '/bau', en: '/build' },
      run: (actor) => {
        say(actor, text(actor.lang, 'build.going'));
        ctx.goTo(actor.uuid, 'bau');
      },
    },
    {
      name: 'ban',
      aliases: [],
      right: 'ban',
      usage: { de: '/ban <spieler> [dauer] [grund]', en: '/ban <player> [duration] [reason]' },
      run: punishing('ban'),
      complete: punishArgs,
    },
    {
      name: 'unban',
      aliases: ['entbannen'],
      right: 'ban',
      usage: { de: '/unban <spieler>', en: '/unban <player>' },
      run: lifting('ban'),
    },
    {
      name: 'mute',
      aliases: ['stumm'],
      right: 'mute',
      usage: { de: '/mute <spieler> [dauer] [grund]', en: '/mute <player> [duration] [reason]' },
      run: punishing('mute'),
      complete: punishArgs,
    },
    {
      name: 'unmute',
      aliases: ['entstummen'],
      right: 'mute',
      usage: { de: '/unmute <spieler>', en: '/unmute <player>' },
      run: lifting('mute'),
      complete: playerArg,
    },
    {
      name: 'gefaengnis',
      aliases: ['gefängnis', 'jail', 'knast'],
      right: 'jail',
      usage: { de: '/gefaengnis <spieler> [dauer] [grund]', en: '/jail <player> [duration] [reason]' },
      run: punishing('jail'),
      complete: punishArgs,
    },
    {
      name: 'frei',
      aliases: ['unjail', 'entlassen'],
      right: 'jail',
      usage: { de: '/frei <spieler>', en: '/unjail <player>' },
      run: lifting('jail'),
      complete: playerArg,
    },
    {
      name: 'kick',
      aliases: [],
      right: 'kick',
      usage: { de: '/kick <spieler> [grund]', en: '/kick <player> [reason]' },
      run: (actor, args) => {
        const t = victim(actor, args[0]);
        if (!t) return;
        if (!t.online) {
          say(actor, text(actor.lang, 'cmd.offline', { name: mm(t.name) }));
          return;
        }
        mod.punish(t, 'kick', null, args.slice(1).join(' '), actor.name);
      },
      complete: playerArg,
    },
    {
      name: 'warn',
      aliases: ['verwarnen'],
      right: 'warn',
      usage: { de: '/warn <spieler> <grund>', en: '/warn <player> <reason>' },
      run: (actor, args) => {
        const reason = args.slice(1).join(' ').trim();
        if (!reason) {
          say(actor, text(actor.lang, 'cmd.usage', { usage: '/warn <spieler> <grund>' }));
          return;
        }
        const t = victim(actor, args[0]);
        if (!t) return;
        mod.punish(t, 'warn', null, reason, actor.name);
      },
      complete: playerArg,
    },
    {
      name: 'strafen',
      aliases: ['history', 'punishments'],
      right: 'warn',
      usage: { de: '/strafen <spieler>', en: '/history <player>' },
      run: (actor, args) => {
        const t = target(args[0]);
        if (!t) {
          say(actor, text(actor.lang, 'cmd.unknown_player', { name: mm(args[0] ?? '') }));
          return;
        }
        const list = ctx.punish.history(t.uuid);
        if (!list.length) {
          say(actor, text(actor.lang, 'history.none', { name: mm(t.name) }));
          return;
        }
        say(
          actor,
          text(actor.lang, 'history.head', { name: mm(t.name) }),
          ...list.map((p) =>
            text(actor.lang, 'history.line', {
              date: dateText(actor.lang, p.createdAt, ctx.timeZone),
              kind: p.kind,
              until: p.kind === 'ban' || p.kind === 'mute' ? until(actor.lang, p.expiresAt) : '',
              reason: mm(p.reason),
              by: mm(p.byName),
              state: p.revokedAt ? text(actor.lang, 'history.revoked') : '',
            }),
          ),
        );
      },
      complete: playerArg,
    },
    {
      name: 'rang',
      aliases: ['rank'],
      right: 'ranks',
      usage: { de: '/rang <spieler> <rang|weg>', en: '/rank <player> <rank|none>' },
      run: (actor, args) => {
        const wanted = args[1]?.toLowerCase();
        if (!wanted) {
          say(actor, text(actor.lang, 'cmd.usage', { usage: '/rang <spieler> <rang|weg>' }));
          return;
        }
        const roles = ctx.stores.roles();
        const role = roles.find(
          (r) => r.id === wanted || r.name.de.toLowerCase() === wanted || r.name.en.toLowerCase() === wanted,
        );
        if (!REMOVE.has(wanted) && !role) {
          say(actor, text(actor.lang, 'rank.unknown', { rank: mm(wanted) }));
          return;
        }
        if (role && !mayAssign(roles, actor.role.id, role.id)) {
          say(actor, text(actor.lang, 'rank.too_high'));
          return;
        }
        const t = victim(actor, args[0]);
        if (!t) return;
        ctx.players.setRole(t.uuid, role && !role.fallback ? role.id : null);
        ctx.refreshProfile(t.uuid);
        say(
          actor,
          role && !role.fallback
            ? text(actor.lang, 'rank.set', {
                name: mm(t.name),
                rank: `<${role.colour}>${mm(role.name[actor.lang])}</${role.colour}>`,
              })
            : text(actor.lang, 'rank.removed', { name: mm(t.name) }),
        );
      },
      complete: (actor, args) => {
        if (args.length <= 1) return onlineNames(args[0]);
        if (args.length > 2) return [];
        const roles = ctx.stores.roles();
        return roles
          .filter((r) => mayAssign(roles, actor.role.id, r.id))
          .map((r) => r.id)
          .concat('weg')
          .filter((id) => id.startsWith(args[1] ?? ''));
      },
    },
  ];
}

/** Befehl nach Name oder Alias. */
export const findCommand = (commands: readonly Command[], name: string): Command | undefined => {
  const lower = name.toLowerCase();
  return commands.find((c) => c.name === lower || c.aliases.includes(lower));
};

export const allowed = (command: Command, role: Role): boolean =>
  !command.right || hasRight(role, command.right);
