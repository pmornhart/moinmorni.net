import { z } from 'zod';
import { WARTUNG_ANNOUNCE_MAX_SECONDS, WARTUNG_REASON_MAX, type WartungPlanView } from '@moinmorni/shared';
import type { Api } from '../app.js';
import { badRequest, conflict } from '../lib/errors.js';
import type { WartungPlan } from '../hub/wartung-plan.js';
import type { PanelAuth } from './auth.js';

/**
 * Panel → Einstellungen → Netzwerk → Wartung (Karte „Wartung jetzt“) und das Fenster „Server neu starten“: dieselben
 * Wege wie `/wartung an|aus|neustart|abbrechen` im Spiel (hub/wartung-plan.ts). Recht: Bereich „Einstellungen“ – wie
 * die Einstellungen der Wartung selbst.
 */

const ANNOUNCE_ERRORS = {
  busy: 'wartung_busy',
  no_restart: 'wartung_no_restart',
  already_on: 'wartung_already_on',
} as const;

export function registerWartungRoutes(app: Api, auth: PanelAuth, plan: WartungPlan): void {
  app.get('/api/panel/wartung', async (request): Promise<WartungPlanView> => {
    await auth.require(request, 'settings');
    return plan.view();
  });

  app.post(
    '/api/panel/wartung',
    {
      schema: {
        body: z.object({
          kind: z.enum(['on', 'restart']),
          seconds: z.number().int().min(0).max(WARTUNG_ANNOUNCE_MAX_SECONDS),
          reason: z.string().max(WARTUNG_REASON_MAX).default(''),
          proxy: z.boolean().default(false),
        }),
      },
    },
    async (request): Promise<WartungPlanView> => {
      const user = await auth.require(request, 'settings');
      const result = plan.announce({ ...request.body, by: user.username });
      if (result !== 'ok') throw conflict(ANNOUNCE_ERRORS[result]);
      return plan.view();
    },
  );

  app.post('/api/panel/wartung/abbrechen', async (request): Promise<WartungPlanView> => {
    const user = await auth.require(request, 'settings');
    if (!plan.cancel(user.username)) throw badRequest('wartung_nothing');
    return plan.view();
  });

  app.post('/api/panel/wartung/aus', async (request): Promise<WartungPlanView> => {
    const user = await auth.require(request, 'settings');
    if (plan.off(user.username) === 'restarting') throw conflict('wartung_restarting');
    return plan.view();
  });
}
