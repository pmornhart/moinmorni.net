import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
import { createBuildService } from '../src/build/service.js';
import { OLD_MODE_JARS, OLD_NETWORK_JAR, OLD_TITLE } from '../src/lib/rename.js';
import { createProvisioner } from '../src/network/provision.js';
import { DEFAULT_MODES } from '@morninet/shared';
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
    const jar = path.join(h.mmDir, 'MorniNet.jar');
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
          repo.endsWith('Morni-Duels')
            ? { repo, tag: release.tag, fileName: 'Morni-Duels.jar', bytes: release.bytes }
            : null,
      },
    });
    const first = await provisioner.ensure();
    expect(first.created).toEqual(['proxy', 'lobby', 'bau', 'duels']);
    expect(first.modesInstalled).toEqual(['duels']);

    const nets = await h.mm.motor.request<Net[]>('GET', '/api/networks');
    const duelsId =
      nets.find((n) => n.name === 'morni.net')?.members.find((m) => m.name === 'duels')?.serverId ?? '';
    const read = (file: string) =>
      h.mm.motor.request<{ content: string }>(
        'GET',
        `/api/servers/${duelsId}/files/content?path=${encodeURIComponent(file)}`,
      );
    expect((await read('plugins/morninet/mode-release.txt')).content.split('\n')).toEqual([
      'pmornhart/Morni-Duels@v1.0.0',
      'Morni-Duels.jar',
      '',
    ]);
    expect((await read('plugins/morninet/hub.json')).content).toContain('"server": "duels"');

    const again = await provisioner.ensure();
    expect(again.created).toEqual([]);
    expect(again.modesInstalled).toEqual([]);

    release.tag = 'v1.1.0';
    release.bytes = Buffer.from('duels-v2');
    const update = await provisioner.ensure();
    expect(update.modesInstalled).toEqual(['duels']);
    expect(update.restart.map((r) => r.member)).toEqual(['duels']);
  });

  test('Umbenennung: Netzwerk, Server und alte Jars unter dem früheren Namen werden umgestellt', async () => {
    h = await createHarness();
    const jar = path.join(h.mmDir, 'MorniNet.jar');
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
          repo.endsWith('Morni-Duels')
            ? { repo, tag: 'v0.1.1', fileName: 'Morni-Duels.jar', bytes: Buffer.from('duels-neu') }
            : null,
      },
    };
    await createProvisioner(config, h.mm.motor, h.mm.hub, quiet, options).ensure();
    const motor = h.mm.motor;
    const [net] = await motor.request<Net[]>('GET', '/api/networks');
    const all = [net!.proxy, ...net!.members];
    const duelsId = net!.members.find((m) => m.name === 'duels')?.serverId ?? '';

    // So sah eine Installation vor der Umbenennung aus: alter Name im Motor, alte Jars, kein neuer Stempel.
    await motor.request('PATCH', `/api/networks/${net!.id}`, { name: OLD_TITLE });
    await Promise.all(
      all.map((s) =>
        motor.request('PATCH', `/api/servers/${s.serverId}`, {
          name: s.serverName.replace(/^\S+/, OLD_TITLE), // eslint-disable-line ts-patterns/require-regex-example -- "morni.net Lobby" → "<alt> Lobby"
        }),
      ),
    );
    await Promise.all(
      all.map(async (s) => {
        await motor.upload(s.serverId, 'plugins', OLD_NETWORK_JAR, Buffer.from('plugin-alt'));
        await motor.request('POST', `/api/servers/${s.serverId}/files/delete`, {
          paths: ['plugins/MorniNet.jar', 'plugins/morninet'],
        });
      }),
    );
    await motor.upload(duelsId, 'plugins', OLD_MODE_JARS['duels'] ?? '', Buffer.from('duels-alt'));
    await motor.request('POST', `/api/servers/${duelsId}/files/delete`, {
      paths: ['plugins/Morni-Duels.jar'],
    });

    const result = await createProvisioner(config, motor, h.mm.hub, quiet, options).ensure();
    expect(result.created).toEqual([]);
    const [after] = await motor.request<Net[]>('GET', '/api/networks');
    expect(after?.name).toBe('morni.net');
    expect([after!.proxy, ...after!.members].map((s) => s.serverName).sort()).toEqual([
      'morni.net Bau',
      'morni.net Duels',
      'morni.net Lobby',
      'morni.net Proxy',
    ]);
    const jars = async (id: string): Promise<string[]> =>
      (await motor.request<Array<{ name: string }>>('GET', `/api/servers/${id}/files?path=plugins`))
        .map((f) => f.name)
        .filter((n) => n.endsWith('.jar'))
        .sort();
    expect(await jars(after!.proxy.serverId)).toEqual(['MorniNet.jar']);
    expect(await jars(duelsId)).toEqual(['Morni-Duels.jar', 'MorniNet.jar']);
    // Alles neu auf laufenden Servern → Neustart, sobald niemand drauf ist (der Ordner zieht das Plugin dabei um).
    expect(result.restart.map((r) => r.member).sort()).toEqual(['bau', 'duels', 'lobby', 'proxy']);
  });

  test('Proxy und Lobby anlegen, Plugin und Schlüssel aufspielen – beim zweiten Mal nichts doppelt', async () => {
    h = await createHarness();
    const jar = path.join(h.mmDir, 'MorniNet.jar');
    fs.writeFileSync(jar, 'plugin-v1');
    const config = { ...h.mm.config, pluginFile: jar };
    const provisioner = createProvisioner(config, h.mm.motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
    });

    const first = await provisioner.ensure();
    expect(first.created).toEqual(['proxy', 'lobby', 'bau']);
    expect(first.pluginUpdated).toEqual(['proxy', 'lobby', 'bau']);
    expect(first.restart).toEqual([]); // neu angelegt: startet ohnehin frisch

    const nets = await h.mm.motor.request<Net[]>('GET', '/api/networks');
    const net = nets.find((n) => n.name === 'morni.net');
    expect(net?.members.map((m) => m.name)).toEqual(['lobby', 'bau']);
    expect(net?.defaultMember).toBe('lobby');

    const lobbyId = net?.members[0]?.serverId ?? '';
    const read = (id: string, file: string) =>
      h.mm.motor.request<{ content: string }>(
        'GET',
        `/api/servers/${id}/files/content?path=${encodeURIComponent(file)}`,
      );
    const hubJson = JSON.parse((await read(lobbyId, 'plugins/morninet/hub.json')).content) as Record<
      string,
      string
    >;
    expect(hubJson).toEqual({
      url: 'ws://morninet:8090/hub',
      server: 'lobby',
      kind: 'backend',
      key: h.mm.hub.keyFor('lobby', 'backend'),
    });
    const proxyJson = JSON.parse(
      (await read(net?.proxy.serverId ?? '', 'plugins/morninet/hub.json')).content,
    ) as Record<string, string>;
    expect(proxyJson).toMatchObject({ server: 'proxy', kind: 'proxy' });
    const plugins = await h.mm.motor.request<Array<{ name: string }>>(
      'GET',
      `/api/servers/${lobbyId}/files?path=plugins`,
    );
    expect(JSON.stringify(plugins)).toContain('MorniNet.jar');

    const second = await provisioner.ensure();
    expect(second).toMatchObject({ created: [], pluginUpdated: [], restart: [] });

    fs.writeFileSync(jar, 'plugin-v2');
    const third = await provisioner.ensure();
    expect(third.pluginUpdated).toEqual(['proxy', 'lobby', 'bau']);
    // Neues Plugin auf laufenden Servern → Neustart, sobald niemand drauf ist.
    expect(third.restart.map((r) => r.member)).toEqual(['proxy', 'lobby', 'bau']);
    expect((await h.mm.motor.request<Net[]>('GET', '/api/networks')).length).toBe(1);
  });
  test('Bau-Server: Kreativ und flach, Bauten (Schematics) per Knopf in die Lobby kopieren', async () => {
    h = await createHarness();
    const jar = path.join(h.mmDir, 'MorniNet.jar');
    fs.writeFileSync(jar, 'plugin');
    await createProvisioner({ ...h.mm.config, pluginFile: jar }, h.mm.motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
    }).ensure();
    const build = createBuildService(h.mm.motor, h.mm.stores);
    const nets = await h.mm.motor.request<Net[]>('GET', '/api/networks');
    const members = nets.find((n) => n.name === 'morni.net')?.members ?? [];
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
