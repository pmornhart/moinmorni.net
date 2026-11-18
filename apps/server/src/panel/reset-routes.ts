import { z } from 'zod';
import {
  RESET_WHATS,
  resetConfirmOk,
  type Mode,
  type ResetOverview,
  type ResetServerView,
  type ResetStep,
  type ResetWhat,
} from '@moinmorni/shared';
import type { Api } from '../app.js';
import type { Db } from '../db/index.js';
import { badRequest, forbidden } from '../lib/errors.js';
import type { MotorClient } from '../motor/client.js';
import { BUILD_MEMBER, LOBBY_MEMBER, WARTUNG_MEMBER } from '../network/provision.js';
import { backupServer, wipeServer, wipeStats, wipesProgress } from '../network/reset.js';
import type { RestartNow, Target } from '../network/restart-now.js';
import { isOurNetwork } from '../public/status.js';
import type { PanelAuth } from './auth.js';
import type { Stores } from './stores.js';

/**
 * Panel → Server → „Zurücksetzen“ (Philip): Welt, Spielstand oder beides eines Servers – oder aller zusammen. Nur der
 * Owner. Ablauf je Server: Sicherung im Motor (muss klappen, sonst bleibt der Server unberührt) → Countdown, Spieler in
 * die Lobby bzw. Wartungs-Lobby (wie beim Neustart, network/restart-now.ts) → stoppen → löschen (network/reset.ts) →
 * starten. Lobby und Wartungs-Lobby bauen sich danach von selbst neu. Wer nicht läuft, wird nur gelöscht (nicht
 * geweckt). Der Proxy hat keine Welt und ist nicht dabei. Bestätigung: Name des Servers bzw. „ALLE“.
 */

const NAME_MAX = 64;
const MAX_SERVERS = 64;
const RUNNING = 'running';
const OWNER = 'owner';
const LOBBY_STATS = 'lobby';

interface MotorNetwork {
  readonly name: string;
  readonly members: ReadonlyArray<{
    readonly serverId: string;
    readonly name: string;
    readonly state: string;
  }>;
}

const FIXED: Readonly<Record<string, { kind: ResetServerView['kind']; de: string; en: string }>> = {
  [LOBBY_MEMBER]: { kind: 'lobby', de: 'Lobby', en: 'Lobby' },
  [WARTUNG_MEMBER]: { kind: 'wartung', de: 'Wartungs-Lobby', en: 'Maintenance lobby' },
  [BUILD_MEMBER]: { kind: 'build', de: 'Bau-Server', en: 'Build server' },
};
const FIXED_ORDER = [LOBBY_MEMBER, WARTUNG_MEMBER, BUILD_MEMBER];

const nameOf = (
  member: string,
  fixed: { readonly de: string; readonly en: string } | undefined,
  mode: Mode | undefined,
): { readonly de: string; readonly en: string } => {
  if (fixed) return { de: fixed.de, en: fixed.en };
  if (mode) return { de: mode.name.de, en: mode.name.en };
  return { de: member, en: member };
};

export interface ResetRouteDeps {
  readonly motor: Pick<MotorClient, 'request'>;
  readonly db: Db;
  readonly restartNow: Pick<RestartNow, 'run'>;
  readonly log: {
    readonly warn: (obj: object, msg: string) => void;
    readonly info: (obj: object, msg: string) => void;
  };
  /** Tests: Sicherung ohne Warten. */
  readonly backupPause?: (ms: number) => Promise<void>;
}

interface Entry {
  readonly view: ResetServerView;
  readonly serverId: string;
  /** Unter diesem Namen stehen die Statistiken in der Datenbank (Modus-ID, „lobby“), sonst null. */
  readonly statsId: string | null;
}

export function registerResetRoutes(app: Api, auth: PanelAuth, stores: Stores, deps: ResetRouteDeps): void {
  const { motor } = deps;
  const steps = new Map<string, { step: ResetStep; error?: string }>();
  let running = 0;

  const entries = async (): Promise<Entry[]> => {
    const networks = await motor.request<MotorNetwork[]>('GET', '/api/networks');
    const net = networks.find(isOurNetwork);
    if (!net) return [];
    const modes: readonly Mode[] = stores.modes();
    const rank = (member: string): number => {
      const fixed = FIXED_ORDER.indexOf(member);
      if (fixed >= 0) return fixed;
      const mode = modes.findIndex((m) => m.server === member);
      return FIXED_ORDER.length + (mode >= 0 ? mode : modes.length);
    };
    return net.members
      .map((m): Entry => {
        const fixed = FIXED[m.name];
        const mode = modes.find((x) => x.server === m.name);
        return {
          serverId: m.serverId,
          statsId: mode?.id ?? (m.name === LOBBY_MEMBER ? LOBBY_STATS : null),
          view: {
            member: m.name,
            kind: fixed?.kind ?? 'mode',
            name: nameOf(m.name, fixed, mode),
            modeId: mode?.id ?? null,
            running: m.state === RUNNING,
          },
        };
      })
      .sort((a, b) => rank(a.view.member) - rank(b.view.member));
  };

  const owner = async (request: Parameters<PanelAuth['require']>[0]): Promise<string> => {
    const user = await auth.require(request, 'servers');
    if (user.role.id !== OWNER) throw forbidden('reset_owner_only');
    return user.username;
  };

  app.get('/api/panel/servers/reset', async (request): Promise<ResetOverview> => {
    await owner(request);
    return {
      servers: (await entries()).map((e) => e.view),
      progress: {
        running: running > 0,
        servers: [...steps].map(([member, s]) => ({ member, ...s })),
      },
    };
  });

  const fail = (e: Entry, err: unknown): void => {
    const error = err instanceof Error ? err.message : 'failed';
    steps.set(e.view.member, { step: 'failed', error });
    deps.log.warn({ err, server: e.view.member }, 'Panel: Zurücksetzen ging nicht');
  };

  /** Ein Server: löschen (und Statistik weg). */
  const wipe = async (e: Entry, what: ResetWhat): Promise<void> => {
    steps.set(e.view.member, { step: 'wiping' });
    try {
      const n = await wipeServer(motor, e.serverId, what);
      if (wipesProgress(what) && e.statsId) wipeStats(deps.db, e.statsId);
      deps.log.info({ server: e.view.member, what, paths: n }, 'Panel: Server zurückgesetzt');
      steps.set(e.view.member, { step: 'done' });
    } catch (err) {
      fail(e, err);
    }
  };

  const process = async (picked: readonly Entry[], what: ResetWhat): Promise<void> => {
    // Sicherungen nacheinander (der Motor sichert je Server einzeln); ohne Sicherung kein Löschen.
    const safe = await picked.reduce<Promise<Entry[]>>(async (acc, e) => {
      const ok = await acc;
      steps.set(e.view.member, { step: 'backup' });
      try {
        await backupServer(motor, e.serverId, deps.backupPause ? { pause: deps.backupPause } : {});
        steps.set(e.view.member, { step: 'waiting' });
        return [...ok, e];
      } catch (err) {
        fail(e, err);
        return ok;
      }
    }, Promise.resolve([]));
    const off = safe.filter((e) => !e.view.running);
    await off.reduce(async (prev, e) => {
      await prev;
      await wipe(e, what);
    }, Promise.resolve());
    const targets: Target[] = safe
      .filter((e) => e.view.running)
      .map((e) => ({
        serverId: e.serverId,
        member: e.view.member,
        whileStopped: () => wipe(e, what),
      }));
    if (targets.length) await deps.restartNow.run(targets, 'manual');
    // Hat der Neustart einen Server nicht erreicht (ließ sich nicht stoppen): als gescheitert zeigen.
    targets.forEach((t) => {
      if (steps.get(t.member)?.step === 'waiting')
        steps.set(t.member, { step: 'failed', error: 'not_stopped' });
    });
  };

  app.post(
    '/api/panel/servers/reset',
    {
      schema: {
        body: z.object({
          servers: z.array(z.string().min(1).max(NAME_MAX)).min(1).max(MAX_SERVERS),
          what: z.enum(RESET_WHATS as [ResetWhat, ...ResetWhat[]]),
          confirm: z.string().max(NAME_MAX),
        }),
      },
    },
    async (request): Promise<{ readonly started: readonly string[] }> => {
      const by = await owner(request);
      if (running > 0) throw badRequest('reset_busy');
      const wanted = [...new Set(request.body.servers)];
      const known = await entries();
      const byMember = new Map(known.map((e) => [e.view.member, e]));
      if (wanted.some((m) => !byMember.has(m))) throw badRequest('reset_unknown_server');
      const picked = wanted.map((m) => byMember.get(m)!);
      if (
        !resetConfirmOk(
          request.body.confirm,
          picked.map((e) => e.view),
        )
      )
        throw badRequest('reset_confirm');
      steps.clear();
      picked.forEach((e) => steps.set(e.view.member, { step: 'waiting' }));
      request.log.info(
        { servers: wanted, what: request.body.what, by },
        'Panel: Server werden zurückgesetzt',
      );
      running += 1;
      void (async (): Promise<void> => {
        try {
          await process(picked, request.body.what);
        } catch (err) {
          deps.log.warn({ err }, 'Panel: Zurücksetzen ging nicht ganz durch');
        } finally {
          running -= 1;
        }
      })();
      return { started: wanted };
    },
  );
}
