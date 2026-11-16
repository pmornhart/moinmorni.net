import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, test } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import type { MotorClient } from '../src/motor/client.js';
import { createSleepService } from '../src/network/sleep.js';
import { createEventBus } from '../src/lib/events.js';
import { createStores } from '../src/panel/stores.js';

const quiet = { info: () => undefined, warn: () => undefined } as unknown as FastifyBaseLogger;
const MINUTE = 60_000;

describe('Schlaf-Modus', () => {
  test('leerer Modus schläft nach der eingestellten Zeit, Lobby nie, Spieler halten ihn wach', async () => {
    const stores = createStores(openDatabase(':memory:').db, createEventBus());
    stores.patchSettings('network', { sleepMinutes: 5 }, 'test');
    const calls: string[] = [];
    const motor = {
      request: (method: string, path: string) => {
        calls.push(`${method} ${path}`);
        if (path === '/api/networks')
          return Promise.resolve([
            {
              name: 'morni.net',
              members: [
                { name: 'lobby', serverId: 'l1' },
                { name: 'duels', serverId: 'd1' },
                { name: 'party', serverId: 'p1' },
              ],
            },
          ]);
        return Promise.resolve(undefined);
      },
    } as unknown as MotorClient;
    const counts: Record<string, number> = { lobby: 3, party: 1 };
    const awake = new Set(['lobby', 'duels', 'party']);
    const hub = {
      presence: { counts: () => counts } as never,
      connectedServers: () => [...awake],
    };
    const sleep = createSleepService(motor, hub, stores, quiet);
    const t0 = Date.parse('2026-11-14T12:00:00Z');

    expect(await sleep.check(t0)).toEqual([]);
    expect(await sleep.check(t0 + 4 * MINUTE)).toEqual([]);
    expect(await sleep.check(t0 + 5 * MINUTE)).toEqual(['duels']);
    expect(calls).toContain('POST /api/servers/d1/actions/stop');

    // Angehalten: das Plugin meldet sich vom Hub ab. Party hat Spieler und bleibt wach; erst wenn sie gehen,
    // läuft die Zeit.
    awake.delete('duels');
    counts['party'] = 0;
    expect(await sleep.check(t0 + 6 * MINUTE)).toEqual([]);
    expect(await sleep.check(t0 + 11 * MINUTE)).toEqual(['party']);
    expect(calls.some((c) => c.includes('/l1/'))).toBe(false);

    expect(await sleep.wake('party')).toBe(true);
    expect(calls).toContain('POST /api/servers/p1/actions/start');
    expect(await sleep.wake('gibts-nicht')).toBe(false);
  });
});
