import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { DEFAULT_MODES } from '@moinmorni/shared';
import { openDatabase } from '../src/db/index.js';
import { modes } from '../src/db/schema.js';
import { createEventBus } from '../src/lib/events.js';
import { createStores } from '../src/panel/stores.js';

describe('Spielmodi beim Start', () => {
  test('alter Tippfehler „Mirni SMP“ wird zu „MorniSMP“, eigene Namen bleiben', () => {
    const handle = openDatabase(':memory:');
    DEFAULT_MODES.forEach((m) =>
      handle.db
        .insert(modes)
        .values({
          id: m.id,
          data: m.id === 'mirni' ? { ...m, name: { de: 'Mirni SMP', en: 'Mirni SMP' } } : m,
        })
        .run(),
    );
    createStores(handle.db, createEventBus());
    const smp = handle.db.select().from(modes).where(eq(modes.id, 'mirni')).get();
    expect(smp?.data.name.de).toBe('MorniSMP');

    handle.db
      .update(modes)
      .set({ data: { ...smp!.data, name: { de: 'Unser Survival', en: 'Our survival' } } })
      .where(eq(modes.id, 'mirni'))
      .run();
    createStores(handle.db, createEventBus());
    expect(handle.db.select().from(modes).where(eq(modes.id, 'mirni')).get()?.data.name.de).toBe(
      'Unser Survival',
    );
  });

  test('MorniSMP älterer Installationen: Platzhalter „Bald da!“ wird zur Beschreibung, Server-Name kommt dazu', () => {
    const handle = openDatabase(':memory:');
    const placeholder = { de: 'Bald da!', en: 'Coming soon!' };
    DEFAULT_MODES.forEach((m) =>
      handle.db
        .insert(modes)
        .values({
          id: m.id,
          data: m.id === 'mirni' ? { ...m, description: placeholder, server: null } : m,
        })
        .run(),
    );
    createStores(handle.db, createEventBus());
    const smp = handle.db.select().from(modes).where(eq(modes.id, 'mirni')).get()?.data;
    expect(smp?.description.de).toContain('freiem Markt');
    expect(smp?.server).toBe('smp');
    // Der Zustand bleibt, wie er war (das Team schaltet im Panel).
    expect(smp?.state).toBe(DEFAULT_MODES.find((m) => m.id === 'mirni')?.state);

    const own = { de: 'Unser Markt-Survival', en: 'Our market survival' };
    handle.db
      .update(modes)
      .set({ data: { ...smp!, description: own, server: 'eigener-name' } })
      .where(eq(modes.id, 'mirni'))
      .run();
    createStores(handle.db, createEventBus());
    const again = handle.db.select().from(modes).where(eq(modes.id, 'mirni')).get()?.data;
    expect(again?.description).toEqual(own);
    expect(again?.server).toBe('eigener-name');
  });
});
