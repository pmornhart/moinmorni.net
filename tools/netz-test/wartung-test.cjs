/**
 * Wartungs-Lobby (echter Test): Test-Spieler (mineflayer) gehen über den Velocity-Proxy ins Netzwerk – Lobby,
 * Wartungs-Lobby und Bau-Server, jeweils Paper mit dem Netzwerk-Plugin, dahinter der Test-Hub mit Steuerung
 * (`scripts/hub-dev.ts --steuer=<port> --wecken=…`). Die try-Liste von Velocity steht absichtlich wie beim Motor
 * („lobby“, „bau“, „wartung“): Geprüft wird, dass bei fehlender Lobby niemand auf dem Bau-Server landet – weder beim
 * Ankommen noch nach einem Rauswurf –, dass alle nach einem Countdown zurück in die Lobby kommen und dass während der
 * Wartung Spieler in der Wartungs-Lobby warten, das Team aber überall hin darf.
 *   NODE_PATH=<ordner mit mineflayer> node tools/netz-test/wartung-test.cjs
 * Test-Spieler haben einen englischen Client – Texte werden in beiden Sprachen erkannt.
 * Umgebung: WT_PROXY (host:port), WT_STEUER (Port der Hub-Steuerung), WT_DIR (Ordner mit lobby/, wartung/, bau/ –
 * je mit server.properties und .rcon-pass), MC_VERSION. Philip muss im Hub Owner sein (--rang=Philip=owner).
 */
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const mineflayer = require('mineflayer');

const [HOST, PORT] = (process.env.WT_PROXY ?? '127.0.0.1:27900').split(':');
const STEUER = Number(process.env.WT_STEUER ?? 27916);
const DIR = process.env.WT_DIR ?? '/home/user/mm-cache/servers/wartung-test';
const VERSION = process.env.MC_VERSION ?? '26.1';
const SERVERS = ['lobby', 'wartung', 'bau'];
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (msg) => (typeof msg === 'string' ? msg : JSON.stringify(msg));

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` – ${detail}` : ''}`);
}

// ---------- Steuerung des Test-Hubs ----------

function steuer(url, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request(
      { host: '127.0.0.1', port: STEUER, path: url, method: body ? 'POST' : 'GET' },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve(text ? JSON.parse(text) : {}));
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}
const settings = (values) => steuer('/', { area: 'network', values });
const connected = async () => (await steuer('/status')).connected ?? [];

// ---------- RCON (wer ist auf welchem Server?) ----------

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

/** Auf welchem Server steht der Spieler gerade? (null = nirgends) */
async function where(name) {
  for (const server of SERVERS) {
    const list = await rcon(server, 'list').catch(() => '');
    // „There are 2 … online: Anna, ♛ Philip“ – vor dem Namen kann das Rang-Symbol stehen.
    const names = (list.split(':')[1] ?? '').split(',').map((n) => n.trim().split(' ').pop());
    if (names.includes(name)) return server;
  }
  return null;
}

/** Wartet, bis der Spieler auf `server` steht. */
async function lands(name, server, ms = 30000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < ms) {
    last = await where(name);
    if (last === server) return { ok: true, seen: last };
    await sleep(500);
  }
  return { ok: false, seen: last };
}

// ---------- Test-Spieler ----------

const LOGIN_GAP_MS = 3500;
let lastLogin = 0;
async function gap() {
  const wait = lastLogin + LOGIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastLogin = Date.now();
}

async function join(username) {
  await gap();
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
    bot.kicks = [];
    bot.on('messagestr', (m) => bot.lines.push(m));
    bot.on('kicked', (reason) => bot.kicks.push(plain(reason)));
    bot.once('spawn', () => resolve(bot));
    bot.once('kicked', (reason) => reject(new Error(`kicked: ${plain(reason)}`)));
    bot.once('error', reject);
  });
}

async function sees(bot, match, ms = 6000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const found = bot.lines.find((l) => match.test(l));
    if (found) {
      bot.lines.splice(bot.lines.indexOf(found), 1);
      return found;
    }
    await sleep(100);
  }
  return null;
}

async function waitConnected(server, up, ms = 120000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if ((await connected()).includes(server) === up) return true;
    await sleep(1000);
  }
  return false;
}

async function main() {
  await settings({
    maintenance: false,
    maintenanceLobby: true,
    maintenanceReturn: true,
    maintenanceUntil: '',
  });
  check(
    'Lobby, Wartungs-Lobby und Bau-Server hängen am Hub',
    (await waitConnected('lobby', true)) &&
      (await waitConnected('wartung', true)) &&
      (await waitConnected('bau', true)),
  );

  // 1. Alles da: Ankunft in der Lobby, Philip (Owner) geht auf den Bau-Server.
  const anna = await join('Anna');
  check('Anna kommt in der Lobby an', (await lands('Anna', 'lobby', 45000)).ok);
  const philip = await join('Philip');
  check('Philip kommt in der Lobby an', (await lands('Philip', 'lobby', 45000)).ok);
  philip.chat('/bau');
  check('Philip (Owner) darf auf den Bau-Server', (await lands('Philip', 'bau')).ok);

  // 2. Lobby fällt weg (Neustart): wer drin ist, landet in der Wartungs-Lobby – nicht auf dem Bau-Server.
  anna.lines.length = 0;
  await steuer('/stop', { server: 'lobby' });
  const annaGone = await lands('Anna', 'wartung');
  check(
    'Lobby gestoppt: Anna landet in der Wartungs-Lobby (nicht auf dem Bau-Server)',
    annaGone.ok,
    `auf ${annaGone.seen}`,
  );
  check('Anna liest, warum', Boolean(await sees(anna, /Lobby startet gerade neu|lobby is restarting/)));
  check('Philip bleibt auf dem Bau-Server', (await lands('Philip', 'bau', 10000)).ok);

  // 3. Neu ankommen, während die Lobby fehlt: Wartungs-Lobby (der Motor hätte „bau“ als Nächstes).
  const carl = await join('Carl');
  const carlAt = await lands('Carl', 'wartung');
  check('Carl kommt neu an, Lobby fehlt: Wartungs-Lobby', carlAt.ok, `auf ${carlAt.seen}`);
  carl.chat('/server bau');
  await sleep(2500);
  check('Carl kommt von dort nicht auf den Bau-Server', (await where('Carl')) === 'wartung');

  // 4. Rauswurf vom Bau-Server, während die Lobby fehlt: Wartungs-Lobby statt Trennen oder sonstwohin.
  await rcon('bau', 'kick Philip Test-Rauswurf');
  const philipAt = await lands('Philip', 'wartung');
  check(
    'Rauswurf vom Bau-Server ohne Lobby: Philip in der Wartungs-Lobby',
    philipAt.ok,
    `auf ${philipAt.seen}`,
  );
  check('Philip ist noch verbunden', philip.kicks.length === 0, philip.kicks.join(' | '));

  // 5. Lobby wieder da: alle Wartenden kommen nach dem Countdown von selbst zurück.
  await steuer('/start', { server: 'lobby' });
  check('Lobby läuft wieder', await waitConnected('lobby', true, 180000));
  const t0 = Date.now();
  const back = await Promise.all(['Anna', 'Carl', 'Philip'].map((n) => lands(n, 'lobby', 60000)));
  check(
    'Anna, Carl und Philip automatisch zurück in der Lobby',
    back.every((b) => b.ok),
    back.map((b) => b.seen).join(', '),
  );
  check('mit Countdown (nicht sofort)', Date.now() - t0 >= 5000, `${Math.round((Date.now() - t0) / 1000)} s`);
  check(
    'Hinweis „Die Lobby ist wieder da“',
    Boolean(await sees(anna, /Lobby ist wieder da|lobby is back/, 2000)),
  );

  // 6. Wartung an: Spieler warten in der Wartungs-Lobby, das Team bleibt.
  await settings({ maintenance: true, maintenanceMessage: 'Großes Update', maintenanceUntil: '22:30' });
  const annaParked = await lands('Anna', 'wartung');
  check('Wartung an: Anna wartet in der Wartungs-Lobby', annaParked.ok, `auf ${annaParked.seen}`);
  check('Anna liest Grund und Uhrzeit', Boolean(await sees(anna, /22:30/)));
  check('Carl auch', (await lands('Carl', 'wartung')).ok);
  await sleep(1500);
  check('Philip (Team) bleibt in der Lobby', (await lands('Philip', 'lobby', 10000)).ok);
  const dora = await join('Dora');
  check('Dora kommt während der Wartung herein – in die Wartungs-Lobby', (await lands('Dora', 'wartung')).ok);
  anna.lines.length = 0;
  anna.chat('/lobby');
  check(
    '/lobby während der Wartung: Hinweis, bleibt',
    Boolean(await sees(anna, /Wartung läuft|Maintenance in progress/)) && (await where('Anna')) === 'wartung',
  );
  philip.chat('/bau');
  check('Philip darf während der Wartung auf den Bau-Server', (await lands('Philip', 'bau')).ok);

  // 7. Wartung aus: alle zurück in die Lobby.
  await settings({ maintenance: false });
  const after = await Promise.all(['Anna', 'Carl', 'Dora'].map((n) => lands(n, 'lobby', 60000)));
  check(
    'Wartung aus: Anna, Carl und Dora zurück in der Lobby',
    after.every((b) => b.ok),
    after.map((b) => b.seen).join(', '),
  );
  check('Philip bleibt, wo er war (Bau-Server)', (await lands('Philip', 'bau', 10000)).ok);

  [anna, philip, carl, dora].forEach((b) => b.quit());
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} bestanden`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
