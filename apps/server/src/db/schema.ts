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
    kind: text('kind').$type<'ban' | 'mute' | 'jail' | 'warn' | 'kick'>().notNull(),
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
