import type { Api } from '../app.js';
import type { PanelAuth } from '../panel/auth.js';
import { copySchema, type BuildService } from './service.js';

/** Panel-Bereich „Bau-Server“: gespeicherte Bauten (WorldEdit-Schematics) ansehen und in einen Modus kopieren. */
export function registerBuildRoutes(app: Api, auth: PanelAuth, build: BuildService): void {
  app.get('/api/panel/build', async (request) => {
    await auth.require(request, 'build');
    return build.overview();
  });

  app.post('/api/panel/build/copy', { schema: { body: copySchema } }, async (request) => {
    await auth.require(request, 'build');
    await build.copy(request.body.file, request.body.target);
    return { ok: true };
  });
}
