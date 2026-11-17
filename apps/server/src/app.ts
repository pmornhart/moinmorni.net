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
import { createDiscordCredentials } from './discord/credentials.js';
import { createApplyLogin } from './applications/login.js';
import { registerApplicationRoutes } from './applications/routes.js';
import { createTeamApplications } from './applications/team.js';
import { contentSecurityPolicy, inlineScriptHashes } from './lib/csp.js';
import { createSecretBox } from './lib/secret-box.js';
import { adoptInterimDatabase } from './lib/rename.js';
import { createHub, type Hub } from './hub/index.js';
import { AppError } from './lib/errors.js';
import { createEventBus, type EventBus } from './lib/events.js';
import { createGithubClient } from './lib/github.js';
import { createMotorClient, MotorError, type FetchLike, type MotorClient } from './motor/client.js';
import { startAlertRelay, type AlertRelay } from './motor/alerts.js';
import { MOTOR_PREFIX, registerMotorProxy } from './motor/proxy.js';
import { createPanelAuth } from './panel/auth.js';
import { githubReleases, RELEASE_CHECK_MS } from './network/mode-releases.js';
import {
  createProvisioner,
  LOBBY_MEMBER,
  PROXY_MEMBER,
  type NetworkProvisioner,
  releaseModes,
} from './network/provision.js';
import { createRestartNow, firstStartAfterUpdate, planRestarts, type Target } from './network/restart-now.js';
import { createMemberIds } from './network/members.js';
import { createModeSettingsSync, type ModeSettingsSync } from './network/mode-settings.js';
import { createRestartQueue } from './network/restart.js';
import { createSleepService, type SleepService } from './network/sleep.js';
import { retuneMemory } from './network/memory.js';
import { ensureServerIcon } from './network/server-icon.js';
import { registerDiscordRoutes } from './panel/discord-routes.js';
import { registerNewsRoutes } from './panel/news-routes.js';
import { registerUpdateRoutes } from './system/routes.js';
import { createBuildService } from './build/service.js';
import { registerBuildRoutes } from './build/routes.js';
import { createApplicationService } from './mornicraft/applications.js';
import { registerApplyRoutes } from './mornicraft/routes.js';
import { registerWhitelistTeamRoute } from './mornicraft/team.js';
import { createUpdateService } from './system/update.js';
import { bt } from './discord/texts.js';
import { registerPlayerRoutes } from './panel/player-routes.js';
import { registerTeamRoutes, type TeamAccess } from './panel/team-routes.js';
import { registerPanelRoutes } from './panel/routes.js';
import { createStores, type Stores } from './panel/stores.js';
import { lobbyPackInfo, lobbyPackUrl, registerPackRoutes } from './lobby/packs.js';
import { badgePackOf, badgePackUrl, registerBadgeRoutes } from './badges/pack.js';
import { createLobbyWorld, seasonOf } from './lobby/world.js';
import { registerPublicRoutes } from './public/routes.js';
import { registerSiteRoutes } from './public/site-routes.js';
import { createStatusService } from './public/status.js';
import { registerWwwRedirect } from './public/www.js';
import { registerSetupRoutes } from './setup/routes.js';
import { createSetupService, type SetupService } from './setup/service.js';
import { MODE_JARS, MODE_REPOS } from '@moinmorni/shared';

/** So lange darf ein Netzwerk-Server nach der Einrichtung brauchen, bis er am Hub hängt. */
const HUB_GRACE_MS = 120_000;
/** Einmal pro Stunde prüft das Netzwerk alles (neue Releases der Spielmodi zusätzlich alle 10 Minuten, siehe unten). */
const MODE_CHECK_MS = 3_600_000;
/** Countdown vor einem Neustart, wenn im Panel nichts steht. */
const DEFAULT_COUNTDOWN_SECONDS = 30;
/** Weiterleiter im eigenen Netz: Docker, Heimnetz, NetBird (100.64.0.0/10). */
const TRUSTED_HOPS = 'loopback,linklocal,uniquelocal,100.64.0.0/10';

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
  /** Tests: eigener Weg zu GitHub (Updates, Releases der Spielmodi). */
  readonly githubFetch?: FetchLike;
}

const HTTP_NOT_FOUND = 404;
const ANNOUNCE_DELAY_MS = 15_000;
const HTTP_BAD_GATEWAY = 502;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;
/** Antworten auf Fehler der Anfrage (Fastify und seine Plugins setzen `statusCode`), alles andere: invalid_request. */
const CLIENT_ERRORS: Readonly<Record<number, string>> = {
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};
const ASSETS = '/assets/';
const API = '/api/';
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/** Bilder der Webseite ändern sich nur mit Updates: einen Tag frisch, danach im Hintergrund prüfen (bis eine Woche). */
const PICTURE_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';
const PICTURES = `${path.sep}bilder${path.sep}`;

export async function buildApp(options: BuildOptions): Promise<BuiltApp> {
  const { config } = options;
  const dbFile = path.join(config.dataDir, 'moinmorni.db');
  // Rückbenennung: Datenbank unter dem Zwischen-Namen übernehmen (einmalig nach dem Update, siehe lib/rename.ts).
  const adopted = adoptInterimDatabase(dbFile);
  const handle = openDatabase(dbFile);
  const events = createEventBus();
  const stores = createStores(handle.db, events);
  const motor = createMotorClient(config.motorUrl, config.motorToken, options.motorFetch);
  // Ein Weg zu GitHub für Updates und Spielmodi: Git statt API, wo es geht, gemerkte Antworten, gemeinsame Bremse.
  const github = createGithubClient({
    api: config.githubApi,
    web: config.githubWeb,
    token: config.githubToken,
    dir: path.join(config.dataDir, 'github'),
    ...(options.githubFetch ? { fetchImpl: options.githubFetch } : {}),
  });
  const app = Fastify({
    logger: options.logger ?? true,
    // Die echte Adresse eines Besuchers kommt vom Weiterleiter davor (NetBird, Docker) – nur ihm wird geglaubt, nie
    // einer Adresse, die ein Besucher selbst in X-Forwarded-For schreibt.
    trustProxy: TRUSTED_HOPS,
  }).withTypeProvider<ZodTypeProvider>();
  if (adopted)
    app.log.info('Datenbank unter dem Zwischen-Namen übernommen – das Netzwerk heißt wieder MoinMorni');
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const indexFile = path.join(config.webDir, 'index.html');
  const hasWeb = fs.existsSync(indexFile);
  // Skripte nur von der eigenen Seite (dazu das kleine Hell/Dunkel-Skript der index.html über seine Prüfsumme).
  const scriptHashes = hasWeb ? inlineScriptHashes(fs.readFileSync(indexFile, 'utf8')) : [];
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: contentSecurityPolicy(config.domain, scriptHashes),
    },
    referrerPolicy: { policy: 'same-origin' },
  });
  // Nur Routen mit eigener Grenze (Einrichtung, später Anmeldung im Hub) – der Rest bleibt frei.
  await app.register(rateLimit, { global: false });
  // www.<Domain> → https://<Domain> (vor allem anderen, auch vor der Webseite und der Weiterleitung zum Motor).
  registerWwwRedirect(app, config.domain);

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.code });
    if (err instanceof MotorError) return reply.code(HTTP_BAD_GATEWAY).send({ error: 'motor_unreachable' });
    if ((err as { validation?: unknown }).validation)
      return reply.code(HTTP_BAD_REQUEST).send({ error: 'invalid_request' });
    // Fehler der Anfrage selbst (kaputtes JSON, falsche Art, zu groß, zu oft): so sagen, wie Fastify sie meint –
    // nicht als Fehler 500 und ohne Eintrag im Fehlerprotokoll (sonst füllt jeder Unsinn von außen das Protokoll).
    const status = (err as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= HTTP_BAD_REQUEST && status < HTTP_SERVER_ERROR)
      return reply.code(status).send({ error: CLIENT_ERRORS[status] ?? 'invalid_request' });
    request.log.error({ err }, 'request failed');
    return reply.code(HTTP_SERVER_ERROR).send({ error: 'internal' });
  });

  const auth = createPanelAuth(handle.db, motor, stores);
  // Der Hub weckt schlafende Modi über den Schlaf-Dienst (der wiederum den Hub fragt, wer wo ist).
  const sleepRef: { service: SleepService | null } = { service: null };
  const botRef: { bot: MoinMorniBot | null } = { bot: null };
  const applications = createApplicationService(handle.db, stores, events);
  // Bot-Token und Client-Secret: aus der .env oder dem Panel (versiegelt mit einem Schlüssel aus MM_SECRET).
  const credentials = createDiscordCredentials(handle.db, config, createSecretBox(config.secret), app.log);
  const hub = createHub({
    wake: (server) => sleepRef.service?.wake(server) ?? Promise.resolve(false),
    allowedIn: applications.allowed,
    extraCommands: (ctx) => botRef.bot?.commands(ctx) ?? [],
    secret: config.secret,
    db: handle.db,
    stores,
    events,
    log: app.log,
    timeZone: config.timeZone,
    domain: config.domain,
    // Rang-Abzeichen: Paket zu den Rollen von gerade, von der eigenen Domain (Minecraft lädt es von dort).
    badgePack: () => {
      const pack = badgePackOf(stores.roles());
      const url = badgePackUrl(config.domain, pack.sha1);
      return url ? { url, sha1: pack.sha1 } : null;
    },
  });
  const status = createStatusService(config, motor, stores, hub);
  const team = createTeamApplications({ db: handle.db, stores, hub, events });
  const lobbyWorld = createLobbyWorld(motor, app.log, {
    season: () => seasonOf(stores.settings('lobby')['season']),
    packOffer: () => ({
      url: lobbyPackUrl(config.domain),
      sha1: lobbyPackInfo().sha1,
      required: stores.settings('lobby')['packRequired'] === true,
    }),
  });
  const lobbyRef = { id: '', season: seasonOf(stores.settings('lobby')['season']) };
  const build = createBuildService(motor, stores);
  /** Gibt es erst nach Hub und Neustart-Warteschlange (weiter unten). */
  const modeSettingsRef: { prepare: ModeSettingsSync['prepare'] } = { prepare: () => Promise.resolve() };
  const releases = githubReleases(app.log, github, {
    // Jars zum Ausprobieren ohne Release: <Datenordner>/mode-jars/<Repo-Name>.jar
    localDir: path.join(config.dataDir, 'mode-jars'),
    stateFile: path.join(config.dataDir, 'github', 'releases.json'),
    web: config.githubWeb,
    ...(options.githubFetch ? { fetchImpl: options.githubFetch } : {}),
  });
  const network = createProvisioner(config, motor, hub, app.log, {
    configureLobby: lobbyWorld.configure,
    configureBuild: build.configure,
    modes: () => stores.modes(),
    releases,
    // Panel → Einstellungen → Updates: neue Spielmodi bekommen von selbst ihren Server.
    addModes: () => stores.settings('updates')['addModes'] !== false,
    // Neue Modus-Server starten gleich mit den Einstellungen aus dem Panel.
    prepare: (servers) => modeSettingsRef.prepare(servers),
  });
  const sleep = createSleepService(motor, hub, stores, app.log);
  sleepRef.service = sleep;
  const bot = createMoinMorniBot({
    config,
    credentials,
    db: handle.db,
    stores,
    hub,
    events,
    status,
    applications,
    team,
    log: app.log,
    ...(options.discordFetch ? { fetchImpl: options.discordFetch } : {}),
  });
  botRef.bot = bot;
  const teamRef: { syncAll: () => Promise<void> } = { syncAll: () => Promise.resolve() };
  /** Server-Zugriff der Team-Konten im Motor nachziehen (neue Server, geänderte Rollen). */
  const syncTeam = (): void => {
    teamRef
      .syncAll()
      .catch((err: unknown) => app.log.warn({ err }, 'Team-Zugriff im Motor nicht nachgezogen'));
  };
  events.on('roles.changed', syncTeam);
  const restarts = createRestartQueue(motor, app.log);
  const modeSettings = createModeSettingsSync({
    motor,
    hub,
    stores,
    events,
    restarts,
    idOf: createMemberIds(motor).idOf,
    log: app.log,
  });
  modeSettingsRef.prepare = modeSettings.prepare;
  // Nach einem Update (erster Start mit der neuen Fassung): Neues gleich mit Countdown statt „sobald niemand drauf ist“.
  const freshUpdate = { pending: firstStartAfterUpdate(config.dataDir, config.version) };
  const restartNow = createRestartNow({
    motor,
    hub: {
      playersOn: (member) => hub.presence.on(member),
      everyone: () => hub.presence.all(),
      tell: hub.tell,
      countdown: hub.countdown,
      connect: hub.connect,
      kick: hub.kick,
    },
    queue: restarts,
    modes: () => stores.modes(),
    countdown: () => Number(stores.settings('updates')['restartCountdown'] ?? DEFAULT_COUNTDOWN_SECONDS),
    log: app.log,
  });
  /** Welche Fassung jeder Spielmodus gerade hat („duels@v0.1.2,…“) – aus dem Zwischenspeicher, ohne GitHub. */
  const releaseTags = async (): Promise<string> => {
    const found = await Promise.all(
      releaseModes(stores.modes()).map(
        async (m) =>
          `${m.id}@${(await releases.latest(MODE_REPOS[m.id] ?? '', MODE_JARS[m.id]))?.tag ?? '-'}`,
      ),
    );
    return found.join(',');
  };
  const releaseSeen: { tags: string | null } = { tags: null };
  const releaseTimer: { current: NodeJS.Timeout | undefined } = { current: undefined };
  const hubCheck: { timer: NodeJS.Timeout | undefined } = { timer: undefined };
  const provisionNow = async (): Promise<void> => {
    if (!config.autoNetwork) return;
    try {
      const result = await network.ensure();
      app.log.info(result, 'Netzwerk geprüft');
      releaseSeen.tags = await releaseTags();
      const settings = stores.settings('updates');
      const fresh = freshUpdate.pending;
      freshUpdate.pending = false;
      const soon = fresh && settings['restartAfterUpdate'] !== false;
      const plan = planRestarts({
        fresh,
        afterUpdate: soon,
        modesNow: settings['modeUpdatesNow'] === true,
        restart: result.restart,
        modesInstalled: result.modesInstalled,
      });
      restarts.add(plan.later);
      /** Weitere Neustarts (Speicher, Bild): nach einem Update gleich mit, sonst sobald niemand drauf ist. */
      const extra: Target[] = [];
      // Einmal: Modi mit dem alten Speicher-Standard bekommen den neuen (laufende übernehmen ihn beim Neustart).
      const retuned = await retuneMemory(
        motor,
        config.dataDir,
        result.servers,
        stores.modes(),
        app.log,
      ).catch((err: unknown) => {
        app.log.warn(
          { err },
          'Netzwerk: Arbeitsspeicher ließ sich nicht anpassen – nächster Versuch beim Start',
        );
        return [];
      });
      extra.push(...retuned);
      // Bild in der Serverliste: das Wappen, solange der Proxy keins hat (Velocity liest es beim Neustart).
      const proxy = result.servers.find((s) => s.member === PROXY_MEMBER);
      if (proxy) {
        const iconNew = await ensureServerIcon(motor, proxy.serverId, app.log).catch((err: unknown) => {
          app.log.warn({ err }, 'Netzwerk: Bild für die Serverliste ließ sich nicht aufspielen');
          return false;
        });
        if (iconNew) extra.push(proxy);
      }
      if (!soon) restarts.add(extra);
      const immediate = soon ? [...plan.now, ...extra] : plan.now;
      // Spielmodi, die gerade schlafen: Einstellungen aus dem Panel für den nächsten Start eintragen.
      void modeSettings.syncFiles();
      // Wer zwei Minuten nach dem Start (bzw. nach dem Neustart mit Countdown) noch ohne Hub läuft (z. B. alter
      // Schlüssel im Speicher), startet neu, sobald niemand drauf ist. Schlafende Server holen sich alles beim Start.
      const armHubCheck = (): void => {
        clearTimeout(hubCheck.timer);
        hubCheck.timer = setTimeout(() => {
          const connected = new Set([...hub.connectedServers(), ...(hub.proxyOnline() ? ['proxy'] : [])]);
          restarts.add(result.servers.filter((s) => !connected.has(s.member)));
        }, HUB_GRACE_MS);
        hubCheck.timer.unref();
      };
      if (immediate.length) {
        void (async () => {
          await restartNow.run(immediate, plan.why);
          armHubCheck();
        })();
      } else armHubCheck();
      // Die Welt baut sich im Hintergrund (beim ersten Mal ein paar Minuten), die Webseite läuft schon.
      lobbyRef.id = result.lobbyServerId;
      syncTeam();
      // Startet die Lobby gleich neu (Update), baut sie erst danach – sonst bricht der Bau mittendrin ab.
      const lobbyRestarts = result.restart.some((s) => s.serverId === result.lobbyServerId);
      if (result.lobbyServerId && !lobbyRestarts) void lobbyWorld.build(result.lobbyServerId);
    } catch (err) {
      app.log.error(
        { err },
        'Netzwerk konnte nicht eingerichtet werden – nächster Versuch beim nächsten Start',
      );
    }
  };
  /** Nie zweimal gleichzeitig (sonst entstünden Server doppelt) – wer kommt, während es läuft, wartet darauf. */
  const provisionLock: { running: Promise<void> | null } = { running: null };
  const provision = async (): Promise<void> => {
    if (provisionLock.running) return provisionLock.running;
    provisionLock.running = provisionNow();
    try {
      await provisionLock.running;
    } finally {
      provisionLock.running = null;
    }
  };
  /** Alle 10 Minuten: gibt es eine neue Fassung eines Spielmodus (Git, keine API-Frage)? Nur dann die Einrichtung. */
  const checkReleases = async (): Promise<void> => {
    if (!config.autoNetwork || releaseSeen.tags === null || (await setup.required())) return;
    if ((await releaseTags()) !== releaseSeen.tags) await provision();
  };
  // „Neue Spielmodi automatisch hinzufügen“ wieder an → gleich nachsehen, statt bis zur nächsten vollen Stunde.
  const addModesRef = { on: stores.settings('updates')['addModes'] !== false };
  events.on('settings.changed', ({ area, values }) => {
    if (area !== 'updates') return;
    const on = values['addModes'] !== false;
    const turnedOn = on && !addModesRef.on;
    addModesRef.on = on;
    if (turnedOn && releaseSeen.tags !== null) void provision();
  });
  events.on('setup.done', () => void provision());
  // Lobby (neu) gestartet und beim Hub angemeldet → Welt prüfen; ist sie aktuell, passiert nichts.
  events.on('server.connected', ({ server }) => {
    if (server === LOBBY_MEMBER && lobbyRef.id) void lobbyWorld.build(lobbyRef.id);
  });
  // Saison-Deko umgeschaltet (Panel oder /lobby saison …) → gleich in der Lobby tauschen.
  events.on('settings.changed', ({ area }) => {
    if (area !== 'lobby' || !lobbyRef.id) return;
    // Möbel-Paket Pflicht an/aus: server.properties der Lobby neu, Neustart sobald niemand drin ist.
    void (async () => {
      try {
        if (await lobbyWorld.configure(lobbyRef.id))
          restarts.add([{ serverId: lobbyRef.id, member: LOBBY_MEMBER }]);
      } catch (err) {
        app.log.warn({ err }, 'Lobby: Einstellungen ließen sich nicht schreiben');
      }
    })();
    const season = seasonOf(stores.settings('lobby')['season']);
    if (season === lobbyRef.season) return;
    lobbyRef.season = season;
    void lobbyWorld.applySeason(lobbyRef.id);
  });
  const setup = createSetupService(config, handle.db, motor, app.log, events);
  registerSetupRoutes(app, setup);
  registerPublicRoutes(app, status);
  registerPackRoutes(app);
  registerBadgeRoutes(app, () => stores.roles());
  registerPanelRoutes(app, auth, stores, hub.modeRestarts);
  registerPlayerRoutes(app, auth, stores, hub, handle.db);
  const teamAccess: TeamAccess = registerTeamRoutes(app, auth, stores, handle.db, motor);
  teamRef.syncAll = teamAccess.syncAll;
  registerDiscordRoutes(app, auth, bot, credentials);
  registerNewsRoutes(app, auth, handle.db, events);
  const updates = createUpdateService(config, motor, stores, github);
  registerUpdateRoutes(app, auth, updates);
  // Whitelist im Panel: das Team (kommt über den Rang immer hinein) steht von selbst mit drauf.
  registerWhitelistTeamRoute(app, auth, handle.db, hub.players, applications);
  registerBuildRoutes(app, auth, build);
  const applyLogin = createApplyLogin(config.secret);
  registerApplyRoutes(app, {
    config,
    auth,
    applications,
    discordAppId: bot.applicationId,
    clientSecret: credentials.clientSecret,
    login: applyLogin,
    ...(options.discordFetch ? { fetchImpl: options.discordFetch } : {}),
  });
  registerApplicationRoutes(app, {
    db: handle.db,
    auth,
    mornicraft: applications,
    team,
    teamAccess: () => teamAccess,
    login: applyLogin,
    hub,
    discordLogin: async () => Boolean(credentials.clientSecret() && (await bot.applicationId())),
  });
  const announceUpdate = async (): Promise<void> => {
    const r = updates.takeResult();
    if (!r) return;
    const vars = { from: r.from ?? '?', to: r.to ?? config.version };
    const key = {
      done: 'logUpdateDone',
      rolled_back: 'logUpdateRolledBack',
      failed: 'logUpdateFailed',
    } as const;
    if (r.state !== 'running') await bot.teamLog(bt('de', key[r.state], vars));
  };
  const stopAuto = updates.startAuto(
    () => hub.presence.all().length,
    (by) => {
      bot.teamLog(bt('de', 'logUpdateStarted', { by })).catch(() => undefined);
    },
  );
  registerSiteRoutes(app, handle.db, stores, hub, bot.inviteUrl, () =>
    team
      .positions()
      .filter((p) => p.open)
      .map((p) => ({ id: p.id, name: p.role.name, symbol: p.role.symbol, colour: p.role.colour })),
  );
  await registerMotorProxy(app, config.motorUrl, { beforeStart: (id) => sleep.makeRoom(id) });

  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: config.webDir,
      wildcard: false,
      index: false,
      setHeaders: (res, file) => {
        const assets = file.includes(`${path.sep}assets${path.sep}`);
        res.header(
          'cache-control',
          assets ? IMMUTABLE_CACHE : file.includes(PICTURES) ? PICTURE_CACHE : 'no-cache',
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

  const relay: { current: AlertRelay | null } = { current: null };
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
      // Neue Rolle oder neues Recht aus der Vorlage (z. B. Supporter nach einem Update): überall nachziehen wie nach
      // einer Änderung im Panel (Discord-Rollen, Motor-Zugriff, Rechte auf den Spielservern).
      if (stores.templateUpgrades.length) events.emit('roles.changed', { by: 'MoinMorni' });
      // Meldungen des Motors (Wächter, NetBird-Ausgang, Server) ins Discord-Team-Log.
      if (config.motorToken)
        relay.current = startAlertRelay({
          motorUrl: config.motorUrl,
          token: config.motorToken,
          dataDir: config.dataDir,
          enabled: () => stores.settings('reach')['teamLogAlerts'] !== false,
          post: (text) => bot.teamLog(text),
          log: app.log,
        });
      // Nach einem Update einmal im Team-Log melden, wie es ausging (der Bot braucht kurz für die Verbindung).
      setTimeout(() => {
        announceUpdate().catch((err: unknown) => app.log.warn({ err }, 'Update-Meldung nicht gesendet'));
      }, ANNOUNCE_DELAY_MS).unref();
      await setup.start();
      if (!(await setup.required())) await provision();
      const modeCheck = setInterval(() => {
        void setup.required().then((required) => (required ? undefined : provision()));
      }, MODE_CHECK_MS);
      modeCheck.unref();
      releaseTimer.current = setInterval(() => {
        void (async () => {
          try {
            await checkReleases();
          } catch (err) {
            app.log.warn(
              { err },
              'Spielmodi: Nachsehen nach neuen Fassungen ging nicht – in 10 Minuten wieder',
            );
          }
        })();
      }, RELEASE_CHECK_MS);
      releaseTimer.current.unref();
    },
    close: async () => {
      relay.current?.stop();
      stopAuto();
      sleep.stop();
      bot.stop();
      restarts.stop();
      clearTimeout(hubCheck.timer);
      clearInterval(releaseTimer.current);
      await hub.close();
      await app.close();
      handle.close();
    },
  };
}
