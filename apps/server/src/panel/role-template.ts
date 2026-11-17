import { eq } from 'drizzle-orm';
import { DEFAULT_ROLES, GAME_RIGHTS, type GameRight, type Role } from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import { roles, settingValues } from '../db/schema.js';

/**
 * Neues aus der Rollen-Vorlage kommt auch bei bestehenden Installationen an – jede Neuerung genau einmal. Ob sie
 * schon lief, steht als Merker in `setting_values` unter einem Bereich, den es im Einstellungs-Katalog nicht gibt
 * (das Panel zeigt ihn nie). Was der Owner selbst angelegt, geändert oder gelöscht hat, bleibt: Eine gelöschte Rolle
 * kommt nicht wieder, eine eigene Rolle gleichen Namens bekommt keinen Zwilling, und die Reihenfolge der vorhandenen
 * Rollen untereinander ändert sich nie – so bekommt niemand durch eine neue Rolle mehr Rechte über andere.
 */

const MARKER_AREA = '_rollen-vorlage';
const BY = 'MoinMorni';
const SUPPORTER = 'supporter';
const MODES_ADMIN: GameRight = 'modes-admin';

interface Upgrade {
  readonly id: string;
  readonly apply: (list: readonly Role[]) => Role[];
}

/** Wohin der Supporter kommt: gleich unter den Moderator; ohne Moderator über den Builder; sonst über „für alle“. */
function supporterPlace(list: readonly Role[]): number {
  const moderator = list.find((r) => r.id === 'moderator');
  if (moderator) return moderator.position + 1;
  const builder = list.find((r) => r.id === 'builder');
  if (builder) return builder.position;
  const fallback = list.find((r) => r.fallback);
  return fallback ? fallback.position : Math.max(-1, ...list.map((r) => r.position)) + 1;
}

const sameName = (role: Role, name: string): boolean =>
  [role.id, role.name.de, role.name.en].some((n) => n.trim().toLowerCase() === name);

/**
 * Supporter (16.11.): zwischen Moderator und Builder. Alle Rollen ab dieser Stelle rücken einen Platz nach unten,
 * ihre Reihenfolge untereinander bleibt. Gibt es schon eine Rolle „Supporter“ (eigene Kennung oder eigener Name),
 * kommt keine zweite dazu.
 */
function addSupporter(list: readonly Role[]): Role[] {
  const fresh = DEFAULT_ROLES.find((r) => r.id === SUPPORTER);
  if (!fresh || list.some((r) => sameName(r, SUPPORTER))) return [...list];
  const at = supporterPlace(list);
  return [
    ...list.map((r) => (r.position >= at ? { ...r, position: r.position + 1 } : r)),
    { ...fresh, position: at },
  ];
}

/** „Spielmodi verwalten“ (16.11.): Owner und Admin bekommen das neue Recht dazu – wie in der Vorlage. */
function addModesAdmin(list: readonly Role[]): Role[] {
  return list.map((r) =>
    (r.id === 'owner' || r.id === 'admin') && !r.game.includes(MODES_ADMIN)
      ? { ...r, game: GAME_RIGHTS.filter((g) => g === MODES_ADMIN || r.game.includes(g)) }
      : r,
  );
}

const ALWAYS_IN: GameRight = 'maintenance-join';
const TEAM_ALWAYS_IN = new Set(['builder', 'media']);
const PUNISHMENTS = 'punishments';

/** Team kommt immer hinein (16.11., Philip): Builder und Media bekommen „Kommt immer rein“ dazu – wie in der Vorlage. */
function addTeamAlwaysIn(list: readonly Role[]): Role[] {
  return list.map((r) =>
    TEAM_ALWAYS_IN.has(r.id) && !r.game.includes(ALWAYS_IN)
      ? { ...r, game: GAME_RIGHTS.filter((g) => g === ALWAYS_IN || r.game.includes(g)) }
      : r,
  );
}

/**
 * Supporter sieht die Strafen-Seite (16.11.): Seit das Panel jede Strafe einzeln prüft (`mayPunish`), darf er dort
 * verwarnen und stummschalten – bannen, einsperren und rauswerfen bleiben gesperrt.
 */
function addSupporterPunishments(list: readonly Role[]): Role[] {
  return list.map((r) =>
    r.id === SUPPORTER && !r.panel.includes(PUNISHMENTS) ? { ...r, panel: [...r.panel, PUNISHMENTS] } : r,
  );
}

const LOBBY_FLY: GameRight = 'lobby-fly';
const FLY_ROLES = new Set(['owner', 'admin', 'moderator', 'supporter', 'builder', 'media', 'vip']);

/** In der Lobby fliegen (17.11., Philip: „alles ab VIP“): VIP und alle Ränge der Vorlage darüber – wie in der Vorlage. */
function addLobbyFly(list: readonly Role[]): Role[] {
  return list.map((r) =>
    FLY_ROLES.has(r.id) && !r.game.includes(LOBBY_FLY)
      ? { ...r, game: GAME_RIGHTS.filter((g) => g === LOBBY_FLY || r.game.includes(g)) }
      : r,
  );
}

/** In dieser Reihenfolge; neue Neuerungen kommen hinten dazu (mit neuer Kennung, alte nie ändern). */
const UPGRADES: readonly Upgrade[] = [
  { id: 'supporter', apply: addSupporter },
  { id: 'modes-admin', apply: addModesAdmin },
  { id: 'team-always-in', apply: addTeamAlwaysIn },
  { id: 'supporter-punishments', apply: addSupporterPunishments },
  { id: 'lobby-fly', apply: addLobbyFly },
];

/**
 * Führt die Neuerungen aus, die hier noch nicht liefen, und merkt sie sich. Gibt zurück, welche davon etwas an der
 * gespeicherten Vorlage geändert haben (leer bei einer frischen Installation – die hat die Vorlage schon so).
 */
export function upgradeRoleTemplate(db: Db): string[] {
  const done = new Set(
    db
      .select({ key: settingValues.key })
      .from(settingValues)
      .where(eq(settingValues.area, MARKER_AREA))
      .all()
      .map((r) => r.key),
  );
  const due = UPGRADES.filter((u) => !done.has(u.id));
  if (!due.length) return [];
  const before = db
    .select()
    .from(roles)
    .all()
    .map((r) => r.data);
  const steps = due.reduce<{ list: readonly Role[]; changed: string[] }>(
    (acc, u) => {
      const next = u.apply(acc.list);
      return {
        list: next,
        changed: JSON.stringify(next) === JSON.stringify(acc.list) ? acc.changed : [...acc.changed, u.id],
      };
    },
    { list: before, changed: [] },
  );
  const at = new Date().toISOString();
  db.transaction((tx) => {
    steps.list
      .filter((r) => JSON.stringify(r) !== JSON.stringify(before.find((b) => b.id === r.id)))
      .forEach((r) =>
        tx
          .insert(roles)
          .values({ id: r.id, data: r, updatedAt: at })
          .onConflictDoUpdate({ target: roles.id, set: { data: r, updatedAt: at } })
          .run(),
      );
    due.forEach((u) =>
      tx
        .insert(settingValues)
        .values({ area: MARKER_AREA, key: u.id, value: at, updatedBy: BY, updatedAt: at })
        .onConflictDoNothing()
        .run(),
    );
  });
  return steps.changed;
}
