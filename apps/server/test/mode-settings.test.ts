/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import type { FastifyBaseLogger } from 'fastify';
import { expect, test } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { MODE_SETTINGS_FILE } from '../src/hub/mode-settings.js';
import { createEventBus } from '../src/lib/events.js';
import { MotorError } from '../src/motor/client.js';
import { createModeSettingsSync } from '../src/network/mode-settings.js';
import { createStores } from '../src/panel/stores.js';

const quiet = { info: () => undefined, warn: () => undefined } as unknown as FastifyBaseLogger;
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 50));

test('Schläft der Modus, landen die Einstellungen über den Motor in seiner mode-settings.json; Neustart-Wünsche gehen in die Warteschlange', async () => {
  const events = createEventBus();
  const stores = createStores(openDatabase(':memory:').db, events);
  const files = new Map<string, string>();
  const writes: string[] = [];
  const motor = {
    request: async <T>(method: string, path: string, raw?: unknown): Promise<T> => {
      const body = raw as { path: string; content: string } | undefined;
      const id = path.split('/')[3] ?? '';
      if (method === 'PUT' && body) {
        writes.push(`${id}:${body.path}`);
        files.set(`${id}:${body.path}`, body.content);
        return undefined as T;
      }
      const file = decodeURIComponent(path.split('path=')[1] ?? '');
      const content = files.get(`${id}:${file}`);
      if (content === undefined) throw new MotorError(404, 'not_found');
      return { content } as T;
    },
  };
  const connected = ['duels'];
  const queue: string[] = [];
  const sync = createModeSettingsSync({
    motor,
    hub: { connectedServers: () => connected },
    stores,
    events,
    restarts: {
      add: (s) => queue.push(...s.map((x) => `+${x.serverId}`)),
      remove: (id) => queue.push(`-${id}`),
    },
    idOf: async (member) => `id-${member}`,
    log: quiet,
  });

  // Alle schlafenden Modi bekommen ihre Werte; Duels ist wach (dort trägt das Plugin selbst ein).
  await sync.syncFiles();
  expect(writes).toContain(`id-bollwerk:${MODE_SETTINGS_FILE}`);
  expect(writes.some((w) => w.startsWith('id-duels:'))).toBe(false);
  const bollwerk = JSON.parse(files.get(`id-bollwerk:${MODE_SETTINGS_FILE}`) ?? '{}') as {
    plugin: string;
    values: Record<string, unknown>;
  };
  expect(bollwerk.plugin).toBe('MorniBollwerk');
  expect(bollwerk.values['wachstube.countdown-sekunden']).toBe(30);
  // Nichts geändert → nicht noch einmal geschrieben.
  const count = writes.length;
  await sync.syncFiles();
  expect(writes.length).toBe(count);

  // Änderung im Panel, während Bollwerk schläft → gleich in die Datei.
  stores.patchSettings('bollwerk', { hallCountdown: 12 }, 'test');
  await settle();
  expect(JSON.parse(files.get(`id-bollwerk:${MODE_SETTINGS_FILE}`) ?? '{}')).toMatchObject({
    values: { 'wachstube.countdown-sekunden': 12 },
  });
  // Duels ist wach: keine Datei über den Motor.
  stores.patchSettings('duels', { timeLimit: 300 }, 'test');
  await settle();
  expect(writes.some((w) => w.startsWith('id-duels:'))).toBe(false);

  // Neue Server vor dem ersten Start.
  await sync.prepare([{ serverId: 'id-neu', member: 'gipfelsturm' }]);
  expect(files.has(`id-neu:${MODE_SETTINGS_FILE}`)).toBe(true);

  events.emit('mode.restart', { mode: 'duels', server: 'duels', needed: true });
  events.emit('mode.restart', { mode: 'duels', server: 'duels', needed: false });
  await settle();
  expect(queue).toEqual(['+id-duels', '-id-duels']);
});
