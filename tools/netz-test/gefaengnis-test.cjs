/**
 * Gefängnis und „Strafen nur nach unten“ echt: Velocity + Lobby (Paper 26.1.2, selbst gebaute Lobby mit Zelle) + ein
 * zweiter Spielserver („duels“), Hub aus scripts/hub-dev.ts, Test-Spieler (mineflayer). Der Test startet Hub, Lobby
 * und den zweiten Server selbst (und auch neu), Velocity muss schon laufen.
 *   NODE_PATH=~/mm-cache/node/node_modules node tools/netz-test/gefaengnis-test.cjs
 * Umgebung: GT_PROXY (Port), GT_LOBBY / GT_DUELS / GT_PROXY_DIR (Ordner), GT_HUB_PORT, GT_STEUER (Port der Steuerung),
 * GT_HUB_DIR (Daten des Test-Hubs), GT_JAVA.
 * Rollen: Philip = Owner, Anna = Admin, Modi = Moderator, Lena ohne Rang.
 */
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mineflayer = require('mineflayer');

const ROOT = path.resolve(__dirname, '../..');
const PROXY = Number(process.env.GT_PROXY ?? 28100);
const LOBBY = process.env.GT_LOBBY ?? '/home/user/mm-cache/servers/schutz-lobby';
const DUELS = process.env.GT_DUELS ?? '/home/user/mm-cache/servers/schutz-duels';
const PROXY_DIR = process.env.GT_PROXY_DIR ?? '/home/user/mm-cache/servers/schutz-proxy';
const HUB_PORT = process.env.GT_HUB_PORT ?? '28120';
const STEUER = Number(process.env.GT_STEUER ?? 28121);
const HUB_DIR = process.env.GT_HUB_DIR ?? '/home/user/mm-cache/hub-schutz';
const JAVA = process.env.GT_JAVA ?? '/home/user/mm-cache/jdk/jdk-25.0.5+8/bin/java';
const RCON_PY = path.join(ROOT, 'tools/mc-client/rcon.py');
/** Zelle und Dorfplatz wie im Bauplan (packages/builder/src/lobby/jail.ts, features.ts). */
const CELL = { minX: -33, maxX: -27, minY: 58, maxY: 61, minZ: 32, maxZ: 38 };
const SPAWN = { x: 0.5, y: 65, z: 27.5 };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
};
const props = (dir) =>
  Object.fromEntries(
    fs
      .readFileSync(path.join(dir, 'server.properties'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
const rcon = (dir, ...cmds) => {
  const p = props(dir);
  return execFileSync('python3', [RCON_PY, `127.0.0.1:${p['rcon.port']}`, p['rcon.password'], ...cmds], {
    encoding: 'utf8',
  });
};

// ---------- Prozesse ----------

const procs = {};
function startHub() {
  const out = fs.openSync(path.join(HUB_DIR, 'hub.log'), 'a');
  procs.hub = spawn(
    'npx',
    [
      'tsx',
      'scripts/hub-dev.ts',
      `${LOBBY}:lobby:backend`,
      `${DUELS}:duels:backend`,
      `${PROXY_DIR}:proxy:proxy`,
      '--rang=Philip=owner',
      '--rang=Anna=admin',
      '--rang=Modi=moderator',
      `--steuer=${STEUER}`,
    ],
    {
      cwd: path.join(ROOT, 'apps/server'),
      env: { ...process.env, MM_HUB_DEV_PORT: HUB_PORT, MM_HUB_DEV_DIR: HUB_DIR },
      stdio: ['ignore', out, out],
      // Eigene Prozessgruppe: npx → tsx → node gehen beim Beenden zusammen.
      detached: true,
    },
  );
}
async function stopHub() {
  const p = procs.hub;
  if (!p) return;
  const gone = new Promise((r) => p.once('exit', r));
  process.kill(-p.pid, 'SIGTERM');
  await gone;
  procs.hub = null;
  await wait(1000);
}
function startServer(name, dir, xmx) {
  try {
    fs.rmSync(path.join(dir, 'world', 'session.lock'), { force: true });
  } catch {}
  const out = fs.openSync(path.join(dir, 'gt-console.log'), 'a');
  procs[name] = spawn('nice', ['-n', '15', JAVA, `-Xmx${xmx}`, '-jar', 'paper.jar', '--nogui'], {
    cwd: dir,
    stdio: ['ignore', out, out],
  });
}
async function stopServer(name, dir) {
  const p = procs[name];
  if (!p) return;
  const gone = new Promise((r) => p.once('exit', r));
  try {
    rcon(dir, 'stop');
  } catch {
    p.kill('SIGTERM');
  }
  await gone;
  procs[name] = null;
}
async function status() {
  try {
    const res = await fetch(`http://127.0.0.1:${STEUER}/status`);
    return await res.json();
  } catch {
    return null;
  }
}
async function until(what, test, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await test()) return true;
    await wait(500);
  }
  console.log(`  … ${what}: Zeit um`);
  return false;
}
const connected = (server) => async () => (await status())?.connected?.includes(server);
/** Server nimmt Spieler an (RCON antwortet erst, wenn er ganz gestartet ist). */
const ready = (dir) => async () => {
  try {
    rcon(dir, 'list');
    return true;
  } catch {
    return false;
  }
};
async function strafe(body) {
  const res = await fetch(`http://127.0.0.1:${STEUER}/strafe`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---------- Test-Spieler ----------

const LOGIN_GAP_MS = 3500;
let lastLogin = 0;
async function join(username, locale = 'de_DE') {
  const gap = lastLogin + LOGIN_GAP_MS - Date.now();
  if (gap > 0) await wait(gap);
  lastLogin = Date.now();
  return new Promise((resolve, reject) => {
    const bot = mineflayer.createBot({
      host: '127.0.0.1',
      port: PROXY,
      username,
      version: '26.1',
      auth: 'offline',
    });
    bot.lines = [];
    bot.once('login', () => bot.setSettings({ locale }));
    bot.on('messagestr', (m) => bot.lines.push(m));
    bot.once('spawn', () => resolve(bot));
    bot.once('kicked', (r) => reject(new Error(`kicked: ${JSON.stringify(r)}`)));
    bot.once('error', reject);
  });
}
async function leave(bot) {
  const gone = new Promise((r) => bot.once('end', r));
  bot.quit();
  await gone;
}
const inCell = (bot) => {
  const p = bot.entity?.position;
  return Boolean(
    p &&
    p.x >= CELL.minX &&
    p.x < CELL.maxX + 1 &&
    p.y >= CELL.minY - 1 &&
    p.y < CELL.maxY + 1 &&
    p.z >= CELL.minZ &&
    p.z < CELL.maxZ + 1,
  );
};
const atSpawn = (bot) => {
  const p = bot.entity?.position;
  return Boolean(
    p && Math.abs(p.x - SPAWN.x) < 3 && Math.abs(p.y - SPAWN.y) < 3 && Math.abs(p.z - SPAWN.z) < 3,
  );
};
const where = (bot) => {
  const p = bot.entity?.position;
  return p ? `${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}` : '?';
};
async function sees(bot, re, ms = 15_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const i = bot.lines.findIndex((l) => re.test(l));
    if (i >= 0) return bot.lines.splice(i, 1)[0];
    await wait(100);
  }
  return null;
}
const say = (bot, line) => {
  bot.lines.length = 0;
  bot.chat(line);
};
const jailed = (bot, ms = 30_000) => until('in der Zelle', () => inCell(bot), ms);
const out = (bot, ms = 30_000) => until('aus der Zelle', () => !inCell(bot) && atSpawn(bot), ms);

async function main() {
  fs.mkdirSync(HUB_DIR, { recursive: true });
  startHub();
  check('Hub läuft', await until('Hub', async () => Boolean(await status()), 300_000));
  startServer('lobby', LOBBY, '2G');
  startServer('duels', DUELS, '1G');
  check('Lobby verbunden', await until('Lobby', connected('lobby'), 900_000));
  check('Zweiter Server verbunden', await until('Duels', connected('duels'), 900_000));
  await until('Lobby bereit', ready(LOBBY), 900_000);
  await until('Duels bereit', ready(DUELS), 900_000);
  await wait(3000);

  const philip = await join('Philip');
  const anna = await join('Anna');
  const modi = await join('Modi');
  let lena = await join('Lena');
  await wait(2000);
  check('Lena landet am Dorfplatz', atSpawn(lena), where(lena));

  // ---------- Strafen nur nach unten ----------
  say(modi, '/gefaengnis Anna 10m Test');
  check(
    'Moderator kann Admin nicht einsperren',
    Boolean(await sees(modi, /Anna ist Admin – das darf nur der Owner\./)),
  );
  check('Anna bleibt frei', !inCell(anna), where(anna));
  say(anna, '/ban Philip perm');
  check(
    'Admin kann Owner nicht bannen',
    Boolean(await sees(anna, /Philip ist Owner – diesen Rang darf niemand/)),
  );
  check('Philip ist noch da', philip.player !== undefined && Boolean(philip.entity));
  say(philip, '/mute Anna 10m Test');
  check('Owner schaltet Admin stumm', Boolean(await sees(anna, /stumm/)));
  say(anna, 'hallo alle');
  check('Anna ist wirklich stumm', Boolean(await sees(anna, /stumm/)));
  say(modi, '/unmute Anna');
  check('Moderator kann den Admin nicht entstummen', Boolean(await sees(modi, /das darf nur der Owner/)));
  say(philip, '/unmute Anna');
  await wait(1000);
  say(anna, 'wieder da');
  check('Owner hebt es auf – Anna schreibt wieder', Boolean(await sees(philip, /wieder da/)));

  // ---------- Gefängnis: /gefaengnis + /frei ----------
  say(philip, '/gefaengnis Lena 10m Beleidigung');
  check('/gefaengnis: Lena sitzt in der Zelle', await jailed(lena), where(lena));
  say(philip, '/frei Lena');
  check('/frei: Lena steht am Dorfplatz', await out(lena), where(lena));
  check('/frei: Nachricht „frei“', Boolean(await sees(lena, /frei/)));

  // ---------- Aufheben im Panel ----------
  await strafe({ action: 'punish', player: 'Lena', kind: 'jail', minutes: 10, reason: 'Panel' });
  check('Panel: eingesperrt', await jailed(lena), where(lena));
  await strafe({ action: 'lift', player: 'Lena', kind: 'jail' });
  check('Panel: aufgehoben → draußen', await out(lena), where(lena));

  // ---------- Ablauf ----------
  await strafe({ action: 'punish', player: 'Lena', kind: 'jail', minutes: 1, reason: 'kurz' });
  check('Ablauf: eingesperrt', await jailed(lena), where(lena));
  check('Ablauf: nach einer Minute draußen', await out(lena, 150_000), where(lena));
  check('Ablauf: „Zeit ist um“', Boolean(await sees(lena, /Zeit im Gefängnis ist um/)));

  // ---------- Offline abgelaufen ----------
  await strafe({ action: 'punish', player: 'Lena', kind: 'jail', minutes: 1, reason: 'offline' });
  check('Offline-Ablauf: eingesperrt', await jailed(lena), where(lena));
  await leave(lena);
  await wait(65_000);
  lena = await join('Lena');
  check('Offline-Ablauf: beim Betreten draußen', await out(lena), where(lena));

  // ---------- Offline aufgehoben ----------
  await strafe({ action: 'punish', player: 'Lena', kind: 'jail', minutes: null, reason: 'offline 2' });
  check('Offline-Aufheben: eingesperrt', await jailed(lena), where(lena));
  await leave(lena);
  await strafe({ action: 'lift', player: 'Lena', kind: 'jail' });
  lena = await join('Lena');
  check('Offline-Aufheben: beim Betreten draußen', await out(lena), where(lena));

  // ---------- Lobby startet neu, während jemand im Gefängnis sitzt ----------
  await strafe({ action: 'punish', player: 'Lena', kind: 'jail', minutes: null, reason: 'Neustart' });
  check('Lobby-Neustart: eingesperrt', await jailed(lena), where(lena));
  await leave(lena);
  for (const b of [philip, anna, modi]) b.quit();
  await stopServer('lobby', LOBBY);
  await strafe({ action: 'lift', player: 'Lena', kind: 'jail' });
  check(
    'Lobby-Neustart: Stand liegt auf der Platte (Zelle bekannt)',
    fs.existsSync(path.join(LOBBY, 'plugins/moinmorni/jail.json')),
  );
  startServer('lobby', LOBBY, '2G');
  await until('Lobby wieder da', connected('lobby'), 900_000);
  await until('Lobby bereit', ready(LOBBY), 900_000);
  await wait(2000);
  lena = await join('Lena');
  check('Lobby-Neustart: frei → draußen', await out(lena, 30_000), where(lena));
  const philip2 = await join('Philip');

  // Neustart der Lobby mit gültiger Strafe: bleibt drin, auch bevor der Hub sich meldet.
  await strafe({ action: 'punish', player: 'Lena', kind: 'jail', minutes: null, reason: 'bleibt' });
  check('Lobby-Neustart 2: eingesperrt', await jailed(lena), where(lena));
  await leave(lena);
  await leave(philip2);
  await stopServer('lobby', LOBBY);
  startServer('lobby', LOBBY, '2G');
  await until('Lobby wieder da', connected('lobby'), 900_000);
  await until('Lobby bereit', ready(LOBBY), 900_000);
  lena = await join('Lena');
  check('Lobby-Neustart 2: gültige Strafe → wieder in der Zelle', await jailed(lena), where(lena));

  // ---------- Hub startet neu ----------
  await stopHub();
  await wait(3000);
  startHub();
  await until('Hub wieder da', async () => Boolean(await status()), 300_000);
  await until('Lobby beim Hub', connected('lobby'), 300_000);
  check('Hub-Neustart: noch in der Zelle', inCell(lena), where(lena));
  await strafe({ action: 'lift', player: 'Lena', kind: 'jail' });
  check('Hub-Neustart: Aufheben → draußen', await out(lena), where(lena));
  // Strafe läuft ab, während der Hub weg ist.
  await strafe({ action: 'punish', player: 'Lena', kind: 'jail', minutes: 1, reason: 'Hub weg' });
  check('Hub weg: eingesperrt', await jailed(lena), where(lena));
  await stopHub();
  check('Hub weg: läuft trotzdem ab → draußen', await out(lena, 150_000), where(lena));
  startHub();
  await until('Hub wieder da', async () => Boolean(await status()), 300_000);
  await until('Lobby beim Hub', connected('lobby'), 300_000);
  await until('Duels beim Hub', connected('duels'), 300_000);

  // ---------- Frei, aber in der Zelle (Teleport) ----------
  rcon(LOBBY, 'tp Lena -29.5 58 36.5');
  check('Frei in der Zelle: sofort herausgesetzt', await out(lena, 15_000), where(lena));
  check('Frei in der Zelle: Hinweis', Boolean(await sees(lena, /nicht im Gefängnis/)));
  rcon(LOBBY, 'gamemode spectator Lena', 'tp Lena -29.5 58 36.5');
  await wait(3000);
  check('Zuschauer darf in die Zelle schauen', inCell(lena), where(lena));
  rcon(LOBBY, 'gamemode adventure Lena');
  check('…als Spieler wieder raus', await out(lena, 15_000), where(lena));

  // ---------- Auf einem anderen Server eingesperrt ----------
  const philip3 = await join('Philip');
  say(lena, '/server duels');
  check(
    'Lena auf dem zweiten Server',
    await until('duels', async () => !atSpawn(lena) && !inCell(lena), 15_000),
  );
  await wait(2000);
  say(philip3, '/gefaengnis Lena 10m woanders');
  check('Woanders eingesperrt: in die Lobby-Zelle geholt', await jailed(lena, 20_000), where(lena));
  say(lena, '/server duels');
  check('Eingesperrt: kein anderer Server', Boolean(await sees(lena, /Gefängnis/)));
  check('…bleibt in der Zelle', inCell(lena), where(lena));
  say(philip3, '/frei Lena');
  check('…/frei → draußen', await out(lena), where(lena));

  for (const b of [lena, philip3]) b.quit();
}

main()
  .catch((err) => {
    console.error(err);
    check('ohne Fehler durchgelaufen', false, String(err));
  })
  .finally(async () => {
    await stopServer('lobby', LOBBY).catch(() => undefined);
    await stopServer('duels', DUELS).catch(() => undefined);
    await stopHub().catch(() => undefined);
    const ok = results.filter((r) => r.ok).length;
    console.log(`\n${ok}/${results.length} grün`);
    process.exit(ok === results.length ? 0 : 1);
  });
