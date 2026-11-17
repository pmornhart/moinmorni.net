/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { DEFAULT_ROLES, mayAssign, type Role } from '@moinmorni/shared';
import { openDatabase, type Db } from '../src/db/index.js';
import { roles, settingValues } from '../src/db/schema.js';
import { createEventBus } from '../src/lib/events.js';
import { createStores } from '../src/panel/stores.js';

/** Die Vorlage vom 14.11. (vor Supporter, „Spielmodi verwalten“ und Team immer hinein), so wie bei Philip. */
const OLD_IDS = ['owner', 'admin', 'moderator', 'builder', 'media', 'vip', 'player'];
const TEAM_LATER = new Set(['builder', 'media']);
const oldTemplate = (): Role[] =>
  DEFAULT_ROLES.filter((r) => r.id !== 'supporter').map((r) => ({
    ...r,
    position: OLD_IDS.indexOf(r.id),
    game: r.game.filter(
      (g) => g !== 'modes-admin' && g !== 'lobby-fly' && !(TEAM_LATER.has(r.id) && g === 'maintenance-join'),
    ),
  }));

const installed = (list: readonly Role[]): Db => {
  const { db } = openDatabase(':memory:');
  list.forEach((r) => db.insert(roles).values({ id: r.id, data: r }).run());
  return db;
};
const order = (db: Db): string[] =>
  createStores(db, createEventBus())
    .roles()
    .map((r) => r.id);
/** Wer darf wen vergeben (nur Paare aus `ids`) – darf sich durch eine neue Rolle nicht ändern. */
const powers = (list: readonly Role[], ids: readonly string[]): string[] =>
  ids.flatMap((a) => ids.filter((b) => mayAssign(list, a, b)).map((b) => `${a}>${b}`));

describe('Rollen-Vorlage: Neues kommt auch bei bestehenden Installationen an', () => {
  test('Supporter kommt gleich unter den Moderator, Owner und Admin bekommen „Spielmodi verwalten“', () => {
    const db = installed(oldTemplate());
    const stores = createStores(db, createEventBus());
    expect(stores.templateUpgrades).toEqual(['supporter', 'modes-admin', 'team-always-in', 'lobby-fly']);
    const list = stores.roles();
    expect(list.map((r) => [r.id, r.position])).toEqual([
      ['owner', 0],
      ['admin', 1],
      ['moderator', 2],
      ['supporter', 3],
      ['builder', 4],
      ['media', 5],
      ['vip', 6],
      ['player', 7],
    ]);
    expect(list.find((r) => r.id === 'supporter')).toEqual(DEFAULT_ROLES.find((r) => r.id === 'supporter'));
    expect(list.filter((r) => r.game.includes('modes-admin')).map((r) => r.id)).toEqual(['owner', 'admin']);
    // Niemand bekommt durch die neue Rolle mehr Rechte über andere.
    expect(powers(list, OLD_IDS)).toEqual(powers(oldTemplate(), OLD_IDS));
    expect(mayAssign(list, 'moderator', 'supporter')).toBe(true);
    expect(mayAssign(list, 'supporter', 'moderator')).toBe(false);
    expect(mayAssign(list, 'builder', 'supporter')).toBe(false);

    // Nächster Start: nichts mehr zu tun, nichts verschoben.
    const again = createStores(db, createEventBus());
    expect(again.templateUpgrades).toEqual([]);
    expect(again.roles()).toEqual(list);
  });

  test('eigene Rollen und Änderungen des Owners bleiben, die Reihenfolge untereinander auch', () => {
    const own: Role = {
      ...oldTemplate().find((r) => r.id === 'vip')!,
      id: 'helfer',
      name: { de: 'Helfer', en: 'Helper' },
      symbol: '☘',
      position: 3,
      game: ['warn'],
    };
    const before = [
      ...oldTemplate().map((r) => {
        if (r.id === 'admin')
          return { ...r, name: { de: 'Chef', en: 'Boss' }, game: ['kick', 'ban'] as Role['game'] };
        return r.position >= 3 ? { ...r, position: r.position + 1 } : r;
      }),
      own,
    ];
    const db = installed(before);
    const list = createStores(db, createEventBus()).roles();
    expect(list.map((r) => r.id)).toEqual([
      'owner',
      'admin',
      'moderator',
      'supporter',
      'helfer',
      'builder',
      'media',
      'vip',
      'player',
    ]);
    // Admin heißt weiter „Chef“, hat seine eigenen Rechte – plus das neue.
    expect(list.find((r) => r.id === 'admin')).toMatchObject({
      name: { de: 'Chef', en: 'Boss' },
      game: ['kick', 'ban', 'lobby-fly', 'modes-admin'],
    });
    expect(list.find((r) => r.id === 'helfer')).toMatchObject({ ...own, position: 4 });
    const ids = before.map((r) => r.id);
    expect(powers(list, ids)).toEqual(powers(before, ids));
  });

  test('eine gelöschte Supporter-Rolle kommt nicht wieder', () => {
    const db = installed(oldTemplate());
    createStores(db, createEventBus());
    db.delete(roles).where(eq(roles.id, 'supporter')).run();
    expect(createStores(db, createEventBus()).templateUpgrades).toEqual([]);
    expect(order(db)).not.toContain('supporter');
  });

  test('gibt es schon eine Rolle „Supporter“ (eigene Kennung), kommt keine zweite dazu', () => {
    const mine: Role = {
      ...oldTemplate().find((r) => r.id === 'vip')!,
      id: 'support',
      name: { de: 'Supporter', en: 'Supporter' },
    };
    const db = installed([...oldTemplate().filter((r) => r.id !== 'vip'), mine]);
    expect(createStores(db, createEventBus()).templateUpgrades).toEqual([
      'modes-admin',
      'team-always-in',
      'lobby-fly',
    ]);
    expect(order(db).filter((id) => id.startsWith('support'))).toEqual(['support']);
  });

  test('ohne Moderator über dem Builder, ohne beide gleich über „für alle“', () => {
    const noMod = installed(oldTemplate().filter((r) => r.id !== 'moderator'));
    expect(order(noMod)).toEqual(['owner', 'admin', 'supporter', 'builder', 'media', 'vip', 'player']);
    const neither = installed(oldTemplate().filter((r) => r.id !== 'moderator' && r.id !== 'builder'));
    expect(order(neither)).toEqual(['owner', 'admin', 'media', 'vip', 'supporter', 'player']);
  });

  test('Team immer hinein und Strafen-Seite für den Supporter kommen auch, wenn der Supporter schon da ist', () => {
    // Stand nach dem ersten Supporter-Update: Supporter ohne Strafen-Seite, Builder und Media ohne „Kommt immer rein“.
    const earlier = DEFAULT_ROLES.map((r) => ({
      ...r,
      panel: r.id === 'supporter' ? r.panel.filter((a) => a !== 'punishments') : r.panel,
      game: r.game.filter((g) => !(TEAM_LATER.has(r.id) && g === 'maintenance-join')),
    }));
    const db = installed(earlier);
    const at = new Date().toISOString();
    ['supporter', 'modes-admin'].forEach((key) =>
      db
        .insert(settingValues)
        .values({ area: '_rollen-vorlage', key, value: at, updatedBy: 'MoinMorni', updatedAt: at })
        .run(),
    );
    const stores = createStores(db, createEventBus());
    expect(stores.templateUpgrades).toEqual(['team-always-in', 'supporter-punishments']);
    expect(stores.roles()).toEqual([...DEFAULT_ROLES]);
    expect(createStores(db, createEventBus()).templateUpgrades).toEqual([]);
  });

  test('In der Lobby fliegen: VIP und alle Ränge darüber bekommen es einmal, Spieler und eigene Rollen nicht', () => {
    const before = DEFAULT_ROLES.map((r) => ({ ...r, game: r.game.filter((g) => g !== 'lobby-fly') }));
    const own: Role = { ...before.find((r) => r.id === 'player')!, id: 'gast', position: 9 };
    const db = installed([...before, own]);
    const at = new Date().toISOString();
    ['supporter', 'modes-admin', 'team-always-in', 'supporter-punishments'].forEach((key) =>
      db
        .insert(settingValues)
        .values({ area: '_rollen-vorlage', key, value: at, updatedBy: 'MoinMorni', updatedAt: at })
        .run(),
    );
    const stores = createStores(db, createEventBus());
    expect(stores.templateUpgrades).toEqual(['lobby-fly']);
    expect(
      stores
        .roles()
        .filter((r) => r.game.includes('lobby-fly'))
        .map((r) => r.id),
    ).toEqual(['owner', 'admin', 'moderator', 'supporter', 'builder', 'media', 'vip']);
    expect(stores.roles().filter((r) => r.id !== 'gast')).toEqual([...DEFAULT_ROLES]);
    // Vom Owner danach wieder weggenommen: bleibt weg.
    expect(createStores(db, createEventBus()).templateUpgrades).toEqual([]);
  });

  test('frische Installation: Vorlage wie sie ist, nichts nachzuziehen', () => {
    const { db } = openDatabase(':memory:');
    const stores = createStores(db, createEventBus());
    expect(stores.templateUpgrades).toEqual([]);
    expect(stores.roles()).toEqual([...DEFAULT_ROLES]);
  });
});
