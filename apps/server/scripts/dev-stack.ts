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

const [motorApp, cli, motorCfg, fake] = await Promise.all([
  from('app.ts'),
  from('admin-cli.ts'),
  from('config.ts'),
  from('docker/fake-driver.ts'),
]);
const motor = await motorApp['buildApp']({
  config: motorCfg['loadConfig'](
    {
      MH_SECRET: secret,
      MH_DATA_DIR: path.join(DIR, 'motor'),
      MH_DOCKER_DRIVER: 'fake',
      MH_HEADLESS: 'true',
      MH_ROUTER_JAVA_PORT: '0',
      MH_ROUTER_BEDROCK_PORT: '0',
    },
    '0.0.0-dev',
  ),
  logger: false,
  docker: fake['createFakeDriver']({ stepMs: fake['FAKE_STEP_MS_FAST'], simulatePlayers: true }),
});
await motor.start();
await motor.app.listen({ host: '127.0.0.1', port: MOTOR_PORT });
const motorUrl = `http://127.0.0.1:${MOTOR_PORT}`;
await fetch(`${motorUrl}/api/setup`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'philip', password: PASSWORD, locale: 'de' }),
});
const tokenFile = path.join(DIR, 'motor-token');
if (!fs.existsSync(tokenFile))
  fs.writeFileSync(
    tokenFile,
    (await cli['runCommand'](motor.ctx.db, 'service-token', ['moinmorni'])).message,
  );
const mm = await buildApp({
  config: loadConfig(
    {
      MM_SECRET: secret,
      MM_DATA_DIR: path.join(DIR, 'moinmorni'),
      MM_MOTOR_URL: motorUrl,
      MM_MOTOR_TOKEN: fs.readFileSync(tokenFile, 'utf8').trim(),
      MM_PORT: String(MM_PORT),
      MM_HOST: '127.0.0.1',
    },
    path.resolve(import.meta.dirname, '../src'),
  ),
  logger: false,
});
await mm.app.listen({ host: '127.0.0.1', port: MM_PORT });

// Beispiel-Spieler, damit Spieler- und Strafen-Seiten im Panel etwas zeigen (nur lokal).
const DEMO = [
  { uuid: '0f6b8a2e-1c4d-4e5f-9a7b-1c2d3e4f5a61', name: 'Lena_Baut', role: 'vip', minutes: 1260 },
  { uuid: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c52', name: 'Finn2015', role: null, minutes: 340 },
  { uuid: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d63', name: 'KaiKocht', role: 'media', minutes: 2210 },
  { uuid: '3c4d5e6f-7a8b-4c9d-0e1f-2a3b4c5d6e74', name: 'Mia_Mausi', role: null, minutes: 95 },
  { uuid: '00000000-0000-0000-0009-01f2a3b4c5d6', name: '.Tobi_04', role: null, minutes: 610 },
] as const;
if (!mm.hub.players.get(DEMO[0].uuid)) {
  DEMO.forEach((p) => {
    mm.hub.players.seen({ uuid: p.uuid, name: p.name, bedrock: p.name.startsWith('.') });
    mm.hub.players.setRole(p.uuid, p.role);
    mm.hub.players.addMinutes(p.uuid, p.minutes);
  });
  mm.hub.punish.add({ uuid: DEMO[1].uuid, kind: 'mute', reason: 'Spam im Chat', by: 'philip', minutes: 120 });
  mm.hub.punish.add({
    uuid: DEMO[3].uuid,
    kind: 'warn',
    reason: 'Bitte nicht beleidigen',
    by: 'philip',
    minutes: null,
  });
  mm.hub.punish.add({
    uuid: DEMO[4].uuid,
    kind: 'ban',
    reason: 'Hacks (Fly)',
    by: 'philip',
    minutes: 7 * 24 * 60,
  });
}
console.log(`Motor: ${motorUrl} · MoinMorni: http://127.0.0.1:${MM_PORT} · Login: philip / ${PASSWORD}`);
