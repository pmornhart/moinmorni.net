import type { Api } from '../app.js';
import type { StatusService } from './status.js';

/** Öffentlich, ohne Anmeldung: Status für Webseite und Discord. */
export function registerPublicRoutes(app: Api, status: StatusService): void {
  app.get('/api/status', async () => status.status());
  app.get('/api/modes', async () => (await status.status()).modes);
}
