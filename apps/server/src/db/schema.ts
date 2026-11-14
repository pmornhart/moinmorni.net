import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import type { Mode, Role } from '@moinmorni/shared';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const createdAt = () => text('created_at').notNull().default(now);

/** Werte aus dem Einstellungs-Katalog (Bereich + Schlüssel); fehlt eine Zeile, gilt der Standard. */
export const settingValues = sqliteTable(
  'setting_values',
  {
    area: text('area').notNull(),
    key: text('key').notNull(),
    value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
    updatedAt: text('updated_at').notNull().default(now),
    /** Wer zuletzt geändert hat: Team-Name im Panel oder Spielername im Spiel. */
    updatedBy: text('updated_by'),
  },
  (t) => [primaryKey({ columns: [t.area, t.key] })],
);

/** Die Rollen-Vorlage (Start: DEFAULT_ROLES). */
export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<Role>().notNull(),
  updatedAt: text('updated_at').notNull().default(now),
});

/** Spielmodi (Start: DEFAULT_MODES). */
export const modes = sqliteTable('modes', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<Mode>().notNull(),
  updatedAt: text('updated_at').notNull().default(now),
});

/** Team-Mitglieder: Konto im Motor (Passkeys, 2FA) → Rolle in MoinMorni. */
export const teamMembers = sqliteTable('team_members', {
  motorUserId: integer('motor_user_id').primaryKey(),
  username: text('username').notNull(),
  roleId: text('role_id').notNull(),
  /** Minecraft-Konto, das im Motor verbunden ist – dort gilt die Team-Rolle auch im Spiel. */
  minecraftUuid: text('minecraft_uuid'),
  createdAt: createdAt(),
});

/** Spieler, die je im Netzwerk waren (Java-UUID oder Floodgate-UUID für Bedrock). */
export const players = sqliteTable(
  'players',
  {
    uuid: text('uuid').primaryKey(),
    name: text('name').notNull(),
    /** Vergebener Rang; null = Rang „für alle anderen“. */
    roleId: text('role_id'),
    /** Selbst gewählte Sprache (/sprache); null = nach dem Client. */
    language: text('language'),
    /** Zuletzt gemeldete Sprache des Clients (für Meldungen schon bei der Anmeldung). */
    clientLocale: text('client_locale'),
    bedrock: integer('bedrock', { mode: 'boolean' }).notNull().default(false),
    privateProfile: integer('private_profile', { mode: 'boolean' }).notNull().default(false),
    discordId: text('discord_id'),
    firstSeen: text('first_seen').notNull().default(now),
    lastSeen: text('last_seen').notNull().default(now),
    playMinutes: integer('play_minutes').notNull().default(0),
  },
  (t) => [index('players_name').on(t.name)],
);

/** Strafen im ganzen Netzwerk (und in Discord). */
export const punishments = sqliteTable(
  'punishments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    playerUuid: text('player_uuid').notNull(),
    kind: text('kind').$type<'ban' | 'mute' | 'jail' | 'warn' | 'kick' | 'voice'>().notNull(),
    reason: text('reason').notNull(),
    /** Wer bestraft hat (Team-Name). */
    byName: text('by_name').notNull(),
    createdAt: createdAt(),
    /** null = für immer (bei Kick/Warnung ohne Bedeutung). */
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
    revokedBy: text('revoked_by'),
  },
  (t) => [index('punishments_player').on(t.playerUuid)],
);

/** Freundschaften: ein Eintrag pro Paar, kleinere UUID zuerst. */
export const friends = sqliteTable(
  'friends',
  {
    a: text('a').notNull(),
    b: text('b').notNull(),
    since: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.a, t.b] }), index('friends_b').on(t.b)],
);

/** Offene Freundschaftsanfragen. */
export const friendRequests = sqliteTable(
  'friend_requests',
  {
    from: text('from_uuid').notNull(),
    to: text('to_uuid').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.from, t.to] }), index('friend_requests_to').on(t.to)],
);

/** Was der Discord-Bot angelegt hat (Server, Rollen, Kanäle, Nachrichten): Schlüssel → Discord-ID. */
export const discordObjects = sqliteTable('discord_objects', {
  key: text('key').primaryKey(),
  discordId: text('discord_id').notNull(),
  updatedAt: text('updated_at').notNull().default(now),
});

/** News für Webseite und Discord (#ankündigungen). Texte auf Deutsch und Englisch. */
export const news = sqliteTable(
  'news',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    category: text('category').$type<'update' | 'event' | 'info'>().notNull(),
    titleDe: text('title_de').notNull(),
    titleEn: text('title_en').notNull(),
    bodyDe: text('body_de').notNull(),
    bodyEn: text('body_en').notNull(),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    /** null = Entwurf (nur im Panel). */
    publishedAt: text('published_at'),
    author: text('author').notNull(),
    createdAt: createdAt(),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [index('news_published').on(t.publishedAt)],
);
