import { Resolver } from 'node:dns/promises';
import type { Mode, ModeStatus, NetworkStatus } from '@moinmorni/shared';
import type { Config } from '../config.js';
import { INTERIM_TITLE } from '../lib/rename.js';
import type { Hub } from '../hub/index.js';
import type { MotorClient } from '../motor/client.js';
import type { Stores } from '../panel/stores.js';

/** Name des Netzwerks im Motor, das MoinMorni bei der Einrichtung anlegt. */
export const NETWORK_NAME = 'MoinMorni';
/** Unser Netzwerk im Motor – bis zur Rückbenennung auch unter dem Zwischen-Namen (lib/rename.ts). */
export const isOurNetwork = (n: { readonly name: string }): boolean =>
  n.name === NETWORK_NAME || n.name === INTERIM_TITLE;
const CACHE_MS = 5_000;
const RUNNING = 'running';

interface MotorNetwork {
  readonly name: string;
  readonly proxy: { readonly serverId?: string; readonly state: string; readonly players: number };
  readonly members: ReadonlyArray<{
    readonly name: string;
    readonly state: string;
    readonly players: number;
  }>;
}

export interface StatusService {
  readonly status: () => Promise<NetworkStatus>;
}

/** Was Spieler tippen: Java-Adresse (mit Port, wenn nötig) und Bedrock-Adresse + Port. */
export interface PlayAddress {
  readonly java: string;
  readonly bedrock: string;
  readonly bedrockPort: number;
}

/** Der Proxy im Motor (Ausschnitt aus GET /api/servers/:id). */
interface ProxyDetail {
  /** Name, unter dem Spieler ihn erreichen (NetBird oder eigene Domain); leer = keiner. */
  readonly domain: string | null;
  readonly port: number;
  readonly publicPort: number | null;
  readonly geyser: boolean;
  readonly geyserPublicPort: number | null;
}

const JAVA_DEFAULT_PORT = 25565;
const ADDRESS_CACHE_MS = 60_000;
const SRV_CACHE_MS = 600_000;
const DNS_TIMEOUT_MS = 2_000;

/** Gibt es einen SRV-Eintrag „_minecraft._tcp.<Name>“, der auf diesen Port zeigt? Dann braucht Java keinen Port. */
export type SrvLookup = (host: string) => Promise<ReadonlyArray<{ readonly port: number }>>;

const systemSrv: SrvLookup = async (host) => {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
  return resolver.resolveSrv(`_minecraft._tcp.${host}`);
};

/**
 * Bedrock-Port für Spieler: von Hand eingestellt (Erreichbarkeit → „Für Spieler“, z. B. 19132 über den Verteiler von
 * MorniHosting) oder der automatische aus dem Motor.
 */
const shownBedrockPort = (stores: Stores, automatic: number): number => {
  const fixed = Number(stores.settings('reach')['bedrockPort'] ?? 0);
  return Number.isInteger(fixed) && fixed > 0 ? fixed : automatic;
};

/** Status für Webseite, Lobby-Figuren und Discord: wer ist online, welcher Modus läuft. Kurz zwischengespeichert. */
/**
 * Spielerzahlen kommen vom Hub (der Proxy meldet jeden Wechsel sofort); ist der Proxy nicht verbunden, aus dem
 * Motor (fragt die Server alle paar Sekunden ab).
 */
export function createStatusService(
  config: Config,
  motor: MotorClient,
  stores: Stores,
  hub: Pick<Hub, 'presence' | 'proxyOnline' | 'modeStates' | 'sport'>,
  srv: SrvLookup = systemSrv,
): StatusService {
  const cache: { at: number; value: NetworkStatus | null } = { at: 0, value: null };
  const addressCache: { at: number; key: string; value: PlayAddress | null } = {
    at: 0,
    key: '',
    value: null,
  };
  const srvCache = new Map<string, { at: number; ports: readonly number[] }>();
  const fallback = (): PlayAddress => ({
    java: config.domain,
    bedrock: config.domain,
    bedrockPort: config.bedrockPort,
  });
  const srvPorts = async (host: string): Promise<readonly number[]> => {
    const hit = srvCache.get(host);
    if (hit && Date.now() - hit.at < SRV_CACHE_MS) return hit.ports;
    const ports = await (async (): Promise<number[]> => {
      try {
        return (await srv(host)).map((r) => r.port);
      } catch {
        return [];
      }
    })();
    srvCache.set(host, { at: Date.now(), ports });
    return ports;
  };
  /**
   * Die Adresse aus dem Motor: Hat der Proxy einen Namen (NetBird – auch „Spiel direkt auf der Domain“ – oder eigene
   * Domain), gilt der mit seinem Port; sonst die Domain aus der .env. Java ohne Port, wenn es 25565 ist oder ein
   * SRV-Eintrag auf den Port zeigt.
   */
  const address = async (proxyId: string | undefined): Promise<PlayAddress> => {
    if (!proxyId) return fallback();
    if (addressCache.value && addressCache.key === proxyId && Date.now() - addressCache.at < ADDRESS_CACHE_MS)
      return addressCache.value;
    const detail = await motor
      .request<ProxyDetail>('GET', `/api/servers/${encodeURIComponent(proxyId)}`)
      .catch(() => null);
    const host = detail?.domain?.trim();
    const value = await (async (): Promise<PlayAddress> => {
      if (!detail || !host) return fallback();
      const port = detail.publicPort ?? detail.port;
      const plain = port === JAVA_DEFAULT_PORT || (await srvPorts(host)).includes(port);
      return {
        java: plain ? host : `${host}:${port}`,
        bedrock: host,
        bedrockPort: detail.geyser && detail.geyserPublicPort ? detail.geyserPublicPort : config.bedrockPort,
      };
    })();
    addressCache.value = value;
    addressCache.key = proxyId;
    addressCache.at = Date.now();
    return value;
  };
  const modeStatus = (
    m: Mode,
    network: MotorNetwork | undefined,
    counts: Record<string, number> | null,
    runs: Record<string, { readonly state: string }>,
  ): ModeStatus => {
    const member = network?.members.find((s) => s.name === m.server);
    const live = counts && m.server ? (counts[m.server] ?? 0) : null;
    const awake = member?.state === RUNNING;
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      state: m.state,
      access: m.access,
      players: live ?? member?.players ?? 0,
      maxPlayers: m.maxPlayers,
      awake,
      server: m.server,
      // Nur was ein wacher Modus meldet – ein schlafender ist nicht „geschlossen“, er wacht auf, sobald jemand kommt.
      phase: awake ? (runs[m.id]?.state ?? null) : null,
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
    const play = await address(network?.proxy.serverId);
    return {
      online: network?.proxy.state === RUNNING || hub.proxyOnline(),
      players: counts ? hub.presence.all().length : (network?.proxy.players ?? 0),
      maxPlayers: Number(settings['maxPlayers']),
      javaAddress: play.java,
      bedrockAddress: play.bedrock,
      bedrockPort: shownBedrockPort(stores, play.bedrockPort),
      modes: stores.modes().map((m) => modeStatus(m, network, counts, hub.modeStates())),
      // Wintersport oder Sommerspiele – wie am Sport-Stand der Lobby (eine Entscheidung im Hub)
      sport: hub.sport(),
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
