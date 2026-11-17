import { z } from 'zod';

/**
 * Rollen-Vorlage: eine Stelle für Spiel, Panel und Discord. Wer einen Rang bekommt, bekommt ihn überall –
 * Symbol und Farbe im Chat und über dem Kopf, Rechte im Spiel, Bereiche im Panel, Rolle mit Rechten in Discord.
 * Philip kann alles im Panel ändern; das hier ist der Startpunkt.
 */

export const ROLE_IDS = [
  'owner',
  'admin',
  'moderator',
  'supporter',
  'builder',
  'media',
  'vip',
  'player',
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** Bereiche im Panel. */
export const PANEL_AREAS = [
  'overview',
  'modes',
  'lobby',
  'players',
  'punishments',
  'chat',
  'voice',
  'roles',
  'content',
  'discord',
  'updates',
  'servers',
  'build',
  'settings',
] as const;
export type PanelArea = (typeof PANEL_AREAS)[number];

/**
 * Rechte im Spiel. Strafen, Ränge, Sprachchat und Party prüft der Hub selbst (Befehle des Netzwerks); auf jedem
 * Spielserver übersetzt das Netzwerk-Plugin den Rest in Rechte des Servers (plugins/moinmorni-network,
 * paper/Rights.java): Teleport, Zuschauen und Spielmodus als Minecraft-Befehle (Kreativ nur mit „creative“),
 * „modes-admin“ als die Verwaltungs-Rechte der Spielmodi dort (jedes Recht eines Modus, das auf „.admin“ endet),
 * „admin“ als alles, was ein Operator über Rechte bekäme – ohne OP zu vergeben.
 */
export const GAME_RIGHTS = [
  'kick',
  'ban',
  'mute',
  'jail',
  'warn',
  'teleport',
  'vanish',
  'spectate',
  'inspect',
  'voice-join-any',
  'voice-mute',
  'build',
  'worldedit',
  'lobby-edit',
  'gamemode',
  'creative',
  'streamer',
  'reserved-slot',
  'bigger-party',
  'lobby-extras',
  'lobby-fly',
  'chat-colour',
  'maintenance-join',
  'ranks',
  'modes-admin',
  'admin',
] as const;
export type GameRight = (typeof GAME_RIGHTS)[number];

/** Rechte der Discord-Rolle. */
export const DISCORD_RIGHTS = [
  'administrator',
  'manage-server',
  'manage-messages',
  'timeout',
  'tickets',
  'team-area',
  'builder-area',
  'media-area',
  'vip-area',
  'links',
] as const;
export type DiscordRight = (typeof DISCORD_RIGHTS)[number];

const HEX_COLOUR_LENGTH = 7;
// A colour as #rrggbb: accepts "#ff5555", rejects "ff5555" and "#f55".
// https://regex101.com/?flavor=javascript&regex=%5E%23%5B0-9a-fA-F%5D%7B6%7D%24&testString=%23ff5555
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const NAME_MAX = 24;
const SYMBOL_MAX = 4;

export const roleSchema = z.object({
  id: z.string().min(1).max(NAME_MAX),
  name: z.object({ de: z.string().min(1).max(NAME_MAX), en: z.string().min(1).max(NAME_MAX) }),
  /** Zeichen vor dem Namen (leer = keins). */
  symbol: z.string().max(SYMBOL_MAX),
  colour: z.string().length(HEX_COLOUR_LENGTH).regex(HEX_COLOUR),
  panel: z.array(z.enum(PANEL_AREAS)),
  game: z.array(z.enum(GAME_RIGHTS)),
  discord: z.array(z.enum(DISCORD_RIGHTS)),
  /** Kleiner = höher (Owner 0). Niemand vergibt Ränge über dem eigenen. */
  position: z.number().int().min(0),
  /** Rang für alle, die keinen anderen haben. */
  fallback: z.boolean(),
});
export type Role = z.infer<typeof roleSchema>;

const EVERY_PANEL_AREA: PanelArea[] = [...PANEL_AREAS];
const EVERY_GAME_RIGHT: GameRight[] = [...GAME_RIGHTS];
const TEAM_GAME_RIGHTS: GameRight[] = [
  'kick',
  'ban',
  'mute',
  'jail',
  'warn',
  'teleport',
  'vanish',
  'spectate',
  'inspect',
  'voice-join-any',
  'voice-mute',
  'lobby-fly',
  'maintenance-join',
];
/**
 * Supporter helfen Spielern: verwarnen, stummschalten (auch im Sprachchat), hinreisen, zuschauen, ansehen – aber
 * nicht bannen, einsperren oder rauswerfen (das bleibt beim Moderator).
 */
export const SUPPORTER_GAME_RIGHTS: readonly GameRight[] = [
  'mute',
  'warn',
  'teleport',
  'spectate',
  'inspect',
  'voice-mute',
  'lobby-fly',
  'maintenance-join',
];
/** „In der Lobby fliegen“ gibt es ab VIP – für VIP und alle Ränge darüber (Philip, 17.11.). */
export const LOBBY_FLY_RIGHT = 'lobby-fly' satisfies GameRight;
const VIP_GAME_RIGHTS: GameRight[] = [
  'reserved-slot',
  'bigger-party',
  'lobby-extras',
  'lobby-fly',
  'chat-colour',
];

/**
 * Die Vorlage, mit der MoinMorni startet (Philip, 14.11.: Owner, Admin, Moderator, Builder, Media, VIP, Spieler;
 * 16.11. Supporter dazu, zwischen Moderator und Builder). Das ganze Team – auch Builder und Media – kommt immer
 * hinein („Teammitglieder müssen automatisch da sein“, Philip 16.11.).
 */
export const DEFAULT_ROLES: readonly Role[] = [
  {
    id: 'owner',
    name: { de: 'Owner', en: 'Owner' },
    symbol: '♛',
    colour: '#ff5555',
    panel: EVERY_PANEL_AREA,
    game: EVERY_GAME_RIGHT,
    discord: ['administrator'],
    position: ROLE_IDS.indexOf('owner'),
    fallback: false,
  },
  {
    id: 'admin',
    name: { de: 'Admin', en: 'Admin' },
    symbol: '✦',
    colour: '#ff9f43',
    // Alles außer: Owner/Admin vergeben, Vorlage für Owner/Admin, Bot verbinden, Server löschen (prüft der Server).
    panel: EVERY_PANEL_AREA,
    game: EVERY_GAME_RIGHT.filter((r) => r !== 'admin'),
    discord: ['manage-server', 'manage-messages', 'timeout', 'tickets', 'team-area', 'links'],
    position: ROLE_IDS.indexOf('admin'),
    fallback: false,
  },
  {
    id: 'moderator',
    name: { de: 'Moderator', en: 'Moderator' },
    symbol: '⚔',
    colour: '#55aaff',
    panel: ['overview', 'players', 'punishments'],
    game: TEAM_GAME_RIGHTS,
    discord: ['manage-messages', 'timeout', 'tickets', 'team-area', 'links'],
    position: ROLE_IDS.indexOf('moderator'),
    fallback: false,
  },
  {
    id: 'supporter',
    name: { de: 'Supporter', en: 'Supporter' },
    // Grünes Schild mit weißem Plus (Abzeichen „plus“); ein satteres Grün als Builder (#55ff55), damit man beide
    // im Chat und über dem Kopf auseinanderhält.
    symbol: '✚',
    colour: '#22c55e',
    // Strafen-Seite: das Panel prüft jede Strafe einzeln (`mayPunish`) – der Supporter verwarnt und schaltet stumm,
    // bannen, einsperren und rauswerfen bleiben gesperrt.
    panel: ['overview', 'players', 'punishments'],
    game: [...SUPPORTER_GAME_RIGHTS],
    discord: ['tickets', 'team-area', 'links'],
    position: ROLE_IDS.indexOf('supporter'),
    fallback: false,
  },
  {
    id: 'builder',
    name: { de: 'Builder', en: 'Builder' },
    symbol: '⚒',
    colour: '#55ff55',
    panel: ['overview', 'build'],
    game: ['build', 'worldedit', 'lobby-edit', 'gamemode', 'creative', 'lobby-fly', 'maintenance-join'],
    discord: ['builder-area', 'links'],
    position: ROLE_IDS.indexOf('builder'),
    fallback: false,
  },
  {
    id: 'media',
    name: { de: 'Media', en: 'Media' },
    symbol: '▶',
    colour: '#ff6ad5',
    panel: [],
    game: ['streamer', ...VIP_GAME_RIGHTS, 'maintenance-join'],
    discord: ['media-area', 'links'],
    position: ROLE_IDS.indexOf('media'),
    fallback: false,
  },
  {
    id: 'vip',
    name: { de: 'VIP', en: 'VIP' },
    symbol: '★',
    colour: '#ffd23f',
    panel: [],
    game: VIP_GAME_RIGHTS,
    discord: ['vip-area'],
    position: ROLE_IDS.indexOf('vip'),
    fallback: false,
  },
  {
    id: 'player',
    name: { de: 'Spieler', en: 'Player' },
    symbol: '',
    colour: '#aaaaaa',
    panel: [],
    game: [],
    discord: [],
    position: ROLE_IDS.indexOf('player'),
    fallback: true,
  },
];

/**
 * Strafen und das Recht im Spiel, das jede braucht – im Panel gilt dasselbe wie beim Befehl (/ban → „ban“,
 * /voicemute → „voice-mute“). voice = im Sprachchat stumm.
 */
export const PUNISHMENT_RIGHTS = {
  warn: 'warn',
  mute: 'mute',
  voice: 'voice-mute',
  jail: 'jail',
  ban: 'ban',
  kick: 'kick',
} as const satisfies Record<string, GameRight>;
export type PunishmentKind = keyof typeof PUNISHMENT_RIGHTS;

/** Darf jemand mit dieser Rolle die Strafe verhängen und aufheben? Der Owner darf alles. */
export function mayPunish(role: Pick<Role, 'id' | 'game'>, kind: PunishmentKind): boolean {
  return role.id === 'owner' || role.game.includes(PUNISHMENT_RIGHTS[kind]);
}

const OWNER_ID = 'owner';

/**
 * Strafen nur nach unten (Philip, 16.11.): Wer jemanden bestrafen will – verwarnen, stummschalten (Chat und
 * Sprachchat), einsperren, rauswerfen, bannen, und auch aufheben –, braucht einen höheren Rang als die Person. Den
 * Owner bestraft niemand, auch kein anderer Owner; der Owner darf alle anderen (auch Admins). Mit dem Rang zählt der
 * Rang im Spiel: eigener Rang oder Team-Konto mit verbundenem Minecraft-Konto, der höhere (siehe `higherRole`).
 * Ob die Rolle die Strafe überhaupt verhängen darf, sagt `mayPunish`.
 */
export function mayPunishPlayer(
  actor: Pick<Role, 'id' | 'position'>,
  target: Pick<Role, 'id' | 'position'>,
): boolean {
  if (target.id === OWNER_ID) return false;
  if (actor.id === OWNER_ID) return true;
  return target.position > actor.position;
}

/**
 * Aufheben gilt wie Verhängen – nur der Owner darf jede Strafe aufheben, auch eine alte auf einem Owner (sonst
 * käme niemand mehr an sie heran).
 */
export function mayLiftFor(
  actor: Pick<Role, 'id' | 'position'>,
  target: Pick<Role, 'id' | 'position'>,
): boolean {
  return actor.id === OWNER_ID || mayPunishPlayer(actor, target);
}

/** Wer darf jemanden mit diesem Rang so bestrafen? Für den Hinweis „das darf nur der Owner“ (höchste zuerst). */
export function punishersOf<R extends Pick<Role, 'id' | 'game' | 'position'>>(
  roles: readonly R[],
  target: Pick<Role, 'id' | 'position'>,
  kind: PunishmentKind,
): R[] {
  return roles
    .filter((r) => mayPunish(r, kind) && mayPunishPlayer(r, target))
    .sort((a, b) => a.position - b.position);
}

/** Der höhere von zwei Rängen (kleinere Position; bei Gleichstand der erste). */
export function higherRole<R extends Pick<Role, 'position'>>(a: R, b: R | undefined): R {
  return b && b.position < a.position ? b : a;
}

/** Rollen, die nur Owner vergeben oder in der Vorlage ändern dürfen. */
export const OWNER_ONLY_ROLES: readonly string[] = ['owner', 'admin'];
/** Diese Ränge vergibt nur der Owner – VIP „vergibt nur Philip, nie ein Shop“. */
export const OWNER_ASSIGNS: readonly string[] = [...OWNER_ONLY_ROLES, 'vip'];

/** Darf jemand mit Rolle `actor` die Rolle `target` vergeben? Niemand über (oder gleich) dem eigenen Rang, außer Owner. */
export function mayAssign(roles: readonly Role[], actor: string, target: string): boolean {
  const a = roles.find((r) => r.id === actor);
  const t = roles.find((r) => r.id === target);
  if (!a || !t) return false;
  if (a.id === 'owner') return true;
  if (OWNER_ASSIGNS.includes(t.id)) return false;
  return t.position > a.position;
}

/**
 * Das Team kommt immer hinein: auch während der Wartung und in Modi „nur auf Einladung“ (MorniCraft) ohne Eintrag
 * in der Whitelist. Wer dazugehört, entscheidet dieses eine Recht im Rang – der Hub lässt danach hinein, und die
 * Whitelist im Panel zeigt genau diese Leute von selbst mit.
 */
export const ALWAYS_IN_RIGHT = 'maintenance-join' satisfies GameRight;

/** Kommt jemand mit diesem Rang immer hinein (Wartung, nur auf Einladung)? */
export function alwaysIn(role: Pick<Role, 'game'>): boolean {
  return role.game.includes(ALWAYS_IN_RIGHT);
}
