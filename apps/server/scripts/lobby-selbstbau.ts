/**
 * Probelauf ohne Motor: baut die Lobby mit dem echten Selbstbau-Code (`src/lobby/world.ts`) auf einem lokalen
 * Paper-Server. Statt des Motors: Dateien direkt im Server-Ordner, Befehle über RCON.
 *   tsx scripts/lobby-selbstbau.ts <server-ordner> <rcon-host:port> <passwort-datei>
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { Rcon } from '@moinmorni/builder';
import { createLobbyWorld } from '../src/lobby/world.js';
import { MotorError, type MotorClient } from '../src/motor/client.js';

const [dir = '.', addr = '127.0.0.1:25575', passFile = '.rcon-pass'] = process.argv.slice(2);
const [host = '127.0.0.1', port = '25575'] = addr.split(':');
const NOT_FOUND = 404;

async function main(): Promise<void> {
  const rcon = new Rcon();
  await rcon.connect(host, Number(port), fs.readFileSync(passFile, 'utf8').trim());
  const fileOf = (url: string): string =>
    path.join(dir, new URL(url, 'http://x').searchParams.get('path') ?? '');
  const motor = {
    request: async (method: string, url: string, body?: unknown) => {
      if (method === 'GET' && url.includes('/files/content')) {
        const file = fileOf(url);
        if (!fs.existsSync(file)) throw new MotorError(NOT_FOUND, 'not_found');
        return { content: fs.readFileSync(file, 'utf8') };
      }
      if (method === 'PUT' && url.endsWith('/files/content')) {
        const b = body as { path: string; content: string };
        const file = path.join(dir, b.path);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, b.content);
        return {};
      }
      if (method === 'POST' && url.endsWith('/command')) {
        const command = (body as { command: string }).command;
        const answer = await rcon.command(command);
        if (!command.includes('execute if loaded')) console.log(`> ${command}\n  ${answer.slice(0, 160)}`);
        return { answer };
      }
      if (method === 'GET') return { live: { state: 'running' } };
      throw new Error(`nicht nachgebaut: ${method} ${url}`);
    },
  } as unknown as MotorClient;
  const say = (o: unknown, m?: string): void => console.log(m ?? o, m ? JSON.stringify(o) : '');
  const log = { info: say, warn: say, error: say } as unknown as FastifyBaseLogger;
  const t0 = Date.now();
  const world = createLobbyWorld(motor, 'moinmorni.net', log, { settleMs: 8000 });
  console.log('Eigenschaften geändert:', await world.configure('lobby'));
  console.log('Ergebnis:', await world.build('lobby'), `nach ${Math.round((Date.now() - t0) / 1000)} s`);
  rcon.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
