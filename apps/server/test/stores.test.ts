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
});
