/**
 * Hub allein zum Testen mit echten Servern: lauscht auf 127.0.0.1:8090 und schreibt jedem Server seine hub.json.
 *   tsx scripts/hub-dev.ts <ordner>:<server>:<proxy|backend> … [--rang=Name=rolle …] [--wecken=server:ordner:jar …]
 *     [--starten] [--steuer=<port>]
 * Mit --wecken startet der Hub schlafende Server selbst (java -jar <jar> im Ordner), wie es sonst der Motor tut;
 * mit --starten gleich beim Start. Dazu ein kleiner Ersatz-Motor: Spielerzahl über RCON (aus server.properties),
 * Neustart (RCON „stop“, dann neu starten), Dateien im Ordner – so laufen „Neustart, sobald leer“ und die
 * Einstellungen schlafender Spielmodi wie im echten Netzwerk.
 * --steuer=<port>: POST / {area, values} ändert Einstellungen wie das Panel, GET /status zeigt verbundene Server,
 * offene Neustarts und wie oft jeder Server gestartet wurde; POST /stop {server} hält einen Server an (Schlaf);
 * POST /neustart {servers, why} startet wie nach einem Update gleich neu (Countdown, Lobby, nacheinander –
 * network/restart-now.ts).
 * Daten unter MM_HUB_DEV_DIR (Standard ~/mm-hub-dev).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { openDatabase } from '../src/db/index.js';
import { createHub } from '../src/hub/index.js';
import { createEventBus } from '../src/lib/events.js';
import { MotorError } from '../src/motor/client.js';
import { createStores } from '../src/panel/stores.js';
import { createModeSettingsSync } from '../src/network/mode-settings.js';
import { createRestartQueue } from '../src/network/restart.js';
import { createRestartNow } from '../src/network/restart-now.js';

const PORT = Number(process.env['MM_HUB_DEV_PORT'] ?? 8090);
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
const wakeable = new Map(
  process.argv
    .filter((a) => a.startsWith('--wecken='))
    .map((a) => a.slice('--wecken='.length).split(':'))
    .map(([server = '', dir = '', jar = '']) => [server, { dir, jar }] as const),
);
const children = new Map<string, ChildProcess>();
const starts = new Map<string, number>();
const wake = (server: string): Promise<boolean> => {
  const spec = wakeable.get(server);
  if (!spec || children.has(server)) return Promise.resolve(Boolean(spec));
  console.log(`wecke ${server} …`);
  const out = fs.openSync(path.join(spec.dir, 'hub-dev-server.log'), 'a');
  const child = spawn(process.env['MM_JAVA'] ?? 'java', ['-Xmx1G', '-jar', spec.jar, '--nogui'], {
    cwd: spec.dir,
    stdio: ['ignore', out, out],
    detached: true,
  });
  children.set(server, child);
  starts.set(server, (starts.get(server) ?? 0) + 1);
  child.on('exit', () => children.delete(server));
  child.unref();
  return Promise.resolve(true);
};

// ---------- Ersatz-Motor (nur zum Testen) ----------

const RCON_LOGIN = 3;
const RCON_COMMAND = 2;
const RCON_HEADER = 14;
/** Ein Befehl über RCON (Port und Passwort aus der server.properties des Ordners). */
const rcon = (dir: string, command: string): Promise<string> => {
  const props = Object.fromEntries(
    fs
      .readFileSync(path.join(dir, 'server.properties'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
  const packet = (id: number, type: number, body: string): Buffer => {
    const b = Buffer.alloc(RCON_HEADER + Buffer.byteLength(body));
    b.writeInt32LE(b.length - 4, 0);
    b.writeInt32LE(id, 4);
    b.writeInt32LE(type, 8);
    b.write(body, 12);
    return b;
  };
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(props['rcon.port']), '127.0.0.1');
    let data = Buffer.alloc(0);
    socket.setTimeout(5000, () => socket.destroy(new Error('rcon timeout')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(packet(1, RCON_LOGIN, String(props['rcon.password']))));
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      while (data.length >= 4 && data.length >= data.readInt32LE(0) + 4) {
        const len = data.readInt32LE(0);
        const id = data.readInt32LE(4);
        const body = data.subarray(12, len + 2).toString('utf8');
        data = data.subarray(len + 4);
        if (id === 1) socket.write(packet(2, RCON_COMMAND, command));
        if (id === 2) {
          socket.end();
          resolve(body);
        }
        if (id === -1) reject(new Error('rcon login'));
      }
    });
  });
};
const DEFAULT_COUNTDOWN_SECONDS = 30;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const stopServer = async (server: string): Promise<void> => {
  const spec = wakeable.get(server);
  const child = children.get(server);
  if (!spec || !child) return;
  const gone = new Promise<void>((r) => child.once('exit', () => r()));
  await rcon(spec.dir, 'stop').catch(() => child.kill('SIGTERM'));
  await gone;
};
const motor = {
  request: async <T>(method: string, url: string, raw?: unknown): Promise<T> => {
    const [, , , server = '', what = '', action = ''] = url.split('?')[0]?.split('/') ?? [];
    const spec = wakeable.get(server);
    if (!spec) throw new Error(`unbekannter Server ${server}`);
    if (what === 'files') {
      const body = raw as { path: string; content: string } | undefined;
      const file = path.join(spec.dir, body?.path ?? decodeURIComponent(url.split('path=')[1] ?? ''));
      if (method === 'PUT' && body) {
        fs.writeFileSync(file, body.content);
        return undefined as T;
      }
      if (!fs.existsSync(file)) throw new MotorError(404, 'not_found');
      return { content: fs.readFileSync(file, 'utf8') } as T;
    }
    if (method === 'POST' && action === 'restart') {
      console.log(`starte ${server} neu …`);
      await stopServer(server);
      await wake(server);
      return undefined as T;
    }
    const running = hub.connectedServers().includes(server);
    const list = running ? await rcon(spec.dir, 'list').catch(() => '') : '';
    // „There are 1 of a max of 20 players online: …“
    // https://regex101.com/?flavor=javascript&regex=There%20are%20(%5Cd%2B)&testString=There%20are%201%20of%20a%20max
    const players = Number(/There are (\d+)/.exec(list)?.[1] ?? 0);
    return { live: { state: running ? 'running' : 'stopped', playersOnline: players } } as T;
  },
};
const hub = createHub({ secret, db: handle.db, stores, events, log, timeZone: 'Europe/Berlin', wake });

const args = process.argv.slice(2);
const ranks = args.filter((a) => a.startsWith('--rang=')).map((a) => a.slice('--rang='.length));
args
  .filter((a) => !a.startsWith('--'))
  .forEach((spec) => {
    const [dir = '', server = '', kind = 'backend'] = spec.split(':');
    const target = path.join(dir, 'plugins', 'moinmorni');
    fs.mkdirSync(target, { recursive: true });
    const config = { url: `ws://127.0.0.1:${PORT}/hub`, server, kind, key: hub.keyFor(server, kind) };
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
const restarts = createRestartQueue(
  motor as never,
  log,
  Number(process.env['MM_HUB_DEV_RESTART_MS'] ?? 5000),
);
const restartNow = createRestartNow({
  motor: motor as never,
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
  log,
});
const modeSync = createModeSettingsSync({
  motor: motor as never,
  hub,
  stores,
  events,
  restarts,
  idOf: (member) => Promise.resolve(wakeable.has(member) ? member : undefined),
  log,
});
await hub.listen('127.0.0.1', PORT);
console.log(`Hub läuft auf ws://127.0.0.1:${PORT}/hub`);
if (args.includes('--starten')) {
  await modeSync.prepare([...wakeable.keys()].map((server) => ({ serverId: server, member: server })));
  await Promise.all([...wakeable.keys()].map(wake));
}
const control = args.find((a) => a.startsWith('--steuer='));
if (control) {
  const read = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
  };
  http
    .createServer((req, res) => {
      void (async () => {
        try {
          const body = req.method === 'POST' ? await read(req) : {};
          if (req.url === '/status') {
            res.end(
              JSON.stringify({
                connected: hub.connectedServers(),
                pendingRestarts: restarts.pending(),
                modeRestarts: hub.modeRestarts(),
                starts: Object.fromEntries(starts),
                restartNowBusy: restartNow.busy(),
                online: hub.presence.all().map((p) => ({ name: p.name, server: p.server })),
              }),
            );
          } else if (req.url === '/stop') {
            await stopServer(String(body['server']));
            res.end('{}');
          } else if (req.url === '/neustart') {
            const servers = (body['servers'] as string[]).map((s) => ({ serverId: s, member: s }));
            void restartNow.run(servers, body['why'] === 'release' ? 'release' : 'update');
            res.end('{}');
          } else if (req.url === '/start') {
            await wake(String(body['server']));
            res.end('{}');
          } else {
            const values = stores.patchSettings(String(body['area']), body['values'] as never, 'steuerung');
            res.end(JSON.stringify(values));
          }
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(err) }));
        }
      })();
    })
    .listen(Number(control.slice('--steuer='.length)), '127.0.0.1');
  console.log(`Steuerung auf http://127.0.0.1:${control.slice('--steuer='.length)}/`);
}
