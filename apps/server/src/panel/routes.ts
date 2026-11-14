import { z } from 'zod';
import { SETTING_AREAS, modePatchSchema, roleSchema } from '@moinmorni/shared';
import type { Api } from '../app.js';
import { forbidden } from '../lib/errors.js';
import type { PanelAuth } from './auth.js';
import type { Stores } from './stores.js';

const OWNER = 'owner';

/** Panel: wer bin ich, Einstellungen nach Katalog, Modi, Rollen-Vorlage. Jede Route prüft den Bereich. */
export function registerPanelRoutes(app: Api, auth: PanelAuth, stores: Stores): void {
  app.get('/api/panel/me', async (request) => {
    const user = await auth.require(request);
    return {
      username: user.username,
      role: user.role,
      areas: [...user.areas],
      minecraftUuid: user.minecraftUuid,
      mustChangePassword: user.mustChangePassword,
      csrfToken: user.csrfToken,
    };
  });

  /** Die Bereiche, die diese Person sieht – mit Katalog und aktuellen Werten. */
  app.get('/api/panel/settings', async (request) => {
    const user = await auth.require(request);
    return SETTING_AREAS.filter((a) => user.areas.has(a.panel)).map((area) => ({
      area,
      values: stores.settings(area.id),
    }));
  });

  app.put(
    '/api/panel/settings/:area',
    { schema: { params: z.object({ area: z.string().min(1) }), body: z.record(z.string(), z.unknown()) } },
    async (request) => {
      const area = SETTING_AREAS.find((a) => a.id === request.params.area);
      const user = await auth.require(request, area?.panel);
      return stores.patchSettings(request.params.area, request.body, user.username);
    },
  );

  app.get('/api/panel/modes', async (request) => {
    await auth.require(request, 'modes');
    return stores.modes();
  });

  app.patch(
    '/api/panel/modes/:id',
    { schema: { params: z.object({ id: z.string().min(1) }), body: modePatchSchema } },
    async (request) => {
      const user = await auth.require(request, 'modes');
      return stores.patchMode(request.params.id, request.body, user.username);
    },
  );

  // Lesen dürfen auch alle mit Bereich „Spieler“ (für die Rang-Auswahl); ändern nur mit Bereich „Rollen“.
  app.get('/api/panel/roles', async (request) => {
    const user = await auth.require(request);
    if (!user.areas.has('roles') && !user.areas.has('players')) throw forbidden('panel_area_forbidden');
    return stores.roles();
  });

  app.put('/api/panel/roles', { schema: { body: z.array(roleSchema).min(1) } }, async (request) => {
    const user = await auth.require(request, 'roles');
    if (user.role.id !== OWNER && !user.role.panel.includes('roles')) throw forbidden();
    return stores.saveRoles(request.body, user.username, user.role.id === OWNER);
  });
}
