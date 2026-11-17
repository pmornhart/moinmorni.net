import { mayAssign, type GameRight, type Role, networkCommand } from '@moinmorni/shared';
import type { HubContext } from './context.js';
import { hasRight } from './context.js';
import {
  isLasting,
  JAIL_DEFAULT_MINUTES,
  type LiftKind,
  type ModKind,
  type Moderation,
  type Target,
} from './moderation.js';
import { parseDuration } from './punish.js';
import { coveredText } from './streamer.js';
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
  /**
   * Erste Wörter, die der Befehl selbst behandelt, obwohl es eine Einstellung mit demselben Befehl gibt
   * (`/lobby ja` – sonst gehen Wörter nach /lobby an die Lobby-Einstellungen, siehe `mergeCommands`).
   */
  readonly own?: readonly string[];
  readonly run: (actor: Actor, args: readonly string[]) => void;
  readonly complete?: (actor: Actor, args: readonly string[]) => string[];
}

const DURATIONS = ['30m', '1h', '1d', '7d', '30d', 'perm'];
/** Zweites Wort nach dem Spieler (Dauer bzw. Rang): `<spieler> <dauer> <grund…>`, `<spieler> <rang>`. */
const SECOND_WORD = 2;
const NOT_PUNISHED = {
  ban: 'punish.not_banned',
  mute: 'punish.not_muted',
  jail: 'punish.not_jailed',
  voice: 'voice.not_muted',
} as const satisfies Record<LiftKind, TextKey>;
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

  /** Ziel suchen: bekannt, nicht man selbst (nur der Owner darf eine alte Strafe von sich selbst aufheben). */
  const known = (actor: Actor, name: string | undefined, self = false): Target | null => {
    const t = target(name);
    if (!t) {
      say(actor, text(actor.lang, 'cmd.unknown_player', { name: mm(name ?? '') }));
      return null;
    }
    if (t.uuid === actor.uuid && !self) {
      say(actor, text(actor.lang, 'cmd.self'));
      return null;
    }
    return t;
  };

  /** Ziel für /rang: bekannt, nicht man selbst, niedrigerer Rang. */
  const victim = (actor: Actor, name: string | undefined): Target | null => {
    const t = known(actor, name);
    if (t && ctx.players.roleOf(t.uuid).position <= actor.role.position) {
      say(actor, text(actor.lang, 'cmd.higher', { name: mm(t.name) }));
      return null;
    }
    return t;
  };

  /** Ziel einer Strafe (verhängen oder aufheben): nur jemand mit niedrigerem Rang – den Owner niemand. */
  const culprit = (actor: Actor, name: string | undefined, kind: ModKind, lifting = false): Target | null => {
    const t = known(actor, name, lifting && actor.role.id === 'owner');
    const refused = t ? mod.refusal(actor.role, t, kind, actor.lang, lifting) : null;
    if (refused) say(actor, refused);
    return refused ? null : t;
  };

  /** Bann, Stumm, Gefängnis, Sprachchat-Stumm: `<spieler> [dauer] [grund…]` – wie im Panel über die Moderation. */
  const punishing =
    (kind: LiftKind) =>
    (actor: Actor, args: readonly string[]): void => {
      const t = culprit(actor, args[0], kind);
      if (!t) return;
      const minutes = parseDuration(args[1]);
      const reasonParts = minutes === undefined ? args.slice(1) : args.slice(SECOND_WORD);
      const reason = reasonParts.join(' ').trim() || text(t.lang, 'punish.no_reason');
      // Ohne Dauer: Bann und Stumm (auch im Sprachchat) für immer, Gefängnis zehn Minuten.
      const fallback = kind === 'jail' ? JAIL_DEFAULT_MINUTES : null;
      mod.punish(t, kind, minutes === undefined ? fallback : minutes, reason, actor.name);
    };

  const lifting =
    (kind: LiftKind) =>
    (actor: Actor, args: readonly string[]): void => {
      // Aufheben wie verhängen: nur bei niedrigerem Rang (alte Strafen bleiben, bis jemand Höheres sie aufhebt).
      const t = culprit(actor, args[0], kind, true);
      if (!t) return;
      if (!mod.lift(t, kind, actor.name))
        say(actor, text(actor.lang, NOT_PUNISHED[kind], { name: mm(t.name) }));
    };

  const playerArg = (_: Actor, args: readonly string[]): string[] =>
    args.length <= 1 ? onlineNames(args[0]) : [];
  const punishArgs = (_: Actor, args: readonly string[]): string[] => {
    if (args.length <= 1) return onlineNames(args[0]);
    return args.length === SECOND_WORD ? DURATIONS.filter((d) => d.startsWith(args[1] ?? '')) : [];
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
    // Streamer-Modus: beim Empfänger nur mit der Maus lesbar.
    const shown = ctx.streamer(t.uuid).includes('msg') ? coveredText(t.lang, message) : mm(message);
    ctx.msg(t.uuid, text(t.lang, 'msg.from', { name: mm(actor.name), text: shown }));
    const self = ctx.presence.get(actor.uuid);
    if (self) self.replyTo = t.uuid;
    t.replyTo = actor.uuid;
  };

  return [
    {
      ...networkCommand('sprache'),
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
      ...networkCommand('msg'),
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
      ...networkCommand('r'),
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
      ...networkCommand('profil'),
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
    // /lobby (fragt mitten im Spiel nach) und /rueckkehr stehen in rejoin.ts.
    {
      ...networkCommand('bau'),
      noRight: 'build.no_right',
      run: (actor) => {
        say(actor, text(actor.lang, 'build.going'));
        ctx.goTo(actor.uuid, 'bau');
      },
    },
    {
      ...networkCommand('ban'),
      run: punishing('ban'),
      complete: punishArgs,
    },
    {
      ...networkCommand('unban'),
      run: lifting('ban'),
    },
    {
      ...networkCommand('mute'),
      run: punishing('mute'),
      complete: punishArgs,
    },
    {
      ...networkCommand('unmute'),
      run: lifting('mute'),
      complete: playerArg,
    },
    {
      ...networkCommand('gefaengnis'),
      run: punishing('jail'),
      complete: punishArgs,
    },
    {
      ...networkCommand('frei'),
      run: lifting('jail'),
      complete: playerArg,
    },
    {
      ...networkCommand('voicemute'),
      run: punishing('voice'),
      complete: punishArgs,
    },
    {
      ...networkCommand('voiceunmute'),
      run: lifting('voice'),
      complete: playerArg,
    },
    {
      ...networkCommand('kick'),
      run: (actor, args) => {
        const t = culprit(actor, args[0], 'kick');
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
      ...networkCommand('warn'),
      run: (actor, args) => {
        const reason = args.slice(1).join(' ').trim();
        if (!reason) {
          say(actor, text(actor.lang, 'cmd.usage', { usage: '/warn <spieler> <grund>' }));
          return;
        }
        const t = culprit(actor, args[0], 'warn');
        if (!t) return;
        mod.punish(t, 'warn', null, reason, actor.name);
      },
      complete: playerArg,
    },
    {
      ...networkCommand('strafen'),
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
              until: isLasting(p.kind) ? until(actor.lang, p.expiresAt) : '',
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
      ...networkCommand('rang'),
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
        if (args.length > SECOND_WORD) return [];
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
