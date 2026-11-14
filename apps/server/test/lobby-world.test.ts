import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
import { createLobbyWorld, patchProperties } from '../src/lobby/world.js';
import { lobbyPackInfo } from '../src/lobby/packs.js';
import type { MotorClient } from '../src/motor/client.js';
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
  files: {
    'pack.mcmeta': '{"pack":{"description":"Test","pack_format":48}}\n',
    'data/moinmorni_lobby/function/prepare.mcfunction': 'forceload add 0 0\n',
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
    const world = createLobbyWorld(motor, 'moinmorni.net', quiet, {
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
    // Der Motor schreibt die Datei im Java-Format zurück („:“ als „\\:“) – beides liest Minecraft gleich.
    expect(props.replaceAll('\\:', ':')).toContain(
      'resource-pack=https://moinmorni.net/api/public/packs/lobby.zip',
    );
    expect(props).toContain(`resource-pack-sha1=${lobbyPackInfo().sha1}`);
    // Standard: nur anbieten, nicht erzwingen (sonst sperrt eine nicht erreichbare Webseite alle aus).
    expect(props).toContain('require-resource-pack=false');

    expect(await world.build(result.lobbyServerId)).toBe('built');
    expect(
      await read('world/datapacks/moinmorni-lobby/data/moinmorni_lobby/function/part/001.mcfunction'),
    ).toContain('setblock 1 64 0');
    expect((await read('plugins/moinmorni/lobby-world.version')).trim()).toBe('v1');
    expect(commands[0]).toBe('minecraft:reload');
    expect(commands).toContain('minecraft:function moinmorni_lobby:part/000');
    expect(commands).toContain('minecraft:function moinmorni_lobby:part/001');
    expect(commands.indexOf('minecraft:function moinmorni_lobby:finish')).toBeGreaterThan(
      commands.indexOf('minecraft:function moinmorni_lobby:part/001'),
    );
    expect(commands.at(-1)).toBe('minecraft:datapack disable "file/moinmorni-lobby"');

    commands.length = 0;
    expect(await world.build(result.lobbyServerId)).toBe('current');
    expect(commands).toEqual([]);
  });

  test('Figuren-Paket ist öffentlich abrufbar, mit gleicher SHA-1 wie in der server.properties', async () => {
    const h = await harness();
    const res = await h.mm.app.inject({ method: 'GET', url: '/api/public/packs/lobby.zip' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(res.rawPayload.equals(lobbyPackInfo().bytes)).toBe(true);
  });
});
