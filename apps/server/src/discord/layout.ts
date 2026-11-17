/* eslint-disable ts-patterns/no-magic-numbers -- Discord-Rechte sind Bit-Nummern aus der Discord-Doku */
import type { DiscordRight, Role } from '@moinmorni/shared';

/**
 * So sieht der MoinMorni-Discord aus: Rollen aus der Rollen-Vorlage (+ „Bot“, „Verbunden“, „Stumm“, „Gefängnis“),
 * Kategorien und Kanäle mit Emoji und Rechten. Der Bot legt fehlendes an, übernimmt Vorhandenes gleichen Namens und
 * lässt stehen, was jemand in Discord selbst umbenannt oder verschoben hat (discord/setup.ts).
 * Rechte: https://docs.discord.com/developers/topics/permissions
 */

const bit = (n: number): bigint => 1n << BigInt(n);
export const PERM = {
  createInvite: bit(0),
  banMembers: bit(2),
  administrator: bit(3),
  manageChannels: bit(4),
  manageGuild: bit(5),
  addReactions: bit(6),
  viewChannel: bit(10),
  sendMessages: bit(11),
  manageMessages: bit(13),
  embedLinks: bit(14),
  attachFiles: bit(15),
  readHistory: bit(16),
  connect: bit(20),
  speak: bit(21),
  manageRoles: bit(28),
  manageThreads: bit(34),
  createPrivateThreads: bit(36),
  sendInThreads: bit(38),
  moderateMembers: bit(40),
} as const;
export type PermName = keyof typeof PERM;

export const CHANNEL_TEXT = 0;
export const CHANNEL_VOICE = 2;
export const CHANNEL_CATEGORY = 4;
export const OVERWRITE_ROLE = 0;
export const OVERWRITE_MEMBER = 1;

/** Rechte, die eine Rolle server-weit bekommt (Bereiche wie „team-area“ wirken über die Kanäle). */
const RIGHT_PERMS: Partial<Record<DiscordRight, bigint>> = {
  administrator: PERM.administrator,
  'manage-server': PERM.manageGuild,
  'manage-messages': PERM.manageMessages | PERM.manageThreads,
  timeout: PERM.moderateMembers,
};

export const rolePermissions = (role: Role): bigint =>
  role.discord.reduce((acc, r) => acc | (RIGHT_PERMS[r] ?? 0n), 0n);

/** Name in Discord: Rollen-Symbole gibt es erst ab Boost-Stufe 2 – darum steht das Symbol im Namen. */
export const discordRoleName = (role: Role): string =>
  role.symbol ? `${role.symbol} ${role.name.de}` : role.name.de;

export const colourInt = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/** Team-Rollen stehen in der Mitgliederliste getrennt (alles mit Panel-Zugang). */
export const isTeam = (role: Role): boolean => role.panel.length > 0;

/** Rollen neben den Rängen, in dieser Reihenfolge unter den Rängen. */
export const EXTRA_ROLES = [
  { key: 'bot', name: '🤖 Bot', colour: 0x10b981, hoist: true },
  { key: 'linked', name: '✔ Verbunden', colour: 0x3ddc84, hoist: false },
  { key: 'muted', name: '🔇 Stumm', colour: 0x6b7280, hoist: false },
  { key: 'jail', name: '⛓ Gefängnis', colour: 0x4b5563, hoist: false },
] as const;
export type ExtraRole = (typeof EXTRA_ROLES)[number]['key'];

/** Wer einen Kanal sehen darf. */
export type Audience = 'everyone' | 'team' | 'builder' | 'media' | 'vip' | 'jail';

export interface ChannelSpec {
  readonly key: string;
  readonly name: string;
  readonly type: typeof CHANNEL_TEXT | typeof CHANNEL_VOICE;
  readonly topic?: string;
  readonly audience: Audience;
  /** Nur lesen (Info-Kanäle); das Team darf schreiben. */
  readonly readOnly?: boolean;
}

export interface CategorySpec {
  readonly key: string;
  readonly name: string;
  readonly audience: Audience;
  readonly channels: readonly ChannelSpec[];
}

const text = (key: string, name: string, topic: string, audience: Audience = 'everyone', readOnly = false) =>
  ({ key, name, type: CHANNEL_TEXT, topic, audience, readOnly }) as const;
const voice = (key: string, name: string, audience: Audience = 'everyone') =>
  ({ key, name, type: CHANNEL_VOICE, audience }) as const;

/** Sprachkanäle aus den Sprachchat-Einstellungen haben Schlüssel „voice-0“, „voice-1“ … */
export const VOICE_KEY_PREFIX = 'voice-';

/** Die Kanäle. Sprachkanäle kommen aus den Voice-Einstellungen (gleiche Namen wie im Spiel). */
export function layout(voiceChannels: readonly string[]): CategorySpec[] {
  return [
    {
      key: 'info',
      name: '📢 Info',
      audience: 'everyone',
      channels: [
        text('welcome', '👋・willkommen', 'Servus! Adresse, Regeln und wie du loslegst.', 'everyone', true),
        text('rules', '📜・regeln', 'Unsere Regeln – im Spiel und hier.', 'everyone', true),
        text('announcements', '📣・ankündigungen', 'Ankündigungen vom Team.', 'everyone', true),
        text('news', '📰・news', 'Neuigkeiten von der Webseite – kommen von selbst.', 'everyone', true),
        text(
          'status',
          '🟢・status',
          'Wer gerade spielt und welche Modi offen sind – aktualisiert sich selbst.',
          'everyone',
          true,
        ),
        text('modes', '🎮・spielmodi', 'Alle Spielmodi – mit Link zur Webseite.', 'everyone', true),
      ],
    },
    {
      key: 'community',
      name: '💬 Community',
      audience: 'everyone',
      channels: [
        text('general', '💬・chat', 'Plaudern über alles.'),
        text('screenshots', '📸・bilder-und-clips', 'Zeig deine schönsten Bauten, Bilder und Clips.'),
        text('ideas', '💡・vorschläge', 'Ideen für das Netzwerk.'),
      ],
    },
    {
      key: 'support',
      name: '🎫 Hilfe',
      audience: 'everyone',
      channels: [
        text('help', '❓・hilfe', 'Fragen? Schreib /hilfe – oder öffne ein Ticket.', 'everyone', true),
        text(
          'tickets',
          '🎫・tickets',
          'Knopf drücken: ein privater Kanal nur für dich und das Team.',
          'everyone',
          true,
        ),
        text('apply', '📝・bewerbungen', 'Bewirb dich fürs Team oder für MorniCraft.', 'everyone', true),
      ],
    },
    {
      key: 'voice',
      name: '🔊 Sprache',
      audience: 'everyone',
      channels: voiceChannels.map((name, i) => voice(`${VOICE_KEY_PREFIX}${i}`, name)),
    },
    {
      key: 'vip',
      name: '★ VIP',
      audience: 'vip',
      channels: [text('vip', '★・vip-lounge', 'Für VIPs und Media.', 'vip')],
    },
    {
      key: 'builder',
      name: '⚒ Bauteam',
      audience: 'builder',
      channels: [
        text('builder', '⚒・bauteam', 'Planung und Bauten.', 'builder'),
        voice('builder-voice', '⚒ Bauteam', 'builder'),
      ],
    },
    {
      key: 'team',
      name: '🛡 Team',
      audience: 'team',
      channels: [
        text('team', '🛡・team-chat', 'Nur fürs Team.', 'team'),
        text('teamlog', '📋・team-log', 'Meldungen und was im Netzwerk passiert.', 'team'),
        text('applications', '📥・bewerbungs-eingang', 'Neue Bewerbungen – annehmen oder ablehnen.', 'team'),
        text('punishlog', '⚖・strafen-log', 'Alle Strafen – im Spiel und hier.', 'team'),
        voice('team-voice', '🛡 Team', 'team'),
      ],
    },
    {
      key: 'jail',
      name: '⛓ Gefängnis',
      audience: 'jail',
      channels: [text('jail', '⛓・gefängnis', 'Hier wartest du, bis deine Strafe vorbei ist.', 'jail')],
    },
  ];
}

export interface Overwrite {
  readonly id: string;
  readonly type: number;
  readonly allow: string;
  readonly deny: string;
}

const VIEW = PERM.viewChannel;
const WRITE = PERM.sendMessages | PERM.addReactions | PERM.sendInThreads | PERM.createPrivateThreads;
const VOICE = PERM.connect | PERM.speak;

/** Was der Bot selbst tut: Rollen und Kanäle anlegen, Server-Bild, Einladung, Bann, Timeout, Nachrichten, Tickets. */
const BOT_NEEDS =
  PERM.manageRoles |
  PERM.manageChannels |
  PERM.manageGuild |
  PERM.createInvite |
  PERM.banMembers |
  PERM.moderateMembers |
  PERM.viewChannel |
  PERM.sendMessages |
  PERM.embedLinks |
  PERM.readHistory |
  PERM.addReactions |
  PERM.manageThreads |
  PERM.createPrivateThreads |
  PERM.sendInThreads;

/** Der Bot selbst in jedem seiner Kanäle (auch in denen, die @everyone nicht sieht). */
const BOT_IN_CHANNEL =
  VIEW |
  WRITE |
  PERM.embedLinks |
  PERM.readHistory |
  PERM.manageThreads |
  PERM.manageRoles |
  PERM.manageChannels |
  VOICE;

/**
 * Genau die Rechte, die der Bot für die Einrichtung braucht: was er selbst tut, was in den Kanal-Rechten steht und was
 * die Rollen der Vorlage in Discord bekommen (Discord lässt einen Bot nur Rechte vergeben, die er selbst hat).
 * „Administrator“ nie – den bekommt eine Rolle nur, wenn du ihn in Discord selbst setzt.
 */
export function invitePermissions(roles: readonly Role[]): bigint {
  const fromRoles = roles.reduce((acc, r) => acc | rolePermissions(r), 0n) & ~PERM.administrator;
  return BOT_NEEDS | VIEW | WRITE | VOICE | PERM.readHistory | fromRoles;
}

/** Die Namen der Rechte in einem Bitfeld (fürs Panel: welche Rechte, welche fehlen). */
export function permNames(bits: bigint): PermName[] {
  return (Object.keys(PERM) as PermName[]).filter((name) => (bits & PERM[name]) === PERM[name]);
}

export interface RoleIds {
  readonly everyone: string;
  /** Rollen, die eine Zielgruppe sehen darf (z. B. team → Owner, Admin, Moderator). */
  readonly audience: (a: Audience) => readonly string[];
  readonly team: readonly string[];
  readonly muted: string;
  readonly jail: string;
  /** „✔ Verbunden“ (Minecraft-Konto verbunden): nur damit schreibt und redet man in offenen Kanälen; null = noch keine. */
  readonly linked: string | null;
  /** Der Bot selbst (Nutzer-ID): sieht und schreibt in jedem seiner Kanäle. */
  readonly bot: string | null;
}

/** Rechte eines Kanals: wer sieht ihn, wer schreibt, Stumm/Gefängnis gesperrt, der Bot immer dabei. */
export function overwritesFor(audience: Audience, readOnly: boolean, ids: RoleIds): Overwrite[] {
  const allow = (id: string, perms: bigint): Overwrite => ({
    id,
    type: OVERWRITE_ROLE,
    allow: perms.toString(),
    deny: '0',
  });
  const deny = (id: string, perms: bigint): Overwrite => ({
    id,
    type: OVERWRITE_ROLE,
    allow: '0',
    deny: perms.toString(),
  });
  const bot: Overwrite[] = ids.bot
    ? [{ id: ids.bot, type: OVERWRITE_MEMBER, allow: BOT_IN_CHANNEL.toString(), deny: '0' }]
    : [];
  // Gefängnis: nur die Gefängnis-Rolle (und das Team, das nach dem Rechten schaut).
  const jail = [
    deny(ids.everyone, VIEW),
    allow(ids.jail, VIEW | PERM.sendMessages | PERM.readHistory),
    ...ids.team.map((id) => allow(id, VIEW | PERM.sendMessages | PERM.readHistory)),
  ];
  const visible =
    audience === 'everyone'
      ? [deny(ids.jail, VIEW)]
      : [deny(ids.everyone, VIEW), ...ids.audience(audience).map((id) => allow(id, VIEW | PERM.readHistory))];
  // Nur lesen: schreiben nur das Team. Offene Kanäle für alle: schreiben und reden nur mit verbundenem
  // Minecraft-Konto (und das Team) – wer nicht verbunden ist, liest mit und hört zu.
  const linkedOnly = !readOnly && audience === 'everyone' && ids.linked !== null;
  const writing = readOnly
    ? [deny(ids.everyone, WRITE), ...ids.team.map((id) => allow(id, VIEW | WRITE))]
    : linkedOnly
      ? [
          deny(ids.everyone, WRITE | PERM.speak),
          allow(ids.linked ?? ids.everyone, WRITE | PERM.speak),
          ...ids.team.map((id) => allow(id, WRITE | PERM.speak)),
        ]
      : [];
  const muted = deny(ids.muted, WRITE | VOICE);
  const all = audience === 'jail' ? jail : [...visible, ...writing, muted];
  // Gleiche Rolle zweimal → zusammenfassen (Discord nimmt pro Rolle nur einen Eintrag).
  const merged = new Map<string, { type: number; allow: bigint; deny: bigint }>();
  [...all, ...bot].forEach((o) => {
    const before = merged.get(o.id) ?? { type: o.type, allow: 0n, deny: 0n };
    merged.set(o.id, {
      type: o.type,
      allow: before.allow | BigInt(o.allow),
      deny: before.deny | BigInt(o.deny),
    });
  });
  return [...merged.entries()].map(([id, p]) => ({
    id,
    type: p.type,
    allow: p.allow.toString(),
    deny: p.deny.toString(),
  }));
}

/** Nur Rechte, die der Bot selbst hat (Discord lehnt sonst die ganze Änderung ab). */
export function withinBot(overwrites: readonly Overwrite[], botPerms: bigint): Overwrite[] {
  if ((botPerms & PERM.administrator) !== 0n) return [...overwrites];
  return overwrites.map((o) => ({
    ...o,
    allow: (BigInt(o.allow) & botPerms).toString(),
    deny: (BigInt(o.deny) & botPerms).toString(),
  }));
}
