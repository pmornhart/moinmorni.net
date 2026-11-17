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
import { upgradeRoleTemplate } from './role-template.js';
import { mergePackRequired } from './pack-required.js';

/**
 * Speicher für Rollen-Vorlage, Einstellungen (nach Katalog) und Modi. Beim ersten Start kommen die Vorlagen
 * hinein; danach gilt, was im Panel (oder per Befehl im Spiel) eingestellt wurde.
 */

export interface Stores {
  readonly roles: () => Role[];
  readonly role: (id: string) => Role | undefined;
  /** Ganze Vorlage speichern. `byOwner` = nur dann dürfen Owner/Admin geändert werden. */
  /** Rollen-Vorlage speichern; `editor` = Rolle dessen, der speichert (Owner darf alles, sonst nur darunter). */
  readonly saveRoles: (list: readonly Role[], by: string, editor: Role) => Role[];
  readonly settings: (area: string) => Record<string, unknown>;
  readonly patchSettings: (area: string, patch: unknown, by: string) => Record<string, unknown>;
  readonly modes: () => Mode[];
  readonly patchMode: (id: string, patch: ModePatch, by: string) => Mode;
  /** Neuerungen der Rollen-Vorlage, die beim Start dazukamen (z. B. Supporter) – leer, wenn nichts neu war. */
  readonly templateUpgrades: readonly string[];
}

/**
 * Darf jemand (nicht Owner) diese Rolle so anlegen, ändern oder löschen? Nur Rollen unter der eigenen, nie die für
 * alle (Spieler), und nur mit Rechten, die er selbst hat – „Admin“ im Spiel und „Administrator“ in Discord nie.
 * Sonst könnte ein Admin sich über eine Rolle mehr Rechte geben, als er hat.
 */
function mayShape(editor: Role, old: Role | undefined, fresh: Role | undefined): boolean {
  const below = (r: Role | undefined): boolean => !r || (r.position > editor.position && !r.fallback);
  const within = (r: Role | undefined): boolean =>
    !r ||
    (r.panel.every((a) => editor.panel.includes(a)) &&
      r.game.every((g) => g !== 'admin' && editor.game.includes(g)) &&
      r.discord.every((d) => d !== 'administrator' && editor.discord.includes(d)));
  return below(old) && below(fresh) && within(fresh);
}

/** Frühe Fassungen hießen den SMP-Modus „Mirni SMP“ (Tippfehler) – einmal auf „MorniSMP“ umstellen, nur wenn unverändert. */
const OLD_SMP_NAME = 'Mirni SMP';
const OLD_SMP_TEXT = 'Bald da!';
/**
 * MorniSMP älterer Installationen nachziehen: Tippfehler „Mirni SMP“, alter Platzhalter-Text „Bald da!“ und noch kein
 * Server-Name. Was im Panel selbst geändert wurde, bleibt.
 */
function updateOldSmp(db: Db): void {
  const row = db.select().from(modes).where(eq(modes.id, 'mirni')).get();
  const fresh = DEFAULT_MODES.find((m) => m.id === 'mirni');
  if (!row || !fresh) return;
  const old = row.data;
  const next: Mode = {
    ...old,
    name: old.name.de === OLD_SMP_NAME ? fresh.name : old.name,
    description: old.description.de === OLD_SMP_TEXT ? fresh.description : old.description,
    server: old.server ?? fresh.server,
  };
  if (JSON.stringify(next) === JSON.stringify(old)) return;
  db.update(modes).set({ data: next }).where(eq(modes.id, 'mirni')).run();
}

/**
 * Beschreibungen, die ein Modus früher als Standard hatte (deutscher Text) – sind sie noch unverändert, kommt die neue
 * aus `DEFAULT_MODES`. Was im Panel selbst geschrieben wurde, bleibt.
 */
const OLD_DEFAULT_TEXTS: Readonly<Record<string, readonly string[]>> = {
  // Duels bis 0.1.x (vor den 20 Kampfarten aus 0.2.0)
  duels: ['1 gegen 1 und 2 gegen 2: Klassisch mit Suppe, Modern oder mit Fähigkeiten. Gewertet oder locker.'],
};

function refreshOldTexts(db: Db): void {
  Object.entries(OLD_DEFAULT_TEXTS).forEach(([id, texts]) => {
    const row = db.select().from(modes).where(eq(modes.id, id)).get();
    const fresh = DEFAULT_MODES.find((m) => m.id === id);
    if (!row || !fresh || !texts.includes(row.data.description.de)) return;
    db.update(modes)
      .set({ data: { ...row.data, description: fresh.description } })
      .where(eq(modes.id, id))
      .run();
  });
}

/**
 * Neue Spielmodi (z. B. Wolkenkampf, Versteckerl …) kommen auch bei bestehenden Installationen dazu – hinten in der
 * Reihenfolge, damit eigene Sortierungen bleiben. Was schon da ist, bleibt unverändert.
 */
function addNewModes(db: Db): void {
  const known = new Set(
    db
      .select({ id: modes.id })
      .from(modes)
      .all()
      .map((m) => m.id),
  );
  const missing = DEFAULT_MODES.filter((m) => !known.has(m.id));
  if (!missing.length) return;
  const last = Math.max(
    -1,
    ...db
      .select()
      .from(modes)
      .all()
      .map((m) => m.data.position),
  );
  missing.forEach((m, i) =>
    db
      .insert(modes)
      .values({ id: m.id, data: { ...m, position: Math.max(m.position, last + 1 + i) } })
      .onConflictDoNothing()
      .run(),
  );
}

export function createStores(db: Db, events: EventBus): Stores {
  if (!db.select().from(roles).get())
    DEFAULT_ROLES.forEach((r) => db.insert(roles).values({ id: r.id, data: r }).run());
  const templateUpgrades = upgradeRoleTemplate(db);
  addNewModes(db);
  updateOldSmp(db);
  refreshOldTexts(db);
  mergePackRequired(db);

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
    templateUpgrades,
    roles: allRoles,
    role: (id) => allRoles().find((r) => r.id === id),
    saveRoles: (list, by, editor) => {
      const byOwner = editor.id === 'owner';
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
      if (!byOwner) {
        const changed = [...parsed, ...before].filter((r) => {
          const old = before.find((o) => o.id === r.id);
          const fresh = parsed.find((f) => f.id === r.id);
          return JSON.stringify(old) !== JSON.stringify(fresh);
        });
        if (
          !changed.every((r) =>
            mayShape(
              editor,
              before.find((o) => o.id === r.id),
              parsed.find((f) => f.id === r.id),
            ),
          )
        )
          throw forbidden('role_too_high');
      }
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
