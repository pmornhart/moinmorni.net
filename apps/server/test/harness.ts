/**
 * Testaufbau mit dem echten Motor: MorniHosting aus vendor/mornihosting im Motor-Modus (ohne Oberfläche) mit
 * nachgebautem Docker, auf einem freien Port – und MoinMorni davor, genau wie im Container.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp as buildMotor } from '../../../vendor/mornihosting/apps/server/src/app.js';
import { runCommand } from '../../../vendor/mornihosting/apps/server/src/admin-cli.js';
import { loadConfig as loadMotorConfig } from '../../../vendor/mornihosting/apps/server/src/config.js';
import {
  createFakeDriver,
  FAKE_STEP_MS_FAST,
} from '../../../vendor/mornihosting/apps/server/src/docker/fake-driver.js';
import { buildApp, type BuiltApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const SECRET = 'test-geheimnis-test-geheimnis-test-geheimnis-1234';
export const OWNER_PASSWORD = 'Test-Passwort-12345';

export interface Harness {
  readonly mm: BuiltApp;
  readonly motorUrl: string;
  /** Anmelden über die Weiterleitung, wie der Browser: liefert Cookie und CSRF-Token. */
  readonly login: (username: string, password: string) => Promise<{ cookie: string; csrf: string }>;
  readonly cleanup: () => Promise<void>;
}

export async function createHarness(): Promise<Harness> {
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
  const address = motor.app.server.address();
  const motorUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  // Philip richtet das erste Konto ein (im echten Aufbau über den Einrichtungs-Assistenten von MoinMorni).
  await fetch(`${motorUrl}/api/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'philip', password: OWNER_PASSWORD, locale: 'de' }),
  });
  const token = (await runCommand(motor.ctx.db, 'service-token', ['moinmorni'])).message;
  const mm = await buildApp({
    config: loadConfig(
      {
        MM_SECRET: SECRET,
        MM_DATA_DIR: mmDir,
        MM_MOTOR_URL: motorUrl,
        MM_MOTOR_TOKEN: token,
        MM_PORT: '0',
        MM_WEB_DIR: mmDir,
      },
      mmDir,
    ),
    logger: false,
  });
  await mm.app.listen({ host: '127.0.0.1', port: 0 });
  const mmAddress = mm.app.server.address();
  const mmUrl = `http://127.0.0.1:${typeof mmAddress === 'object' && mmAddress ? mmAddress.port : 0}`;

  return {
    mm,
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
