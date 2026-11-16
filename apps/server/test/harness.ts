/**
 * Testaufbau mit dem echten Motor: MorniHosting aus vendor/mornihosting im Motor-Modus (ohne Oberfläche) mit
 * nachgebautem Docker, auf einem freien Port – und morni.net davor, genau wie im Container.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp, type BuiltApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const SECRET = 'test-geheimnis-test-geheimnis-test-geheimnis-1234';
const VENDOR = path.resolve(import.meta.dirname, '../../../vendor/mornihosting/apps/server/src');

/** Nur was der Test vom Motor braucht – MorniHosting bringt eigene Fastify-Typen mit, die prüfen wir hier nicht. */
interface MotorApp {
  readonly app: {
    listen: (o: { host: string; port: number }) => Promise<string>;
    server: { address: () => unknown };
  };
  readonly ctx: { readonly db: unknown };
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}
interface MotorModules {
  readonly buildMotor: (o: { config: unknown; logger: boolean; docker: unknown }) => Promise<MotorApp>;
  readonly runCommand: (
    db: unknown,
    command: string,
    args: string[],
  ) => Promise<{ ok: boolean; message: string }>;
  readonly loadMotorConfig: (env: Record<string, string>, version: string) => unknown;
  readonly createFakeDriver: (o: { stepMs: number; simulatePlayers: boolean }) => unknown;
  readonly FAKE_STEP_MS_FAST: number;
}

async function loadMotor(): Promise<MotorModules> {
  const from = (file: string): Promise<Record<string, unknown>> => import(path.join(VENDOR, file));
  const [app, cli, config, fake] = await Promise.all([
    from('app.ts'),
    from('admin-cli.ts'),
    from('config.ts'),
    from('docker/fake-driver.ts'),
  ]);
  return {
    buildMotor: app['buildApp'] as MotorModules['buildMotor'],
    runCommand: cli['runCommand'] as MotorModules['runCommand'],
    loadMotorConfig: config['loadConfig'] as MotorModules['loadMotorConfig'],
    createFakeDriver: fake['createFakeDriver'] as MotorModules['createFakeDriver'],
    FAKE_STEP_MS_FAST: fake['FAKE_STEP_MS_FAST'] as number,
  };
}
export const OWNER_PASSWORD = 'Test-Passwort-12345';

export interface Harness {
  readonly mm: BuiltApp;
  readonly mmUrl: string;
  readonly mmDir: string;
  readonly motorUrl: string;
  /** Anmelden über die Weiterleitung, wie der Browser: liefert Cookie und CSRF-Token. */
  readonly login: (username: string, password: string) => Promise<{ cookie: string; csrf: string }>;
  readonly cleanup: () => Promise<void>;
}

export interface HarnessOptions {
  /** false = der Motor ist frisch, noch ohne Konto (Ersteinrichtung über morni.net testen). */
  readonly motorSetup?: boolean;
  /** Gebaute Webseite ausliefern (Browser-Tests). */
  readonly webDir?: string;
  /** Fester Port für morni.net (Browser-Tests). */
  readonly port?: number;
  /** Weitere Einstellungen (z. B. MM_DISCORD_TOKEN). */
  readonly env?: Record<string, string>;
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const { buildMotor, runCommand, loadMotorConfig, createFakeDriver, FAKE_STEP_MS_FAST } = await loadMotor();
  const motorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-motor-'));
  const mmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-data-'));
  const motorConfig = loadMotorConfig(
    {
      MH_SECRET: SECRET,
      MH_DATA_DIR: motorDir,
      MH_DOCKER_DRIVER: 'fake',
      MH_HEADLESS: 'true',
      MH_ROUTER_JAVA_PORT: '0',
      MH_ROUTER_BEDROCK_PORT: '0',
    },
    '0.0.0-test',
  );
  const motor = await buildMotor({
    config: motorConfig,
    logger: false,
    docker: createFakeDriver({ stepMs: FAKE_STEP_MS_FAST, simulatePlayers: false }),
  });
  await motor.start();
  await motor.app.listen({ host: '127.0.0.1', port: 0 });
  const address = motor.app.server.address() as { port: number };
  const motorUrl = `http://127.0.0.1:${address.port}`;
  // Philip richtet das erste Konto ein (im echten Aufbau über den Einrichtungs-Assistenten von morni.net).
  if (options.motorSetup !== false)
    await fetch(`${motorUrl}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'philip', password: OWNER_PASSWORD, locale: 'de' }),
    });
  const token = (await runCommand(motor.ctx.db, 'service-token', ['morninet'])).message;
  const mm = await buildApp({
    config: loadConfig(
      {
        MM_SECRET: SECRET,
        MM_DATA_DIR: mmDir,
        MM_MOTOR_URL: motorUrl,
        MM_MOTOR_TOKEN: token,
        MM_PORT: '0',
        MM_WEB_DIR: options.webDir ?? mmDir,
        MM_AUTO_NETWORK: 'false',
        ...options.env,
      },
      mmDir,
    ),
    logger: false,
  });
  await mm.app.listen({ host: '127.0.0.1', port: options.port ?? 0 });
  const mmAddress = mm.app.server.address();
  const mmUrl = `http://127.0.0.1:${typeof mmAddress === 'object' && mmAddress ? mmAddress.port : 0}`;

  return {
    mm,
    mmUrl,
    mmDir,
    motorUrl,
    login: async (username, password) => {
      const res = await fetch(`${mmUrl}/panel/motor/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: mmUrl },
        body: JSON.stringify({ username, password }),
      });
      const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
      const me = (await (
        await fetch(`${mmUrl}/panel/motor/api/auth/me`, { headers: { cookie } })
      ).json()) as { csrfToken: string };
      return { cookie, csrf: me.csrfToken };
    },
    cleanup: async () => {
      await mm.close();
      await motor.stop();
      fs.rmSync(motorDir, { recursive: true, force: true });
      fs.rmSync(mmDir, { recursive: true, force: true });
    },
  };
}
