import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Role } from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import { applications, whitelist } from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import type { EventBus } from '../lib/events.js';
import type { Stores } from '../panel/stores.js';

/**
 * MorniCraft (und jeder andere Modus „nur auf Einladung“): Wer auf der Whitelist steht, kommt hinein – der Hub
 * prüft das, bevor er jemanden auf den Server lässt. Bewerben geht über die Webseite (mit Discord-Anmeldung) und
 * im Discord (Knopf oder /bewerben). Das Team entscheidet im Panel oder direkt in Discord; eine Zusage setzt den
 * Namen auf die Whitelist.
 */

export const APPLY_MODE = 'mornicraft';
const NAME_MIN = 3;
const NAME_MAX = 16;
const ANSWER_MAX = 1000;
const ABOUT_MIN = 20;
const AGE_MAX = 3;
const NOTE_MAX = 300;
// Java-Name: 3–16 Buchstaben, Ziffern, Unterstrich – z. B. "Lena_Baut"; Bedrock über Geyser mit Punkt davor
// (".Lena"), "Lena Baut" (Leerzeichen) passt nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5C.%3F%5Ba-zA-Z0-9_%5D%7B3%2C16%7D%24&testString=.Lena_Baut
const MINECRAFT_NAME = /^\.?[a-zA-Z0-9_]{3,16}$/;

export const minecraftNameSchema = z
  .string()
  .trim()
  .min(NAME_MIN)
  .max(NAME_MAX + 1)
  .regex(MINECRAFT_NAME);
export const answersSchema = z.object({
  about: z.string().trim().min(ABOUT_MIN).max(ANSWER_MAX),
  why: z.string().trim().min(1).max(ANSWER_MAX),
  age: z.string().trim().max(AGE_MAX).default(''),
});
export const decideSchema = z.object({
  accept: z.boolean(),
  note: z.string().trim().max(NOTE_MAX).default(''),
});

/**
 * Wer MorniCraft-Bewerbungen entscheidet und die Whitelist pflegt: wer im Spiel kicken darf (Moderator und darüber) –
 * im Panel genauso wie mit den Knöpfen in Discord, der Owner immer. Der Bereich „Spieler“ allein reicht nicht: den hat
 * auch der Supporter, der sonst Leute an der Bewerbung vorbei in einen Modus „nur auf Einladung“ holen könnte.
 */
export const mayDecideMornicraft = (role: Role): boolean => role.id === 'owner' || role.game.includes('kick');

export type Application = typeof applications.$inferSelect;
export type WhitelistEntry = typeof whitelist.$inferSelect;

export interface ApplyInput {
  readonly minecraftName: string;
  readonly answers: z.infer<typeof answersSchema>;
  readonly discordId: string | null;
  readonly discordName: string | null;
  readonly via: 'website' | 'discord';
}

export interface ApplicationService {
  readonly open: () => boolean;
  readonly apply: (input: ApplyInput) => Application;
  readonly list: (status?: Application['status']) => Application[];
  readonly get: (id: number) => Application | undefined;
  /** Letzte Bewerbung dieser Discord-Person (für „Deine Bewerbung ist in Arbeit“). */
  readonly latestOf: (discordId: string) => Application | undefined;
  readonly decide: (id: number, accept: boolean, by: string, note: string) => Application;
  readonly setDiscordMessage: (id: number, messageId: string) => void;
  readonly whitelist: (mode?: string) => WhitelistEntry[];
  readonly allow: (name: string, by: string, mode?: string) => WhitelistEntry;
  readonly disallow: (id: number) => boolean;
  /** Darf diese Person in den Modus? (UUID oder Name; merkt sich die UUID beim ersten Mal.) */
  readonly allowed: (mode: string, uuid: string, name: string) => boolean;
  readonly acceptMessage: () => string;
}

export function createApplicationService(db: Db, stores: Stores, events: EventBus): ApplicationService {
  const settings = (): Record<string, unknown> => stores.settings('mornicraft');
  // Nur MorniCraft – Team-Bewerbungen (mode „team“) hat applications/team.ts.
  const get = (id: number): Application | undefined =>
    db
      .select()
      .from(applications)
      .where(and(eq(applications.id, id), eq(applications.mode, APPLY_MODE)))
      .get();
  const entryOf = (mode: string, name: string): WhitelistEntry | undefined =>
    db
      .select()
      .from(whitelist)
      .where(and(eq(whitelist.mode, mode), eq(whitelist.name, name.toLowerCase())))
      .get();

  const allow = (name: string, by: string, mode = APPLY_MODE): WhitelistEntry => {
    const clean = minecraftNameSchema.parse(name);
    const existing = entryOf(mode, clean);
    if (existing) return existing;
    return db
      .insert(whitelist)
      .values({ mode, name: clean.toLowerCase(), displayName: clean, addedBy: by })
      .returning()
      .get();
  };

  return {
    open: () => settings()['applicationsOpen'] === true,
    apply: (input) => {
      if (settings()['applicationsOpen'] !== true) throw conflict('applications_closed');
      const name = minecraftNameSchema.parse(input.minecraftName);
      if (entryOf(APPLY_MODE, name)) throw conflict('application_already_listed');
      const pending = db
        .select()
        .from(applications)
        .where(and(eq(applications.mode, APPLY_MODE), eq(applications.status, 'pending')))
        .all()
        .some(
          (a) =>
            a.minecraftName.toLowerCase() === name.toLowerCase() ||
            (input.discordId !== null && a.discordId === input.discordId),
        );
      if (pending) throw conflict('application_pending');
      const row = db
        .insert(applications)
        .values({
          mode: APPLY_MODE,
          minecraftName: name,
          discordId: input.discordId,
          discordName: input.discordName,
          answers: answersSchema.parse(input.answers),
          via: input.via,
        })
        .returning()
        .get();
      events.emit('application.created', { id: row.id });
      return row;
    },
    list: (status) =>
      db
        .select()
        .from(applications)
        .where(and(eq(applications.mode, APPLY_MODE), status ? eq(applications.status, status) : undefined))
        .orderBy(desc(applications.id))
        .all(),
    get,
    latestOf: (discordId) =>
      db
        .select()
        .from(applications)
        .where(and(eq(applications.mode, APPLY_MODE), eq(applications.discordId, discordId)))
        .orderBy(desc(applications.id))
        .get(),
    decide: (id, accept, by, note) => {
      const app = get(id);
      if (!app) throw notFound('application_unknown');
      if (app.status !== 'pending') throw conflict('application_decided');
      if (accept) allow(app.minecraftName, by, app.mode);
      db.update(applications)
        .set({
          status: accept ? 'accepted' : 'rejected',
          decidedBy: by,
          decidedAt: new Date().toISOString(),
          note: note || null,
        })
        .where(eq(applications.id, id))
        .run();
      events.emit('application.decided', { id });
      return get(id) ?? app;
    },
    setDiscordMessage: (id, messageId) => {
      db.update(applications).set({ discordMessageId: messageId }).where(eq(applications.id, id)).run();
    },
    whitelist: (mode = APPLY_MODE) =>
      db.select().from(whitelist).where(eq(whitelist.mode, mode)).orderBy(whitelist.name).all(),
    allow,
    disallow: (id) => db.delete(whitelist).where(eq(whitelist.id, id)).run().changes > 0,
    allowed: (mode, uuid, name) => {
      const byUuid = db
        .select()
        .from(whitelist)
        .where(and(eq(whitelist.mode, mode), eq(whitelist.uuid, uuid)))
        .get();
      if (byUuid) return true;
      const byName = entryOf(mode, name);
      if (!byName) return false;
      // Name stimmt, UUID noch unbekannt: ab jetzt gehört der Eintrag dieser Person (Namenswechsel egal).
      if (byName.uuid === null) db.update(whitelist).set({ uuid }).where(eq(whitelist.id, byName.id)).run();
      return byName.uuid === null || byName.uuid === uuid;
    },
    acceptMessage: () => String(settings()['acceptMessage'] ?? '').trim(),
  };
}
