/**
 * Wartungs-Lobby ohne Hub (echter Test): Der Hub ist weg (MoinMorni startet neu), die Lobby auch. Der Proxy schickt
 * neue Spieler selbst in die Wartungs-Lobby, lässt niemanden auf den Bau-Server und holt alle zurück, sobald die
 * Lobby wieder antwortet.
 *   NODE_PATH=<ordner mit mineflayer> node tools/netz-test/wartung-ohne-hub.cjs
 * Erwartet: Velocity mit Netzwerk-Plugin auf WT_PROXY, Wartungs-Lobby läuft, Lobby und Hub sind aus. Der Test startet
 * die Lobby selbst (WT_JAVA, Ordner WT_DIR/lobby mit paper.jar) und lässt sie danach laufen.
 */
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mineflayer = require('mineflayer');

const [HOST, PORT] = (process.env.WT_PROXY ?? '127.0.0.1:27900').split(':');
const DIR = process.env.WT_DIR ?? '/home/user/mm-cache/servers/wartung-test';
const JAVA = process.env.WT_JAVA ?? 'java';
const VERSION = process.env.MC_VERSION ?? '26.1';
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` – ${detail}` : ''}`);
}

function props(server) {
  const text = fs.readFileSync(path.join(DIR, server, 'server.properties'), 'utf8');
  return Object.fromEntries(
    text
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

function rcon(server, command) {
  const p = props(server);
  const packet = (id, type, body) => {
    const b = Buffer.alloc(14 + Buffer.byteLength(body));
    b.writeInt32LE(b.length - 4, 0);
    b.writeInt32LE(id, 4);
    b.writeInt32LE(type, 8);
    b.write(body, 12);
    return b;
  };
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(p['rcon.port']), '127.0.0.1');
    let data = Buffer.alloc(0);
    socket.setTimeout(8000, () => socket.destroy(new Error('rcon timeout')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(packet(1, 3, String(p['rcon.password']))));
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      while (data.length >= 4 && data.length >= data.readInt32LE(0) + 4) {
        const len = data.readInt32LE(0);
        const id = data.readInt32LE(4);
        const body = data.subarray(12, len + 2).toString('utf8');
        data = data.subarray(len + 4);
        if (id === 1) socket.write(packet(2, 2, command));
        if (id === 2) {
          socket.end();
          resolve(body);
        }
        if (id === -1) reject(new Error('rcon login'));
      }
    });
  });
}

async function where(name) {
  for (const server of ['lobby', 'wartung', 'bau']) {
    const list = await rcon(server, 'list').catch(() => '');
    const names = (list.split(':')[1] ?? '').split(',').map((n) => n.trim().split(' ').pop());
    if (names.includes(name)) return server;
  }
  return null;
}

async function lands(name, server, ms = 30000) {
  const start = Date.now();
  let seen = null;
  while (Date.now() - start < ms) {
    seen = await where(name);
    if (seen === server) return { ok: true, seen };
    await sleep(500);
  }
  return { ok: false, seen };
}

function join(username) {
  return new Promise((resolve, reject) => {
    const bot = mineflayer.createBot({
      host: HOST,
      port: Number(PORT),
      username,
      version: VERSION,
      auth: 'offline',
      physicsEnabled: false,
    });
    bot.lines = [];
    bot.on('messagestr', (m) => bot.lines.push(m));
    bot.once('spawn', () => resolve(bot));
    bot.once('kicked', (reason) => reject(new Error(`kicked: ${JSON.stringify(reason)}`)));
    bot.once('error', reject);
  });
}

async function sees(bot, match, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (bot.lines.some((l) => match.test(l))) return true;
    await sleep(100);
  }
  return false;
}

async function main() {
  check('Lobby ist aus', (await rcon('lobby', 'list').catch(() => null)) === null);
  const eva = await join('Eva');
  const at = await lands('Eva', 'wartung');
  check('Ohne Hub und ohne Lobby: Eva landet in der Wartungs-Lobby', at.ok, `auf ${at.seen}`);
  check(
    'Die Wartungs-Lobby sagt, dass das Netzwerk neu startet',
    await sees(eva, /Netzwerk startet|network is restarting/),
  );
  eva.chat('/server bau');
  await sleep(3000);
  check('Ohne Hub nicht auf den Bau-Server', (await where('Eva')) === 'wartung');

  const out = fs.openSync(path.join(DIR, 'lobby', 'ohne-hub-lobby.log'), 'a');
  const lobby = spawn(JAVA, ['-Xmx768M', '-jar', 'paper.jar', '--nogui'], {
    cwd: path.join(DIR, 'lobby'),
    stdio: ['ignore', out, out],
    detached: true,
  });
  lobby.unref();
  const back = await lands('Eva', 'lobby', 240000);
  check('Lobby antwortet wieder: der Proxy holt Eva selbst zurück', back.ok, `auf ${back.seen}`);
  check('mit Hinweis', await sees(eva, /Lobby ist wieder da|lobby is back/));
  eva.quit();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} bestanden`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
