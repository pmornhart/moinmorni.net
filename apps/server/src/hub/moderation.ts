import { mayLiftFor, mayPunishPlayer, punishersOf, PUNISHMENT_RIGHTS, type Role } from '@moinmorni/shared';
import type { HubContext } from './context.js';
import type { Punishment } from './punish.js';
import { normalUuid } from './players.js';
import { dateText, mm, text, type Lang, type TextKey } from './texts.js';

/**
 * Strafen mit allem, was dazugehört – gleich, ob sie im Spiel (/ban, /voicemute) oder im Panel verhängt werden:
 * Rauswurf mit Grund, Bann-Liste an den Proxy, Nachricht an den Spieler, Hinweis ans Team, Discord (über
 * `punishments.changed`).
 */

/** voice = im Sprachchat stumm (Chat schreiben geht weiter). */
export type ModKind = 'ban' | 'mute' | 'jail' | 'warn' | 'kick' | 'voice';
export type LiftKind = 'ban' | 'mute' | 'jail' | 'voice';

/** Was dauert und sich aufheben lässt (Verwarnen und Rauswerfen sind einmalig). */
export const LIFT_KINDS: readonly LiftKind[] = ['ban', 'mute', 'jail', 'voice'];
export const isLasting = (kind: string): kind is LiftKind => LIFT_KINDS.some((k) => k === kind);

/** Das Recht im Spiel zu jeder Strafe – im Panel gilt dasselbe (`mayPunish` aus @moinmorni/shared). */
const KIND_RIGHT = PUNISHMENT_RIGHTS satisfies Record<ModKind, string>;

export interface Target {
  readonly uuid: string;
  readonly name: string;
  readonly online: boolean;
  readonly lang: Lang;
}

export interface Moderation {
  /** Nach Name oder UUID; online zuerst. */
  readonly target: (nameOrUuid: string | undefined) => Target | null;
  readonly punish: (
    t: Target,
    kind: ModKind,
    minutes: number | null,
    reason: string | null,
    by: string,
  ) => Punishment;
  /** false = es gab nichts aufzuheben. */
  readonly lift: (t: Target, kind: LiftKind, by: string) => boolean;
  readonly untilText: (lang: Lang, iso: string | null) => string;
  /**
   * Strafen nur nach unten: null = `actor` darf `t` so bestrafen (oder die Strafe aufheben); sonst die Meldung, wer es
   * darf („Mia ist Admin – das darf nur der Owner.“). Ob der Rang die Strafe überhaupt kennt (`mayPunish`), prüft der
   * Aufrufer vorher.
   */
  readonly refusal: (
    actor: Pick<Role, 'id' | 'position'>,
    t: Target,
    kind: ModKind,
    lang: Lang,
    lifting?: boolean,
  ) => string | null;
}

const TEAM_KEY = {
  ban: 'team.ban',
  mute: 'team.mute',
  jail: 'team.jail',
  warn: 'team.warn',
  kick: 'team.kick',
  voice: 'team.voicemute',
} as const satisfies Record<ModKind, TextKey>;
const LIFT_KEY = {
  ban: 'team.unban',
  mute: 'team.unmute',
  jail: 'team.unjail',
  voice: 'team.voiceunmute',
} as const satisfies Record<LiftKind, TextKey>;
/** Nachricht an den Spieler selbst (wenn online); Bann und Rauswurf zeigen ihren Grund beim Rauswurf. */
const YOU_KEY: Readonly<Partial<Record<ModKind, TextKey>>> = {
  mute: 'mute.you',
  warn: 'warn.you',
  jail: 'jail.you',
  voice: 'voice.muted_you',
};
const FREE_KEY: Readonly<Partial<Record<LiftKind, TextKey>>> = {
  mute: 'unmute.you',
  jail: 'unjail.you',
  voice: 'voice.unmuted_you',
};
/** Hinweis „nur höhere Ränge“ – nach der Zahl derer, die es dürfen: niemand, einer, mehrere. */
const PROTECTED_KEY: readonly TextKey[] = [
  'punish.protected_nobody',
  'punish.protected_one',
  'punish.protected_many',
];
/** Gefängnis ohne Dauer: zehn Minuten (für immer nur ausdrücklich, z. B. „perm“). */
export const JAIL_DEFAULT_MINUTES = 10;
const LOBBY = 'lobby';
// UUID mit oder ohne Bindestriche.
// https://regex101.com/?flavor=javascript&regex=%5E%5B0-9a-f%5D%7B8%7D-%3F(%5B0-9a-f%5D%7B4%7D-%3F)%7B3%7D%5B0-9a-f%5D%7B12%7D%24&flags=i&testString=069a79f4-44e9-4726-a5be-fca90e38aaf5
const UUID = /^[0-9a-f]{8}-?([0-9a-f]{4}-?){3}[0-9a-f]{12}$/i;

export interface ModChange {
  readonly uuid: string;
  readonly kind: ModKind;
  readonly action: 'add' | 'lift';
  readonly until: string | null;
  readonly reason: string;
  readonly by: string;
}

export function createModeration(ctx: HubContext, onChange: (change: ModChange) => void): Moderation {
  const untilText = (lang: Lang, iso: string | null): string =>
    iso
      ? text(lang, 'punish.until', { date: dateText(lang, iso, ctx.timeZone) })
      : text(lang, 'punish.forever');

  /** „Owner“, „Owner und Admin“, „Owner, Admin und Moderator“ – in Rangfarbe. */
  const roleList = (lang: Lang, roles: readonly Role[]): string => {
    const names = roles.map((r) => `<${r.colour}>${mm(r.name[lang])}</${r.colour}>`);
    const last = names.pop() ?? '';
    return names.length ? `${names.join(', ')}${text(lang, 'punish.and')}${last}` : last;
  };

  return {
    untilText,
    refusal: (actor, t, kind, lang, lifting = false) => {
      const rank = ctx.players.roleOf(t.uuid);
      if ((lifting ? mayLiftFor : mayPunishPlayer)(actor, rank)) return null;
      const who = punishersOf(ctx.stores.roles(), rank, kind);
      return text(
        lang,
        PROTECTED_KEY[Math.min(who.length, PROTECTED_KEY.length - 1)] ?? 'punish.protected_many',
        {
          name: mm(t.name),
          rank: `<${rank.colour}>${mm(rank.name[lang])}</${rank.colour}>`,
          who: roleList(lang, who),
        },
      );
    },
    target: (nameOrUuid) => {
      if (!nameOrUuid) return null;
      const byUuid = UUID.test(nameOrUuid);
      const online = byUuid ? ctx.presence.get(nameOrUuid) : ctx.presence.byName(nameOrUuid);
      if (online) return { uuid: online.uuid, name: online.name, online: true, lang: online.lang };
      const known = byUuid ? ctx.players.get(normalUuid(nameOrUuid)) : ctx.players.byName(nameOrUuid);
      if (!known) return null;
      const lang: Lang = known.language === 'en' ? 'en' : 'de';
      return { uuid: known.uuid, name: known.name, online: false, lang };
    },
    punish: (t, kind, minutes, reason, by) => {
      const why = reason?.trim() || text(t.lang, 'punish.no_reason');
      const p = ctx.punish.add({
        uuid: t.uuid,
        kind,
        reason: why,
        by,
        minutes: isLasting(kind) ? minutes : null,
      });
      const vars = (lang: Lang) => ({
        actor: mm(by),
        name: mm(t.name),
        reason: mm(why),
        until: untilText(lang, p.expiresAt),
      });
      if (kind === 'ban') {
        if (t.online) ctx.kick(t.uuid, text(t.lang, 'ban.screen', vars(t.lang)));
        ctx.syncBans();
      }
      if (kind === 'kick' && t.online) ctx.kick(t.uuid, text(t.lang, 'kick.screen', vars(t.lang)));
      const you = YOU_KEY[kind];
      if (you && t.online) ctx.msg(t.uuid, text(t.lang, you, vars(t.lang)));
      // Gefängnis: die Zelle steht in der Lobby – wer woanders spielt, kommt dorthin.
      if (kind === 'jail' && t.online && ctx.presence.get(t.uuid)?.server !== LOBBY)
        ctx.connect(t.uuid, LOBBY);
      ctx.team(KIND_RIGHT[kind], (lang) => text(lang, TEAM_KEY[kind], vars(lang)));
      onChange({ uuid: t.uuid, kind, action: 'add', until: p.expiresAt, reason: why, by });
      return p;
    },
    lift: (t, kind, by) => {
      if (!ctx.punish.revoke(t.uuid, kind, by)) return false;
      if (kind === 'ban') ctx.syncBans();
      const free = FREE_KEY[kind];
      if (free && t.online) ctx.msg(t.uuid, text(t.lang, free));
      ctx.team(KIND_RIGHT[kind], (lang) => text(lang, LIFT_KEY[kind], { actor: mm(by), name: mm(t.name) }));
      onChange({ uuid: t.uuid, kind, action: 'lift', until: null, reason: '', by });
      return true;
    },
  };
}
