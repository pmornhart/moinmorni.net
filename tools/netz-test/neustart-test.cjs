/**
 * „Nach einem Update gleich neu starten“, mit echten Servern: Velocity 4.3 + Lobby + Duels (Paper 26.1.2) mit dem
 * Netzwerk-Plugin, dazu der Test-Hub (apps/server/scripts/hub-dev.ts mit --wecken, --starten, --steuer – sein
 * Ersatz-Motor startet die Server neu). Ein Test-Spieler steht in Duels; dann der Neustart wie nach einem Update
 * (network/restart-now.ts): Countdown im Chat und als Leiste oben (vom Proxy), Umzug in die Lobby, Duels startet neu
 * und kommt wieder, danach Countdown in der Lobby, freundlicher Rauswurf, Lobby startet neu, wieder hinein.
 *   NODE_PATH=<ordner mit mineflayer> node tools/netz-test/neustart-test.cjs [proxy-port] [steuer-url]
 *
 * Verfasst mit Claude 🤖
 */
const http = require('node:http');
const mineflayer = require('mineflayer');

const [PORT = '28310', CONTROL = 'http://127.0.0.1:28331'] = process.argv.slice(2);
const VERSION = process.env.MC_VERSION ?? '26.1';
const COUNTDOWN = 12;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${String(detail).slice(0, 240)}` : ''}`);
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
async function until(test, ms, step = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await Promise.resolve(test()).catch(() => false)) return true;
    await sleep(step);
  }
  return false;
}
/** Text aus Chat-Komponenten (JSON oder NBT, wie sie 26.x schickt). */
function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string') {
    try {
      return textOf(JSON.parse(v));
    } catch {
      return v;
    }
  }
  if (Array.isArray(v)) return v.map(textOf).join('');
  if (typeof v !== 'object') return String(v);
  if (v.type === 'string') return v.value;
  if (v.type === 'compound' || v.type === 'list') return textOf(v.value);
  if (v.value && typeof v.value === 'object' && !('text' in v)) return textOf(v.value);
  return [v.text, v[''], v.extra && textOf(v.extra)]
    .filter((x) => x != null)
    .map(textOf)
    .join('');
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
    bot.chats = [];
    bot.bars = new Map();
    bot.kickReason = null;
    bot._client.on('system_chat', (p) => bot.chats.push(textOf(p.content)));
    // Leiste oben (Boss-Leiste): 0 = neu, 2 = Füllstand, 3 = Titel, 1 = weg.
    bot._client.on('boss_bar', (p) => {
      const id = String(p.entityUUID);
      if (p.action === 0)
        bot.bars.set(id, { title: textOf(p.title), titles: [textOf(p.title)], health: p.health });
      else if (p.action === 1) bot.bars.delete(id);
      else if (p.action === 3 && bot.bars.has(id)) {
        const bar = bot.bars.get(id);
        bar.title = textOf(p.title);
        bar.titles.push(bar.title);
      } else if (p.action === 2 && bot.bars.has(id)) bot.bars.get(id).health = p.health;
    });
    bot._client.on('kick_disconnect', (p) => (bot.kickReason = textOf(p.reason)));
    bot._client.on('disconnect', (p) => (bot.kickReason = textOf(p.reason)));
    bot.on('kicked', (r) => (bot.kickReason = bot.kickReason ?? textOf(r)));
    bot.once('spawn', () => resolve(bot));
    bot.once('error', reject);
  });
}
const chatHas = (bot, re) => bot.chats.some((c) => re.test(c));
/** Nur die Leisten des Neustarts (die Lobby hat ihre eigene Ankündigungs-Leiste). */
const RESTART_BAR = /startet in|restarts in/;
const restartBars = (bot) => [...bot.bars.values()].filter((b) => b.titles.some((t) => RESTART_BAR.test(t)));
/** Wo der Hub den Spieler gerade sieht. */
const whereIs = async (name) => (await status()).online?.find((p) => p.name === name)?.server ?? null;

(async () => {
  await call('/', { area: 'updates', values: { restartCountdown: COUNTDOWN } });
  const ready = await until(async () => {
    const s = await status();
    return s.connected.includes('lobby') && s.connected.includes('duels');
  }, 180000);
  const s0 = await status();
  check('Lobby und Duels hängen am Hub', ready, JSON.stringify(s0));

  const anna = await join('Anna');
  await until(async () => (await whereIs('Anna')) === 'lobby', 15000);
  // Auf dem ausgelasteten Rechner bricht der Wechsel manchmal ab – dann noch einmal.
  const inDuels = await [1, 2, 3].reduce(async (prev) => {
    if (await prev) return true;
    anna.chat('/server duels');
    return until(async () => (await whereIs('Anna')) === 'duels', 20000);
  }, Promise.resolve(false));
  await sleep(3000);
  check('Anna ist in Duels', inDuels, `${await whereIs('Anna')} · ${anna.chats.slice(-2).join(' | ')}`);

  // Neustart wie nach einem Update.
  const t0 = Date.now();
  await call('/neustart', { servers: ['duels', 'lobby'], why: 'update' });
  const told = await until(
    () =>
      chatHas(
        anna,
        /(Update eingespielt.*Duels.*startet in 12 Sekunden neu|Update installed.*Duels.*restarts in 12 seconds)/,
      ),
    8000,
  );
  check(
    'Chat: „Update eingespielt – Duels startet in 12 Sekunden neu“',
    told,
    anna.chats.slice(-2).join(' | '),
  );
  const bar = await until(
    () => restartBars(anna).some((b) => /Duels.*(startet|restarts) in.*\d+ s/.test(b.title)),
    8000,
  );
  const firstBar = restartBars(anna)[0];
  check('Leiste oben vom Proxy mit Countdown', bar, firstBar?.title);
  await sleep(3500);
  const counting = restartBars(anna)[0];
  check(
    'Leiste zählt herunter und leert sich',
    counting && counting.titles.length >= 3 && counting.health < 1,
    `${counting?.titles.slice(-3).join(' → ')} · ${counting?.health}`,
  );
  const reminder = await until(
    () => chatHas(anna, /(Noch 10 Sekunden bis zum Neustart|10 seconds until the restart)/),
    8000,
  );
  check('Hinweis 10 Sekunden vorher', reminder);
  const moved = await until(
    () =>
      chatHas(anna, /(Du bist in der Lobby, solange Duels neu startet|in the lobby while Duels restarts)/),
    20000,
  );
  const movedAfter = (Date.now() - t0) / 1000;
  check('nach dem Countdown in die Lobby geholt', moved, `${movedAfter.toFixed(1)} s nach dem Auftrag`);
  check('nicht vor Ablauf des Countdowns', movedAfter >= COUNTDOWN - 1, `${movedAfter.toFixed(1)} s`);
  check('Leiste weg, wenn der Countdown vorbei ist', await until(() => restartBars(anna).length === 0, 5000));
  const restarted = await until(async () => (await status()).starts.duels >= 2, 60000);
  check('Duels startet neu (Ersatz-Motor)', restarted, JSON.stringify((await status()).starts));
  const back = await until(async () => (await status()).connected.includes('duels'), 180000, 1000);
  check('Duels ist wieder da und hängt am Hub', back);
  const lobbyStartsBefore = (await status()).starts.lobby;

  // Danach die Lobby: Countdown, freundlicher Rauswurf, Neustart.
  const lobbyTold = await until(
    () => chatHas(anna, /(die Lobby startet in 12 Sekunden neu|the lobby restarts in 12 seconds)/),
    30000,
  );
  check('erst danach: Countdown für die Lobby', lobbyTold, anna.chats.slice(-2).join(' | '));
  const lobbyBar = await until(() => restartBars(anna).some((b) => /Lobby|lobby/.test(b.title)), 5000);
  check('Leiste für die Lobby', lobbyBar, restartBars(anna)[0]?.title);
  const kicked = await until(() => anna.kickReason !== null, 30000);
  check(
    'freundlicher Rauswurf „Die Lobby startet neu … wieder rein“',
    kicked && /(Lobby startet neu|lobby is restarting)/.test(anna.kickReason),
    anna.kickReason,
  );
  const lobbyRestarted = await until(async () => (await status()).starts.lobby > lobbyStartsBefore, 60000);
  check('Lobby startet neu', lobbyRestarted, JSON.stringify((await status()).starts));
  const lobbyBack = await until(async () => (await status()).connected.includes('lobby'), 180000, 1000);
  check('Lobby ist wieder da', lobbyBack);
  check('Neustart-Runde fertig', await until(async () => !(await status()).restartNowBusy, 30000));

  const again = await join('Anna');
  await sleep(3000);
  check('Anna kommt wieder hinein, keine Leiste mehr', restartBars(again).length === 0);
  again.quit();
  const s9 = await status();
  check(
    'jeder Server genau einmal neu gestartet',
    s9.starts.duels === 2 && s9.starts.lobby === 2,
    JSON.stringify(s9.starts),
  );

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} grün`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
