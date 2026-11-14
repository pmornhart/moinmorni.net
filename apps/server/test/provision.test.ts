import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
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
      versions: { paper: '1.21.4', velocity: '3.4.0' },
    });

    const first = await provisioner.ensure();
    expect(first.created).toEqual(['proxy', 'lobby']);
    expect(first.pluginUpdated).toEqual(['proxy', 'lobby']);

    const nets = await h.mm.motor.request<Net[]>('GET', '/api/networks');
    const net = nets.find((n) => n.name === 'MoinMorni');
    expect(net?.members.map((m) => m.name)).toEqual(['lobby']);
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
      key: h.mm.hub.keyFor('lobby'),
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
    expect((await provisioner.ensure()).pluginUpdated).toEqual(['proxy', 'lobby']);
    expect((await h.mm.motor.request<Net[]>('GET', '/api/networks')).length).toBe(1);
  });
});
