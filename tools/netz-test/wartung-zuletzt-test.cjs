/**
 * Neustart nach einem Update mit der Wartungs-Lobby zuletzt (Philip: „es muss immer der Wartungsserver gehen – erst
 * werden alle anderen geupdatet und dann der Wartungsserver“): Velocity 4.3 + Lobby + Duels + Wartungs-Lobby
 * (Paper 26.1.2) mit dem Netzwerk-Plugin und dem Test-Hub (apps/server/scripts/hub-dev.ts mit --wecken, --starten,
 * --steuer). Anna steht in Duels, Bert in der Lobby. Neustart wie nach einem Update für duels, lobby, wartung:
 * Duels zuerst (Anna in die Lobby), dann die Lobby (beide warten in der Wartungs-Lobby), erst wenn die Lobby wieder
 * läuft und beide zurück sind, die Wartungs-Lobby. Niemand wird getrennt. Der Proxy startet nicht neu.
 *   NODE_PATH=<ordner mit mineflayer> node tools/netz-test/wartung-zuletzt-test.cjs [proxy-port] [steuer-url]
 *
 * Verfasst mit Claude 🤖
 */
const http = require('node:http');
const mineflayer = require('mineflayer');

const [PORT = '28400', CONTROL = 'http://127.0.0.1:28405'] = process.argv.slice(2);
const VERSION = process.env.MC_VERSION ?? '26.1';
const COUNTDOWN = 10;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${String(detail).slice(0, 300)}` : ''}`);
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
    bot.gone = null;
    bot._client.on('system_chat', (p) => bot.chats.push(textOf(p.content)));
    bot._client.on('kick_disconnect', (p) => (bot.gone = textOf(p.reason) || 'kick'));
    bot.on('end', (r) => (bot.gone = bot.gone ?? `end ${r}`));
    bot.once('spawn', () => resolve(bot));
    bot.once('error', reject);
  });
}
const chatHas = (bot, re) => bot.chats.some((c) => re.test(c));
const whereIs = async (name) => (await status()).online?.find((p) => p.name === name)?.server ?? null;
/** Wo die Spieler im Lauf der Zeit waren (alle halbe Sekunde) – und was zur selben Zeit am Hub hing. */
const timeline = [];

(async () => {
  await call('/', { area: 'updates', values: { restartCountdown: COUNTDOWN } });
  const ready = await until(async () => {
    const s = await status();
    return ['lobby', 'duels', 'wartung'].every((m) => s.connected.includes(m));
  }, 240000);
  check('Lobby, Duels und Wartungs-Lobby hängen am Hub', ready, JSON.stringify((await status()).connected));

  const anna = await join('Anna');
  await until(async () => (await whereIs('Anna')) === 'lobby', 20000);
  const inDuels = await [1, 2, 3].reduce(async (prev) => {
    if (await prev) return true;
    anna.chat('/server duels');
    return until(async () => (await whereIs('Anna')) === 'duels', 25000);
  }, Promise.resolve(false));
  const bert = await join('Bert');
  const bertLobby = await until(async () => (await whereIs('Bert')) === 'lobby', 20000);
  await sleep(2000);
  check(
    'Anna in Duels, Bert in der Lobby',
    inDuels && bertLobby,
    `${await whereIs('Anna')} / ${await whereIs('Bert')}`,
  );

  const watch = setInterval(async () => {
    try {
      const s = await status();
      timeline.push({
        t: Date.now(),
        anna: s.online.find((p) => p.name === 'Anna')?.server ?? null,
        bert: s.online.find((p) => p.name === 'Bert')?.server ?? null,
        connected: s.connected,
        starts: s.starts,
      });
    } catch {}
  }, 500);
  const startsBefore = (await status()).starts;
  await call('/neustart', { servers: ['wartung', 'lobby', 'duels'], why: 'update' });

  // 1. Duels: Countdown, Anna in die Lobby, Duels startet neu.
  check(
    'Countdown für Duels',
    await until(() => chatHas(anna, /Duels.*(startet in|restarts in)/), 15000),
    anna.chats.slice(-1)[0],
  );
  const duelsAgain = await until(async () => (await status()).starts.duels > startsBefore.duels, 60000);
  check(
    'Duels startet zuerst neu (Anna vorher in der Lobby)',
    duelsAgain && chatHas(anna, /(solange Duels neu startet|while Duels restarts)/),
  );
  check(
    'Lobby und Wartungs-Lobby noch nicht neu gestartet, während Duels startet',
    (await status()).starts.lobby === startsBefore.lobby &&
      (await status()).starts.wartung === startsBefore.wartung,
  );
  // 2. Lobby: beide warten in der Wartungs-Lobby.
  const lobbyTold = await until(
    () => chatHas(bert, /(So lange wartest du in der Wartungs-Lobby|you wait in the maintenance lobby)/),
    240000,
  );
  check(
    'Countdown in der Lobby: „So lange wartest du in der Wartungs-Lobby“',
    lobbyTold,
    bert.chats.slice(-1)[0],
  );
  const parked = await until(
    async () => (await whereIs('Anna')) === 'wartung' && (await whereIs('Bert')) === 'wartung',
    40000,
  );
  check(
    'Anna und Bert warten in der Wartungs-Lobby',
    parked,
    `${await whereIs('Anna')} / ${await whereIs('Bert')}`,
  );
  const lobbyRestarted = await until(async () => (await status()).starts.lobby > startsBefore.lobby, 60000);
  check('Lobby startet neu', lobbyRestarted);
  // 3. Erst zurück, dann die Wartungs-Lobby.
  const back = await until(
    async () => (await whereIs('Anna')) === 'lobby' && (await whereIs('Bert')) === 'lobby',
    240000,
  );
  check('beide von selbst zurück in der Lobby', back, `${await whereIs('Anna')} / ${await whereIs('Bert')}`);
  const wartungRestarted = await until(
    async () => (await status()).starts.wartung > startsBefore.wartung,
    120000,
  );
  check('danach startet die Wartungs-Lobby neu', wartungRestarted, JSON.stringify((await status()).starts));
  check('Neustart-Runde fertig', await until(async () => !(await status()).restartNowBusy, 240000, 1000));
  clearInterval(watch);

  const firstWartung = timeline.find((x) => x.starts.wartung > startsBefore.wartung);
  const lastLobbyStart = timeline.find((x) => x.starts.lobby > startsBefore.lobby);
  const backAt = timeline.find(
    (x) => x.t > (lastLobbyStart?.t ?? 0) && x.anna === 'lobby' && x.bert === 'lobby',
  );
  check(
    'Reihenfolge: Duels → Lobby → (alle zurück) → Wartungs-Lobby',
    lastLobbyStart && backAt && firstWartung && lastLobbyStart.t < backAt.t && backAt.t <= firstWartung.t,
    `Lobby ${lastLobbyStart?.t} · zurück ${backAt?.t} · Wartung ${firstWartung?.t}`,
  );
  const both = timeline.filter((x) => !x.connected.includes('lobby') && !x.connected.includes('wartung'));
  check('nie Lobby und Wartungs-Lobby zugleich weg', both.length === 0, `${both.length} Zeitpunkte`);
  check('niemand getrennt', anna.gone === null && bert.gone === null, `${anna.gone} / ${bert.gone}`);
  check(
    'Anna und Bert sind am Ende in der Lobby',
    (await whereIs('Anna')) === 'lobby' && (await whereIs('Bert')) === 'lobby',
  );
  const s9 = await status();
  check(
    'jeder Server genau einmal neu gestartet',
    ['duels', 'lobby', 'wartung'].every((m) => s9.starts[m] === startsBefore[m] + 1),
    JSON.stringify(s9.starts),
  );
  anna.quit();
  bert.quit();
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} grün`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
