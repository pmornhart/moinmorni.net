import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
import { DEFAULT_MODES } from '@moinmorni/shared';
import { openDatabase } from '../src/db/index.js';
import { createEventBus } from '../src/lib/events.js';
import type { MotorClient } from '../src/motor/client.js';
import { idleMemoryOnce, sleepOffOnce } from '../src/network/always-on.js';
import { createSleepService } from '../src/network/sleep.js';
import { createStores } from '../src/panel/stores.js';

const quiet = { info: () => undefined, warn: () => undefined } as unknown as FastifyBaseLogger;

describe('Immer online: Modi schlafen nicht mehr, sie geben im Leerlauf Speicher frei', () => {
  const dirs: string[] = [];
  const tempDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-always-on-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  });

  test('neue Installationen: kein Modus schläft, der Bau-Server auch nicht', () => {
    expect(DEFAULT_MODES.filter((m) => m.sleepWhenEmpty)).toEqual([]);
    const stores = createStores(openDatabase(':memory:').db, createEventBus());
    expect(stores.settings('build')['sleepWhenEmpty']).toBe(false);
  });

  test('ältere Installationen: einmal alle auf „immer online“, danach bleibt, was im Panel steht', () => {
    const dir = tempDir();
    const stores = createStores(openDatabase(':memory:').db, createEventBus());
    // So sah es vorher aus: fast alle Modi und der Bau-Server schliefen.
    stores.patchMode('duels', { sleepWhenEmpty: true }, 'test');
    stores.patchMode('party', { sleepWhenEmpty: true }, 'test');
    stores.patchSettings('build', { sleepWhenEmpty: true }, 'test');

    // Zurück kommen die Server (Bau-Server „bau“), damit die gerade schlafenden wieder starten.
    expect(sleepOffOnce(stores, dir, quiet).sort()).toEqual(['bau', 'duels', 'party']);
    expect(stores.modes().filter((m) => m.sleepWhenEmpty)).toEqual([]);
    expect(stores.settings('build')['sleepWhenEmpty']).toBe(false);

    // Philip will Duels doch schlafen lassen: das bleibt.
    stores.patchMode('duels', { sleepWhenEmpty: true }, 'test');
    expect(sleepOffOnce(stores, dir, quiet)).toEqual([]);
    expect(stores.modes().find((m) => m.id === 'duels')?.sleepWhenEmpty).toBe(true);
  });

  test('Motor: einmal „Arbeitsspeicher im Leerlauf freigeben“ für alle Server des Netzwerks', async () => {
    const dir = tempDir();
    const calls: string[] = [];
    const list = [
      { id: 'p1', releaseIdleMemory: false },
      { id: 'l1', releaseIdleMemory: true },
      { id: 'd1', releaseIdleMemory: false },
      // Ein Server außerhalb des Netzwerks bleibt, wie er ist.
      { id: 'fremd', releaseIdleMemory: false },
    ];
    const motor = {
      request: (method: string, url: string, body?: unknown) => {
        calls.push(`${method} ${url}${body ? ` ${JSON.stringify(body)}` : ''}`);
        return Promise.resolve(method === 'GET' ? list : undefined);
      },
    } as unknown as MotorClient;
    const members = [
      { serverId: 'p1', member: 'proxy' },
      { serverId: 'l1', member: 'lobby' },
      { serverId: 'd1', member: 'duels' },
    ];

    const changed = await idleMemoryOnce(motor, dir, members, quiet);
    expect(changed).toEqual([
      { serverId: 'p1', member: 'proxy' },
      { serverId: 'd1', member: 'duels' },
    ]);
    expect(calls.filter((c) => c.startsWith('PATCH'))).toEqual([
      'PATCH /api/servers/p1 {"releaseIdleMemory":true}',
      'PATCH /api/servers/d1 {"releaseIdleMemory":true}',
    ]);
    // Nur einmal: wer es danach im Panel ausschaltet, behält das.
    calls.length = 0;
    expect(await idleMemoryOnce(motor, dir, members, quiet)).toEqual([]);
    expect(calls).toEqual([]);
  });

  test('Motor kennt die Einstellung noch nicht (ältere Fassung): nichts ändern, beim nächsten Start noch einmal', async () => {
    const dir = tempDir();
    const calls: string[] = [];
    const motor = {
      request: (method: string, url: string) => {
        calls.push(`${method} ${url}`);
        return Promise.resolve(method === 'GET' ? [{ id: 'p1' }, { id: 'l1' }] : undefined);
      },
    } as unknown as MotorClient;
    const members = [
      { serverId: 'p1', member: 'proxy' },
      { serverId: 'l1', member: 'lobby' },
    ];
    expect(await idleMemoryOnce(motor, dir, members, quiet)).toEqual([]);
    expect(calls).toEqual(['GET /api/servers']);
    expect(await idleMemoryOnce(motor, dir, members, quiet)).toEqual([]);
    expect(calls).toEqual(['GET /api/servers', 'GET /api/servers']);
  });

  test('wer schlief, startet wieder, sobald er in den Speicher passt – wer schlafen soll, nicht', async () => {
    const dir = tempDir();
    const stores = createStores(openDatabase(':memory:').db, createEventBus());
    // Gipfelsturm soll weiter schlafen (Schalter im Panel), Duels ist jetzt immer online.
    stores.patchMode('gipfelsturm', { sleepWhenEmpty: true }, 'test');
    const PROXY = 1024;
    const LOBBY = 3072;
    const MODE = 1536;
    const TIGHT = 6000;
    const ROOMY = 8192;
    const host = { memoryTotalMb: TIGHT };
    const started: string[] = [];
    const servers = [
      { id: 'pr', memoryMb: PROXY, live: { state: 'running', playersOnline: 0 } },
      { id: 'lo', memoryMb: LOBBY, live: { state: 'running', playersOnline: 0 } },
      { id: 'du', memoryMb: MODE, live: { state: 'stopped', playersOnline: 0 } },
      { id: 'gi', memoryMb: MODE, live: { state: 'stopped', playersOnline: 0 } },
      // Von Hand angehalten: hat das Netzwerk nicht schlafen geschickt, bleibt aus.
      { id: 'bo', memoryMb: MODE, live: { state: 'stopped', playersOnline: 0 } },
    ];
    // Start eines Servers: "/api/servers/du/actions/start" passt (du), "/api/servers" nicht.
    // https://regex101.com/?flavor=javascript&regex=%5E%5C%2Fapi%5C%2Fservers%5C%2F(%5Cw%2B)%5C%2Factions%5C%2Fstart%24&testString=%2Fapi%2Fservers%2Fdu%2Factions%2Fstart
    const START = /^\/api\/servers\/(\w+)\/actions\/start$/;
    const motor = {
      request: (method: string, url: string) => {
        if (url === '/api/servers') return Promise.resolve(servers);
        if (url === '/api/host') return Promise.resolve(host);
        if (url === '/api/networks')
          return Promise.resolve([
            {
              name: 'MoinMorni',
              proxy: { serverId: 'pr' },
              members: [
                { name: 'lobby', serverId: 'lo' },
                { name: 'duels', serverId: 'du' },
                { name: 'gipfelsturm', serverId: 'gi' },
                { name: 'bollwerk', serverId: 'bo' },
              ],
            },
          ]);
        const start = START.exec(url)?.[1];
        if (method === 'POST' && start) {
          started.push(start);
          const s = servers.find((x) => x.id === start);
          if (s) s.live = { state: 'starting', playersOnline: 0 };
        }
        return Promise.resolve(undefined);
      },
    } as unknown as MotorClient;
    const hub = { presence: { counts: () => ({}) } as never, connectedServers: () => [] };
    const sleep = createSleepService(motor, hub, stores, quiet, dir);
    sleep.remember(['duels', 'gipfelsturm']);

    // 4 GB laufen, Duels braucht 1,5 GB + 0,75 GB Reserve – bei 6 GB passt das nicht: warten, nichts schlafen schicken.
    expect(await sleep.keepOnline()).toEqual([]);
    expect(started).toEqual([]);

    // Nach einem Neustart von MoinMorni weiß das Netzwerk es noch; jetzt ist genug Platz.
    host.memoryTotalMb = ROOMY;
    const again = createSleepService(motor, hub, stores, quiet, dir);
    expect(await again.keepOnline()).toEqual(['duels']);
    expect(started).toEqual(['du']);
    // Läuft wieder: vergessen. Gipfelsturm schläft weiter, Bollwerk bleibt aus.
    expect(await again.keepOnline()).toEqual([]);
    expect(started).toEqual(['du']);
    stores.patchMode('gipfelsturm', { sleepWhenEmpty: false }, 'test');
    expect(await again.keepOnline()).toEqual(['gipfelsturm']);
    expect(started).toEqual(['du', 'gi']);
  });

  test('Sicherheitsnetz: reicht der Speicher nicht, schläft auch ein Modus ohne „schlafen, wenn leer“ – die mit zuerst', async () => {
    const stores = createStores(openDatabase(':memory:').db, createEventBus());
    stores.patchMode('gipfelsturm', { sleepWhenEmpty: true }, 'test');
    // Wie im Netzwerk: Proxy 1 GB, Lobby 3 GB, Modi 1,5 GB, Party 2 GB – der Rechner hat 8 GB.
    const PROXY = 1024;
    const LOBBY = 3072;
    const MODE = 1536;
    const PARTY = 2048;
    const TOTAL = 8192;
    const stopped: string[] = [];
    const servers = [
      { id: 'pr', memoryMb: PROXY, live: { state: 'running', playersOnline: 0 } },
      { id: 'lo', memoryMb: LOBBY, live: { state: 'running', playersOnline: 0 } },
      { id: 'du', memoryMb: MODE, live: { state: 'running', playersOnline: 0 } },
      { id: 'gi', memoryMb: MODE, live: { state: 'running', playersOnline: 0 } },
      { id: 'pa', memoryMb: PARTY, live: { state: 'stopped', playersOnline: 0 } },
    ];
    // Aktionen des Motors: "/api/servers/gi/actions/stop" passt (Server gi, stop), "/api/servers" nicht.
    // https://regex101.com/?flavor=javascript&regex=%5E%5C%2Fapi%5C%2Fservers%5C%2F(%5Cw%2B)%5C%2Factions%5C%2Fstop%24&testString=%2Fapi%2Fservers%2Fgi%2Factions%2Fstop
    const STOP = /^\/api\/servers\/(\w+)\/actions\/stop$/;
    // Ein Server: "/api/servers/gi" passt (gi), "/api/servers/gi/actions/stop" nicht.
    // https://regex101.com/?flavor=javascript&regex=%5E%5C%2Fapi%5C%2Fservers%5C%2F(%5Cw%2B)%24&testString=%2Fapi%2Fservers%2Fgi
    const ONE = /^\/api\/servers\/(\w+)$/;
    const motor = {
      request: (method: string, url: string) => {
        if (url === '/api/servers') return Promise.resolve(servers);
        if (url === '/api/host') return Promise.resolve({ memoryTotalMb: TOTAL });
        if (url === '/api/networks')
          return Promise.resolve([
            {
              name: 'MoinMorni',
              proxy: { serverId: 'pr' },
              members: [
                { name: 'lobby', serverId: 'lo' },
                { name: 'duels', serverId: 'du' },
                { name: 'gipfelsturm', serverId: 'gi' },
                { name: 'party', serverId: 'pa' },
              ],
            },
          ]);
        const stop = STOP.exec(url)?.[1];
        if (method === 'POST' && stop) {
          stopped.push(stop);
          const s = servers.find((x) => x.id === stop);
          if (s) s.live = { state: 'stopped', playersOnline: 0 };
        }
        const one = ONE.exec(url)?.[1];
        if (one) return Promise.resolve(servers.find((x) => x.id === one));
        return Promise.resolve(undefined);
      },
    } as unknown as MotorClient;
    const hub = { presence: { counts: () => ({}) } as never, connectedServers: () => [] };
    const sleep = createSleepService(motor, hub, stores, quiet);

    // 7 GB laufen, Party braucht 2 GB (+ 0,75 GB Reserve des Motors) von 8 GB → 2,75 GB fehlen: erst Gipfelsturm
    // (schläft gern), dann Duels (immer online, aber leer). Lobby und Proxy nie.
    const asleep = ['gi', 'du'];
    expect(await sleep.makeRoom('pa')).toBe(asleep.length);
    expect(stopped).toEqual(asleep);
  });
});
