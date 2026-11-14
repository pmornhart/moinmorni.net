import fs from 'node:fs';
import path from 'node:path';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { openDatabase, type Db } from './db/index.js';
import { AppError } from './lib/errors.js';
import { createEventBus, type EventBus } from './lib/events.js';
import { createMotorClient, MotorError, type FetchLike, type MotorClient } from './motor/client.js';
import { MOTOR_PREFIX, registerMotorProxy } from './motor/proxy.js';
import { createPanelAuth } from './panel/auth.js';
import { registerPanelRoutes } from './panel/routes.js';
import { createStores, type Stores } from './panel/stores.js';
import { registerPublicRoutes } from './public/routes.js';
import { createStatusService } from './public/status.js';

export type Api = FastifyInstance<
  import('node:http').Server,
  import('node:http').IncomingMessage,
  import('node:http').ServerResponse,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export interface BuiltApp {
  readonly app: Api;
  readonly db: Db;
  readonly stores: Stores;
  readonly motor: MotorClient;
  readonly events: EventBus;
  readonly close: () => Promise<void>;
}

export interface BuildOptions {
  readonly config: Config;
  readonly logger?: boolean;
  /** Tests: eigener Weg zum Motor. */
  readonly motorFetch?: FetchLike;
}

const HTTP_NOT_FOUND = 404;
const HTTP_BAD_GATEWAY = 502;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;
const ASSETS = '/assets/';
const API = '/api/';
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

export async function buildApp(options: BuildOptions): Promise<BuiltApp> {
  const { config } = options;
  const handle = openDatabase(path.join(config.dataDir, 'moinmorni.db'));
  const events = createEventBus();
  const stores = createStores(handle.db, events);
  const motor = createMotorClient(config.motorUrl, config.motorToken, options.motorFetch);
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(helmet, { contentSecurityPolicy: false, referrerPolicy: { policy: 'same-origin' } });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.code });
    if (err instanceof MotorError) return reply.code(HTTP_BAD_GATEWAY).send({ error: 'motor_unreachable' });
    if ((err as { validation?: unknown }).validation)
      return reply.code(HTTP_BAD_REQUEST).send({ error: 'invalid_request' });
    request.log.error({ err }, 'request failed');
    return reply.code(HTTP_SERVER_ERROR).send({ error: 'internal' });
  });

  const auth = createPanelAuth(handle.db, motor, stores);
  const status = createStatusService(config, motor, stores);
  registerPublicRoutes(app, status);
  registerPanelRoutes(app, auth, stores);
  await registerMotorProxy(app, config.motorUrl);

  const hasWeb = fs.existsSync(path.join(config.webDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: config.webDir,
      wildcard: false,
      index: false,
      setHeaders: (res, file) => {
        res.header(
          'cache-control',
          file.includes(`${path.sep}assets${path.sep}`) ? IMMUTABLE_CACHE : 'no-cache',
        );
      },
    });
  }
  app.setNotFoundHandler((request, reply) => {
    const page =
      request.method === 'GET' &&
      !request.url.startsWith(API) &&
      !request.url.startsWith(ASSETS) &&
      !request.url.startsWith(MOTOR_PREFIX);
    if (page && hasWeb) return reply.type('text/html').sendFile('index.html');
    return reply.code(HTTP_NOT_FOUND).send({ error: 'not_found' });
  });

  return {
    app,
    db: handle.db,
    stores,
    motor,
    events,
    close: async () => {
      await app.close();
      handle.close();
    },
  };
}
