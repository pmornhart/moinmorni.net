import type { MotorClient } from '../motor/client.js';
import { NETWORK_NAME } from '../public/status.js';

/** Welcher Server im Motor hinter einem Namen im Netzwerk steckt („duels“ → Server-ID). */

const IDS_CACHE_MS = 60_000;

interface MotorNetwork {
  readonly name: string;
  readonly members: ReadonlyArray<{ readonly serverId: string; readonly name: string }>;
}

export interface MemberIds {
  /** Server-ID im Motor; undefined = kein solcher Server im Netzwerk. */
  readonly idOf: (name: string) => Promise<string | undefined>;
}

/** Fragt den Motor höchstens einmal pro Minute nach den Servern des Netzwerks. */
export function createMemberIds(motor: Pick<MotorClient, 'request'>, cacheMs = IDS_CACHE_MS): MemberIds {
  const ids = { at: Number.NEGATIVE_INFINITY, map: new Map<string, string>() };
  return {
    idOf: async (name) => {
      if (Date.now() - ids.at > cacheMs) {
        const networks = await motor.request<MotorNetwork[]>('GET', '/api/networks');
        const net = networks.find((n) => n.name === NETWORK_NAME);
        ids.map = new Map((net?.members ?? []).map((m) => [m.name, m.serverId]));
        ids.at = Date.now();
      }
      return ids.map.get(name);
    },
  };
}
