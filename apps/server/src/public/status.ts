import type { Mode, ModeStatus, NetworkStatus } from '@moinmorni/shared';
import type { Config } from '../config.js';
import type { MotorClient } from '../motor/client.js';
import type { Stores } from '../panel/stores.js';

/** Name des Netzwerks im Motor, das MoinMorni bei der Einrichtung anlegt. */
export const NETWORK_NAME = 'MoinMorni';
const CACHE_MS = 5_000;
const RUNNING = 'running';

interface MotorNetwork {
  readonly name: string;
  readonly proxy: { readonly state: string; readonly players: number };
  readonly members: ReadonlyArray<{
    readonly name: string;
    readonly state: string;
    readonly players: number;
  }>;
}

export interface StatusService {
  readonly status: () => Promise<NetworkStatus>;
}

/** Status für Webseite, Lobby-Figuren und Discord: wer ist online, welcher Modus läuft. Kurz zwischengespeichert. */
export function createStatusService(config: Config, motor: MotorClient, stores: Stores): StatusService {
  const cache: { at: number; value: NetworkStatus | null } = { at: 0, value: null };
  const modeStatus = (m: Mode, network: MotorNetwork | undefined): ModeStatus => {
    const member = network?.members.find((s) => s.name === m.server);
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      state: m.state,
      access: m.access,
      players: member?.players ?? 0,
      maxPlayers: m.maxPlayers,
      awake: member?.state === RUNNING,
    };
  };
  const networksOrNone = async (): Promise<MotorNetwork[]> => {
    try {
      return await motor.request<MotorNetwork[]>('GET', '/api/networks');
    } catch {
      return [];
    }
  };
  const load = async (): Promise<NetworkStatus> => {
    const networks = await networksOrNone();
    const network = networks.find((n) => n.name === NETWORK_NAME);
    const settings = stores.settings('network');
    return {
      online: network?.proxy.state === RUNNING,
      players: network?.proxy.players ?? 0,
      maxPlayers: Number(settings['maxPlayers']),
      javaAddress: config.domain,
      bedrockAddress: config.domain,
      bedrockPort: config.bedrockPort,
      modes: stores.modes().map((m) => modeStatus(m, network)),
      updatedAt: new Date().toISOString(),
    };
  };
  return {
    status: async () => {
      if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
      cache.value = await load();
      cache.at = Date.now();
      return cache.value;
    },
  };
}
