import type { Api } from '../app.js';
import { conflict } from '../lib/errors.js';
import type { PanelAuth } from '../panel/auth.js';
import type { UpdateService } from './update.js';

const CHECKS_PER_MINUTE = 3;
const MINUTE_MS = 60_000;

/** Panel-Bereich „Updates“: Stand, nach Updates suchen, Update starten. */
export function registerUpdateRoutes(app: Api, auth: PanelAuth, updates: UpdateService): void {
  const checks: { at: number[] } = { at: [] };

  app.get('/api/panel/updates', async (request) => {
    await auth.require(request, 'updates');
    return updates.view();
  });

  app.post('/api/panel/updates/check', async (request) => {
    await auth.require(request, 'updates');
    const now = Date.now();
    checks.at = checks.at.filter((t) => now - t < MINUTE_MS);
    if (checks.at.length >= CHECKS_PER_MINUTE) return updates.view();
    checks.at.push(now);
    return updates.check();
  });

  app.post('/api/panel/updates/start', async (request) => {
    const user = await auth.require(request, 'updates');
    const view = await updates.view();
    if (!view.canUpdate) throw conflict('update_no_agent');
    return updates.start(user.username);
  });
}
