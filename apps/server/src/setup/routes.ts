import { z } from 'zod';
import type { Api } from '../app.js';
import { badRequest } from '../lib/errors.js';
import type { SetupService } from './service.js';

const CODE_MAX = 40;
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;
const SETUP_LIMIT = 5;
// Wie im Motor: Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich – "Philip_M" ja, "Philip M" nein.
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9._-%5D%2B%24&testString=Philip_M
const USERNAME = /^[A-Za-z0-9._-]+$/;

const setupSchema = z.object({
  code: z.string().trim().min(1).max(CODE_MAX),
  username: z.string().trim().min(USERNAME_MIN).max(USERNAME_MAX).regex(USERNAME),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  locale: z.enum(['de', 'en']),
});

/** Ersteinrichtung (vor jeder Anmeldung, darum ohne CSRF-Token – geschützt durch den Einrichtungs-Code). */
export function registerSetupRoutes(app: Api, setup: SetupService): void {
  app.get('/api/setup', async () => ({ required: await setup.required() }));
  app.post(
    '/api/setup',
    { config: { rateLimit: { max: SETUP_LIMIT, timeWindow: '1 minute' } } },
    async (request) => {
      const parsed = setupSchema.safeParse(request.body);
      if (!parsed.success) throw badRequest('setup_invalid');
      await setup.complete(parsed.data, request.hostname);
      return { ok: true };
    },
  );
}
