import { z } from 'zod';

/**
 * Rollen-Vorlage: eine Stelle für Spiel, Panel und Discord. Wer einen Rang bekommt, bekommt ihn überall –
 * Symbol und Farbe im Chat und über dem Kopf, Rechte im Spiel, Bereiche im Panel, Rolle mit Rechten in Discord.
 * Philip kann alles im Panel ändern; das hier ist der Startpunkt.
 */

export const ROLE_IDS = ['owner', 'admin', 'moderator', 'builder', 'media', 'vip', 'player'] as const;
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

/** Rechte im Spiel (das Netzwerk-Plugin übersetzt sie in Plugin- und Minecraft-Rechte). */
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
  'chat-colour',
  'maintenance-join',
  'ranks',
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
const TEAM_GAME_RIGHTS: GameRight[] = ['kick', 'ban', 'mute', 'jail', 'warn', 'teleport', 'vanish', 'spectate', 'inspect', 'voice-join-any', 'voice-mute', 'maintenance-join'];
const VIP_GAME_RIGHTS: GameRight[] = ['reserved-slot', 'bigger-party', 'lobby-extras', 'chat-colour'];

/** Die Vorlage, mit der MoinMorni startet (Philip, 14.11.: Owner, Admin, Moderator, Builder, Media, VIP, Spieler). */
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
    id: 'builder',
    name: { de: 'Builder', en: 'Builder' },
    symbol: '⚒',
    colour: '#55ff55',
    panel: ['overview', 'build'],
    game: ['build', 'worldedit', 'lobby-edit', 'gamemode', 'creative'],
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
    game: ['streamer', ...VIP_GAME_RIGHTS],
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

/** Rollen, die nur Owner vergeben oder in der Vorlage ändern dürfen. */
export const OWNER_ONLY_ROLES: readonly string[] = ['owner', 'admin'];

/** Darf jemand mit Rolle `actor` die Rolle `target` vergeben? Niemand über (oder gleich) dem eigenen Rang, außer Owner. */
export function mayAssign(roles: readonly Role[], actor: string, target: string): boolean {
  const a = roles.find((r) => r.id === actor);
  const t = roles.find((r) => r.id === target);
  if (!a || !t) return false;
  if (a.id === 'owner') return true;
  if (OWNER_ONLY_ROLES.includes(t.id)) return false;
  return t.position > a.position;
}
