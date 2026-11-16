/**
 * Probelauf der Rückbenennung mit echten Server-Ordnern: Der echte Provisioner (`src/network/provision.ts`) stellt ein
 * Netzwerk zurück, das noch unter dem Zwischen-Namen läuft – Netzwerk und Server-Namen im Motor, hub.json im
 * Datenordner plugins/moinmorni/, Netzwerk-Jar MoinMorni-Network.jar, die Jar unter dem Zwischen-Namen weg. Statt des
 * Motors: ein kleiner Ersatz, der die Dateien direkt in den Ordnern liest und schreibt (Gelöschtes landet in
 * `<ordner>/.papierkorb/`). Die Schlüssel kommen vom selben Geheimnis wie bei `scripts/hub-dev.ts` (MM_HUB_DEV_DIR) –
 * danach starten die Server und verbinden sich mit diesem Hub.
 *   tsx scripts/umzug-probe.ts <jar> <hub-url> <proxy-ordner> <lobby-ordner> <bau-ordner>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../src/config.js';
import { hubSecretOf, serverKeyOf } from '../src/hub/protocol.js';
import { INTERIM_TITLE } from '../src/lib/rename.js';
import { MotorError, type MotorClient } from '../src/motor/client.js';
import { createProvisioner } from '../src/network/provision.js';

/** node + Skript stehen vor den eigenen Angaben. */
const ARGS_FROM = 2;
const [jar = '', hubUrl = '', proxyDir = '', lobbyDir = '', bauDir = ''] = process.argv.slice(ARGS_FROM);
const DIR = process.env['MM_HUB_DEV_DIR'] ?? path.join(os.homedir(), 'mm-hub-dev');
const secret = fs.readFileSync(path.join(DIR, 'secret'), 'utf8').trim();
const NOT_FOUND = 404;
const dirs: Record<string, string> = { proxy: proxyDir, lobby: lobbyDir, bau: bauDir };
const names: Record<string, string> = {
  proxy: `${INTERIM_TITLE} Proxy`,
  lobby: `${INTERIM_TITLE} Lobby`,
  bau: `${INTERIM_TITLE} Bau`,
};
const net = { name: INTERIM_TITLE };
const view = (): unknown => ({
  id: 'netz',
  name: net.name,
  proxy: { serverId: 'proxy', serverName: names['proxy'], state: 'running' },
  members: ['lobby', 'bau'].map((id) => ({
    serverId: id,
    name: id,
    serverName: names[id],
    state: 'running',
  })),
  defaultMember: 'lobby',
});
const inside = (id: string, rel: string): string => {
  const base = path.resolve(dirs[id] ?? '');
  const file = path.resolve(base, rel);
  if (!file.startsWith(`${base}${path.sep}`)) throw new Error(`außerhalb: ${rel}`);
  return file;
};
const log = (method: string, url: string, extra = ''): void => console.log(`motor ${method} ${url} ${extra}`);

const motor = {
  baseUrl: 'probe',
  request: async (method: string, url: string, body?: unknown) => {
    const u = new URL(url, 'http://probe');
    const [, , what = '', id = '', sub = '', action = ''] = u.pathname.split('/');
    if (what === 'networks') {
      if (method === 'PATCH') {
        net.name = String((body as { name?: string }).name ?? net.name);
        log(method, url, JSON.stringify(body));
        return view();
      }
      return id ? view() : [view()];
    }
    if (what !== 'servers' || !dirs[id]) throw new MotorError(NOT_FOUND, 'not_found');
    if (method === 'PATCH' && !sub) {
      names[id] = String((body as { name?: string }).name ?? names[id]);
      log(method, url, JSON.stringify(body));
      return {};
    }
    if (sub === 'files' && action === 'content') {
      if (method === 'PUT') {
        const b = body as { path: string; content: string };
        const file = inside(id, b.path);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, b.content);
        log(method, url, b.path);
        return undefined;
      }
      const file = inside(id, u.searchParams.get('path') ?? '');
      if (!fs.existsSync(file)) throw new MotorError(NOT_FOUND, 'not_found');
      return { content: fs.readFileSync(file, 'utf8') };
    }
    if (sub === 'files' && !action && method === 'GET') {
      const folder = inside(id, u.searchParams.get('path') ?? '');
      return fs.existsSync(folder) ? fs.readdirSync(folder).map((name) => ({ name })) : [];
    }
    if (sub === 'files' && action === 'delete') {
      const paths = (body as { paths: string[] }).paths;
      const trash = inside(id, '.papierkorb');
      fs.mkdirSync(trash, { recursive: true });
      const moved = paths.filter((p) => fs.existsSync(inside(id, p)));
      moved.forEach((p) =>
        fs.renameSync(inside(id, p), path.join(trash, `${Date.now()}-${path.basename(p)}`)),
      );
      log(method, url, JSON.stringify(moved));
      return { moved: moved.length };
    }
    if (method === 'GET' && !sub) return { live: { state: 'running', playersOnline: 0 } };
    throw new Error(`nicht nachgebaut: ${method} ${url}`);
  },
  upload: async (id: string, dir: string, filename: string, bytes: Uint8Array) => {
    const file = inside(id, path.join(dir, filename));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    log('UPLOAD', `${id}/${dir}/${filename}`);
  },
} as unknown as MotorClient;

const say = (o: unknown, m?: string): void => console.log(m ?? o, m ? JSON.stringify(o) : '');
const quiet = { info: say, warn: say, error: say } as unknown as FastifyBaseLogger;
const hubSecret = hubSecretOf(secret);
const config = { hubUrl, pluginFile: path.resolve(jar) } as Config;
const result = await createProvisioner(
  config,
  motor,
  { keyFor: (server, kind) => serverKeyOf(hubSecret, server, kind) },
  quiet,
  { versions: { paper: '26.1.2', velocity: '4.3.1' }, buildContent: false },
).ensure();
console.log('Netzwerk heißt jetzt:', net.name);
console.log('Server heißen jetzt:', Object.values(names).join(', '));
console.log('Ergebnis:', JSON.stringify({ ...result, servers: undefined }));
