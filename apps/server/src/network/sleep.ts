import type { FastifyBaseLogger } from 'fastify';
import type { Hub } from '../hub/index.js';
import { MotorError, type MotorClient } from '../motor/client.js';
import type { Stores } from '../panel/stores.js';
import { createMemberIds } from './members.js';

/**
 * Schlaf-Modus: Ist in einem Modus (mit „schlafen, wenn leer“) eine Weile niemand, hält der Motor seinen Server an.
 * Will jemand hinein, weckt der Hub ihn über `wake` – sobald das Plugin des Servers sich meldet, kommt der Spieler
 * von selbst hinein. Lobby und Proxy schlafen nie (sie sind keine Modi).
 */

const CHECK_MS = 30_000;
const BUILD_SERVER = 'bau';
const MINUTE_MS = 60_000;
/** So viel hält der Motor neben den Servern frei (wie `HOST_RESERVE_MB` im Motor). */
const HOST_RESERVE_MB = 768;
/** Zählen beim Speicherschutz des Motors als „läuft“. */
const ACTIVE_STATES: readonly string[] = ['starting', 'running'];
const STOPPED = 'stopped';
/** So lange warten wir höchstens, bis ein schlafen geschickter Server wirklich aus ist. */
const STOP_WAIT_MS = 90_000;
const STOP_POLL_MS = 2_000;
/** Antwort des Motors, wenn ein Server nicht mehr in den Arbeitsspeicher passt. */
const MEMORY_FULL = 'host_memory_full';

/** Was der Motor über einen Server sagt (Ausschnitt von `/api/servers`). */
interface ServerBrief {
  readonly id: string;
  readonly memoryMb: number;
  readonly live?: { readonly state?: string; readonly playersOnline?: number };
}

interface NetworkBrief {
  readonly name: string;
  readonly proxy?: { readonly serverId: string };
  readonly members: ReadonlyArray<{ readonly serverId: string; readonly name: string }>;
}

export interface SleepService {
  /** Server im Netzwerk wecken (Motor startet ihn) – reicht der Arbeitsspeicher nicht, schlafen erst leere Modi. */
  readonly wake: (server: string) => Promise<boolean>;
  /**
   * Platz im Arbeitsspeicher für diesen Server schaffen (Motor-ID): leere, wache Modi mit „schlafen, wenn leer“
   * schlafen sofort, der am längsten leere zuerst – bis der Server in den Speicher passt. Lobby, Proxy und Modi mit
   * Spielern bleiben immer. Gibt zurück, wie viele schlafen gingen.
   */
  readonly makeRoom: (serverId: string) => Promise<number>;
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
  const members = createMemberIds(motor);
  const timer = { id: null as ReturnType<typeof setInterval> | null };

  const action = async (name: string, what: 'start' | 'stop'): Promise<boolean> => {
    const id = await members.idOf(name);
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

  /** Server, die für Platz schlafen dürfen: dieselben wie beim Schlaf-Modus (Modi mit „schlafen, wenn leer“, Bau). */
  const sleepyNames = (): Set<string> =>
    new Set([
      ...stores
        .modes()
        .filter((m) => m.sleepWhenEmpty && m.server)
        .map((m) => m.server ?? ''),
      ...(stores.settings('build')['sleepWhenEmpty'] === true ? [BUILD_SERVER] : []),
    ]);

  const waitStopped = async (serverId: string, deadline: number): Promise<void> => {
    const detail = await motor.request<ServerBrief | undefined>('GET', `/api/servers/${serverId}`);
    if (detail?.live?.state === STOPPED || Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS));
    await waitStopped(serverId, deadline);
  };

  const makeRoom = async (serverId: string, extra = 0): Promise<number> => {
    const [rawList, host, rawNetworks] = await Promise.all([
      motor.request<ServerBrief[] | undefined>('GET', '/api/servers'),
      motor.request<{ readonly memoryTotalMb?: number } | undefined>('GET', '/api/host'),
      motor.request<NetworkBrief[] | undefined>('GET', '/api/networks'),
    ]);
    const list = Array.isArray(rawList) ? rawList : [];
    const networks = Array.isArray(rawNetworks) ? rawNetworks : [];
    const target = list.find((x) => x.id === serverId);
    const total = host?.memoryTotalMb ?? 0;
    if (!target || total <= 0) return 0;
    const active = list.filter((x) => x.id !== serverId && ACTIVE_STATES.includes(x.live?.state ?? ''));
    const used = active.reduce((sum, x) => sum + x.memoryMb, 0);
    const missing = used + target.memoryMb + HOST_RESERVE_MB + extra - total;
    if (missing <= 0) return 0;
    const nameOf = new Map(networks.flatMap((n) => n.members.map((m) => [m.serverId, m.name] as const)));
    const allowed = sleepyNames();
    const counts = hub.presence.counts();
    const now = Date.now();
    // Der am längsten leere zuerst; bei Gleichstand der größere (macht mehr Platz).
    const candidates = active
      .filter((x) => x.live?.state === 'running')
      .map((x) => ({ ...x, name: nameOf.get(x.id) ?? '' }))
      .filter((x) => allowed.has(x.name))
      .filter((x) => (x.live?.playersOnline ?? 0) === 0 && (counts[x.name] ?? 0) === 0)
      .sort(
        (a, b) =>
          (emptySince.get(a.name) ?? now) - (emptySince.get(b.name) ?? now) || b.memoryMb - a.memoryMb,
      );
    const chosen = candidates.reduce<{ freed: number; list: typeof candidates }>(
      (acc, x) => (acc.freed >= missing ? acc : { freed: acc.freed + x.memoryMb, list: [...acc.list, x] }),
      { freed: 0, list: [] },
    ).list;
    await chosen.reduce(async (prev, x) => {
      await prev;
      emptySince.delete(x.name);
      log.info(
        { server: x.name, for: nameOf.get(serverId) ?? serverId },
        'Schlaf-Modus: schläft, um Platz zu machen',
      );
      await motor.request('POST', `/api/servers/${x.id}/actions/stop`);
    }, Promise.resolve());
    const deadline = Date.now() + STOP_WAIT_MS;
    await Promise.all(chosen.map((x) => waitStopped(x.id, deadline)));
    return chosen.length;
  };

  const startServer = async (server: string): Promise<boolean> => {
    const id = await members.idOf(server);
    if (!id) return false;
    // Klappt das Platzmachen nicht (Motor kurz weg), entscheidet der Motor beim Start selbst.
    await makeRoom(id).catch((err: unknown) =>
      log.warn({ err, server }, 'Schlaf-Modus: Platz machen ging nicht'),
    );
    try {
      await motor.request('POST', `/api/servers/${id}/actions/start`);
    } catch (err) {
      // Der Motor rechnet etwas anders (z. B. gerade startende Server) – noch einen leeren Modus schlafen schicken.
      if (!(err instanceof MotorError && err.code === MEMORY_FULL)) throw err;
      if ((await makeRoom(id, HOST_RESERVE_MB)) === 0) throw err;
      await motor.request('POST', `/api/servers/${id}/actions/start`);
    }
    return true;
  };

  return {
    wake: async (server) => {
      emptySince.delete(server);
      const ok = await startServer(server);
      if (ok) log.info({ server }, 'Schlaf-Modus: wird geweckt');
      return ok;
    },
    makeRoom: (serverId) => makeRoom(serverId),
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
