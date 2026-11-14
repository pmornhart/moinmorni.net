import type { HubContext } from './context.js';
import type { Punishment } from './punish.js';
import { normalUuid } from './players.js';
import { dateText, mm, text, type Lang } from './texts.js';

/**
 * Strafen mit allem, was dazugehört – gleich, ob sie im Spiel (/ban) oder im Panel verhängt werden: Rauswurf mit
 * Grund, Bann-Liste an den Proxy, Nachricht an den Spieler, Hinweis ans Team.
 */

export type ModKind = 'ban' | 'mute' | 'warn' | 'kick';
export type LiftKind = 'ban' | 'mute';

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
}

const TEAM_KEY = { ban: 'team.ban', mute: 'team.mute', warn: 'team.warn', kick: 'team.kick' } as const;
// UUID mit oder ohne Bindestriche.
// https://regex101.com/?flavor=javascript&regex=%5E%5B0-9a-f%5D%7B8%7D-%3F(%5B0-9a-f%5D%7B4%7D-%3F)%7B3%7D%5B0-9a-f%5D%7B12%7D%24&flags=i&testString=069a79f4-44e9-4726-a5be-fca90e38aaf5
const UUID = /^[0-9a-f]{8}-?([0-9a-f]{4}-?){3}[0-9a-f]{12}$/i;

export function createModeration(ctx: HubContext, onChange: () => void): Moderation {
  const untilText = (lang: Lang, iso: string | null): string =>
    iso
      ? text(lang, 'punish.until', { date: dateText(lang, iso, ctx.timeZone) })
      : text(lang, 'punish.forever');

  return {
    untilText,
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
      const lasting = kind === 'ban' || kind === 'mute';
      const p = ctx.punish.add({ uuid: t.uuid, kind, reason: why, by, minutes: lasting ? minutes : null });
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
      if (kind === 'mute' && t.online) ctx.msg(t.uuid, text(t.lang, 'mute.you', vars(t.lang)));
      if (kind === 'warn' && t.online) ctx.msg(t.uuid, text(t.lang, 'warn.you', vars(t.lang)));
      ctx.team(kind, (lang) => text(lang, TEAM_KEY[kind], vars(lang)));
      onChange();
      return p;
    },
    lift: (t, kind, by) => {
      if (!ctx.punish.revoke(t.uuid, kind, by)) return false;
      if (kind === 'ban') ctx.syncBans();
      if (kind === 'mute' && t.online) ctx.msg(t.uuid, text(t.lang, 'unmute.you'));
      ctx.team(kind, (lang) =>
        text(lang, kind === 'ban' ? 'team.unban' : 'team.unmute', { actor: mm(by), name: mm(t.name) }),
      );
      onChange();
      return true;
    },
  };
}
