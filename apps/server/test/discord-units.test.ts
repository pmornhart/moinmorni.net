/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODES,
  DEFAULT_ROLES,
  TEAM_POSITIONS,
  teamPositionsOf,
  defaultsFor,
  TEAM_APPLY_AREA,
} from '@moinmorni/shared';
import type { Config } from '../src/config.js';
import { parseImage } from '../src/discord/images.js';
import { invitePermissions, permNames, PERM } from '../src/discord/layout.js';
import { LOGO_DATA_URI } from '../src/discord/logo.js';
import { modesMessages, statusMessage, type BoardContext } from '../src/discord/messages.js';
import { positionChanges, roleOrder } from '../src/discord/role-order.js';
import { createSecretBox } from '../src/lib/secret-box.js';
import type { MotorClient } from '../src/motor/client.js';
import type { Stores } from '../src/panel/stores.js';
import { createStatusService } from '../src/public/status.js';

describe('Reihenfolge der Rollen', () => {
  const desired = ['owner', 'admin', 'mod', 'builder', 'vip', 'bot'];

  test('niemand hat umsortiert: Reihenfolge der Ränge, neue Rollen an ihren Platz', () => {
    const current = ['owner', 'admin', 'builder', 'vip', 'bot', 'mod'];
    expect(
      roleOrder(current, desired, ['owner', 'admin', 'builder', 'vip', 'bot'], new Set(['mod'])),
    ).toEqual(desired);
    expect(
      roleOrder(['bot', 'vip', 'builder', 'mod', 'admin', 'owner'], desired, null, new Set(desired)),
    ).toEqual(desired);
  });

  test('in Discord selbst umsortiert: bleibt so, neue Rolle kommt hinter ihren Vorgänger', () => {
    const swapped = ['owner', 'admin', 'vip', 'builder', 'bot'];
    const last = ['owner', 'admin', 'builder', 'vip', 'bot'];
    expect(roleOrder(swapped, desired, last, new Set())).toEqual(swapped);
    expect(roleOrder([...swapped, 'mod'], desired, last, new Set(['mod']))).toEqual([
      'owner',
      'admin',
      'mod',
      'vip',
      'builder',
      'bot',
    ]);
  });

  test('neue Plätze nur unter den eigenen Rollen – fremde behalten ihren Platz', () => {
    // Eigene Rollen auf 9, 7, 6 (fremde auf 8): die eigenen tauschen nur ihre drei Plätze.
    const positions = new Map([
      ['a', 6],
      ['b', 9],
      ['c', 7],
    ]);
    const ids = new Map([
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ]);
    expect(positionChanges(['a', 'b', 'c'], positions, ids)).toEqual([
      { id: '1', position: 9 },
      { id: '2', position: 7 },
      { id: '3', position: 6 },
    ]);
    expect(positionChanges(['b', 'c', 'a'], positions, ids)).toEqual([]);
  });
});

describe('Rechte der Einladung', () => {
  test('alles, was die Einrichtung braucht – nie Administrator', () => {
    const perms = invitePermissions(DEFAULT_ROLES);
    expect(perms & PERM.administrator).toBe(0n);
    expect(permNames(perms)).toEqual(
      expect.arrayContaining([
        'manageRoles',
        'manageChannels',
        'manageGuild',
        'createInvite',
        'banMembers',
        'moderateMembers',
        'manageThreads',
        'createPrivateThreads',
        'manageMessages',
        'connect',
        'speak',
      ]),
    );
  });
});

describe('Versiegelte Geheimnisse', () => {
  test('nur mit demselben MM_SECRET wieder lesbar, nie im Klartext, jedes Mal anders', () => {
    const box = createSecretBox('x'.repeat(40));
    const sealed = box.seal('mein-bot-token');
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(sealed).not.toContain('mein-bot-token');
    expect(box.seal('mein-bot-token')).not.toBe(sealed);
    expect(box.open(sealed)).toBe('mein-bot-token');
    expect(createSecretBox('y'.repeat(40)).open(sealed)).toBeNull();
    expect(box.open('kaputt')).toBeNull();
    expect(box.open(`${sealed.slice(0, -4)}AAAA`)).toBeNull();
  });
});

describe('Bilder für Discord', () => {
  test('erkennt PNG an den ersten Bytes, lehnt Fremdes ab, merkt bewegte GIFs', () => {
    expect(parseImage(LOGO_DATA_URI)).toMatchObject({ mime: 'image/png', animated: false });
    // Falsch beschriftet: in Wahrheit ein PNG.
    expect(parseImage(LOGO_DATA_URI.replace('image/png', 'image/gif')).mime).toBe('image/png');
    expect(() => parseImage('data:image/png;base64,SGFsbG8=')).toThrow('discord_image_invalid');
    expect(() => parseImage('https://example.org/bild.png')).toThrow('discord_image_invalid');
    const frame = Buffer.from('21f904000a0000002c00000000010001000002024401', 'hex');
    const gif = (frames: number) =>
      `data:image/gif;base64,${Buffer.concat([
        Buffer.from('474946383961010001008000000000ffffff', 'hex'),
        ...Array.from({ length: frames }, () => frame),
        Buffer.from('3b', 'hex'),
      ]).toString('base64')}`;
    expect(parseImage(gif(1)).animated).toBe(false);
    expect(parseImage(gif(2)).animated).toBe(true);
  });
});

describe('Stellen aus der Vorgabe', () => {
  test('Vorgaben: Moderator, Supporter, Builder, Media offen; Admin zu; Fragen je Sprache', () => {
    const positions = teamPositionsOf(defaultsFor(TEAM_APPLY_AREA));
    expect(positions.map((p) => [p.id, p.open])).toEqual([
      ['moderator', true],
      ['supporter', true],
      ['builder', true],
      ['media', true],
      ['admin', false],
    ]);
    expect(TEAM_POSITIONS).not.toContain('vip');
    expect(TEAM_POSITIONS).not.toContain('owner');
    expect(positions.find((p) => p.id === 'builder')?.questions.de.join(' ')).toContain('Bauten');
    expect(positions.find((p) => p.id === 'media')?.questions.en.join(' ')).toContain('channel');
    expect(positions.every((p) => p.questions.de.length === p.questions.en.length)).toBe(true);
  });
});

describe('Adresse für Spieler aus dem Motor', () => {
  const config = { domain: 'moinmorni.net', bedrockPort: 19132 } as Config;
  const stores = { settings: () => ({ maxPlayers: 100 }), modes: () => [] } as unknown as Stores;
  const hub = {
    presence: { counts: () => ({}), all: () => [] },
    proxyOnline: () => false,
    modeStates: () => ({}),
    sport: () => 'sommerspiele',
  };
  const motor = (detail: object | null): MotorClient =>
    ({
      request: async (_method: string, path: string) => {
        if (path === '/api/networks')
          return [
            { name: 'MoinMorni', proxy: { serverId: 'p1', state: 'running', players: 0 }, members: [] },
          ];
        if (!detail) throw new Error('weg');
        return detail;
      },
    }) as unknown as MotorClient;
  const status = (detail: object | null, srv: number[] = []) =>
    createStatusService(config, motor(detail), stores, hub as never, async () =>
      srv.map((port) => ({ port })),
    ).status();

  test('Proxy direkt auf der Domain mit eigenem Port (NetBird): Java mit Port, Bedrock mit seinem Port', async () => {
    const s = await status({
      domain: 'moinmorni.net',
      port: 25577,
      publicPort: 25566,
      geyser: true,
      geyserPublicPort: 19133,
    });
    expect(s).toMatchObject({
      javaAddress: 'moinmorni.net:25566',
      bedrockAddress: 'moinmorni.net',
      bedrockPort: 19133,
    });
  });

  test('mit SRV-Eintrag auf den Port: Java ohne Port; 25565 sowieso ohne', async () => {
    const srv = await status(
      { domain: 'moinmorni.net', port: 25577, publicPort: 25566, geyser: true, geyserPublicPort: 19133 },
      [25566],
    );
    expect(srv.javaAddress).toBe('moinmorni.net');
    const plain = await status({
      domain: 'spiel.moinmorni.net',
      port: 25577,
      publicPort: 25565,
      geyser: false,
      geyserPublicPort: null,
    });
    expect(plain).toMatchObject({ javaAddress: 'spiel.moinmorni.net', bedrockPort: 19132 });
  });

  test('ohne Namen im Motor (oder Motor weg): die Domain aus der .env', async () => {
    expect(
      await status({ domain: null, port: 25577, publicPort: null, geyser: true, geyserPublicPort: null }),
    ).toMatchObject({
      javaAddress: 'moinmorni.net',
      bedrockPort: 19132,
    });
    expect((await status(null)).javaAddress).toBe('moinmorni.net');
  });
});

describe('Discord: Wintersport und Sommerspiele sind ein Platz', () => {
  const modes = DEFAULT_MODES.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    state: m.state,
    access: m.access,
    players: 0,
    maxPlayers: m.maxPlayers,
    awake: true,
    server: m.server,
    phase: null,
  }));
  const status = (sport: 'wintersport' | 'sommerspiele') => ({
    online: true,
    players: 0,
    maxPlayers: 100,
    javaAddress: 'moinmorni.net',
    bedrockAddress: 'moinmorni.net',
    bedrockPort: 19132,
    modes,
    sport,
    updatedAt: new Date(0).toISOString(),
  });
  const names = (body: { embeds?: ReadonlyArray<{ fields?: ReadonlyArray<{ name: string }> }> }) =>
    (body.embeds?.[0]?.fields ?? []).map((f) => f.name).join(' ');

  test('Status-Nachricht: nur der Sport-Modus, der gerade dran ist', () => {
    const summer = names(statusMessage(status('sommerspiele')) as never);
    expect(summer).toContain('Sommerspiele');
    expect(summer).not.toContain('Wintersport');
    const winter = names(statusMessage(status('wintersport')) as never);
    expect(winter).toContain('Wintersport');
    expect(winter).not.toContain('Sommerspiele');
  });

  test('Kanal „Spielmodi“: der andere Sport-Modus fehlt', () => {
    const ctx = {
      domain: 'moinmorni.net',
      status: status('sommerspiele'),
      channel: () => null,
      modes: DEFAULT_MODES,
    } as unknown as BoardContext;
    const titles = modesMessages(ctx)
      .flatMap((b) => ((b as { embeds?: Array<{ title?: string }> }).embeds ?? []).map((e) => e.title))
      .join(' ');
    expect(titles).toContain('Sommerspiele');
    expect(titles).not.toContain('Wintersport');
  });
});
