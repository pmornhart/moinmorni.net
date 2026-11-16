/**
 * Einstellungen der Spielmodi, mit echtem Server: Paper 26.1.2 mit Netzwerk-Plugin + Bollwerk, dazu der Test-Hub
 * (apps/server/scripts/hub-dev.ts mit --wecken, --starten, --steuer). Prüft den ganzen Weg Panel → Hub → Plugin →
 * config.yml → Neustart, sobald niemand spielt → Wert wirkt; dazu Einstellungen, während der Modus schläft.
 *   NODE_PATH=<ordner mit mineflayer> node tools/netz-test/modus-einstellungen-test.cjs <server-ordner> [port] [steuer-url]
 *
 * Verfasst mit Claude 🤖
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const mineflayer = require('mineflayer');

const [DIR, PORT = '25980', CONTROL = 'http://127.0.0.1:8798'] = process.argv.slice(2);
const CONFIG = path.join(DIR, 'plugins', 'MorniBollwerk', 'config.yml');
const VERSION = process.env.MC_VERSION ?? '26.1';
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${String(detail).slice(0, 200)}` : ''}`);
}
function call(route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${CONTROL}${route}`, { method: body ? 'POST' : 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () =>
        res.statusCode === 200 ? resolve(JSON.parse(data || '{}')) : reject(new Error(data)),
      );
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const status = () => call('/status');
async function until(test, ms, step = 1000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test().catch(() => false)) return true;
    await sleep(step);
  }
  return false;
}
function plain(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(plain).join('');
  if (typeof v.toString === 'function' && v.toString !== Object.prototype.toString) return v.toString();
  return [v.text, v.extra && plain(v.extra)].filter(Boolean).join('');
}
function nbtText(v) {
  if (v == null || typeof v !== 'object') return typeof v === 'string' ? v : '';
  if (v.type === 'string') return v.value;
  if (Array.isArray(v)) return v.map(nbtText).join('');
  const inner = v.type ? v.value : v;
  if (Array.isArray(inner)) return inner.map(nbtText).join('');
  if (inner && typeof inner === 'object') {
    return ['text', '', 'extra', 'value']
      .filter((k) => k in inner)
      .map((k) => nbtText(inner[k]))
      .join('');
  }
  return '';
}
function join(name) {
  return new Promise((resolve, reject) => {
    const bot = mineflayer.createBot({
      host: '127.0.0.1',
      port: Number(PORT),
      username: name,
      version: VERSION,
      auth: 'offline',
    });
    bot.bars = [];
    // Aktionsleiste kommt in 26.x als NBT-Text: alle Textteile einsammeln.
    bot._client.on('action_bar', (p) => bot.bars.push(nbtText(p.text)));
    bot.once('spawn', () => resolve(bot));
    bot.once('kicked', (r) => reject(new Error(`kicked ${JSON.stringify(r)}`)));
    bot.once('error', reject);
  });
}
const countdownOf = (bot) => {
  const hit = [...bot.bars].reverse().find((b) => /in\D{0,40}?(\d+)\s*s/.test(b));
  return hit ? Number(/(\d+)\s*s/.exec(hit)[1]) : null;
};

(async () => {
  const before = fs.readFileSync(CONFIG, 'utf8');
  check(
    'config.yml des Modus hat die Standardwerte',
    /countdown-sekunden: 30/.test(before) && /mindestens-spieler: 2/.test(before),
  );
  const s0 = await status();
  check(
    'Server verbunden, kein Neustart offen',
    s0.connected.includes('bollwerk') && s0.modeRestarts.length === 0,
    JSON.stringify(s0),
  );
  const starts0 = s0.starts.bollwerk;

  // 1) Spieler ist drin, Einstellung im Panel ändern.
  const anna = await join('Anna');
  await sleep(4000);
  check(
    'ein Spieler allein: kein Countdown von selbst (mindestens 2)',
    countdownOf(anna) === null,
    anna.bars.slice(-2).join(' | '),
  );
  await call('/', { area: 'bollwerk', values: { hallMinPlayers: 1, hallCountdown: 12 } });
  const written = await until(
    async () => /mindestens-spieler: 1/.test(fs.readFileSync(CONFIG, 'utf8')),
    10000,
  );
  const after = fs.readFileSync(CONFIG, 'utf8');
  check(
    'Panel → config.yml: neue Werte eingetragen',
    written && /countdown-sekunden: 12/.test(after),
    after.match(/wachstube:[\s\S]{0,300}/)?.[0],
  );
  check(
    'Kommentare der config.yml bleiben',
    after.includes('# So lange läuft der Countdown in der Wachstube'),
  );
  check('alles andere unverändert', /herz-leben: 400/.test(after) && /startgeld: 50/.test(after));
  check(
    'Neustart gemeldet',
    await until(async () => (await status()).modeRestarts.includes('bollwerk'), 5000),
  );
  await sleep(12000);
  const s1 = await status();
  check(
    'kein Neustart, solange jemand spielt',
    s1.starts.bollwerk === starts0 && s1.connected.includes('bollwerk'),
    JSON.stringify(s1),
  );
  check('Wert gilt noch nicht (vor dem Neustart)', countdownOf(anna) === null);

  // 2) Spieler geht → Neustart → Wert wirkt.
  anna.quit();
  const restarted = await until(
    async () => {
      const s = await status();
      return s.starts.bollwerk > starts0 && s.connected.includes('bollwerk');
    },
    240000,
    2000,
  );
  check('leer → Server startet von selbst neu und meldet sich wieder', restarted);
  const s2 = await status();
  check(
    'danach kein Neustart mehr offen',
    s2.modeRestarts.length === 0 && s2.pendingRestarts.length === 0,
    JSON.stringify(s2),
  );
  await sleep(5000);
  const bert = await join('Bert');
  const counting = await until(async () => countdownOf(bert) !== null, 15000);
  const shown = countdownOf(bert);
  check('Wert wirkt: allein startet der Countdown von selbst', counting, bert.bars.slice(-1)[0]);
  check(
    'Wert wirkt: Countdown beginnt bei 12 statt 30',
    shown !== null && shown <= 12 && shown >= 8,
    `angezeigt ${shown}`,
  );
  bert.quit();

  // 3) Modus schläft: Einstellung ändern → vor dem Aufwachen eingetragen, kein weiterer Neustart.
  await call('/stop', { server: 'bollwerk' });
  check(
    'Server angehalten (schläft)',
    await until(async () => !(await status()).connected.includes('bollwerk'), 60000),
  );
  await call('/', { area: 'bollwerk', values: { hallCountdown: 9 } });
  const saved = path.join(DIR, 'plugins', 'moinmorni', 'mode-settings.json');
  check(
    'schlafend: Werte landen über den Motor in mode-settings.json',
    await until(
      async () => JSON.parse(fs.readFileSync(saved, 'utf8')).values['wachstube.countdown-sekunden'] === 9,
      10000,
    ),
  );
  check('config.yml ist dabei noch alt', /countdown-sekunden: 12/.test(fs.readFileSync(CONFIG, 'utf8')));
  const starts3 = (await status()).starts.bollwerk;
  await call('/start', { server: 'bollwerk' });
  check('aufgewacht', await until(async () => (await status()).connected.includes('bollwerk'), 240000, 2000));
  check(
    'vor dem Start eingetragen: config.yml hat 9',
    /countdown-sekunden: 9/.test(fs.readFileSync(CONFIG, 'utf8')),
  );
  await sleep(3000);
  const s4 = await status();
  check(
    'kein zusätzlicher Neustart nötig',
    s4.modeRestarts.length === 0 && s4.starts.bollwerk === starts3 + 1,
    JSON.stringify(s4),
  );
  await sleep(4000);
  const carl = await join('Carl');
  await until(async () => countdownOf(carl) !== null, 15000);
  const c = countdownOf(carl);
  check(
    'Wert wirkt gleich nach dem Aufwachen: Countdown bei 9',
    c !== null && c <= 9 && c >= 5,
    `angezeigt ${c}`,
  );
  carl.quit();

  // 4) Zurück auf den Standard (für weitere Tests).
  await call('/', { area: 'bollwerk', values: { hallMinPlayers: 2, hallCountdown: 30 } });
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} bestanden`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
