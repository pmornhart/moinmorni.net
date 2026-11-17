import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
import { MOEBEL_PACK_ID } from '@moinmorni/builder';
import { INTERIM_LOBBY_PACKS } from '../src/lib/rename.js';
import { lobbyPackInfo, lobbyPackUrl } from '../src/lobby/packs.js';
import { createLobbyWorld, lobbyProperties, patchProperties } from '../src/lobby/world.js';
import { MotorError, type MotorClient } from '../src/motor/client.js';
import { createProvisioner } from '../src/network/provision.js';
import { createHarness, type Harness } from './harness.js';

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

/** Kleiner Bauplan statt der echten Lobby (die hat ~250 000 Befehle). */
const tinyPack = (version: string) => () => ({
  version,
  parts: 2,
  load: ['forceload add 0 0 15 15'],
  unload: ['forceload remove 0 0 15 15'],
  seasonFiles: {
    'pack.mcmeta': '{"pack":{"description":"Saison","pack_format":48}}\n',
    'data/moinmorni_season/function/wiesn.mcfunction': 'kill @e[tag=mm_season]\n',
    'data/moinmorni_season/function/winter/off_000.mcfunction':
      'fill 0 65 0 3 65 3 air replace snow strict\n',
  },
  seasonSteps: {
    none: ['function moinmorni_season:none'],
    wiesn: [
      'function moinmorni_season:wiesn',
      'execute if data storage moinmorni:season {winter:1b} run function moinmorni_season:winter/off_000',
      'data remove storage moinmorni:season winter',
    ],
    winter: ['function moinmorni_season:winter'],
    easter: ['function moinmorni_season:easter'],
    halloween: ['function moinmorni_season:halloween'],
  },
  seasonLoad: ['forceload add 0 0 31 31'],
  seasonUnload: ['forceload remove 0 0 31 31'],
  files: {
    'pack.mcmeta': '{"pack":{"description":"Test","pack_format":48}}\n',
    'data/moinmorni_lobby/function/prepare.mcfunction': '# geladen\n',
    'data/moinmorni_lobby/function/clean.mcfunction': 'kill @e[type=!player,x=0,y=64,z=0,distance=..320]\n',
    'data/moinmorni_lobby/function/part/000.mcfunction': 'setblock 0 64 0 stone strict\n',
    'data/moinmorni_lobby/function/part/001.mcfunction': 'setblock 1 64 0 stone strict\n',
    'data/moinmorni_lobby/function/finish.mcfunction': 'forceload remove 0 0\n',
  },
});

describe('Lobby baut sich selbst', () => {
  let open: Harness | undefined;
  afterEach(async () => {
    await open?.cleanup();
    open = undefined;
  });
  const harness = async (): Promise<Harness> => {
    open = await createHarness();
    return open;
  };

  test('server.properties: nur eigene Schlüssel, Rest und Kommentare bleiben, Umlaute als \\u', () => {
    const before = '#Minecraft server properties\nmotd=Hallo\ngamemode=survival\n';
    const after = patchProperties(before, {
      gamemode: 'adventure',
      'resource-pack-prompt': '{"text":"Grüß dich"}',
    });
    expect(after.changed).toBe(true);
    expect(after.text).toBe(
      '#Minecraft server properties\nmotd=Hallo\ngamemode=adventure\nresource-pack-prompt={"text":"Gr\\u00fc\\u00df dich"}\n',
    );
    expect(patchProperties(after.text, { gamemode: 'adventure' }).changed).toBe(false);
  });

  test('Einrichten: Lobby-Einstellungen vor dem Start, Welt per Datenpaket bauen, beim zweiten Mal nichts', async () => {
    const h = await harness();
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin');
    const config = { ...h.mm.config, pluginFile: jar };
    const commands: string[] = [];
    const motor: MotorClient = {
      ...h.mm.motor,
      request: async <T>(method: string, url: string, body?: unknown): Promise<T> => {
        if (url.endsWith('/command')) commands.push((body as { command: string }).command);
        return h.mm.motor.request<T>(method, url, body);
      },
    };
    const world = createLobbyWorld(motor, quiet, {
      season: () => 'wiesn',
      pack: tinyPack('v1'),
      sleep: () => new Promise((r) => setTimeout(r, 20)),
      settleMs: 0,
      gapMs: 0,
      pollMs: 100,
      readyTimeoutMs: 20_000,
      loadTimeoutMs: 2_000,
    });
    const provisioner = createProvisioner(config, motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      versions: { paper: '1.21.4', velocity: '3.4.0' },
      configureLobby: world.configure,
    });
    const result = await provisioner.ensure();
    expect(result.lobbyServerId).not.toBe('');
    // Zweiter Durchlauf: nichts mehr zu ändern, obwohl der Motor die Datei umformatiert hat.
    expect(await world.configure(result.lobbyServerId)).toBe(false);

    const read = async (file: string): Promise<string> =>
      (
        await h.mm.motor.request<{ content: string }>(
          'GET',
          `/api/servers/${result.lobbyServerId}/files/content?path=${encodeURIComponent(file)}`,
        )
      ).content;
    const props = await read('server.properties');
    expect(props).toContain('gamemode=adventure');
    expect(props).toContain('difficulty=peaceful');
    // Jump and Run: Blöcke nur beim Läufer – sonst „Schweben“-Rauswurf.
    expect(props).toContain('allow-flight=true');
    // Ohne eigene Domain kein Möbel-Paket (Minecraft lädt nur von außen erreichbare Adressen).
    expect(props).toMatch(/^resource-pack=$/m); // eslint-disable-line ts-patterns/require-regex-example -- empty pack line: "resource-pack=" yes, "resource-pack=https://…" no
    expect(props).toContain('require-resource-pack=false');

    // Rückbenennung: Datenpakete unter dem Zwischen-Namen liegen noch in der Welt – nach dem Bau sind sie weg.
    await Promise.all(
      INTERIM_LOBBY_PACKS.map((dir) =>
        h.mm.motor.request('PUT', `/api/servers/${result.lobbyServerId}/files/content`, {
          path: `world/datapacks/${dir}/pack.mcmeta`,
          content: '{}',
        }),
      ),
    );
    expect(await world.build(result.lobbyServerId)).toBe('built');
    await Promise.all(
      INTERIM_LOBBY_PACKS.map((dir) =>
        expect(read(`world/datapacks/${dir}/pack.mcmeta`)).rejects.toBeInstanceOf(MotorError),
      ),
    );
    expect(
      await read('world/datapacks/moinmorni-lobby/data/moinmorni_lobby/function/part/001.mcfunction'),
    ).toContain('setblock 1 64 0');
    expect((await read('plugins/moinmorni/lobby-world.version')).trim()).toBe('v1');
    expect((await read('plugins/moinmorni/lobby-world.target')).trim()).toBe('v1');
    expect(commands[0]).toBe('minecraft:reload');
    // Aufräumen erst nach dem Laden der Stücke, vor dem ersten Bau-Schritt.
    expect(commands.indexOf('minecraft:function moinmorni_lobby:clean')).toBeGreaterThan(
      commands.indexOf('minecraft:forceload add 0 0 15 15'),
    );
    expect(commands.indexOf('minecraft:function moinmorni_lobby:clean')).toBeLessThan(
      commands.indexOf('minecraft:function moinmorni_lobby:part/000'),
    );
    expect(commands).toContain('minecraft:function moinmorni_lobby:part/001');
    expect(commands.indexOf('minecraft:function moinmorni_lobby:finish')).toBeGreaterThan(
      commands.indexOf('minecraft:function moinmorni_lobby:part/001'),
    );
    expect(commands).toContain('minecraft:datapack disable "file/moinmorni-lobby"');
    // Danach die Saison-Deko: Bereich festhalten, Schritte der Saison nacheinander (liegt Winter-Schnee, kommt er
    // weg), loslassen.
    expect(commands.filter((c) => !c.includes('execute if loaded')).slice(-5)).toEqual([
      'minecraft:forceload add 0 0 31 31',
      'minecraft:function moinmorni_season:wiesn',
      'minecraft:execute if data storage moinmorni:season {winter:1b} run function moinmorni_season:winter/off_000',
      'minecraft:data remove storage moinmorni:season winter',
      'minecraft:forceload remove 0 0 31 31',
    ]);
    expect(
      await read('world/datapacks/moinmorni-lobby-season/data/moinmorni_season/function/wiesn.mcfunction'),
    ).toContain('kill @e[tag=mm_season]');

    commands.length = 0;
    expect(await world.build(result.lobbyServerId)).toBe('current');
    expect(commands).toEqual([]);
  });

  test('Server antwortet gleich nach dem Start zu langsam: Befehl wird wiederholt, der Bau läuft durch', async () => {
    const h = await harness();
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin');
    const config = { ...h.mm.config, pluginFile: jar };
    const slow = { left: 2 };
    const commands: string[] = [];
    const motor: MotorClient = {
      ...h.mm.motor,
      request: async <T>(method: string, url: string, body?: unknown): Promise<T> => {
        const command = url.endsWith('/command') ? (body as { command: string }).command : '';
        if (command) commands.push(command);
        if (command.endsWith('part/000') && slow.left > 0) {
          slow.left -= 1;
          throw new MotorError(409, 'command_failed');
        }
        return h.mm.motor.request<T>(method, url, body);
      },
    };
    const world = createLobbyWorld(motor, quiet, {
      pack: tinyPack('v1'),
      sleep: () => new Promise((r) => setTimeout(r, 5)),
      settleMs: 0,
      gapMs: 0,
      pollMs: 100,
      retryMs: 0,
      readyTimeoutMs: 20_000,
      loadTimeoutMs: 2_000,
    });
    const provisioner = createProvisioner(config, motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      versions: { paper: '1.21.4', velocity: '3.4.0' },
      configureLobby: world.configure,
    });
    const result = await provisioner.ensure();
    expect(await world.build(result.lobbyServerId)).toBe('built');
    expect(commands.filter((c) => c.endsWith('part/000'))).toHaveLength(3);
  });

  test('Ein Stück lässt sich auf dem Server nicht laden (z. B. alter Blockname): Bau läuft durch, Fehler im Protokoll', async () => {
    const h = await harness();
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin');
    const config = { ...h.mm.config, pluginFile: jar };
    const motor: MotorClient = {
      ...h.mm.motor,
      request: async <T>(method: string, url: string, body?: unknown): Promise<T> => {
        const command = url.endsWith('/command') ? (body as { command: string }).command : '';
        if (command.endsWith('part/001')) return { answer: 'Unknown function moinmorni_lobby:part/001' } as T;
        return h.mm.motor.request<T>(method, url, body);
      },
    };
    const errors: unknown[] = [];
    const log = { ...quiet, error: (obj: unknown) => errors.push(obj) } as unknown as FastifyBaseLogger;
    const world = createLobbyWorld(motor, log, {
      pack: tinyPack('v1'),
      sleep: () => new Promise((r) => setTimeout(r, 5)),
      settleMs: 0,
      gapMs: 0,
      pollMs: 100,
      readyTimeoutMs: 20_000,
      loadTimeoutMs: 2_000,
    });
    const provisioner = createProvisioner(config, motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      versions: { paper: '1.21.4', velocity: '3.4.0' },
      configureLobby: world.configure,
    });
    const result = await provisioner.ensure();
    expect(await world.build(result.lobbyServerId)).toBe('built');
    expect(errors).toEqual([{ parts: ['part/001'] }]);
  });

  test('Möbel-Paket: mit Domain bietet die Lobby es an (feste Kennung, Pflicht per Schalter), die Webseite liefert es', async () => {
    const offer = { url: lobbyPackUrl('moinmorni.net'), sha1: lobbyPackInfo().sha1, required: true };
    const props = lobbyProperties(offer);
    expect(props['resource-pack']).toBe('https://moinmorni.net/api/public/packs/lobby.zip');
    expect(props['resource-pack-sha1']).toMatch(/^[0-9a-f]{40}$/); // eslint-disable-line ts-patterns/require-regex-example -- SHA-1 hex: "da39a3ee5e6b4b0d3255bfef95601890afd80709" yes, "abc" no
    expect(props['resource-pack-id']).toBe(MOEBEL_PACK_ID);
    expect(props['require-resource-pack']).toBe('true');
    expect(lobbyProperties({ ...offer, url: null })['resource-pack']).toBe('');

    const h = await harness();
    const res = await h.mm.app.inject({ method: 'GET', url: '/api/public/packs/lobby.zip' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(crypto.createHash('sha1').update(res.rawPayload).digest('hex')).toBe(offer.sha1);
  });
});
