import type { FastifyBaseLogger } from 'fastify';
import type { Role } from '@moinmorni/shared';
import { AppError, badRequest } from '../lib/errors.js';
import { DISCORD_CODES, DiscordError } from './client.js';
import { parseImage } from './images.js';
import { LOGO_DATA_URI, LOGO_VERSION } from './logo.js';
import { discordRoleName } from './layout.js';
import {
  rankIconOf,
  rankLook,
  ROLE_ICONS_FEATURE,
  type RankLook,
  type RankLookReason,
} from './rank-icons.js';
import type { DiscordStore } from './store.js';

/**
 * Aussehen in Discord: Server-Symbol (Standard: das MoinMorni-Logo), Server-Banner (nur mit Boost-Stufe 2) und
 * Profilbild + Name des Bots. Discord erlaubt Änderungen am Bot nur ein paar Mal pro Stunde – darum setzt der Bot sein
 * Logo nur einmal von selbst (wenn er noch keins hat) und sonst nur, wenn jemand im Panel etwas ändert.
 * https://docs.discord.com/developers/resources/guild#modify-guild · …/user#modify-current-user
 */

type Rest = <T>(method: string, path: string, body?: unknown, reason?: string) => Promise<T>;

interface DGuild {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly banner: string | null;
  readonly features: readonly string[];
  readonly premium_tier?: number;
}
interface DUser {
  readonly id: string;
  readonly username: string;
  readonly avatar: string | null;
}

export interface AppearanceView {
  readonly guild: {
    readonly name: string;
    readonly icon: string | null;
    /** Das Symbol ist das MoinMorni-Logo, das der Bot gesetzt hat. */
    readonly iconIsLogo: boolean;
    readonly banner: string | null;
    readonly premiumTier: number;
    /** Bewegtes Server-Symbol (GIF) – ab Boost-Stufe 1. */
    readonly animatedIcon: boolean;
    /** Banner überhaupt – ab Boost-Stufe 2. */
    readonly banners: boolean;
    readonly animatedBanner: boolean;
    /** Rollen-Symbole (Bild neben dem Rollennamen) – ab Boost-Stufe 2. */
    readonly roleIcons: boolean;
  } | null;
  /**
   * Wie Discord die Ränge zeigt: Abzeichen als Rollen-Symbol („icons“) oder Symbol im Namen („names“) – und warum
   * („boost“: Server unter Stufe 2, „badges_off“: Abzeichen im Panel aus). Ohne Server: null.
   */
  readonly ranks: {
    readonly look: RankLook;
    readonly reason: RankLookReason;
    /** Die Ränge so, wie Discord sie zeigt (beste zuerst). */
    readonly roles: readonly RankView[];
  } | null;
  readonly bot: {
    readonly name: string;
    readonly avatar: string | null;
    readonly avatarIsLogo: boolean;
  } | null;
}

export interface RankView {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly colour: string;
  /** Name der Rolle in Discord („Moderator“ mit Bild daneben oder „⚔ Moderator“). */
  readonly discordName: string;
  /** Bekommt in Discord das Abzeichen als Rollen-Symbol. */
  readonly icon: boolean;
  /** Gibt es schon in Discord (nach „Server einrichten“). */
  readonly inDiscord: boolean;
}

export type IconResult = 'set' | 'kept' | 'unchanged';

export interface Appearance {
  readonly view: () => Promise<AppearanceView>;
  /** Neues Server-Symbol (Bild aus dem Panel) oder zurück aufs Logo. */
  readonly setIcon: (image: string | 'logo', by: string) => Promise<AppearanceView>;
  /** Banner setzen oder (null) entfernen. */
  readonly setBanner: (image: string | null, by: string) => Promise<AppearanceView>;
  /** Name und/oder Profilbild des Bots. */
  readonly setBot: (change: {
    readonly name?: string;
    readonly avatar?: string | 'logo';
  }) => Promise<AppearanceView>;
  /** Beim Einrichten: Logo setzen, wenn es noch kein Symbol gibt oder das Logo des Bots veraltet ist. */
  readonly ensureGuildLogo: () => Promise<IconResult>;
  /** Einmal pro Bot: hat er kein Profilbild, bekommt er das Logo (nicht bei jedem Start – Discord bremst das). */
  readonly ensureBotLogo: () => Promise<void>;
}

export interface AppearanceDeps {
  readonly rest: Rest;
  readonly store: DiscordStore;
  readonly guildId: () => string | null;
  /** Bilder-Server von Discord (Tests: nachgebautes Discord). */
  readonly cdn: string;
  /** Rang-Abzeichen im Panel an? */
  readonly badges: () => boolean;
  /** Die Ränge aus dem Panel, die es in Discord als Rolle gibt (ohne „Spieler“). */
  readonly ranks: () => readonly Role[];
  readonly log: FastifyBaseLogger;
}

const ICON_KEY = 'icon';
const BANNER_KEY = 'banner';
const AVATAR_KEY = 'bot:avatar';
const ANIMATED_PREFIX = 'a_';
const PREVIEW_SIZE = 256;
const BANNER_SIZE = 1024;
const HTTP_TOO_MANY = 429;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_LARGE = 413;
const NAME_MIN = 2;
const NAME_MAX = 32;
// Bot-Namen: 2–32 Zeichen ohne @ # : und ` (Discord lehnt die ab) – "MoinMorni" passt, "Moin#Morni" nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5B%5E%40%23%3A%60%5D%7B2%2C32%7D%24&testString=MoinMorni
const BOT_NAME = /^[^@#:`]{2,32}$/;

/** Discord-Fehler freundlich: fehlende Rechte, Bild abgelehnt, zu oft geändert. */
export function friendlyDiscordError(err: unknown, invalid = 'discord_image_invalid'): never {
  if (err instanceof Error && err.message === 'discord_not_configured')
    throw badRequest('discord_not_configured');
  if (!(err instanceof DiscordError)) throw err;
  if (err.status === HTTP_TOO_MANY) throw new AppError(HTTP_TOO_MANY, 'discord_rate_limited');
  if (err.code === DISCORD_CODES.missingPermissions || err.code === DISCORD_CODES.missingAccess)
    throw new AppError(HTTP_FORBIDDEN, 'discord_missing_permissions');
  if (err.status === HTTP_TOO_LARGE) throw badRequest('discord_image_too_big');
  if (err.code === DISCORD_CODES.invalidFormBody || err.status === HTTP_BAD_REQUEST)
    throw badRequest(invalid);
  throw new AppError(HTTP_BAD_REQUEST, 'discord_failed');
}

const cdnUrl = (
  cdn: string,
  kind: 'icons' | 'banners' | 'avatars',
  owner: string,
  hash: string,
  size: number,
) => `${cdn}/${kind}/${owner}/${hash}.${hash.startsWith(ANIMATED_PREFIX) ? 'gif' : 'png'}?size=${size}`;

export function createAppearance(deps: AppearanceDeps): Appearance {
  const { rest, store, cdn } = deps;
  const guild = async (): Promise<DGuild | null> => {
    const g = deps.guildId();
    return g ? rest<DGuild>('GET', `/guilds/${g}`) : null;
  };
  const me = (): Promise<DUser> => rest<DUser>('GET', '/users/@me');

  const ranksView = (roleIcons: boolean): NonNullable<AppearanceView['ranks']> => {
    const look = rankLook(roleIcons, deps.badges());
    return {
      ...look,
      roles: [...deps.ranks()]
        .sort((a, b) => a.position - b.position)
        .map((r) => {
          const icon = look.look === 'icons' && rankIconOf(r) !== null;
          return {
            id: r.id,
            name: r.name.de,
            symbol: r.symbol,
            colour: r.colour,
            discordName: icon ? r.name.de : discordRoleName(r),
            icon,
            inDiscord: Boolean(store.get(`role:${r.id}`)),
          };
        }),
    };
  };

  const view = async (): Promise<AppearanceView> => {
    const [g, u] = await Promise.all([guild().catch(() => null), me().catch(() => null)]);
    const icon = store.entry(ICON_KEY);
    const avatar = store.entry(AVATAR_KEY);
    return {
      guild: g
        ? {
            name: g.name,
            icon: g.icon ? cdnUrl(cdn, 'icons', g.id, g.icon, PREVIEW_SIZE) : null,
            iconIsLogo: Boolean(g.icon && icon?.id === g.icon && icon.applied?.['source'] === 'logo'),
            banner: g.banner ? cdnUrl(cdn, 'banners', g.id, g.banner, BANNER_SIZE) : null,
            premiumTier: g.premium_tier ?? 0,
            animatedIcon: g.features.includes('ANIMATED_ICON'),
            banners: g.features.includes('BANNER'),
            animatedBanner: g.features.includes('ANIMATED_BANNER'),
            roleIcons: g.features.includes(ROLE_ICONS_FEATURE),
          }
        : null,
      ranks: g ? ranksView(g.features.includes(ROLE_ICONS_FEATURE)) : null,
      bot: u
        ? {
            name: u.username,
            avatar: u.avatar ? cdnUrl(cdn, 'avatars', u.id, u.avatar, PREVIEW_SIZE) : null,
            avatarIsLogo: Boolean(
              u.avatar && avatar?.id === u.avatar && avatar.applied?.['source'] === 'logo',
            ),
          }
        : null,
    };
  };

  const patchGuild = async (body: Record<string, unknown>, reason: string): Promise<DGuild> => {
    const g = deps.guildId();
    if (!g) throw badRequest('discord_no_guild');
    try {
      return await rest<DGuild>('PATCH', `/guilds/${g}`, body, reason);
    } catch (err) {
      return friendlyDiscordError(err);
    }
  };

  const setIcon = async (image: string | 'logo', by: string): Promise<AppearanceView> => {
    const logo = image === 'logo';
    const data = parseImage(logo ? LOGO_DATA_URI : image);
    const g = await guild();
    if (!g) throw badRequest('discord_no_guild');
    if (data.animated && !g.features.includes('ANIMATED_ICON'))
      throw badRequest('discord_animated_needs_boost');
    const after = await patchGuild({ icon: data.dataUri }, `MoinMorni: Server-Symbol (${by})`);
    if (after.icon)
      store.put(ICON_KEY, after.icon, {
        applied: { source: logo ? 'logo' : 'custom', version: LOGO_VERSION, by },
      });
    return view();
  };

  return {
    view,
    setIcon,
    setBanner: async (image, by) => {
      const g = await guild();
      if (!g) throw badRequest('discord_no_guild');
      if (image === null) {
        await patchGuild({ banner: null }, `MoinMorni: Banner entfernt (${by})`);
        store.drop(BANNER_KEY);
        return view();
      }
      if (!g.features.includes('BANNER')) throw badRequest('discord_banner_needs_boost');
      const data = parseImage(image);
      if (data.animated && !g.features.includes('ANIMATED_BANNER'))
        throw badRequest('discord_animated_needs_boost');
      const after = await patchGuild({ banner: data.dataUri }, `MoinMorni: Banner (${by})`);
      if (after.banner) store.put(BANNER_KEY, after.banner, { applied: { by } });
      return view();
    },
    setBot: async (change) => {
      const body: Record<string, unknown> = {};
      if (change.name !== undefined) {
        const name = change.name.trim();
        if (name.length < NAME_MIN || name.length > NAME_MAX || !BOT_NAME.test(name))
          throw badRequest('discord_name_invalid');
        body['username'] = name;
      }
      const logo = change.avatar === 'logo';
      if (change.avatar !== undefined)
        body['avatar'] = parseImage(logo ? LOGO_DATA_URI : (change.avatar ?? '')).dataUri;
      if (!Object.keys(body).length) return view();
      try {
        const after = await rest<DUser>('PATCH', '/users/@me', body);
        if (change.avatar !== undefined && after.avatar)
          store.put(AVATAR_KEY, after.avatar, {
            applied: { source: logo ? 'logo' : 'custom', version: LOGO_VERSION, user: after.id },
          });
      } catch (err) {
        friendlyDiscordError(err, body['username'] ? 'discord_name_invalid' : 'discord_image_invalid');
      }
      return view();
    },
    ensureGuildLogo: async () => {
      const g = await guild();
      if (!g) throw new Error('discord_no_guild');
      const mine = store.entry(ICON_KEY);
      const ours = Boolean(mine && g.icon === mine.id);
      // Ein eigenes Bild (in Discord gesetzt oder im Panel hochgeladen) bleibt.
      if (g.icon && (!ours || mine?.applied?.['source'] !== 'logo')) return 'kept';
      if (ours && mine?.applied?.['version'] === LOGO_VERSION) return 'unchanged';
      const after = await rest<DGuild>(
        'PATCH',
        `/guilds/${g.id}`,
        { icon: LOGO_DATA_URI },
        'MoinMorni: Server-Symbol',
      );
      if (after.icon) store.put(ICON_KEY, after.icon, { applied: { source: 'logo', version: LOGO_VERSION } });
      return 'set';
    },
    ensureBotLogo: async () => {
      const u = await me();
      const mine = store.entry(AVATAR_KEY);
      // Für diesen Bot schon erledigt (Logo gesetzt oder er hatte ein eigenes Bild): nichts tun.
      if (mine?.applied?.['user'] === u.id) return;
      if (u.avatar) {
        store.put(AVATAR_KEY, u.avatar, { applied: { source: 'own', user: u.id } });
        return;
      }
      try {
        const after = await rest<DUser>('PATCH', '/users/@me', { avatar: LOGO_DATA_URI });
        store.put(AVATAR_KEY, after.avatar ?? '-', {
          applied: { source: 'logo', version: LOGO_VERSION, user: u.id },
        });
      } catch (err) {
        deps.log.warn({ err }, 'Discord: Profilbild des Bots nicht gesetzt');
      }
    },
  };
}
