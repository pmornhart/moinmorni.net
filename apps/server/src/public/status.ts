import { NETWORK_TITLE, type Mode, type ModeStatus, type NetworkStatus } from '@morninet/shared';
import type { Config } from '../config.js';
import { isOurNetwork } from '../lib/rename.js';
import type { Hub } from '../hub/index.js';
import type { MotorClient } from '../motor/client.js';
import type { Stores } from '../panel/stores.js';

/** Name des Netzwerks im Motor, das morni.net bei der Einrichtung anlegt. */
export const NETWORK_NAME = NETWORK_TITLE;
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
/**
 * Spielerzahlen kommen vom Hub (der Proxy meldet jeden Wechsel sofort); ist der Proxy nicht verbunden, aus dem
 * Motor (fragt die Server alle paar Sekunden ab).
 */
export function createStatusService(
  config: Config,
  motor: MotorClient,
  stores: Stores,
  hub: Pick<Hub, 'presence' | 'proxyOnline' | 'modeStates'>,
): StatusService {
  const cache: { at: number; value: NetworkStatus | null } = { at: 0, value: null };
  const modeStatus = (
    m: Mode,
    network: MotorNetwork | undefined,
    counts: Record<string, number> | null,
    runs: Record<string, { readonly state: string }>,
  ): ModeStatus => {
    const member = network?.members.find((s) => s.name === m.server);
    const live = counts && m.server ? (counts[m.server] ?? 0) : null;
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      state: m.state,
      access: m.access,
      players: live ?? member?.players ?? 0,
      maxPlayers: m.maxPlayers,
      awake: member?.state === RUNNING,
      server: m.server,
      phase: runs[m.id]?.state ?? null,
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
    const network = networks.find(isOurNetwork);
    const settings = stores.settings('network');
    const counts = hub.proxyOnline() ? hub.presence.counts() : null;
    return {
      online: network?.proxy.state === RUNNING || hub.proxyOnline(),
      players: counts ? hub.presence.all().length : (network?.proxy.players ?? 0),
      maxPlayers: Number(settings['maxPlayers']),
      javaAddress: config.domain,
      bedrockAddress: config.domain,
      bedrockPort: config.bedrockPort,
      modes: stores.modes().map((m) => modeStatus(m, network, counts, hub.modeStates())),
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
