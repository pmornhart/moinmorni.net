/**
 * Streamer-Modus im ganzen Netzwerk, mit echten Servern: Test-Spieler (mineflayer) über den Velocity-Proxy auf eine
 * Lobby (Paper + Netzwerk-Plugin) und MorniCraft (Paper + Netzwerk-Plugin + MorniCraft). Prüft: /streamer in der Lobby
 * gilt in MorniCraft und umgekehrt, ● LIVE für die anderen (Chat, Tab-Liste, über dem Kopf), IP-Adressen und die eigene
 * Adresse im Chat verdeckt, /msg nur mit der Maus, Befehls-Link in MorniCraft, Team-Werkzeuge nur nach unten.
 *   NODE_PATH=<ordner mit mineflayer> node tools/netz-test/streamer-test.cjs [host] [port] [steuer-url]
 * Erwartet: Proxy mit den Servern „lobby“ (zuerst) und „mornicraft“, Hub (scripts/hub-dev.ts) mit Philip = owner,
 * Mia = moderator, Lena = media; die Steuer-URL nimmt POST {area, values} wie das Panel.
 */
const mineflayer = require('mineflayer');
const http = require('node:http');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const HOST = args[0] ?? '127.0.0.1';
const PORT = Number(args[1] ?? 28700);
const CONTROL = args[2] ?? 'http://127.0.0.1:28713/';
const VERSION = process.env.MC_VERSION ?? '1.21.11';
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` – ${String(detail).slice(0, 200)}` : ''}`);
}

const LOGIN_GAP_MS = 3500;
let lastLogin = 0;
async function join(username) {
  const wait = lastLogin + LOGIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastLogin = Date.now();
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
    bot.raw = [];
    bot.on('messagestr', (m) => bot.lines.push(m));
    bot.on('message', (m) => bot.raw.push(JSON.stringify(m.json)));
    bot.once('spawn', () => resolve(bot));
    bot.once('kicked', (reason) => reject(new Error(`kicked: ${JSON.stringify(reason)}`)));
    bot.once('error', reject);
  });
}

/** Wartet auf eine passende Chat-Zeile (und nimmt sie aus der Liste). */
async function sees(bot, match, ms = 10000) {
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

/** Wartet auf eine Nachricht, deren JSON (mit Mauszeiger-Text und Klick) passt. */
async function seesRaw(bot, match, ms = 10000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const found = bot.raw.find((l) => match.test(l));
    if (found) {
      bot.raw.splice(bot.raw.indexOf(found), 1);
      return found;
    }
    await sleep(100);
  }
  return null;
}

/** Wartet, bis eine Bedingung gilt. */
async function until(test, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (test()) return true;
    await sleep(200);
  }
  return test();
}

function set(area, values) {
  return new Promise((resolve, reject) => {
    const req = http.request(CONTROL, { method: 'POST' }, (res) => {
      res.resume();
      res.on('end', () =>
        res.statusCode === 200 ? resolve() : reject(new Error(`status ${res.statusCode}`)),
      );
    });
    req.on('error', reject);
    req.end(JSON.stringify({ area, values }));
  });
}

const text = (c) => (c == null ? '' : typeof c === 'string' ? c : (c.toString?.() ?? JSON.stringify(c)));
/** Name in der Tab-Liste, wie ihn dieser Bot sieht. */
const tabName = (bot, name) => text(bot.players[name]?.displayName);
/** Was über dem Kopf steht: Präfix + Name + Anhang des Teams, in dem der Spieler ist. */
const overHead = (bot, name) =>
  Object.values(bot.teams)
    .filter((t) => t.members?.includes(name))
    .map((t) => `${text(t.prefix)}${name}${text(t.suffix)}`)
    .join(' | ');
/** Text der MorniCraft-Leiste rechts (Zeilen stecken in Team-Präfixen „mc0“ …). */
const sidebarText = (bot) =>
  Object.values(bot.teams)
    .filter((t) => /^mc\d+$/.test(t.team))
    .map((t) => text(t.prefix))
    .join(' | ');

async function goTo(bot, server) {
  bot.lines = [];
  bot.chat(`/server ${server}`);
  await new Promise((resolve) => {
    const done = () => resolve();
    bot.once('respawn', done);
    setTimeout(done, 8000);
  });
  await sleep(3000);
}

async function main() {
  await set('network', {
    streamerAccess: 'all',
    streamerIp: true,
    streamerHideDomain: true,
    streamerCoords: true,
    streamerMessages: true,
    streamerLive: true,
    streamerAnnounce: true,
  });
  const philip = await join('Philip');
  const lena = await join('Lena');
  const mia = await join('Mia');
  await sleep(3000);
  for (const b of [philip, lena, mia]) b.chat('/sprache de');
  lena.chat('/streamer aus');
  // Erst weiter, wenn der Hub geantwortet hat (auf einem vollen Rechner dauert das).
  await sees(lena, /Streamer-Modus ist aus/, 20000);
  await sleep(1500);
  for (const b of [philip, lena, mia]) b.lines = [];

  // ---- In der Lobby einschalten ----
  lena.chat('/streamer an');
  const on = await sees(lena, /Streamer-Modus ist an/);
  check(
    'Lobby: /streamer an',
    Boolean(on),
    on ?? lena.lines.filter((l) => l.includes('Streamer')).join(' | '),
  );
  check(
    'Menü mit Hinweis auf F3 „Reduzierte Debug-Infos“',
    Boolean(await sees(lena, /Reduzierte Debug-Infos/)),
  );
  check('Menü-Schalter zum Anklicken', Boolean(await seesRaw(lena, /\/streamer koordinaten/)));
  check(
    'Philip (gleicher Server) erfährt: Lena streamt jetzt',
    Boolean(await sees(philip, /Lena streamt jetzt/)),
  );
  check(
    'Tab-Liste: andere sehen ● LIVE',
    await until(() => tabName(philip, 'Lena').includes('● LIVE')),
    tabName(philip, 'Lena'),
  );
  check(
    'Über dem Kopf: ● LIVE',
    await until(() => overHead(philip, 'Lena').includes('● LIVE')),
    overHead(philip, 'Lena'),
  );
  check('Philip selbst ohne LIVE', !tabName(lena, 'Philip').includes('LIVE'), tabName(lena, 'Philip'));
  // Neues Profil, während LIVE schon gilt (ein Teil aus und wieder an): das eigene LIVE-Team bleibt – vorher verschwand
  // es bei jeder zweiten Meldung samt Rang über dem Kopf.
  for (const round of [1, 2]) {
    lena.chat('/streamer koordinaten');
    await sleep(2500);
    check(
      `Über dem Kopf: ● LIVE bleibt nach neuem Profil (${round}.)`,
      overHead(philip, 'Lena').includes('● LIVE'),
      overHead(philip, 'Lena'),
    );
  }

  // ---- Chat: IP-Adressen und eigene Adresse verdeckt, nur für Lena ----
  philip.chat('Kommt auf 85.215.54.143:25565 oder play.moinmorni.net');
  const forLena = await sees(lena, /Kommt auf/);
  const forMia = await sees(mia, /Kommt auf/);
  check(
    'Chat bei Lena: IP und Adresse als •••',
    Boolean(
      forLena && forLena.includes('•••') && !forLena.includes('85.215') && !forLena.includes('moinmorni.net'),
    ),
    forLena ?? '',
  );
  check(
    'Chat bei Mia (streamt nicht): alles lesbar',
    Boolean(forMia && forMia.includes('85.215.54.143')),
    forMia ?? '',
  );
  lena.chat('Servus Stream');
  const live = await sees(philip, /Servus Stream/);
  // Rang bzw. Abzeichen vorn, Name, „● LIVE“ hinten – wie in Tab-Liste und über dem Kopf.
  check('Chat: ● LIVE hinter Lenas Namen', Boolean(live && /Lena ● LIVE/.test(live)), live ?? '');

  // ---- /msg nur mit der Maus ----
  philip.chat('/msg Lena geheim 10.0.0.5');
  const covered = await sees(lena, /Philip → dich/);
  check(
    '/msg bei Lena verdeckt',
    Boolean(covered && covered.includes('versteckt') && !covered.includes('geheim')),
    covered ?? '',
  );
  const hover = await seesRaw(lena, /hover_event.*geheim/);
  check(
    '… Mauszeiger zeigt den Text, ohne die IP',
    Boolean(hover && !hover.includes('10.0.0.5')),
    hover ?? '',
  );
  lena.chat('/msg Philip alles klar');
  const plain = await sees(philip, /Lena → dich/);
  check(
    '/msg an Philip (streamt nicht) direkt lesbar',
    Boolean(plain && plain.includes('alles klar')),
    plain ?? '',
  );

  // ---- In MorniCraft gilt es sofort ----
  await goTo(lena, 'mornicraft');
  await goTo(philip, 'mornicraft');
  await sleep(2500);
  check(
    'MorniCraft: Leiste zeigt LIVE · Streamer-Modus',
    await until(() => sidebarText(lena).includes('LIVE')),
    sidebarText(lena),
  );
  check(
    'MorniCraft: andere sehen ● LIVE über dem Kopf',
    await until(() => overHead(philip, 'Lena').includes('LIVE')),
    overHead(philip, 'Lena'),
  );
  lena.chat('/getpos');
  check('MorniCraft: /getpos versteckt die Koordinaten', Boolean(await sees(lena, /versteckt/)));
  philip.chat('Hier MorniCraft 1.2.3.4');
  const mc = await sees(lena, /Hier MorniCraft/);
  check(
    'MorniCraft: Netzwerk-Chat bei Lena verdeckt',
    Boolean(mc && mc.includes('•••') && !mc.includes('1.2.3.4')),
    mc ?? '',
  );

  // ---- In MorniCraft ausschalten → überall aus ----
  lena.chat('/streamer aus');
  check(
    'MorniCraft: /streamer aus (Befehl des Netzwerks)',
    Boolean(await sees(lena, /Streamer-Modus ist aus/)),
  );
  check(
    'MorniCraft: LIVE aus der Leiste weg',
    await until(() => !sidebarText(lena).includes('LIVE')),
    sidebarText(lena),
  );
  check(
    'MorniCraft: LIVE über dem Kopf weg',
    await until(() => !overHead(philip, 'Lena').includes('LIVE')),
    overHead(philip, 'Lena'),
  );
  // … und in MorniCraft wieder an → zurück in der Lobby an.
  lena.chat('/streamer an');
  check('MorniCraft: /streamer an', Boolean(await sees(lena, /Streamer-Modus ist an/)));
  await goTo(lena, 'lobby');
  check(
    'Zurück in der Lobby: Mia sieht ● LIVE in der Tab-Liste',
    await until(() => tabName(mia, 'Lena').includes('● LIVE')),
    tabName(mia, 'Lena'),
  );
  mia.chat('Lobby 192.168.1.20');
  const back = await sees(lena, /Lobby /);
  check('Zurück in der Lobby: Chat verdeckt', Boolean(back && back.includes('•••')), back ?? '');

  // ---- Befehls-Link in MorniCraft ----
  philip.raw = [];
  philip.chat('/info');
  const link = await seesRaw(philip, /befehle\/mornicraft\?spieler=Philip/);
  check(
    'MorniCraft /info: Link auf die Befehls-Seite',
    Boolean(link),
    link?.match(/https?:[^"]*befehle[^"]*/)?.[0] ?? '',
  );
  check('… nicht mehr auf die Statistik', !philip.raw.some((l) => l.includes('/spieler/Philip')));

  // ---- Team-Werkzeuge nur nach unten ----
  await goTo(mia, 'mornicraft');
  await goTo(lena, 'mornicraft');
  mia.chat('/einfrieren Philip');
  check('Moderatorin kann den Owner nicht einfrieren', Boolean(await sees(mia, /höherer Rang/)));
  mia.chat('/ansehen Philip');
  check('… und sein Team-Fenster nicht öffnen', Boolean(await sees(mia, /höherer Rang/)));
  mia.chat('/einfrieren Lena');
  check('Moderatorin friert Lena (Media, niedriger) ein', Boolean(await sees(mia, /eingefroren|friert/i)));
  mia.chat('/einfrieren Lena');
  await sleep(1500);
  philip.chat('/einfrieren Mia');
  check('Owner friert die Moderatorin ein', Boolean(await sees(philip, /eingefroren|friert/i)));
  philip.chat('/einfrieren Mia');
  await sleep(1500);

  lena.chat('/streamer aus');
  await sleep(1500);
  for (const b of [philip, lena, mia]) b.quit();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} grün`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
