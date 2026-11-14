/**
 * Hub allein zum Testen mit echten Servern: lauscht auf 127.0.0.1:8090 und schreibt jedem Server seine hub.json.
 *   tsx scripts/hub-dev.ts <ordner>:<server>:<proxy|backend> … [--rang Name=rolle …]
 * Daten unter MM_HUB_DEV_DIR (Standard ~/mm-hub-dev).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { openDatabase } from '../src/db/index.js';
import { createHub } from '../src/hub/index.js';
import { createEventBus } from '../src/lib/events.js';
import { createStores } from '../src/panel/stores.js';

const PORT = 8090;
const DIR = process.env['MM_HUB_DEV_DIR'] ?? path.join(os.homedir(), 'mm-hub-dev');
fs.mkdirSync(DIR, { recursive: true });
const secretFile = path.join(DIR, 'secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
const secret = fs.readFileSync(secretFile, 'utf8').trim();

const say = (level: string) => (o: unknown, msg?: string) =>
  console.log(
    new Date().toISOString().slice(11, 19),
    level,
    msg ?? o,
    msg && typeof o === 'object' ? JSON.stringify(o) : '',
  );
const log = {
  info: say('INFO'),
  warn: say('WARN'),
  error: say('ERROR'),
  debug: () => undefined,
  trace: () => undefined,
  fatal: say('FATAL'),
  child: () => log,
  level: 'info',
  silent: () => undefined,
} as unknown as FastifyBaseLogger;

const handle = openDatabase(path.join(DIR, 'hub.db'));
const events = createEventBus();
const stores = createStores(handle.db, events);
const hub = createHub({ secret, db: handle.db, stores, events, log, timeZone: 'Europe/Berlin' });

const args = process.argv.slice(2);
const ranks = args.filter((a) => a.startsWith('--rang=')).map((a) => a.slice('--rang='.length));
args
  .filter((a) => !a.startsWith('--'))
  .forEach((spec) => {
    const [dir = '', server = '', kind = 'backend'] = spec.split(':');
    const target = path.join(dir, 'plugins', 'moinmorni');
    fs.mkdirSync(target, { recursive: true });
    const config = { url: `ws://127.0.0.1:${PORT}/hub`, server, kind, key: hub.keyFor(server) };
    fs.writeFileSync(path.join(target, 'hub.json'), JSON.stringify(config, null, 2));
    console.log(`hub.json für ${server} (${kind}) → ${target}`);
  });
ranks.forEach((r) => {
  const [name = '', role = ''] = r.split('=');
  const uuid = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  // Offline-UUID wie Minecraft (Version 3): so kennt der Hub den Test-Spieler schon vor dem ersten Besuch.
  uuid[6] = ((uuid[6] ?? 0) & 0x0f) | 0x30;
  uuid[8] = ((uuid[8] ?? 0) & 0x3f) | 0x80;
  const hex = uuid.toString('hex');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  hub.players.seen({ uuid: id, name, bedrock: false });
  hub.players.setRole(id, role);
  console.log(`${name} (${id}) hat den Rang ${role}`);
});
await hub.listen('127.0.0.1', PORT);
console.log(`Hub läuft auf ws://127.0.0.1:${PORT}/hub`);
