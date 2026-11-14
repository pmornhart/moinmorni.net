import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { punishments } from '../db/schema.js';

/** Strafen im ganzen Netzwerk: Bann, Stumm, Verwarnung, Rauswurf (Gefängnis kommt mit der Lobby). */

export type PunishKind = 'ban' | 'mute' | 'jail' | 'warn' | 'kick' | 'voice';
export type Punishment = typeof punishments.$inferSelect;

const MINUTE_MS = 60_000;
const UNITS: Readonly<Record<string, number>> = { m: 1, h: 60, d: 1440, w: 10_080 };
const FOREVER = new Set(['perm', 'permanent', 'immer', 'forever', 'ewig']);
// Dauer wie "30m", "2h", "7d", "4w" – Zahl und Einheit.
// https://regex101.com/?flavor=javascript&regex=%5E(%5Cd%7B1%2C4%7D)(%5Bmhdw%5D)%24&testString=30m
const DURATION = /^(\d{1,4})([mhdw])$/;

/** Minuten aus "30m", null = für immer, undefined = keine Dauer (also wohl schon der Grund). */
export function parseDuration(value: string | undefined): number | null | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (FOREVER.has(lower)) return null;
  const match = DURATION.exec(lower);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return amount > 0 ? amount * (UNITS[match[2] ?? ''] ?? 0) : undefined;
}

export interface PunishInput {
  readonly uuid: string;
  readonly kind: PunishKind;
  readonly reason: string;
  readonly by: string;
  /** null = für immer. */
  readonly minutes: number | null;
}

export interface PunishService {
  readonly add: (input: PunishInput) => Punishment;
  /** Gerade gültige Strafe dieser Art (abgelaufene und aufgehobene zählen nicht). */
  readonly active: (uuid: string, kind: PunishKind) => Punishment | undefined;
  readonly revoke: (uuid: string, kind: PunishKind, by: string) => boolean;
  readonly history: (uuid: string) => Punishment[];
  /** Wer gerade im Sprachchat stumm ist. */
  readonly activeOf: (kind: PunishKind) => string[];
  /** Alle gültigen Banns – der Proxy hält sie vor, falls der Hub kurz weg ist. */
  readonly activeBans: () => { uuid: string; until: string | null }[];
}

export function createPunishService(db: Db, now: () => Date = () => new Date()): PunishService {
  const valid = (p: Punishment): boolean =>
    !p.revokedAt && (!p.expiresAt || new Date(p.expiresAt).getTime() > now().getTime());
  const open = (uuid: string, kind: PunishKind): Punishment[] =>
    db
      .select()
      .from(punishments)
      .where(and(eq(punishments.playerUuid, uuid), eq(punishments.kind, kind), isNull(punishments.revokedAt)))
      .orderBy(desc(punishments.id))
      .all()
      .filter(valid);

  return {
    add: (input) =>
      db
        .insert(punishments)
        .values({
          playerUuid: input.uuid,
          kind: input.kind,
          reason: input.reason,
          byName: input.by,
          createdAt: now().toISOString(),
          expiresAt:
            input.minutes === null
              ? null
              : new Date(now().getTime() + input.minutes * MINUTE_MS).toISOString(),
        })
        .returning()
        .get(),
    active: (uuid, kind) => open(uuid, kind)[0],
    revoke: (uuid, kind, by) => {
      const list = open(uuid, kind);
      const at = now().toISOString();
      list.forEach((p) =>
        db.update(punishments).set({ revokedAt: at, revokedBy: by }).where(eq(punishments.id, p.id)).run(),
      );
      return list.length > 0;
    },
    history: (uuid) =>
      db
        .select()
        .from(punishments)
        .where(eq(punishments.playerUuid, uuid))
        .orderBy(desc(punishments.id))
        .all(),
    activeOf: (kind) =>
      db
        .select()
        .from(punishments)
        .where(and(eq(punishments.kind, kind), isNull(punishments.revokedAt)))
        .all()
        .filter(valid)
        .map((p) => p.playerUuid),
    activeBans: () =>
      db
        .select()
        .from(punishments)
        .where(and(eq(punishments.kind, 'ban'), isNull(punishments.revokedAt)))
        .all()
        .filter(valid)
        .map((p) => ({ uuid: p.playerUuid, until: p.expiresAt })),
  };
}
