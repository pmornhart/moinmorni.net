import type { FastifyBaseLogger } from 'fastify';
import type { MotorClient } from '../motor/client.js';

/**
 * Nach einem Update oder neuen Einstellungen eines Spielmodus: Server mit neuem Plugin, neuem Hub-Schlüssel oder
 * neuen Einstellungen starten neu, sobald niemand drauf ist – so fliegt keiner mitten im Spiel raus. Ein gestoppter Server holt sich das Neue beim nächsten
 * Start von selbst und fällt aus der Liste. Die Spielerzahl kommt vom Motor (der Hub kennt sie nicht, solange das
 * alte Plugin mit altem Schlüssel nicht hineinkommt).
 */

const CHECK_MS = 30_000;
const RUNNING = 'running';

interface MotorLive {
  readonly live?: { readonly state?: string; readonly playersOnline?: number };
}

export interface RestartQueue {
  readonly add: (servers: ReadonlyArray<{ readonly serverId: string; readonly member: string }>) => void;
  /** Doch nicht mehr nötig (z. B. Einstellung wieder auf den alten Wert gestellt). */
  readonly remove: (serverId: string) => void;
  /** Einmal prüfen (sonst alle 30 s von selbst). */
  readonly check: () => Promise<void>;
  readonly pending: () => string[];
  readonly stop: () => void;
}

export function createRestartQueue(
  motor: Pick<MotorClient, 'request'>,
  log: FastifyBaseLogger,
  everyMs = CHECK_MS,
): RestartQueue {
  const waiting = new Map<string, string>();
  /** Läuft gerade eine Prüfung, warten alle auf dieselbe statt eine zweite zu starten. */
  const running: { now: Promise<void> | null } = { now: null };

  const one = async (serverId: string, member: string): Promise<void> => {
    const detail = await motor.request<MotorLive>('GET', `/api/servers/${serverId}`);
    if (detail.live?.state !== RUNNING) {
      waiting.delete(serverId);
      return;
    }
    if ((detail.live.playersOnline ?? 0) > 0) return;
    waiting.delete(serverId);
    log.info(
      { server: member },
      'Netzwerk: Server startet neu, damit Update oder neue Einstellungen gelten (gerade niemand drauf)',
    );
    await motor.request('POST', `/api/servers/${serverId}/actions/restart`);
  };

  const run = async (): Promise<void> => {
    await Promise.all(
      [...waiting].map(async ([serverId, member]) => {
        try {
          await one(serverId, member);
        } catch (err) {
          log.warn(
            { err, server: member },
            'Netzwerk: Neustart nach dem Update klappte nicht – nächster Versuch gleich',
          );
        }
      }),
    );
  };
  const check = async (): Promise<void> => {
    if (running.now) {
      await running.now;
      return;
    }
    running.now = run();
    try {
      await running.now;
    } finally {
      running.now = null;
    }
  };

  const timer = setInterval(() => void check(), everyMs);
  timer.unref();

  return {
    add: (servers) => {
      servers.forEach((s) => waiting.set(s.serverId, s.member));
      if (servers.length > 0) void check();
    },
    remove: (serverId) => {
      waiting.delete(serverId);
    },
    check,
    pending: () => [...waiting.values()],
    stop: () => clearInterval(timer),
  };
}
