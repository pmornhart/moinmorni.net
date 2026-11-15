import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
import { createBuildService } from '../src/build/service.js';
import { createProvisioner } from '../src/network/provision.js';
import { createHarness, type Harness } from './harness.js';

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

interface Net {
  readonly id: string;
  readonly name: string;
  readonly proxy: { serverId: string };
  readonly members: Array<{ serverId: string; name: string }>;
  readonly defaultMember: string | null;
}

describe('Netzwerk richtet sich selbst ein', () => {
  let h: Harness;
  afterEach(async () => {
    await h.cleanup();
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
    expect(first.created).toEqual(['proxy', 'lobby', 'bau']);
    expect(first.pluginUpdated).toEqual(['proxy', 'lobby', 'bau']);

    const nets = await h.mm.motor.request<Net[]>('GET', '/api/networks');
    const net = nets.find((n) => n.name === 'MoinMorni');
    expect(net?.members.map((m) => m.name)).toEqual(['lobby', 'bau']);
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
    expect(second).toMatchObject({ created: [], pluginUpdated: [] });

    fs.writeFileSync(jar, 'plugin-v2');
    expect((await provisioner.ensure()).pluginUpdated).toEqual(['proxy', 'lobby', 'bau']);
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
