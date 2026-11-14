import { asc, eq } from 'drizzle-orm';
import {
  DEFAULT_MODES,
  DEFAULT_ROLES,
  OWNER_ONLY_ROLES,
  areaById,
  defaultsFor,
  modePatchSchema,
  modeSchema,
  patchSchemaFor,
  roleSchema,
  type Mode,
  type ModePatch,
  type Role,
} from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import { modes, roles, settingValues } from '../db/schema.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import type { EventBus } from '../lib/events.js';

/**
 * Speicher für Rollen-Vorlage, Einstellungen (nach Katalog) und Modi. Beim ersten Start kommen die Vorlagen
 * hinein; danach gilt, was im Panel (oder per Befehl im Spiel) eingestellt wurde.
 */

export interface Stores {
  readonly roles: () => Role[];
  readonly role: (id: string) => Role | undefined;
  /** Ganze Vorlage speichern. `byOwner` = nur dann dürfen Owner/Admin geändert werden. */
  readonly saveRoles: (list: readonly Role[], by: string, byOwner: boolean) => Role[];
  readonly settings: (area: string) => Record<string, unknown>;
  readonly patchSettings: (area: string, patch: unknown, by: string) => Record<string, unknown>;
  readonly modes: () => Mode[];
  readonly patchMode: (id: string, patch: ModePatch, by: string) => Mode;
}

export function createStores(db: Db, events: EventBus): Stores {
  if (!db.select().from(roles).get())
    DEFAULT_ROLES.forEach((r) => db.insert(roles).values({ id: r.id, data: r }).run());
  if (!db.select().from(modes).get())
    DEFAULT_MODES.forEach((m) => db.insert(modes).values({ id: m.id, data: m }).run());

  const allRoles = (): Role[] =>
    db
      .select()
      .from(roles)
      .all()
      .map((r) => r.data)
      .sort((a, b) => a.position - b.position);
  const allModes = (): Mode[] =>
    db
      .select()
      .from(modes)
      .orderBy(asc(modes.id))
      .all()
      .map((m) => m.data)
      .sort((a, b) => a.position - b.position);

  return {
    roles: allRoles,
    role: (id) => allRoles().find((r) => r.id === id),
    saveRoles: (list, by, byOwner) => {
      const parsed = list.map((r) => roleSchema.parse(r));
      if (new Set(parsed.map((r) => r.id)).size !== parsed.length) throw badRequest('role_duplicate');
      if (parsed.filter((r) => r.fallback).length !== 1) throw badRequest('role_fallback_one');
      if (!parsed.some((r) => r.id === 'owner')) throw badRequest('role_owner_missing');
      const before = allRoles();
      const touchesOwnerRoles = OWNER_ONLY_ROLES.some((id) => {
        const old = before.find((r) => r.id === id);
        const fresh = parsed.find((r) => r.id === id);
        return JSON.stringify(old) !== JSON.stringify(fresh);
      });
      if (touchesOwnerRoles && !byOwner) throw forbidden('role_owner_only');
      db.transaction((tx) => {
        tx.delete(roles).run();
        parsed.forEach((r) => tx.insert(roles).values({ id: r.id, data: r }).run());
      });
      events.emit('roles.changed', { by });
      return allRoles();
    },
    settings: (areaId) => {
      const area = areaById(areaId);
      if (!area) throw notFound('settings_area_unknown');
      const stored = db.select().from(settingValues).where(eq(settingValues.area, areaId)).all();
      return { ...defaultsFor(area), ...Object.fromEntries(stored.map((s) => [s.key, s.value])) };
    },
    patchSettings: (areaId, patch, by) => {
      const area = areaById(areaId);
      if (!area) throw notFound('settings_area_unknown');
      const parsed = patchSchemaFor(area).safeParse(patch);
      if (!parsed.success) throw badRequest('settings_invalid');
      const updatedAt = new Date().toISOString();
      Object.entries(parsed.data)
        .filter(([, value]) => value !== undefined)
        .forEach(([key, value]) =>
          db
            .insert(settingValues)
            .values({ area: areaId, key, value, updatedBy: by, updatedAt })
            .onConflictDoUpdate({
              target: [settingValues.area, settingValues.key],
              set: { value, updatedBy: by, updatedAt },
            })
            .run(),
        );
      const values = {
        ...defaultsFor(area),
        ...Object.fromEntries(
          db
            .select()
            .from(settingValues)
            .where(eq(settingValues.area, areaId))
            .all()
            .map((s) => [s.key, s.value]),
        ),
      };
      events.emit('settings.changed', { area: areaId, values, by });
      return values;
    },
    modes: allModes,
    patchMode: (id, patch, by) => {
      const current = allModes().find((m) => m.id === id);
      if (!current) throw notFound('mode_unknown');
      const next = modeSchema.parse({ ...current, ...modePatchSchema.parse(patch) });
      db.update(modes).set({ data: next, updatedAt: new Date().toISOString() }).where(eq(modes.id, id)).run();
      events.emit('modes.changed', { by });
      return next;
    },
  };
}
