import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, test } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { MotorError, type MotorClient } from '../src/motor/client.js';
import { createSleepService } from '../src/network/sleep.js';
import { createEventBus } from '../src/lib/events.js';
import { createStores } from '../src/panel/stores.js';

const quiet = { info: () => undefined, warn: () => undefined } as unknown as FastifyBaseLogger;
const MINUTE = 60_000;

describe('Schlaf-Modus', () => {
  test('leerer Modus schläft nach der eingestellten Zeit, Lobby nie, Spieler halten ihn wach', async () => {
    const stores = createStores(openDatabase(':memory:').db, createEventBus());
    stores.patchSettings('network', { sleepMinutes: 5 }, 'test');
    // Seit dem 16.11. sind alle Modi standardmäßig immer online – schlafen nur, wo es eingeschaltet ist.
    stores.patchMode('duels', { sleepWhenEmpty: true }, 'test');
    stores.patchMode('party', { sleepWhenEmpty: true }, 'test');
    const calls: string[] = [];
    const motor = {
      request: (method: string, path: string) => {
        calls.push(`${method} ${path}`);
        if (path === '/api/networks')
          return Promise.resolve([
            {
              name: 'MoinMorni',
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

  test('Platz machen: reicht der Arbeitsspeicher nicht, schläft erst der leere Modus – nie Lobby oder einer mit Spielern', async () => {
    const stores = createStores(openDatabase(':memory:').db, createEventBus());
    const servers = new Map(
      [
        { id: 'x0', memoryMb: 1024, state: 'running', players: 0 },
        { id: 'l1', memoryMb: 4096, state: 'running', players: 0 },
        { id: 'd1', memoryMb: 2048, state: 'running', players: 0 },
        { id: 'p1', memoryMb: 2048, state: 'running', players: 1 },
        { id: 'a1', memoryMb: 2048, state: 'stopped', players: 0 },
      ].map((x) => [x.id, x]),
    );
    const brief = (id: string) => {
      const x = servers.get(id);
      return x && { id, memoryMb: x.memoryMb, live: { state: x.state, playersOnline: x.players } };
    };
    // Wie der Motor: Start nur, wenn alle laufenden Server samt Reserve in 10 GB passen.
    const TOTAL = 10240;
    const RESERVE = 768;
    const calls: string[] = [];
    const motor = {
      request: (method: string, path: string) => {
        calls.push(`${method} ${path}`);
        if (path === '/api/networks')
          return Promise.resolve([
            {
              name: 'MoinMorni',
              proxy: { serverId: 'x0' },
              members: [
                { name: 'lobby', serverId: 'l1' },
                { name: 'duels', serverId: 'd1' },
                { name: 'party', serverId: 'p1' },
                { name: 'adlerflug', serverId: 'a1' },
              ],
            },
          ]);
        if (path === '/api/host') return Promise.resolve({ memoryTotalMb: TOTAL });
        if (path === '/api/servers') return Promise.resolve([...servers.keys()].map(brief));
        const one = /^\/api\/servers\/(\w+)$/.exec(path);
        if (method === 'GET' && one) return Promise.resolve(brief(one[1] ?? ''));
        const act = /^\/api\/servers\/(\w+)\/actions\/(\w+)$/.exec(path);
        const target = act ? servers.get(act[1] ?? '') : undefined;
        if (act?.[2] === 'stop' && target) target.state = 'stopped';
        if (act?.[2] === 'start' && target) {
          const used = [...servers.values()]
            .filter((x) => x !== target && x.state === 'running')
            .reduce((sum, x) => sum + x.memoryMb, 0);
          if (used + target.memoryMb + RESERVE > TOTAL)
            return Promise.reject(new MotorError(409, 'host_memory_full'));
          target.state = 'running';
        }
        return Promise.resolve(undefined);
      },
    } as unknown as MotorClient;
    const hub = {
      presence: { counts: () => ({ party: 1 }) } as never,
      connectedServers: () => ['lobby', 'duels', 'party'],
    };
    const sleep = createSleepService(motor, hub, stores, quiet);

    expect(await sleep.wake('adlerflug')).toBe(true);
    expect(servers.get('a1')?.state).toBe('running');
    // Duels war leer und musste schlafen; Party (ein Spieler), Lobby und Proxy blieben.
    expect(servers.get('d1')?.state).toBe('stopped');
    expect(servers.get('p1')?.state).toBe('running');
    expect(servers.get('l1')?.state).toBe('running');
    expect(calls).not.toContain('POST /api/servers/l1/actions/stop');
    expect(calls).not.toContain('POST /api/servers/x0/actions/stop');

    // Passt es schon, schläft niemand.
    servers.set('a1', { id: 'a1', memoryMb: 2048, state: 'stopped', players: 0 });
    expect(await sleep.makeRoom('d1')).toBe(0);

    // Nichts mehr frei und kein leerer Modus (überall spielt jemand): der Start scheitert wie im Motor.
    servers.set('a1', { id: 'a1', memoryMb: 2048, state: 'running', players: 2 });
    servers.set('x9', { id: 'x9', memoryMb: 1024, state: 'running', players: 0 });
    await expect(sleep.wake('duels')).rejects.toMatchObject({ code: 'host_memory_full' });
    expect(servers.get('a1')?.state).toBe('running');
  });
});
