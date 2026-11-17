import { z } from 'zod';
import type { ModeRest } from '@moinmorni/shared';
import type { Api } from '../app.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import type { MotorClient } from '../motor/client.js';
import type { MemberIds } from '../network/members.js';
import type { RestartQueue } from '../network/restart.js';
import type { PanelAuth } from './auth.js';
import type { Stores } from './stores.js';

/**
 * Ruhezustand je Modus (Panel → Modi → „Wenn niemand drin ist“): Ob der Server eines Modus im Leerlauf Arbeitsspeicher
 * freigibt, steht nur im Motor („Arbeitsspeicher im Leerlauf freigeben“ je Server) – MoinMorni merkt sich nichts
 * selbst, so zeigen Modi-Seite und Server-Einstellungen immer dasselbe. Eine Änderung gilt ab dem nächsten Start; das
 * Netzwerk startet den Modus dafür neu, sobald niemand drin ist.
 */

interface MotorServer {
  readonly id: string;
  readonly releaseIdleMemory?: boolean;
}

export function registerModeRestRoutes(
  app: Api,
  auth: PanelAuth,
  stores: Stores,
  motor: Pick<MotorClient, 'request'>,
  ids: MemberIds,
  restarts: Pick<RestartQueue, 'add' | 'pending'>,
): void {
  /** Was der Motor je Server sagt; ein älterer Motor kennt den Schalter nicht (dann fehlt er). */
  const flags = async (): Promise<Map<string, boolean | undefined>> => {
    const list = await motor.request<MotorServer[]>('GET', '/api/servers');
    return new Map(list.map((s) => [s.id, s.releaseIdleMemory]));
  };

  app.get('/api/panel/modes/rest', async (request): Promise<Record<string, ModeRest>> => {
    await auth.require(request, 'modes');
    const flagOf = await flags();
    const waiting = new Set(restarts.pending());
    const entries = await Promise.all(
      stores.modes().map(async (mode): Promise<[string, ModeRest]> => {
        const serverId = mode.server ? await ids.idOf(mode.server) : undefined;
        const on = serverId === undefined ? undefined : flagOf.get(serverId);
        return [
          mode.id,
          {
            on: typeof on === 'boolean' ? on : null,
            restartPending: mode.server !== null && waiting.has(mode.server),
          },
        ];
      }),
    );
    return Object.fromEntries(entries);
  });

  app.put(
    '/api/panel/modes/:id/rest',
    { schema: { params: z.object({ id: z.string().min(1) }), body: z.object({ on: z.boolean() }) } },
    async (request): Promise<ModeRest> => {
      const user = await auth.require(request, 'modes');
      const mode = stores.modes().find((m) => m.id === request.params.id);
      if (!mode) throw notFound('mode_not_found');
      const serverId = mode.server ? await ids.idOf(mode.server) : undefined;
      // Noch kein Server (Modus „bald“, Repo ohne Release): es gibt nichts einzustellen.
      if (!mode.server || serverId === undefined) throw conflict('mode_no_server');
      const before = (await flags()).get(serverId);
      if (typeof before !== 'boolean') throw badRequest('motor_without_idle_memory');
      const { on } = request.body;
      if (before !== on) {
        await motor.request('PATCH', `/api/servers/${serverId}`, { releaseIdleMemory: on });
        // Gilt ab dem nächsten Start: neu starten, sobald niemand drin ist (schläft er gerade, beim Aufwachen).
        restarts.add([{ serverId, member: mode.server }]);
        request.log.info(
          { mode: mode.id, server: mode.server, on, by: user.username },
          'Panel: Ruhezustand eines Modus geändert',
        );
      }
      return { on, restartPending: restarts.pending().includes(mode.server) };
    },
  );
}
