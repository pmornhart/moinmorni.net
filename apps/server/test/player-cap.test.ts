import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
import { DEFAULT_MODES, NETWORK_PLAYERS_MAX, SERVER_MAX_PLAYERS } from '@moinmorni/shared';
import { buildProperties } from '../src/build/service.js';
import { lobbyProperties } from '../src/lobby/world.js';
import { wartungProperties } from '../src/lobby/wartung.js';
import { openPlayerCap, raisePlayerCap } from '../src/network/player-cap.js';
import { createProvisioner } from '../src/network/provision.js';
import { createHarness, type Harness } from './harness.js';

const quiet = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;
const CAP = `max-players=${SERVER_MAX_PLAYERS}`;
/** So legt Minecraft einen neuen Server an. */
const MINECRAFT_DEFAULT = 20;
/** Was jemand von Hand höher gestellt hat, bleibt. */
const HIGHER = SERVER_MAX_PLAYERS + MINECRAFT_DEFAULT;

interface Net {
  readonly name: string;
  readonly members: Array<{ serverId: string; name: string }>;
}

describe('Höchstzahl hinter dem Proxy: nicht Minecraft weist ab, sondern Proxy und Hub', () => {
  let h: Harness | null = null;
  afterEach(async () => {
    await h?.cleanup();
    h = null;
  });

  test('Lobby, Wartungs-Lobby und Bau-Server bringen die Höchstzahl mit – weit über dem Netzwerk', () => {
    expect(SERVER_MAX_PLAYERS).toBeGreaterThan(NETWORK_PLAYERS_MAX);
    [lobbyProperties(), wartungProperties(), buildProperties()].forEach((p) =>
      expect(p['max-players']).toBe(String(SERVER_MAX_PLAYERS)),
    );
  });

  test('Spielmodi: weniger oder nichts → hoch, mehr bleibt, sonst alles wie es war', () => {
    const minecraft = `#Minecraft server properties\nmotd=Duels\nmax-players=${MINECRAFT_DEFAULT}\npvp=true\n`;
    const raised = raisePlayerCap(minecraft);
    expect(raised.changed).toBe(true);
    expect(raised.text).toBe(`#Minecraft server properties\nmotd=Duels\n${CAP}\npvp=true\n`);
    expect(raisePlayerCap(raised.text)).toEqual({ text: raised.text, changed: false });
    // Neuer Server vor dem ersten Start: nur das, was der Motor schon hineinschrieb.
    expect(raisePlayerCap('white-list=false\n')).toEqual({
      text: `white-list=false\n${CAP}\n`,
      changed: true,
    });
    expect(raisePlayerCap('').text).toBe(`${CAP}\n`);
    expect(raisePlayerCap('max-players=viele\n').text).toBe(`${CAP}\n`);
    const higher = `max-players=${HIGHER}\n`;
    expect(raisePlayerCap(higher)).toEqual({ text: higher, changed: false });
  });

  test('Provisioner: neuer Modus-Server vor dem ersten Start, bestehender einmal (Neustart, sobald leer)', async () => {
    h = await createHarness();
    const motor = h.mm.motor;
    const provisioner = createProvisioner(h.mm.config, motor, h.mm.hub, quiet, {
      proxyAddOns: {},
      lobbyAddOns: {},
      buildContent: false,
      versions: { paper: '1.21.4', velocity: '3.4.0' },
      modes: () => DEFAULT_MODES,
      releases: {
        latest: async (repo) =>
          repo.endsWith('MoinMorni-Duels')
            ? { repo, tag: 'v1.0.0', fileName: 'MoinMorni-Duels.jar', bytes: Buffer.from('duels') }
            : null,
      },
      configureMode: (serverId) => openPlayerCap(motor, serverId),
    });
    const first = await provisioner.ensure();
    expect(first.created).toContain('duels');
    const nets = await motor.request<Net[]>('GET', '/api/networks');
    const members = nets.find((n) => n.name === 'MoinMorni')?.members ?? [];
    const idOf = (name: string): string => members.find((m) => m.name === name)?.serverId ?? '';
    const props = async (name: string): Promise<string> =>
      (
        await motor.request<{ content: string }>(
          'GET',
          `/api/servers/${idOf(name)}/files/content?path=server.properties`,
        )
      ).content;
    const write = (name: string, content: string): Promise<unknown> =>
      motor.request('PUT', `/api/servers/${idOf(name)}/files/content`, {
        path: 'server.properties',
        content,
      });
    // Vor dem ersten Start eingetragen – Minecraft (hier der nachgebaute Server) behält es und ergänzt den Rest.
    expect(await props('duels')).toContain(CAP);
    expect(await props('duels')).toContain('white-list=false');
    expect(first.restart.map((r) => r.member)).not.toContain('duels');

    // Bestehende Installation von vorher: Minecraft hat 20 eingetragen.
    await write('duels', (await props('duels')).replace(CAP, `max-players=${MINECRAFT_DEFAULT}`));
    const once = await provisioner.ensure();
    expect(once.restart.map((r) => r.member)).toContain('duels');
    expect(await props('duels')).toContain(CAP);
    const twice = await provisioner.ensure();
    expect(twice.restart.map((r) => r.member)).not.toContain('duels');

    // Höher gestellt bleibt höher – kein Neustart.
    await write('duels', (await props('duels')).replace(CAP, `max-players=${HIGHER}`));
    const higher = await provisioner.ensure();
    expect(higher.restart.map((r) => r.member)).not.toContain('duels');
    expect(await props('duels')).toContain(`max-players=${HIGHER}`);
  });
});
