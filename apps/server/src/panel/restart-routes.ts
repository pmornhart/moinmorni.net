import { z } from 'zod';
import type {
  Mode,
  RestartKind,
  RestartOverview,
  RestartRequestResult,
  RestartServerState,
  RestartServerView,
} from '@moinmorni/shared';
import type { Api } from '../app.js';
import { badRequest } from '../lib/errors.js';
import type { MotorClient } from '../motor/client.js';
import { BUILD_MEMBER, LOBBY_MEMBER, PROXY_MEMBER, WARTUNG_MEMBER } from '../network/provision.js';
import type { RestartNow, Target } from '../network/restart-now.js';
import { isOurNetwork } from '../public/status.js';
import type { PanelAuth } from './auth.js';
import type { Stores } from './stores.js';

/**
 * Panel → „Server neu starten“ (Philip: „jeden Server rebooten außer der Wartungs-Lobby“): Das Team wählt Server des
 * Netzwerks, MoinMorni startet sie mit Countdown nacheinander neu – genau wie nach einem Update (network/restart-now.ts):
 * Spielmodi und Bau-Server zuerst, Spieler kommen vorher in die Lobby; die Lobby zuletzt, ihre Spieler warten so lange
 * in der Wartungs-Lobby; der Proxy mit der Lobby zusammen. Die Wartungs-Lobby selbst nie (auch nicht über die API). Wer
 * nicht läuft (schläft, aus), wird nicht geweckt – sein nächster Start ist ohnehin frisch. Recht: Bereich „Server“.
 */

const MAX_SERVERS = 64;
const NAME_MAX = 64;
const RUNNING = 'running';
const STARTING: readonly string[] = ['starting', 'installing', 'stopping'];

interface MotorNetwork {
  readonly name: string;
  readonly proxy: { readonly serverId: string; readonly state: string; readonly players: number };
  readonly members: ReadonlyArray<{
    readonly serverId: string;
    readonly name: string;
    readonly state: string;
    readonly players: number;
  }>;
}

const FIXED: Readonly<
  Record<string, { readonly kind: RestartKind; readonly de: string; readonly en: string }>
> = {
  [PROXY_MEMBER]: { kind: 'proxy', de: 'Proxy (ganzes Netzwerk)', en: 'Proxy (whole network)' },
  [LOBBY_MEMBER]: { kind: 'lobby', de: 'Lobby', en: 'Lobby' },
  [BUILD_MEMBER]: { kind: 'build', de: 'Bau-Server', en: 'Build server' },
};
/** Reihenfolge in der Liste: Proxy, Lobby, Bau-Server, dann die Modi wie im Panel. */
const FIXED_ORDER: readonly string[] = [PROXY_MEMBER, LOBBY_MEMBER, BUILD_MEMBER];

export interface RestartRouteHub {
  readonly proxyOnline: () => boolean;
  readonly playersOn: (member: string) => number;
  readonly everyone: () => number;
}

export interface RestartRouteDeps {
  readonly motor: Pick<MotorClient, 'request'>;
  readonly hub: RestartRouteHub;
  readonly restartNow: Pick<RestartNow, 'run' | 'busy' | 'progress'>;
  readonly asleep: () => readonly string[];
  readonly countdown: () => number;
  readonly log: { readonly warn: (obj: object, msg: string) => void };
}

interface Entry {
  readonly view: RestartServerView;
  readonly serverId: string;
}

/** Fester Name (Proxy, Lobby, Bau), sonst der des Modus, sonst der Name im Netzwerk. */
const nameOf = (
  member: string,
  fixed: { readonly de: string; readonly en: string } | undefined,
  mode: Mode | undefined,
): { readonly de: string; readonly en: string } => {
  if (fixed) return { de: fixed.de, en: fixed.en };
  if (mode) return { de: mode.name.de, en: mode.name.en };
  return { de: member, en: member };
};

const stateOf = (motorState: string, member: string, asleep: readonly string[]): RestartServerState => {
  if (motorState === RUNNING) return 'running';
  if (STARTING.includes(motorState)) return 'starting';
  return asleep.includes(member) ? 'sleeping' : 'stopped';
};

export function registerRestartRoutes(
  app: Api,
  auth: PanelAuth,
  stores: Stores,
  deps: RestartRouteDeps,
): void {
  const { motor, hub } = deps;

  /** Alle Server des Netzwerks außer der Wartungs-Lobby, mit Motor-ID. */
  const entries = async (): Promise<Entry[]> => {
    const networks = await motor.request<MotorNetwork[]>('GET', '/api/networks');
    const net = networks.find(isOurNetwork);
    if (!net) return [];
    const asleep = deps.asleep();
    const live = hub.proxyOnline();
    const modes: readonly Mode[] = stores.modes();
    const proxy: Entry = {
      serverId: net.proxy.serverId,
      view: {
        member: PROXY_MEMBER,
        kind: 'proxy',
        name: { de: FIXED[PROXY_MEMBER]!.de, en: FIXED[PROXY_MEMBER]!.en },
        modeId: null,
        state: stateOf(net.proxy.state, PROXY_MEMBER, asleep),
        players: live ? hub.everyone() : net.proxy.players,
      },
    };
    const members = net.members
      .filter((m) => m.name !== WARTUNG_MEMBER)
      .map((m): Entry => {
        const fixed = FIXED[m.name];
        const mode = modes.find((x) => x.server === m.name);
        return {
          serverId: m.serverId,
          view: {
            member: m.name,
            kind: fixed?.kind ?? 'mode',
            name: nameOf(m.name, fixed, mode),
            modeId: mode?.id ?? null,
            state: stateOf(m.state, m.name, asleep),
            players: live ? hub.playersOn(m.name) : m.players,
          },
        };
      });
    const rank = (e: Entry): number => {
      const fixed = FIXED_ORDER.indexOf(e.view.member);
      if (fixed >= 0) return fixed;
      const mode = modes.findIndex((m) => m.server === e.view.member);
      return FIXED_ORDER.length + (mode >= 0 ? mode : modes.length);
    };
    return [proxy, ...members].sort((a, b) => rank(a) - rank(b));
  };

  app.get('/api/panel/servers/restart', async (request): Promise<RestartOverview> => {
    await auth.require(request, 'servers');
    return {
      servers: (await entries()).map((e) => e.view),
      countdown: Math.max(1, Math.round(deps.countdown())),
      progress: deps.restartNow.progress(),
    };
  });

  app.post(
    '/api/panel/servers/restart',
    {
      schema: {
        body: z.object({ servers: z.array(z.string().min(1).max(NAME_MAX)).min(1).max(MAX_SERVERS) }),
      },
    },
    async (request): Promise<RestartRequestResult> => {
      const user = await auth.require(request, 'servers');
      const wanted = [...new Set(request.body.servers)];
      // Die Wartungs-Lobby nimmt die Spieler der Lobby auf, solange die neu startet – sie startet nie von Hand neu.
      if (wanted.includes(WARTUNG_MEMBER)) throw badRequest('restart_wartung');
      const known = await entries();
      const byMember = new Map(known.map((e) => [e.view.member, e]));
      if (wanted.some((m) => !byMember.has(m))) throw badRequest('restart_unknown_server');
      const picked = wanted.map((m) => byMember.get(m)!);
      // Läuft: geordnet mit Countdown neu. Ist aus (abgestürzt, gestoppt – nicht schlafend): gleich starten, damit
      // „alle neu starten“ wirklich alle hochbringt. Startet gerade schon (z. B. einzeln neu gestartet) oder schläft:
      // nichts tun – der Server kommt ohnehin frisch hoch; das blockiert die anderen nie.
      const running = picked.filter((e) => e.view.state === 'running');
      const stopped = picked.filter((e) => e.view.state === 'stopped');
      const skipped = picked
        .filter((e) => e.view.state === 'starting' || e.view.state === 'sleeping')
        .map((e) => e.view.member);
      const queued = deps.restartNow.busy();
      const targets: Target[] = running.map((e) => ({ serverId: e.serverId, member: e.view.member }));
      const booted = (
        await Promise.all(
          stopped.map(async (e) => {
            try {
              await motor.request('POST', `/api/servers/${encodeURIComponent(e.serverId)}/actions/start`);
              return e.view.member;
            } catch (err) {
              deps.log.warn({ err, server: e.view.member }, 'Panel: Server ließ sich nicht starten');
              skipped.push(e.view.member);
              return null;
            }
          }),
        )
      ).filter((m): m is string => m !== null);
      request.log.info(
        { servers: targets.map((t) => t.member), booted, skipped, queued, by: user.username },
        'Panel: Server werden von Hand neu gestartet',
      );
      // Nicht abwarten: Countdown und Neustarts dauern Minuten; das Panel fragt den Stand ab.
      if (targets.length)
        void (async (): Promise<void> => {
          try {
            await deps.restartNow.run(targets, 'manual');
          } catch (err) {
            deps.log.warn({ err }, 'Panel: Neustart von Hand ging nicht ganz durch');
          }
        })();
      return { started: [...targets.map((t) => t.member), ...booted], skipped, queued };
    },
  );
}
