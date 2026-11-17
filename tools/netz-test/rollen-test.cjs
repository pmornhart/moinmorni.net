/**
 * Ränge wirken auf jedem Server (echter Test): Test-Spieler (mineflayer) gehen über den Velocity-Proxy auf einen
 * Spielmodus-Server mit Netzwerk-Plugin und prüfen, was ihr Rang dort darf – Verwaltungs-Befehl des Modus
 * („Spielmodi verwalten“), Kreativ nur mit eigenem Recht, „Alles“ ohne OP, Strafen des Supporters über den Hub, und
 * dass ein neuer Rang sofort gilt.
 *   NODE_PATH=<ordner mit mineflayer> node tools/netz-test/rollen-test.cjs [host] [port]
 * Erwartet: Proxy vor einem Server mit Morni Versteckerl (Verwaltung /versteckerladmin, Recht
 * moinmorni.versteckerl.admin) und dem Netzwerk-Plugin; Hub mit Philip = owner, Anna = admin, Susi = supporter
 * (scripts/hub-dev.ts --rang=…), Lena ohne Rang. Mit RT_SERVER_DIR=<Ordner des Spielservers> wird auch die ops.json
 * geprüft (niemand bekommt OP).
 */
const fs = require('node:fs');
const path = require('node:path');
const mineflayer = require('mineflayer');

const HOST = process.argv[2] ?? '127.0.0.1';
const PORT = Number(process.argv[3] ?? 26690);
const VERSION = process.env.MC_VERSION ?? '1.21.11';
const SERVER_DIR = process.env.RT_SERVER_DIR ?? '';
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (msg) => (typeof msg === 'string' ? msg : JSON.stringify(msg));

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` – ${detail}` : ''}`);
}

// Velocity lässt pro Adresse nur alle 3 s eine Anmeldung zu.
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
      port: PORT,
      username,
      version: VERSION,
      auth: 'offline',
      physicsEnabled: false,
    });
    bot.lines = [];
    bot.on('messagestr', (m) => bot.lines.push(m));
    bot.once('spawn', () => resolve(bot));
    bot.once('kicked', (reason) => reject(new Error(`kicked: ${plain(reason)}`)));
    bot.once('error', reject);
  });
}

/** Wartet, bis der Bot eine Zeile sieht, die passt (und nimmt sie aus der Liste). */
async function sees(bot, match, ms = 4000) {
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

/** Befehl schicken, vorher die alten Zeilen vergessen. */
function say(bot, line) {
  bot.lines.length = 0;
  bot.chat(line);
}

/** Wartet, bis der Spielmodus des Bots passt. */
async function mode(bot, wanted, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (bot.game.gameMode === wanted) return true;
    await sleep(100);
  }
  return false;
}

/** Schlägt der Server diesen Befehl beim Tippen vor (Befehlsliste nach Rechten)? */
async function suggests(bot, typed, command) {
  const found = await bot.tabComplete(typed, true, false, 3000).catch(() => []);
  return found.map((t) => (typeof t === 'string' ? t : t.match)).some((m) => m.replace('/', '') === command);
}

const INFO = /Morni Versteckerl .* Netzwerk: ja/;
const NO_CREATIVE = /Kreativmodus darf dein Rang nicht|can't use creative mode/;

async function admin(bot) {
  say(bot, '/versteckerladmin info');
  return sees(bot, INFO, 3000);
}

async function main() {
  const ops = () => (SERVER_DIR ? JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'ops.json'), 'utf8')) : []);
  check('vorher ist niemand OP', ops().length === 0);

  const philip = await join('Philip');
  const anna = await join('Anna');
  const susi = await join('Susi');
  const lena = await join('Lena');
  await sleep(2500);

  // „Spielmodi verwalten“: Owner (über „Alles“) und Admin dürfen den Verwaltungs-Befehl des Modus.
  const ownerInfo = await admin(philip);
  check('Owner darf den Verwaltungs-Befehl des Modus (/versteckerladmin)', Boolean(ownerInfo), ownerInfo ?? '');
  const adminInfo = await admin(anna);
  check('Admin darf ihn („Spielmodi verwalten“)', Boolean(adminInfo), adminInfo ?? '');
  check('Supporter darf ihn nicht', !(await admin(susi)));
  check('Spieler darf ihn nicht', !(await admin(lena)));
  check('Befehlsliste: Admin bekommt /versteckerladmin vorgeschlagen', await suggests(anna, '/versteckerla', 'versteckerladmin'));
  check('Befehlsliste: Supporter nicht', !(await suggests(susi, '/versteckerla', 'versteckerladmin')));

  // Supporter: verwarnen und stummschalten (Hub), aber nicht bannen.
  say(susi, '/warn Lena Bitte freundlich bleiben');
  const warned = await sees(lena, /Verwarnung|Warning/);
  check('Supporter verwarnt (Netzwerk-Befehl)', Boolean(warned), warned ?? '');
  say(susi, '/ban Lena Test');
  check('Supporter darf nicht bannen', Boolean(await sees(susi, /nicht|not allowed/)));
  say(susi, '/mute Lena 5m Test');
  const muted = await sees(lena, /stumm|muted/i);
  check('Supporter schaltet stumm', Boolean(muted), muted ?? '');
  say(philip, '/unmute Lena');
  await sleep(500);

  // Spielmodus: Zuschauen ja, Kreativ nur mit eigenem Recht.
  say(susi, '/gamemode creative');
  const refused = await sees(susi, NO_CREATIVE);
  check('Supporter kommt nicht in den Kreativmodus', Boolean(refused) && susi.game.gameMode !== 'creative', refused ?? susi.game.gameMode);
  say(susi, '/gamemode spectator');
  check('Supporter darf in den Zuschauermodus', await mode(susi, 'spectator'), susi.game.gameMode);
  say(susi, '/gamemode adventure');
  await mode(susi, 'adventure');
  say(lena, '/gamemode spectator');
  await sleep(1500);
  check('Spieler darf den Spielmodus nicht wechseln', lena.game.gameMode !== 'spectator', lena.game.gameMode);
  say(anna, '/gamemode creative');
  check('Admin darf in den Kreativmodus (Recht „Kreativmodus“)', await mode(anna, 'creative'), anna.game.gameMode);
  say(anna, '/gamemode adventure');

  // „Alles“: Owner darf auch, was sonst nur OPs dürfen – ohne OP zu sein; der Admin nicht.
  say(philip, '/minecraft:give Philip minecraft:diamond 1');
  const gave = await sees(philip, /Gave 1|Diamant|Diamond/);
  check('Owner darf alles (/give), ohne OP', Boolean(gave), gave ?? '');
  say(anna, '/minecraft:give Anna minecraft:diamond 1');
  check('Admin hat nicht „Alles“ (/give)', !(await sees(anna, /Gave 1|Diamant|Diamond/, 2500)));

  // Rang wechselt → sofort anders (Profil vom Hub, Befehlsliste neu).
  say(philip, '/rang Susi admin');
  await sees(philip, /Susi/);
  await sleep(700);
  const promoted = await admin(susi);
  check('nach /rang Susi admin darf Susi gleich den Verwaltungs-Befehl', Boolean(promoted), promoted ?? '');
  check('… und bekommt ihn vorgeschlagen', await suggests(susi, '/versteckerla', 'versteckerladmin'));
  say(philip, '/rang Susi supporter');
  await sees(philip, /Susi/);
  await sleep(700);
  check('zurück auf Supporter: gleich wieder nicht', !(await admin(susi)));
  check('… und nicht mehr vorgeschlagen', !(await suggests(susi, '/versteckerla', 'versteckerladmin')));

  check('nachher ist auch niemand OP', ops().length === 0, JSON.stringify(ops()));

  [philip, anna, susi, lena].forEach((b) => b.quit());
  await sleep(500);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} grün`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
