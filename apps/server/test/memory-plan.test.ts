import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { FastifyBaseLogger } from 'fastify';
import { DEFAULT_MODES, MODE_MEMORY_MB } from '@moinmorni/shared';
import { describe, expect, test } from 'vitest';
import type { MotorClient } from '../src/motor/client.js';
import { registerMotorProxy } from '../src/motor/proxy.js';
import { retuneMemory } from '../src/network/memory.js';
import { BUILD_MEMORY_MB, LOBBY_MEMORY_MB, MODE_DEFAULT_MEMORY_MB } from '../src/network/provision.js';

/** Der Proxy (Velocity) bekommt 1 GB, wie in provision.ts. */
const PROXY_MB = 1024;
/** Die Wartungs-Lobby bekommt 768 MB (provision.ts). */
const WARTUNG_MB = 768;

const quiet = { info: () => undefined, warn: () => undefined } as unknown as FastifyBaseLogger;

describe('Arbeitsspeicher der Netzwerk-Server', () => {
  test('einmal: alter Standard → neuer, im Panel Geändertes bleibt', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-mem-'));
    const memory = new Map([
      ['d1', 3072],
      ['s1', 8192],
      ['c1', 6144],
      ['b1', 3072],
      ['l1', 4096],
      ['p1', 2560],
      ['w1', 1536],
    ]);
    const patches: string[] = [];
    const motor = {
      request: (method: string, url: string, body?: { memoryMb: number }) => {
        if (method === 'GET' && url === '/api/servers')
          return Promise.resolve([...memory].map(([id, memoryMb]) => ({ id, memoryMb })));
        if (method === 'PATCH' && body) {
          const id = url.split('/').pop() ?? '';
          memory.set(id, body.memoryMb);
          patches.push(`${id}=${body.memoryMb}`);
        }
        return Promise.resolve(undefined);
      },
    } as unknown as MotorClient;
    const members = [
      { serverId: 'd1', member: 'duels' },
      { serverId: 's1', member: 'smp' },
      { serverId: 'c1', member: 'mornicraft' },
      { serverId: 'b1', member: 'bau' },
      { serverId: 'l1', member: 'lobby' },
      { serverId: 'p1', member: 'party' },
      { serverId: 'w1', member: 'wintersport' },
    ];
    const changed = await retuneMemory(motor, dir, members, DEFAULT_MODES, quiet);
    expect(changed.map((c) => c.member).sort()).toEqual([
      'bau',
      'duels',
      'lobby',
      'mornicraft',
      'smp',
      'wintersport',
    ]);
    expect(Object.fromEntries(memory)).toEqual({
      d1: 1536,
      s1: 3072,
      c1: 3072,
      b1: 1536,
      l1: 3072,
      p1: 2560,
      w1: 1024,
    });
    // Nur einmal: wer später im Panel wieder 3 GB einstellt, behält sie.
    memory.set('d1', 3072);
    expect(await retuneMemory(motor, dir, members, DEFAULT_MODES, quiet)).toEqual([]);
    expect(memory.get('d1')).toBe(3072);
    expect(patches).toHaveLength(6);
  });

  test('Sommerspiele dazu: Wintersport einmal von 1,5 auf 1 GB – auch wo der erste Schritt schon lief', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-mem-'));
    fs.writeFileSync(path.join(dir, 'memory-plan-2'), 'früher\n');
    const memory = new Map([
      ['w1', 1536],
      ['d1', 1536],
      ['a1', 2048],
    ]);
    const motor = {
      request: (method: string, url: string, body?: { memoryMb: number }) => {
        if (method === 'GET' && url === '/api/servers')
          return Promise.resolve([...memory].map(([id, memoryMb]) => ({ id, memoryMb })));
        if (method === 'PATCH' && body) memory.set(url.split('/').pop() ?? '', body.memoryMb);
        return Promise.resolve(undefined);
      },
    } as unknown as MotorClient;
    const members = [
      { serverId: 'w1', member: 'wintersport' },
      { serverId: 'd1', member: 'duels' },
      { serverId: 'a1', member: 'adlerflug' },
    ];
    expect((await retuneMemory(motor, dir, members, DEFAULT_MODES, quiet)).map((c) => c.member)).toEqual([
      'wintersport',
    ]);
    expect(Object.fromEntries(memory)).toEqual({ w1: 1024, d1: 1536, a1: 2048 });
    memory.set('w1', 1536);
    expect(await retuneMemory(motor, dir, members, DEFAULT_MODES, quiet)).toEqual([]);
  });

  test('Start im Panel: vorher wird Platz geschaffen, Stoppen und andere Wege nicht', async () => {
    const seen: string[] = [];
    const upstream = http.createServer((req, res) => {
      seen.push(`${req.method ?? ''} ${req.url ?? ''}`);
      res.setHeader('content-type', 'application/json');
      res.end('{}');
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const port = (upstream.address() as { port: number }).port;
    const app = Fastify();
    const room: string[] = [];
    await registerMotorProxy(app, `http://127.0.0.1:${port}`, {
      beforeStart: (id) => {
        room.push(id);
        return Promise.resolve();
      },
    });
    try {
      await app.inject({ method: 'POST', url: '/panel/motor/api/servers/ab12/actions/start' });
      await app.inject({ method: 'POST', url: '/panel/motor/api/servers/cd34/actions/restart' });
      await app.inject({ method: 'POST', url: '/panel/motor/api/servers/ef56/actions/stop' });
      await app.inject({ method: 'GET', url: '/panel/motor/api/servers' });
      expect(room).toEqual(['ab12', 'cd34']);
      expect(seen).toContain('POST /api/servers/ab12/actions/start');
      expect(seen).toContain('POST /api/servers/ef56/actions/stop');
    } finally {
      await app.close();
      upstream.close();
    }
  });

  test('alle Server passen zugleich in 32 GB (mit der Reserve des Motors)', () => {
    const total = 32768;
    const reserve = 768;
    const modes = DEFAULT_MODES.filter((m) => m.server);
    const sum =
      PROXY_MB +
      LOBBY_MEMORY_MB +
      BUILD_MEMORY_MB +
      modes.reduce((acc, m) => acc + (MODE_MEMORY_MB[m.id] ?? MODE_DEFAULT_MEMORY_MB), 0);
    expect(modes.length).toBeGreaterThanOrEqual(16);
    // Seit 16 Modi (17.11., Sommerspiele) bleiben neben den Höchstwerten (dazu die Wartungs-Lobby mit 768 MB) gut
    // 0,75 GB Luft für das, was Java neben dem Heap braucht – im Leerlauf geben die Modi aber den Großteil zurück
    // (Ruhezustand), und Wintersport bzw. die Sommerspiele haben je ein halbes Jahr Pause.
    expect(sum + WARTUNG_MB + reserve).toBeLessThanOrEqual(total);
  });
});
