import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { teamMembers } from '../db/schema.js';
import { badRequest, conflict } from '../lib/errors.js';
import type { EventBus } from '../lib/events.js';
import { retry } from '../lib/retry.js';
import { MotorError, type MotorClient, type MotorMe } from '../motor/client.js';

/**
 * Ersteinrichtung: Solange es im Motor noch keine Person gibt, kann genau einmal ein Owner-Konto angelegt werden –
 * nur mit dem Einrichtungs-Code, den das Installationsskript anzeigt (liegt in `<Daten>/setup-code`, nur für den
 * Container lesbar). So kann niemand, der die Seite zufällig vor Philip findet, das Netzwerk übernehmen.
 * Danach (und bei jedem Start) stellt MoinMorni den Motor passend ein: keine offene Registrierung.
 */

const CODE_FILE = 'setup-code';
// Ohne Zeichen, die man verwechselt (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_GROUPS = 3;
const CODE_GROUP_LENGTH = 4;
const OWNER = 'owner';
const FILE_MODE = 0o600;
const START_TRIES = 60;
const START_DELAY_MS = 5_000;
const HTTP_CONFLICT = 409;
const HTTP_BAD_REQUEST = 400;
// Leerzeichen und Bindestriche, die man beim Abtippen setzt: "abcd-efgh ijkl" → "abcdefghijkl".
// https://regex101.com/?flavor=javascript&regex=%5B%5Cs-%5D%2B&flags=g&testString=abcd-efgh%20ijkl
const CODE_SEPARATORS = /[\s-]+/g;

export interface SetupInput {
  readonly code: string;
  readonly username: string;
  readonly password: string;
  readonly locale: 'de' | 'en';
}

export interface SetupService {
  /** Muss noch ein Owner-Konto angelegt werden? */
  readonly required: () => Promise<boolean>;
  /** Owner-Konto anlegen. `host` = Adresse, über die Philip gerade da ist (für die Panel-Domain im Motor). */
  readonly complete: (input: SetupInput, host: string) => Promise<void>;
  /** Beim Start: Code bereitlegen (falls nötig) und den Motor einstellen. Wartet, bis der Motor antwortet. */
  readonly start: () => Promise<void>;
}

function newCode(): string {
  const chars = Array.from(
    crypto.randomBytes(CODE_GROUPS * CODE_GROUP_LENGTH),
    (b) => CODE_ALPHABET[b % CODE_ALPHABET.length] ?? '',
  );
  return Array.from({ length: CODE_GROUPS }, (_, i) =>
    chars.slice(i * CODE_GROUP_LENGTH, (i + 1) * CODE_GROUP_LENGTH).join(''),
  ).join('-');
}

const normalized = (code: string): string => code.replace(CODE_SEPARATORS, '').toUpperCase();

function sameCode(given: string, expected: string): boolean {
  const digest = (v: string): Buffer => crypto.createHash('sha256').update(normalized(v)).digest();
  return crypto.timingSafeEqual(digest(given), digest(expected));
}

export function createSetupService(
  config: Config,
  db: Db,
  motor: MotorClient,
  log: FastifyBaseLogger,
  events: EventBus,
): SetupService {
  const codeFile = path.join(config.dataDir, CODE_FILE);
  const state = { done: false };

  const required = async (): Promise<boolean> => {
    if (state.done) return false;
    const status = await motor.request<{ setupRequired: boolean }>('GET', '/api/system/status');
    state.done = !status.setupRequired;
    return status.setupRequired;
  };

  const readCode = (): string | null => {
    try {
      return fs.readFileSync(codeFile, 'utf8').trim();
    } catch {
      return null;
    }
  };

  const prepareCode = (): void => {
    const existing = readCode();
    const code = existing ?? newCode();
    if (!existing) fs.writeFileSync(codeFile, `${code}\n`, { mode: FILE_MODE });
    log.warn(
      `Noch kein Owner-Konto. Öffne https://${config.domain}/panel/einrichtung – Einrichtungs-Code: ${code}`,
    );
  };

  /** Keine offene Registrierung im Motor: Team-Konten legt nur das Team an. */
  const motorDefaults = async (): Promise<void> => {
    const signup = await motor.request<{ enabled: boolean }>('GET', '/api/signup');
    if (signup.enabled) await motor.request('PUT', '/api/signup', { enabled: false });
  };

  return {
    required,
    complete: async (input, host) => {
      if (!(await required())) throw conflict('setup_done');
      const expected = readCode();
      if (!expected || !sameCode(input.code, expected)) throw badRequest('setup_code_wrong');
      const created = await motor
        .request<MotorMe>('POST', '/api/setup', {
          username: input.username,
          password: input.password,
          locale: input.locale,
        })
        .catch((err: unknown) => {
          if (err instanceof MotorError && err.status === HTTP_CONFLICT) throw conflict('setup_done');
          if (err instanceof MotorError && err.status === HTTP_BAD_REQUEST) throw badRequest('setup_invalid');
          throw err;
        });
      state.done = true;
      const known = db.select().from(teamMembers).where(eq(teamMembers.motorUserId, created.user.id)).get();
      if (!known)
        db.insert(teamMembers)
          .values({ motorUserId: created.user.id, username: created.user.username, roleId: OWNER })
          .run();
      fs.rmSync(codeFile, { force: true });
      // Über die echte Domain eingerichtet: Passkeys und Links im Motor gelten für diese Domain.
      if (host === config.domain) await motor.request('PUT', '/api/settings', { panelDomain: config.domain });
      await motorDefaults();
      log.info({ owner: created.user.username }, 'Einrichtung abgeschlossen');
      events.emit('setup.done', { owner: created.user.username });
    },
    start: async () => {
      const needed = await retry(required, START_TRIES, START_DELAY_MS);
      if (needed) prepareCode();
      else fs.rmSync(codeFile, { force: true });
      await retry(motorDefaults, START_TRIES, START_DELAY_MS);
    },
  };
}
