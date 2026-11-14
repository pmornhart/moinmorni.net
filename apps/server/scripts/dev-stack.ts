/**
 * Lokale Entwicklung: Motor (MorniHosting, Motor-Modus, nachgebautes Docker) auf :8180 und MoinMorni auf :8080,
 * mit Owner-Konto „philip“ (Passwort aus MM_DEV_PASSWORD, Standard „Test-Passwort-12345“). Daten unter
 * MM_DEV_DIR (Standard ~/mm-dev). Start: pnpm --filter @moinmorni/server exec tsx scripts/dev-stack.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const VENDOR = path.resolve(import.meta.dirname, '../../../vendor/mornihosting/apps/server/src');
const DIR = process.env['MM_DEV_DIR'] ?? path.join(os.homedir(), 'mm-dev');
const PASSWORD = process.env['MM_DEV_PASSWORD'] ?? 'Test-Passwort-12345';
const MOTOR_PORT = 8180;
const MM_PORT = 8080;

const from = (file: string): Promise<Record<string, any>> => import(path.join(VENDOR, file));
const secretFile = path.join(DIR, 'secret');
fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, `${crypto.randomUUID()}${crypto.randomUUID()}`);
const secret = fs.readFileSync(secretFile, 'utf8').trim();

const [motorApp, cli, motorCfg, fake] = await Promise.all([from('app.ts'), from('admin-cli.ts'), from('config.ts'), from('docker/fake-driver.ts')]);
const motor = await motorApp['buildApp']({
  config: motorCfg['loadConfig']({ MH_SECRET: secret, MH_DATA_DIR: path.join(DIR, 'motor'), MH_DOCKER_DRIVER: 'fake', MH_HEADLESS: 'true', MH_ROUTER_JAVA_PORT: '0', MH_ROUTER_BEDROCK_PORT: '0' }, '0.0.0-dev'),
  logger: false,
  docker: fake['createFakeDriver']({ stepMs: fake['FAKE_STEP_MS_FAST'], simulatePlayers: true }),
});
await motor.start();
await motor.app.listen({ host: '127.0.0.1', port: MOTOR_PORT });
const motorUrl = `http://127.0.0.1:${MOTOR_PORT}`;
await fetch(`${motorUrl}/api/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'philip', password: PASSWORD, locale: 'de' }) });
const tokenFile = path.join(DIR, 'motor-token');
if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, (await cli['runCommand'](motor.ctx.db, 'service-token', ['moinmorni'])).message);
const mm = await buildApp({
  config: loadConfig({ MM_SECRET: secret, MM_DATA_DIR: path.join(DIR, 'moinmorni'), MM_MOTOR_URL: motorUrl, MM_MOTOR_TOKEN: fs.readFileSync(tokenFile, 'utf8').trim(), MM_PORT: String(MM_PORT), MM_HOST: '127.0.0.1' }, path.resolve(import.meta.dirname, '../src')),
  logger: false,
});
await mm.app.listen({ host: '127.0.0.1', port: MM_PORT });
console.log(`Motor: ${motorUrl} · MoinMorni: http://127.0.0.1:${MM_PORT} · Login: philip / ${PASSWORD}`);
