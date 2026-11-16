import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { storedSecrets } from '../db/schema.js';
import type { SecretBox } from '../lib/secret-box.js';

/**
 * Zugang des Discord-Bots: Bot-Token und Client-Secret (für „Mit Discord anmelden“). Beides kommt aus der .env
 * (`MM_DISCORD_TOKEN`, `MM_DISCORD_CLIENT_SECRET`) oder aus dem Panel – dort versiegelt gespeichert (lib/secret-box.ts).
 * Steht ein Wert in der .env, gilt der; das Panel zeigt das und lässt ihn in Ruhe. Werte verlassen den Server nie:
 * das Panel bekommt nur „gesetzt“ und woher.
 */

export type CredentialSource = 'env' | 'panel';

export interface CredentialState {
  readonly set: boolean;
  /** Woher der Wert kommt; null = nirgends. */
  readonly source: CredentialSource | null;
}

export interface CredentialsView {
  readonly token: CredentialState;
  readonly clientSecret: CredentialState;
}

export type CredentialKind = keyof CredentialsView;

export interface DiscordCredentials {
  readonly token: () => string | null;
  readonly clientSecret: () => string | null;
  readonly view: () => CredentialsView;
  /** Im Panel speichern (versiegelt); null = entfernen. Ein Wert aus der .env lässt sich so nicht ändern. */
  readonly save: (kind: CredentialKind, value: string | null, by: string) => void;
}

const KEYS: Readonly<Record<CredentialKind, string>> = {
  token: 'discord.token',
  clientSecret: 'discord.client-secret',
};

export function createDiscordCredentials(
  db: Db,
  config: Pick<Config, 'discordToken' | 'discordClientSecret'>,
  box: SecretBox,
  log: FastifyBaseLogger,
): DiscordCredentials {
  const fromEnv: Readonly<Record<CredentialKind, string | null>> = {
    token: config.discordToken,
    clientSecret: config.discordClientSecret,
  };
  const stored = (kind: CredentialKind): string | null => {
    const row = db.select().from(storedSecrets).where(eq(storedSecrets.key, KEYS[kind])).get();
    if (!row) return null;
    const value = box.open(row.value);
    // Mit einem anderen MM_SECRET versiegelt (z. B. neue .env ohne Umzug): dann gilt er als nicht gesetzt.
    if (value === null) log.warn({ kind }, 'Discord: gespeicherter Zugang lässt sich nicht öffnen');
    return value;
  };
  const value = (kind: CredentialKind): string | null => fromEnv[kind] ?? stored(kind);
  const state = (kind: CredentialKind): CredentialState => {
    if (fromEnv[kind]) return { set: true, source: 'env' };
    return stored(kind) ? { set: true, source: 'panel' } : { set: false, source: null };
  };
  return {
    token: () => value('token'),
    clientSecret: () => value('clientSecret'),
    view: () => ({ token: state('token'), clientSecret: state('clientSecret') }),
    save: (kind, plain, by) => {
      if (fromEnv[kind]) throw new Error('discord_credential_from_env');
      if (plain === null) {
        db.delete(storedSecrets).where(eq(storedSecrets.key, KEYS[kind])).run();
        return;
      }
      const sealed = box.seal(plain);
      const updatedAt = new Date().toISOString();
      db.insert(storedSecrets)
        .values({ key: KEYS[kind], value: sealed, updatedBy: by, updatedAt })
        .onConflictDoUpdate({ target: storedSecrets.key, set: { value: sealed, updatedBy: by, updatedAt } })
        .run();
    },
  };
}
