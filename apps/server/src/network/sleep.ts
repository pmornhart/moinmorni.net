import type { FastifyBaseLogger } from 'fastify';
import type { Hub } from '../hub/index.js';
import type { MotorClient } from '../motor/client.js';
import type { Stores } from '../panel/stores.js';
import { NETWORK_NAME } from '../public/status.js';

/**
 * Schlaf-Modus: Ist in einem Modus (mit „schlafen, wenn leer“) eine Weile niemand, hält der Motor seinen Server an.
 * Will jemand hinein, weckt der Hub ihn über `wake` – sobald das Plugin des Servers sich meldet, kommt der Spieler
 * von selbst hinein. Lobby und Proxy schlafen nie (sie sind keine Modi).
 */

const CHECK_MS = 30_000;
const BUILD_SERVER = 'bau';
const MINUTE_MS = 60_000;
const IDS_CACHE_MS = 60_000;

interface MotorNetwork {
  readonly name: string;
  readonly members: ReadonlyArray<{ readonly serverId: string; readonly name: string }>;
}

export interface SleepService {
  /** Server im Netzwerk wecken (Motor startet ihn). */
  readonly wake: (server: string) => Promise<boolean>;
  /** Einmal prüfen, wer schlafen gehen darf (läuft sonst alle 30 s). */
  readonly check: (now?: number) => Promise<string[]>;
  readonly start: () => void;
  readonly stop: () => void;
}

export function createSleepService(
  motor: MotorClient,
  hub: Pick<Hub, 'presence' | 'connectedServers'>,
  stores: Stores,
  log: FastifyBaseLogger,
): SleepService {
  const emptySince = new Map<string, number>();
  const ids = { at: 0, map: new Map<string, string>() };
  const timer = { id: null as ReturnType<typeof setInterval> | null };

  const serverId = async (name: string): Promise<string | undefined> => {
    if (Date.now() - ids.at > IDS_CACHE_MS) {
      const networks = await motor.request<MotorNetwork[]>('GET', '/api/networks');
      const net = networks.find((n) => n.name === NETWORK_NAME);
      ids.map = new Map((net?.members ?? []).map((m) => [m.name, m.serverId]));
      ids.at = Date.now();
    }
    return ids.map.get(name);
  };
  const action = async (name: string, what: 'start' | 'stop'): Promise<boolean> => {
    const id = await serverId(name);
    if (!id) return false;
    await motor.request('POST', `/api/servers/${id}/actions/${what}`);
    return true;
  };

  const check = async (now = Date.now()): Promise<string[]> => {
    const minutes = Number(stores.settings('network')['sleepMinutes']);
    const counts = hub.presence.counts();
    const awake = new Set(hub.connectedServers());
    const sleepy = [
      ...stores
        .modes()
        .filter((m) => m.sleepWhenEmpty && m.server && awake.has(m.server))
        .map((m) => m.server ?? ''),
      // Der Bau-Server ist kein Modus, schläft aber auf Wunsch genauso.
      ...(stores.settings('build')['sleepWhenEmpty'] === true && awake.has(BUILD_SERVER)
        ? [BUILD_SERVER]
        : []),
    ];
    const due = sleepy.filter((server) => {
      if ((counts[server] ?? 0) > 0) {
        emptySince.delete(server);
        return false;
      }
      const since = emptySince.get(server) ?? now;
      emptySince.set(server, since);
      return now - since >= minutes * MINUTE_MS;
    });
    await Promise.all(
      due.map(async (server) => {
        emptySince.delete(server);
        try {
          if (await action(server, 'stop')) log.info({ server }, 'Schlaf-Modus: leerer Modus schläft');
        } catch (err) {
          log.warn({ err, server }, 'Schlaf-Modus: anhalten ging nicht');
        }
      }),
    );
    return due;
  };

  return {
    wake: async (server) => {
      emptySince.delete(server);
      const ok = await action(server, 'start');
      if (ok) log.info({ server }, 'Schlaf-Modus: wird geweckt');
      return ok;
    },
    check,
    start: () => {
      timer.id = setInterval(() => {
        check().catch((err: unknown) => log.warn({ err }, 'Schlaf-Modus: Prüfung fehlgeschlagen'));
      }, CHECK_MS);
      timer.id.unref();
    },
    stop: () => {
      if (timer.id) clearInterval(timer.id);
    },
  };
}
