/**
 * MorniCraft im Netzwerk, mit echten Servern: Test-Spieler (mineflayer) gehen über den Velocity-Proxy auf einen
 * Paper-Server mit MorniCraft + Netzwerk-Plugin. Prüft: Rang kommt vom Netzwerk und steht nur einmal da, Clan-Kürzel
 * im Netzwerk-Chat, MorniCraft-Befehle gehen weiter, Einstellungen aus dem Panel kommen sofort an, Sprache je Spieler.
 *   NODE_PATH=<ordner mit mineflayer> node tools/netz-test/mornicraft-test.cjs [host] [port] [steuer-url]
 * Erwartet: Proxy mit Server „mornicraft“ (Modus an), Hub mit Philip = owner und Mia = moderator; die Steuer-URL
 * nimmt POST {area, values} und ändert damit Einstellungen wie das Panel (siehe README des Tests im STAND).
 * Mit `--allein` gegen einen MorniCraft-Server ohne Netzwerk (direkt, ohne Proxy).
 */
const mineflayer = require('mineflayer');
const http = require('node:http');
const crypto = require('node:crypto');

const alone = process.argv.includes('--allein');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const HOST = args[0] ?? '127.0.0.1';
const PORT = Number(args[1] ?? 25795);
const CONTROL = args[2] ?? 'http://127.0.0.1:8796/';
const VERSION = process.env.MC_VERSION ?? '1.21.11';
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (msg) => (typeof msg === 'string' ? msg : JSON.stringify(msg));
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` – ${String(detail).slice(0, 160)}` : ''}`);
}

const LOGIN_GAP_MS = 3500;
let lastLogin = 0;
async function join(username) {
  const wait = lastLogin + LOGIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastLogin = Date.now();
  return new Promise((resolve, reject) => {
    const bot = mineflayer.createBot({ host: HOST, port: PORT, username, version: VERSION, auth: 'offline', physicsEnabled: false });
    bot.lines = [];
    bot.on('messagestr', (m) => bot.lines.push(m));
    // Teleport-Wartezeit steht in einem Balken oben.
    bot.on('bossBarCreated', (b) => bot.lines.push(`BALKEN ${b.title?.toString?.() ?? plain(b.title)}`));
    bot.once('spawn', () => resolve(bot));
    bot.once('kicked', (reason) => reject(new Error(`kicked: ${plain(reason)}`)));
    bot.once('error', reject);
  });
}

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

/** Wie oft eine passende Zeile kommt (in `ms`). */
async function count(bot, match, ms = 2500) {
  await sleep(ms);
  const hits = bot.lines.filter((l) => match.test(l));
  bot.lines = bot.lines.filter((l) => !match.test(l));
  return hits;
}

function set(area, values) {
  return new Promise((resolve, reject) => {
    const req = http.request(CONTROL, { method: 'POST' }, (res) => {
      res.resume();
      res.on('end', () => (res.statusCode === 200 ? resolve() : reject(new Error(`status ${res.statusCode}`))));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ area, values }));
  });
}

/** Offline-UUID wie Minecraft. */
function offlineUuid(name) {
  const u = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  u[6] = (u[6] & 0x0f) | 0x30;
  u[8] = (u[8] & 0x3f) | 0x80;
  const h = u.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Was der Hub über einen Spieler aus MorniCraft gespeichert hat (Steuer-URL, GET). */
function panelData(name) {
  return new Promise((resolve, reject) => {
    http.get(`${CONTROL}?uuid=${offlineUuid(name)}`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

const prefixOf = (team) => plain(team?.prefix?.json ?? team?.prefix ?? '');
/** Teams des Bots, in denen dieser Spieler steht. */
const teamsOf = (bot, name) => Object.values(bot.teams).filter((t) => t.members?.includes(name));
/** Text der Leiste rechts (Zeilen stecken in Team-Präfixen „mc0“ …). */
const sidebarText = (bot) =>
  Object.values(bot.teams)
    .filter((t) => /^mc\d+$/.test(t.team))
    .map((t) => plain(t.prefix?.toString?.() ?? t.prefix))
    .join(' | ');

async function network() {
  // Standard aus dem Panel (frühere Läufe können etwas geändert haben).
  await set('mornicraft', { teleportDelay: 5, spawnCommand: true });
  await set('website', { rulesEn: 'Be kind: no insults.' });
  const philip = await join('Philip');
  await sleep(1500);
  philip.chat('/sprache de');
  const lena = await join('Lena');
  await sleep(3000);
  philip.lines = [];
  lena.lines = [];

  // ---- Spawn-Insel: gebaut beim ersten Start, Spieler landen darauf ----
  const pos = philip.entity.position;
  const ground = philip.blockAt(pos.offset(0, -1, 0));
  check('Spawn-Insel: Spieler steht in der Luft über dem Meer (y > 165)', pos.y > 165, `y ${pos.y.toFixed(1)}`);
  check('Spawn-Insel: fester Boden unter den Füßen', Boolean(ground && ground.name !== 'air'), ground?.name ?? '?');

  // ---- Rang vom Netzwerk, nur einmal ----
  philip.chat('Servus MorniCraft');
  const hits = await count(lena, /Servus MorniCraft/);
  check('Chat geht über den Hub, genau eine Zeile', hits.length === 1, JSON.stringify(hits));
  check('Rang vom Netzwerk im Chat (♛ einmal, kein „Owner ·“ von MorniCraft)',
    hits.length === 1 && (hits[0].match(/♛/g) ?? []).length === 1 && !hits[0].includes('Owner ·'), hits[0] ?? '');
  const philipTeams = teamsOf(lena, 'Philip');
  check('Über dem Kopf: ein Team von MorniCraft mit ♛', philipTeams.length === 1 && philipTeams[0].team.startsWith('mcr')
    && (prefixOf(philipTeams[0]).match(/♛/g) ?? []).length === 1, philipTeams.map((t) => `${t.team}:${prefixOf(t)}`).join(','));
  check('Kein zweites Team vom Netzwerk-Plugin', !Object.values(lena.teams).some((t) => t.team.startsWith('mm') && t.members?.includes('Philip')));
  const bar = sidebarText(philip);
  check('Leiste rechts: Rang des Netzwerks', bar.includes('Owner'), bar);
  const title = [...JSON.stringify(philip.scoreboards?.mornicraft?.title ?? '').matchAll(/"value":"(.)"/g)].map((m) => m[1]).join('');
  check('Leiste rechts: Name „MorniCraft auf morni.net“ (Smaragd → Gold)', title === 'MorniCraft auf morni.net'
    && JSON.stringify(philip.scoreboards?.mornicraft?.title).includes('#FBBF24'), title);
  check('Leiste rechts: Adresse morni.net', bar.includes('morni.net'), bar);

  // ---- Clan-Kürzel nach dem Rang ----
  philip.chat('/clan create Testclan TC');
  await sleep(2500);
  philip.chat('Mit Clan');
  const clanLine = await sees(lena, /Mit Clan/);
  check('Clan-Kürzel im Netzwerk-Chat nach dem Rang', Boolean(clanLine && /♛ \[TC\] Philip/.test(clanLine)), clanLine ?? '');
  const withClan = teamsOf(lena, 'Philip')[0];
  const shownPrefix = prefixOf(withClan);
  check('Clan-Kürzel über dem Kopf nach dem Rang', /"text":"♛ "/.test(shownPrefix) && /"text":"\[TC\] "/.test(shownPrefix)
    && shownPrefix.indexOf('extra') > 0, shownPrefix);

  // ---- MorniCraft-Befehle gehen weiter ----
  philip.chat('/tpa Lena');
  check('Andere Spieler in ihrer Sprache: Anfrage an Lena auf Englisch', Boolean(await sees(lena, /wants to come to you/)));
  check('… Philip liest seine Antwort auf Deutsch', Boolean(await sees(philip, /Anfrage an Lena geschickt/)));
  lena.chat('/tpdeny');
  check('… Ablehnung bei Philip auf Deutsch', Boolean(await sees(philip, /hat abgelehnt/)));

  philip.chat('/mcadmin reload');
  check('/mcadmin reload für Admins', Boolean(await sees(philip, /neu geladen/)));
  lena.chat('/mcadmin reload');
  check('/mcadmin: Spieler darf nicht', Boolean(await sees(lena, /Unknown or incomplete|permission/i)));
  philip.chat('/mcadmin drache blitze');
  check('/mcadmin drache erreichbar', Boolean(await sees(philip, /Drache|drache|End/, 3000)));

  philip.chat('/sethome basis');
  check('/sethome', Boolean(await sees(philip, /basis.*(gespeichert|verschoben)/)));
  philip.chat('/info');
  check('/info mit morni.net-Befehlen', Boolean(await sees(philip, /\/lobby/)));
  philip.chat('/rules');
  check('/rules: Regeln des Netzwerks (Deutsch)', Boolean(await sees(philip, /Freundlich bleiben/)));
  lena.chat('/rules');
  check('/rules: Lena auf Englisch (Sprache je Spieler)', Boolean(await sees(lena, /Be kind/)));
  philip.chat('/team');
  check('/team: wer vom Team online ist', Boolean(await sees(philip, /Gerade online im Team/)));
  philip.chat('/teamdashboard');
  check('/teamdashboard → Panel von morni.net', Boolean(await sees(philip, /morni\.net[- ]?Panel|Panel von morni\.net/i)));
  lena.chat('/teamdashboard');
  check('/teamdashboard: Spieler darf nicht', Boolean(await sees(lena, /moderators and owners/)));
  philip.chat('/freilassen Lena');
  check('Strafen sind Sache des Netzwerks', Boolean(await sees(philip, /auf morni\.net das Netzwerk|das Netzwerk morni\.net/)));
  philip.chat('/mute Lena 10m Test');
  check('/mute vom Netzwerk', Boolean(await sees(lena, /muted|stummgeschaltet/)));
  lena.chat('Geht das?');
  check('Stumm gilt auf MorniCraft', !(await sees(philip, /Geht das\?/, 2000)));
  philip.chat('/unmute Lena');
  await sees(lena, /chat again|wieder schreiben/);

  // ---- Panel: was MorniCraft über Philip meldet ----
  await sleep(7000);
  const data = await panelData('Philip');
  check('Panel-Daten: Zuhause, Clan, online', Boolean(data && data.online && data.homes.some((h) => h.name === 'basis')
    && data.clan?.tag === 'TC'), JSON.stringify(data));

  // ---- Rechte aus dem Netzwerk ----
  const mia = await join('Mia');
  await sleep(2500);
  mia.chat('/einfrieren Lena');
  check('Moderator (Netzwerk) darf /einfrieren', Boolean(await sees(mia, /froze Lena|friert Lena|Lena eingefroren/)));
  mia.chat('/einfrieren Lena');
  check('… und wieder auftauen', Boolean(await sees(lena, /move again|wieder bewegen/)));
  lena.chat('/einfrieren Philip');
  check('Spieler darf nicht /einfrieren', Boolean(await sees(lena, /Unknown or incomplete|permission/i)));

  // ---- Einstellungen aus dem Panel kommen sofort an ----
  lena.chat('/spawn');
  check('/spawn mit Wartezeit (Standard 5 s, Balken auf Englisch)', Boolean(await sees(lena, /BALKEN.*don't move/)));
  await sleep(6000);
  await set('mornicraft', { spawnCommand: false });
  await sleep(2000);
  lena.chat('/spawn');
  check('Panel: /spawn aus → sofort aus', Boolean(await sees(lena, /switched off|ausgeschaltet/)));
  await set('mornicraft', { spawnCommand: true, teleportDelay: 0 });
  await sleep(2000);
  lena.chat('/spawn');
  const quick = await sees(lena, /switched off|ausgeschaltet|BALKEN/, 2000);
  check('Panel: wieder an, ohne Wartezeit', quick === null, quick ?? '');
  await set('website', { rulesEn: 'Only one rule' });
  await sleep(2000);
  lena.chat('/rules');
  check('Neue Regeln von der Webseite sofort im Spiel', Boolean(await sees(lena, /Only one rule/)));

  philip.chat('/clan disband');
  await sleep(500);
  philip.chat('/clan disband');
  await sleep(500);
  [philip, lena, mia].forEach((b) => b.quit());
}

async function standalone() {
  const lena = await join('Lena');
  await sleep(3000);
  lena.chat('/info');
  check('Allein: /info ohne morni.net-Teil', Boolean(await sees(lena, /\/spawn/)) && !(await sees(lena, /\/lobby/, 1500)));
  lena.chat('/rules');
  check('Allein: /rules aus der config.yml', Boolean(await sees(lena, /Regeln|Rules|rules/)));
  lena.chat('/team');
  check('Allein: /team wie immer (Ränge von MorniCraft)', Boolean(await sees(lena, /Das Team|The team/)));
  lena.chat('Hallo allein');
  const line = await sees(lena, /Hallo allein/);
  // mineflayer zeigt bei Spieler-Chat nur den Text (die Zeile von MorniCraft kommt als „unsigned content“).
  check('Allein: Chat bleibt auf dem Server', Boolean(line), line ?? '');
  lena.chat('/sethome basis');
  check('Allein: /sethome', Boolean(await sees(lena, /basis/)));
  const bar = sidebarText(lena);
  check('Allein: Leiste ohne morni.net', bar.length > 0 && !bar.includes('morni.net'), bar);
  lena.quit();
}

setTimeout(() => {
  console.log('Zeit abgelaufen');
  process.exit(2);
}, 150_000);
(alone ? standalone() : network())
  .then(async () => {
    await sleep(500);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} bestanden`);
    process.exit(failed ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
