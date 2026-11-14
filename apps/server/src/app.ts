import fs from 'node:fs';
import path from 'node:path';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { openDatabase, type Db } from './db/index.js';
import { createMoinMorniBot, type MoinMorniBot } from './discord/bot.js';
import { createHub, type Hub } from './hub/index.js';
import { AppError } from './lib/errors.js';
import { createEventBus, type EventBus } from './lib/events.js';
import { createMotorClient, MotorError, type FetchLike, type MotorClient } from './motor/client.js';
import { MOTOR_PREFIX, registerMotorProxy } from './motor/proxy.js';
import { createPanelAuth } from './panel/auth.js';
import { createProvisioner, type NetworkProvisioner } from './network/provision.js';
import { createSleepService, type SleepService } from './network/sleep.js';
import { registerDiscordRoutes } from './panel/discord-routes.js';
import { registerNewsRoutes } from './panel/news-routes.js';
import { registerPlayerRoutes } from './panel/player-routes.js';
import { registerPanelRoutes } from './panel/routes.js';
import { createStores, type Stores } from './panel/stores.js';
import { registerPublicRoutes } from './public/routes.js';
import { registerSiteRoutes } from './public/site-routes.js';
import { createStatusService } from './public/status.js';
import { registerSetupRoutes } from './setup/routes.js';
import { createSetupService, type SetupService } from './setup/service.js';

export type Api = FastifyInstance<
  import('node:http').Server,
  import('node:http').IncomingMessage,
  import('node:http').ServerResponse,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export interface BuiltApp {
  readonly app: Api;
  readonly config: Config;
  readonly db: Db;
  readonly stores: Stores;
  readonly motor: MotorClient;
  readonly events: EventBus;
  readonly setup: SetupService;
  readonly hub: Hub;
  readonly network: NetworkProvisioner;
  readonly sleep: SleepService;
  readonly bot: MoinMorniBot;
  /** Nach dem Start im Hintergrund: Einrichtungs-Code bereitlegen, Motor einstellen. */
  readonly start: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface BuildOptions {
  readonly config: Config;
  readonly logger?: boolean;
  /** Tests: eigener Weg zum Motor. */
  readonly motorFetch?: FetchLike;
  /** Tests: eigener Weg zu Discord. */
  readonly discordFetch?: typeof fetch;
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
  // Nur Routen mit eigener Grenze (Einrichtung, später Anmeldung im Hub) – der Rest bleibt frei.
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.code });
    if (err instanceof MotorError) return reply.code(HTTP_BAD_GATEWAY).send({ error: 'motor_unreachable' });
    if ((err as { validation?: unknown }).validation)
      return reply.code(HTTP_BAD_REQUEST).send({ error: 'invalid_request' });
    request.log.error({ err }, 'request failed');
    return reply.code(HTTP_SERVER_ERROR).send({ error: 'internal' });
  });

  const auth = createPanelAuth(handle.db, motor, stores);
  // Der Hub weckt schlafende Modi über den Schlaf-Dienst (der wiederum den Hub fragt, wer wo ist).
  const sleepRef: { service: SleepService | null } = { service: null };
  const botRef: { bot: MoinMorniBot | null } = { bot: null };
  const hub = createHub({
    wake: (server) => sleepRef.service?.wake(server) ?? Promise.resolve(false),
    extraCommands: (ctx) => botRef.bot?.commands(ctx) ?? [],
    secret: config.secret,
    db: handle.db,
    stores,
    events,
    log: app.log,
    timeZone: config.timeZone,
    domain: config.domain,
  });
  const status = createStatusService(config, motor, stores, hub);
  const network = createProvisioner(config, motor, hub, app.log);
  const sleep = createSleepService(motor, hub, stores, app.log);
  sleepRef.service = sleep;
  const bot = createMoinMorniBot({
    config,
    db: handle.db,
    stores,
    hub,
    events,
    status,
    log: app.log,
    ...(options.discordFetch ? { fetchImpl: options.discordFetch } : {}),
  });
  botRef.bot = bot;
  const provision = async (): Promise<void> => {
    if (!config.autoNetwork) return;
    try {
      const result = await network.ensure();
      app.log.info(result, 'Netzwerk geprüft');
    } catch (err) {
      app.log.error(
        { err },
        'Netzwerk konnte nicht eingerichtet werden – nächster Versuch beim nächsten Start',
      );
    }
  };
  events.on('setup.done', () => void provision());
  const setup = createSetupService(config, handle.db, motor, app.log, events);
  registerSetupRoutes(app, setup);
  registerPublicRoutes(app, status);
  registerPanelRoutes(app, auth, stores);
  registerPlayerRoutes(app, auth, stores, hub, handle.db);
  registerDiscordRoutes(app, auth, bot);
  registerNewsRoutes(app, auth, handle.db, events);
  registerSiteRoutes(app, handle.db, stores, hub, bot.inviteUrl);
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
    config,
    db: handle.db,
    stores,
    motor,
    events,
    setup,
    hub,
    network,
    sleep,
    bot,
    start: async () => {
      sleep.start();
      bot.start();
      await setup.start();
      if (!(await setup.required())) await provision();
    },
    close: async () => {
      sleep.stop();
      bot.stop();
      await hub.close();
      await app.close();
      handle.close();
    },
  };
}
