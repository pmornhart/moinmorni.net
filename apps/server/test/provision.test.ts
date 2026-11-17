import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
import { createBuildService } from '../src/build/service.js';
import { INTERIM_ID, INTERIM_MODE_JARS, INTERIM_NETWORK_JAR, INTERIM_TITLE } from '../src/lib/rename.js';
import { createProvisioner } from '../src/network/provision.js';
import { DEFAULT_MODES } from '@moinmorni/shared';
import { createHarness, type Harness } from './harness.js';

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

interface Net {
  readonly id: string;
  readonly name: string;
  readonly proxy: { serverId: string; serverName: string };
  readonly members: Array<{ serverId: string; name: string; serverName: string }>;
  readonly defaultMember: string | null;
}

describe('Netzwerk richtet sich selbst ein', () => {
  let h: Harness;
  afterEach(async () => {
    await h.cleanup();
  });

  test('Spielmodus mit Release bekommt eigenen Server und sein Plugin; neues Release → wieder aufspielen', async () => {
    h = await createHarness();
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin-v1');
    const config = { ...h.mm.config, pluginFile: jar };
    const release = { tag: 'v1.0.0', bytes: Buffer.from('duels-v1') };
    const provisioner = createProvisioner(config, h.mm.motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
      modes: () => DEFAULT_MODES,
      releases: {
        // Nur Duels hat schon ein Release, die anderen Modi noch nicht.
        latest: async (repo) =>
          repo.endsWith('MoinMorni-Duels')
            ? { repo, tag: release.tag, fileName: 'MoinMorni-Duels.jar', bytes: release.bytes }
            : null,
      },
    });
    const first = await provisioner.ensure();
    expect(first.created).toEqual(['proxy', 'lobby', 'wartung', 'bau', 'duels']);
    expect(first.modesInstalled).toEqual(['duels']);

    const nets = await h.mm.motor.request<Net[]>('GET', '/api/networks');
    const duelsId =
      nets.find((n) => n.name === 'MoinMorni')?.members.find((m) => m.name === 'duels')?.serverId ?? '';
    const read = (file: string) =>
      h.mm.motor.request<{ content: string }>(
        'GET',
        `/api/servers/${duelsId}/files/content?path=${encodeURIComponent(file)}`,
      );
    expect((await read('plugins/moinmorni/mode-release.txt')).content.split('\n')).toEqual([
      'pmornhart/MoinMorni-Duels@v1.0.0',
      'MoinMorni-Duels.jar',
      '',
    ]);
    expect((await read('plugins/moinmorni/hub.json')).content).toContain('"server": "duels"');

    const again = await provisioner.ensure();
    expect(again.created).toEqual([]);
    expect(again.modesInstalled).toEqual([]);

    release.tag = 'v1.1.0';
    release.bytes = Buffer.from('duels-v2');
    const update = await provisioner.ensure();
    expect(update.modesInstalled).toEqual(['duels']);
    expect(update.restart.map((r) => r.member)).toEqual(['duels']);
  });

  test('Neue Spielmodi nur mit Schalter (Panel → Updates); der Name der Jar kommt aus MODE_JARS', async () => {
    h = await createHarness();
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin-v1');
    const asked: Array<readonly [string, string | undefined]> = [];
    const allow = { modes: false };
    const provisioner = createProvisioner({ ...h.mm.config, pluginFile: jar }, h.mm.motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
      modes: () => DEFAULT_MODES,
      addModes: () => allow.modes,
      releases: {
        latest: async (repo, jarName) => {
          asked.push([repo, jarName]);
          return repo.endsWith('Morni-Bollwek')
            ? { repo, tag: 'v0.1.3', fileName: jarName ?? '', bytes: Buffer.from('bollwerk') }
            : null;
        },
      },
    });
    const first = await provisioner.ensure();
    expect(first.created).toEqual(['proxy', 'lobby', 'wartung', 'bau']);
    expect(asked).toContainEqual(['pmornhart/Morni-Bollwek', 'Morni-Bollwerk.jar']);
    allow.modes = true;
    const second = await provisioner.ensure();
    expect(second.created).toEqual(['bollwerk']);
    expect(second.modesInstalled).toEqual(['bollwerk']);
  });

  test('Rückbenennung: Netzwerk, Server und Jars unter dem Zwischen-Namen werden zurückgestellt', async () => {
    h = await createHarness();
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin-neu');
    const config = { ...h.mm.config, pluginFile: jar };
    const options = {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
      modes: () => DEFAULT_MODES,
      releases: {
        latest: async (repo: string) =>
          repo.endsWith('MoinMorni-Duels')
            ? { repo, tag: 'v0.1.2', fileName: 'MoinMorni-Duels.jar', bytes: Buffer.from('duels-neu') }
            : null,
      },
    };
    await createProvisioner(config, h.mm.motor, h.mm.hub, quiet, options).ensure();
    const motor = h.mm.motor;
    const [net] = await motor.request<Net[]>('GET', '/api/networks');
    const all = [net!.proxy, ...net!.members];
    const duelsId = net!.members.find((m) => m.name === 'duels')?.serverId ?? '';
    const interimDir = `plugins/${INTERIM_ID}`;

    // So sah eine Installation unter dem Zwischen-Namen aus: Name im Motor, Jars, Stempel im Zwischen-Ordner.
    await motor.request('PATCH', `/api/networks/${net!.id}`, { name: INTERIM_TITLE });
    await Promise.all(
      all.map((s) =>
        motor.request('PATCH', `/api/servers/${s.serverId}`, {
          name: s.serverName.replace(/^\S+/, INTERIM_TITLE), // eslint-disable-line ts-patterns/require-regex-example -- "MoinMorni Lobby" → "<Zwischen-Name> Lobby"
        }),
      ),
    );
    await Promise.all(
      all.map(async (s) => {
        await motor.upload(s.serverId, 'plugins', INTERIM_NETWORK_JAR, Buffer.from('plugin-zwischen'));
        await motor.request('PUT', `/api/servers/${s.serverId}/files/content`, {
          path: `${interimDir}/plugin.sha256`,
          content: 'zwischen\n',
        });
        await motor.request('POST', `/api/servers/${s.serverId}/files/delete`, {
          paths: ['plugins/MoinMorni-Network.jar', 'plugins/moinmorni'],
        });
      }),
    );
    await motor.upload(duelsId, 'plugins', INTERIM_MODE_JARS['duels'] ?? '', Buffer.from('duels-zwischen'));
    await motor.request('PUT', `/api/servers/${duelsId}/files/content`, {
      path: `${interimDir}/mode-release.txt`,
      content: `pmornhart/Morni-Duels@v0.1.1\n${INTERIM_MODE_JARS['duels']}\n`,
    });
    await motor.request('POST', `/api/servers/${duelsId}/files/delete`, {
      paths: ['plugins/MoinMorni-Duels.jar'],
    });

    const result = await createProvisioner(config, motor, h.mm.hub, quiet, options).ensure();
    expect(result.created).toEqual([]);
    const [after] = await motor.request<Net[]>('GET', '/api/networks');
    expect(after?.name).toBe('MoinMorni');
    expect([after!.proxy, ...after!.members].map((s) => s.serverName).sort()).toEqual([
      'MoinMorni Bau',
      'MoinMorni Duels',
      'MoinMorni Lobby',
      'MoinMorni Proxy',
      'MoinMorni Wartung',
    ]);
    const jars = async (id: string): Promise<string[]> =>
      (await motor.request<Array<{ name: string }>>('GET', `/api/servers/${id}/files?path=plugins`))
        .map((f) => f.name)
        .filter((n) => n.endsWith('.jar'))
        .sort();
    // Nie zwei Netzwerk-Plugins, nie zwei Duels-Jars.
    expect(await jars(after!.proxy.serverId)).toEqual(['MoinMorni-Network.jar']);
    expect(await jars(duelsId)).toEqual(['MoinMorni-Duels.jar', 'MoinMorni-Network.jar']);
    // Alles neu auf laufenden Servern → Neustart, sobald niemand drauf ist (den Ordner holt das Plugin dabei zurück).
    expect(result.restart.map((r) => r.member).sort()).toEqual(['bau', 'duels', 'lobby', 'proxy', 'wartung']);
  });

  test('Proxy und Lobby anlegen, Plugin und Schlüssel aufspielen – beim zweiten Mal nichts doppelt', async () => {
    h = await createHarness();
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin-v1');
    const config = { ...h.mm.config, pluginFile: jar };
    const provisioner = createProvisioner(config, h.mm.motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
    });

    const first = await provisioner.ensure();
    // Die Wartungs-Lobby gehört von Anfang an dazu (zweite Wahl nach der Lobby).
    expect(first.created).toEqual(['proxy', 'lobby', 'wartung', 'bau']);
    expect(first.pluginUpdated).toEqual(['proxy', 'lobby', 'wartung', 'bau']);
    expect(first.wartungServerId).not.toBe('');
    expect(first.restart).toEqual([]); // neu angelegt: startet ohnehin frisch
    // Immer online, ohne Spieler aber wenig Arbeitsspeicher: jeder neue Server gibt im Leerlauf Speicher frei.
    const created = await h.mm.motor.request<Array<{ readonly releaseIdleMemory?: boolean }>>(
      'GET',
      '/api/servers',
    );
    expect(created.map((s) => s.releaseIdleMemory)).toEqual(
      ['proxy', 'lobby', 'wartung', 'bau'].map(() => true),
    );

    const nets = await h.mm.motor.request<Net[]>('GET', '/api/networks');
    const net = nets.find((n) => n.name === 'MoinMorni');
    expect(net?.members.map((m) => m.name)).toEqual(['lobby', 'wartung', 'bau']);
    expect(net?.defaultMember).toBe('lobby');

    const lobbyId = net?.members[0]?.serverId ?? '';
    const read = (id: string, file: string) =>
      h.mm.motor.request<{ content: string }>(
        'GET',
        `/api/servers/${id}/files/content?path=${encodeURIComponent(file)}`,
      );
    const hubJson = JSON.parse((await read(lobbyId, 'plugins/moinmorni/hub.json')).content) as Record<
      string,
      string
    >;
    expect(hubJson).toEqual({
      url: 'ws://moinmorni:8090/hub',
      server: 'lobby',
      kind: 'backend',
      key: h.mm.hub.keyFor('lobby', 'backend'),
    });
    const proxyJson = JSON.parse(
      (await read(net?.proxy.serverId ?? '', 'plugins/moinmorni/hub.json')).content,
    ) as Record<string, string>;
    expect(proxyJson).toMatchObject({ server: 'proxy', kind: 'proxy' });
    const plugins = await h.mm.motor.request<Array<{ name: string }>>(
      'GET',
      `/api/servers/${lobbyId}/files?path=plugins`,
    );
    expect(JSON.stringify(plugins)).toContain('MoinMorni-Network.jar');

    const second = await provisioner.ensure();
    expect(second).toMatchObject({ created: [], pluginUpdated: [], restart: [] });

    fs.writeFileSync(jar, 'plugin-v2');
    const third = await provisioner.ensure();
    expect(third.pluginUpdated).toEqual(['proxy', 'lobby', 'wartung', 'bau']);
    // Neues Plugin auf laufenden Servern → Neustart, sobald niemand drauf ist.
    expect(third.restart.map((r) => r.member)).toEqual(['proxy', 'lobby', 'wartung', 'bau']);
    expect((await h.mm.motor.request<Net[]>('GET', '/api/networks')).length).toBe(1);
  });
  test('Bau-Server: Kreativ und flach, Bauten (Schematics) per Knopf in die Lobby kopieren', async () => {
    h = await createHarness();
    const jar = path.join(h.mmDir, 'MoinMorni-Network.jar');
    fs.writeFileSync(jar, 'plugin');
    await createProvisioner({ ...h.mm.config, pluginFile: jar }, h.mm.motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
    }).ensure();
    const build = createBuildService(h.mm.motor, h.mm.stores);
    const nets = await h.mm.motor.request<Net[]>('GET', '/api/networks');
    const members = nets.find((n) => n.name === 'MoinMorni')?.members ?? [];
    const bau = members.find((m) => m.name === 'bau')?.serverId ?? '';
    const lobby = members.find((m) => m.name === 'lobby')?.serverId ?? '';
    expect(await build.configure(bau)).toBe(true);
    const props = await h.mm.motor.request<{ content: string }>(
      'GET',
      `/api/servers/${bau}/files/content?path=server.properties`,
    );
    expect(props.content).toContain('gamemode=creative');
    expect(props.content).toMatch(/level-type=minecraft\\?:flat/); // eslint-disable-line ts-patterns/require-regex-example -- "level-type=minecraft\\:flat" (escaped) or "level-type=minecraft:flat"
    expect(await build.configure(bau)).toBe(false);

    expect((await build.overview()).schematics).toEqual([]);
    // Echte Schematics sind gzip – genau so muss die Datei drüben ankommen (nicht unterwegs entpackt).
    const schem = new Uint8Array(zlib.gzipSync(Buffer.from('Schematic-Inhalt')));
    await h.mm.motor.upload(bau, 'plugins/WorldEdit/schematics', 'rathaus.schem', schem);
    const overview = await build.overview();
    expect(overview.schematics.map((f) => f.name)).toEqual(['rathaus.schem']);
    expect(overview.targets.map((t) => t.id)).toContain('lobby');
    await build.copy('rathaus.schem', 'lobby');
    const copied = await h.mm.motor.download(lobby, 'plugins/WorldEdit/schematics/rathaus.schem');
    expect(Buffer.from(copied).equals(Buffer.from(schem))).toBe(true);
    await expect(build.copy('rathaus.schem', 'bau')).rejects.toThrow();
  });
});
