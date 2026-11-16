/* eslint-disable ts-patterns/no-magic-numbers -- Discord-Rechte sind Bit-Nummern aus der Discord-Doku */
import type { DiscordRight, Role } from '@morninet/shared';

/**
 * So sieht der morni.net-Discord aus: Rollen aus der Rollen-Vorlage (+ „Verbunden“, „Stumm“, „Gefängnis“),
 * Kategorien und Kanäle mit Rechten. Der Bot legt fehlendes an und lässt Vorhandenes stehen (gleicher Name).
 * Rechte: https://docs.discord.com/developers/topics/permissions
 */

const bit = (n: number): bigint => 1n << BigInt(n);
export const PERM = {
  administrator: bit(3),
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
  useCommands: bit(31),
  manageThreads: bit(34),
  createPrivateThreads: bit(36),
  sendInThreads: bit(38),
  moderateMembers: bit(40),
} as const;

export const CHANNEL_TEXT = 0;
export const CHANNEL_VOICE = 2;
export const CHANNEL_CATEGORY = 4;
const OVERWRITE_ROLE = 0;

/** Rechte, die eine Rolle server-weit bekommt (Bereiche wie „team-area“ wirken über die Kanäle). */
const RIGHT_PERMS: Partial<Record<DiscordRight, bigint>> = {
  administrator: PERM.administrator,
  'manage-server': PERM.manageGuild,
  'manage-messages': PERM.manageMessages | PERM.manageThreads,
  timeout: PERM.moderateMembers,
};

export const rolePermissions = (role: Role): string =>
  role.discord.reduce((acc, r) => acc | (RIGHT_PERMS[r] ?? 0n), 0n).toString();

/** Name in Discord: Rollen-Symbole gibt es erst ab Boost-Stufe 2 – darum steht das Symbol im Namen. */
export const discordRoleName = (role: Role): string =>
  role.symbol ? `${role.symbol} ${role.name.de}` : role.name.de;

export const colourInt = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/** Team-Rollen stehen in der Mitgliederliste getrennt (alles mit Panel-Zugang). */
export const isTeam = (role: Role): boolean => role.panel.length > 0;

export const EXTRA_ROLES = [
  { key: 'linked', name: '✔ Verbunden', colour: 0x3ddc84 },
  { key: 'muted', name: '🔇 Stumm', colour: 0x6b7280 },
  { key: 'jail', name: '⛓ Gefängnis', colour: 0x4b5563 },
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

/** Die Kanäle. Sprachkanäle kommen aus den Voice-Einstellungen (gleiche Namen wie im Spiel). */
export function layout(voiceChannels: readonly string[]): CategorySpec[] {
  return [
    {
      key: 'info',
      name: '📢 Info',
      audience: 'everyone',
      channels: [
        text('welcome', '👋・willkommen', 'Servus! Hier geht es los.', 'everyone', true),
        text('rules', '📜・regeln', 'Unsere Regeln – im Spiel und hier.', 'everyone', true),
        text('news', '📣・ankündigungen', 'Neuigkeiten von morni.net.', 'everyone', true),
        text(
          'status',
          '🟢・status',
          'Wer gerade spielt und welche Modi offen sind – aktualisiert sich selbst.',
          'everyone',
          true,
        ),
      ],
    },
    {
      key: 'community',
      name: '💬 Community',
      audience: 'everyone',
      channels: [
        text('general', '💬・allgemein', 'Plaudern über alles.'),
        text('screenshots', '📸・bilder', 'Zeig deine schönsten Bauten und Momente.'),
        text('lfg', '🎮・mitspieler-suche', 'Wer spielt mit? Duels, Party, Burgverlies …'),
        text('ideas', '💡・vorschläge', 'Ideen für das Netzwerk.'),
      ],
    },
    {
      key: 'support',
      name: '🎫 Hilfe',
      audience: 'everyone',
      channels: [text('help', '🎫・hilfe', 'Frag uns – oder öffne ein Ticket.', 'everyone', true)],
    },
    {
      key: 'voice',
      name: '🔊 Sprachkanäle',
      audience: 'everyone',
      channels: voiceChannels.map((name, i) => voice(`voice-${i}`, name)),
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
        text('teamlog', '📋・team-log', 'Strafen, Meldungen und was im Netzwerk passiert.', 'team'),
        text('applications', '📝・bewerbungen', 'Bewerbungen für MorniCraft.', 'team'),
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

export interface RoleIds {
  readonly everyone: string;
  /** Rollen, die eine Zielgruppe sehen darf (z. B. team → Owner, Admin, Moderator). */
  readonly audience: (a: Audience) => readonly string[];
  readonly team: readonly string[];
  readonly muted: string;
  readonly jail: string;
}

/** Rechte eines Kanals: wer sieht ihn, wer schreibt, Stumm/Gefängnis gesperrt. */
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
  if (audience === 'jail')
    return [deny(ids.everyone, VIEW), allow(ids.jail, VIEW | PERM.sendMessages | PERM.readHistory)];
  const visible =
    audience === 'everyone'
      ? [deny(ids.jail, VIEW)]
      : [deny(ids.everyone, VIEW), ...ids.audience(audience).map((id) => allow(id, VIEW | PERM.readHistory))];
  const writing = readOnly
    ? [deny(ids.everyone, WRITE), ...ids.team.map((id) => allow(id, VIEW | WRITE))]
    : [];
  const muted = deny(ids.muted, WRITE | VOICE);
  // Gleiche Rolle zweimal → zusammenfassen (Discord nimmt pro Rolle nur einen Eintrag).
  const merged = new Map<string, { allow: bigint; deny: bigint }>();
  [...visible, ...writing, muted].forEach((o) => {
    const before = merged.get(o.id) ?? { allow: 0n, deny: 0n };
    merged.set(o.id, { allow: before.allow | BigInt(o.allow), deny: before.deny | BigInt(o.deny) });
  });
  return [...merged.entries()].map(([id, p]) => ({
    id,
    type: OVERWRITE_ROLE,
    allow: p.allow.toString(),
    deny: p.deny.toString(),
  }));
}
