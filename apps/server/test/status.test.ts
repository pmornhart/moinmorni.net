import { describe, expect, test } from 'vitest';
import { modePause } from '@moinmorni/shared';
import type { Config } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { createEventBus } from '../src/lib/events.js';
import type { MotorClient } from '../src/motor/client.js';
import { createStores } from '../src/panel/stores.js';
import { createStatusService } from '../src/public/status.js';

/** Bedrock-Port der Test-Installation. */
const BEDROCK_PORT = 19132;

describe('Status für Webseite und Discord', () => {
  test('ein schlafender Modus ist nie „geschlossen“ – nur was ein wacher meldet, zählt; Sommerpause nur Wintersport', async () => {
    const stores = createStores(openDatabase(':memory:').db, createEventBus());
    const motor = {
      request: (_method: string, path: string) =>
        Promise.resolve(
          path === '/api/networks'
            ? [
                {
                  name: 'MoinMorni',
                  proxy: { state: 'running', players: 0 },
                  members: [
                    { name: 'lobby', state: 'running', players: 0 },
                    { name: 'smp', state: 'stopped', players: 0 },
                    { name: 'wintersport', state: 'running', players: 0 },
                    { name: 'wolkenkampf', state: 'running', players: 0 },
                  ],
                },
              ]
            : undefined,
        ),
    } as unknown as MotorClient;
    // MorniSMP hat beim Beenden „closed“ gemeldet und schläft jetzt; Wintersport und Wolkenkampf laufen und sind zu.
    const hub = {
      presence: { counts: () => ({}), all: () => [] } as never,
      proxyOnline: () => false,
      modeStates: () => ({
        mirni: { state: 'closed' },
        wintersport: { state: 'closed' },
        wolkenkampf: { state: 'closed' },
      }),
      sport: () => 'sommerspiele',
    } as never;
    const config = { domain: 'moinmorni.net', bedrockPort: BEDROCK_PORT } as unknown as Config;
    const status = await createStatusService(config, motor, stores, hub).status();
    const mode = (id: string) => status.modes.find((m) => m.id === id)!;

    expect(mode('mirni')).toMatchObject({ awake: false, phase: null });
    expect(modePause(mode('mirni'))).toBeNull();
    expect(mode('wintersport')).toMatchObject({ awake: true, phase: 'closed' });
    expect(modePause(mode('wintersport'))).toBe('summer');
    expect(modePause(mode('wolkenkampf'))).toBe('closed');
    expect(modePause({ ...mode('wintersport'), id: 'sommerspiele' })).toBe('winter');
    // Wer gerade dran ist, sagt der Hub (dieselbe Entscheidung wie am Sport-Stand der Lobby).
    expect(status.sport).toBe('sommerspiele');
  });

  test('Bedrock-Port: automatisch aus dem Motor, von Hand 19132 (Verteiler von MorniHosting) überall', async () => {
    const stores = createStores(openDatabase(':memory:').db, createEventBus());
    const motor = {
      request: (_method: string, path: string) => Promise.resolve(path === '/api/networks' ? [] : undefined),
    } as unknown as MotorClient;
    const hub = {
      presence: { counts: () => ({}), all: () => [] } as never,
      proxyOnline: () => false,
      modeStates: () => ({}),
      sport: () => 'wintersport',
    } as never;
    const automatic = 19134;
    const config = { domain: 'moinmorni.net', bedrockPort: automatic } as unknown as Config;
    expect((await createStatusService(config, motor, stores, hub).status()).bedrockPort).toBe(automatic);

    stores.patchSettings('reach', { bedrockPort: BEDROCK_PORT }, 'test');
    expect((await createStatusService(config, motor, stores, hub).status()).bedrockPort).toBe(BEDROCK_PORT);

    stores.patchSettings('reach', { bedrockPort: 0 }, 'test');
    expect((await createStatusService(config, motor, stores, hub).status()).bedrockPort).toBe(automatic);
  });
});
