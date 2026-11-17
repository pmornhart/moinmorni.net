/**
 * Rang-Abzeichen auf dem MorniCraft-Server: Dort malt MorniCraft (Netzwerk-Modus) Tab-Liste, Namen über dem Kopf und
 * die Leiste rechts selbst. Das Netzwerk-Plugin hängt den Schlüssel des Abzeichens als Metadaten `moinmorni:badge` an
 * den Spieler; MorniCraft (ab 1.12.1) zeigt den Rang dann als Übersetzung mit diesem Schlüssel – wie auf allen anderen
 * Servern. Geprüft wird, was beim Test-Spieler ankommt (Team-Pakete: Rang-Teams „mcr…“ und Leiste „mc0…“), mit
 * Abzeichen an, aus und wieder an, dazu ein Clan-Kürzel neben dem Abzeichen.
 *   NODE_PATH=<ordner mit mineflayer> MM_STEUER=http://127.0.0.1:<port> node tools/netz-test/mornicraft-abzeichen-test.cjs [host] [port]
 * Erwartet: Proxy mit „mornicraft“ (Paper + Netzwerk-Plugin + MorniCraft), Hub aus scripts/hub-dev.ts mit
 * --steuer=<port>, --rang=Philip=owner und --rang=Mia=moderator.
 */
const mineflayer = require('mineflayer');
const nbt = require('prismarine-nbt');

const HOST = process.argv[2] ?? '127.0.0.1';
const PORT = Number(process.argv[3] ?? 28500);
const STEUER = process.env.MM_STEUER ?? 'http://127.0.0.1:28503';
const VERSION = process.env.MC_VERSION ?? '26.1';
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` – ${String(detail).slice(0, 200)}` : ''}`);
}

const LOGIN_GAP_MS = 3500;
let lastLogin = 0;
const asJson = (x) =>
  JSON.stringify(x && typeof x === 'object' && 'type' in x && 'value' in x ? nbt.simplify(x) : x);

async function join(username) {
  const wait = lastLogin + LOGIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastLogin = Date.now();
  const bot = mineflayer.createBot({ host: HOST, port: PORT, username, version: VERSION, auth: 'offline', physicsEnabled: false });
  bot.teamsSeen = new Map();
  bot.lines = [];
  bot.on('messagestr', (m) => bot.lines.push(m));
  bot._client.on('add_resource_pack', (p) => {
    // Abzeichen-Paket vom Proxy: annehmen und „geladen“ melden.
    bot._client.write('resource_pack_receive', { uuid: String(p.uuid), result: 3 });
    bot._client.write('resource_pack_receive', { uuid: String(p.uuid), result: 0 });
  });
  bot._client.on('teams', (p) => {
    if (p.team?.startsWith('mc') && p.prefix !== undefined) bot.teamsSeen.set(p.team, asJson(p.prefix));
  });
  await new Promise((resolve, reject) => {
    bot.once('spawn', resolve);
    bot.once('kicked', (reason) => reject(new Error(`kicked: ${JSON.stringify(reason)}`)));
    bot.once('error', reject);
  });
  return bot;
}

async function until(get, ms = 10000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const found = get();
    if (found) return found;
    await sleep(200);
  }
  return null;
}

async function steuer(path, body) {
  const res = await fetch(`${STEUER}${path}`, { method: 'POST', body: JSON.stringify(body) });
  return res.json();
}

/** Präfix eines Teams mit diesem Namen-Muster, das `test` erfüllt. */
const team = (bot, name, test) =>
  until(() => [...bot.teamsSeen.entries()].find(([n, p]) => name.test(n) && test(p))?.[1] ?? null);
const rankTeam = /^mcr\d\d/;
const barLine = /^mc\d+$/;

async function main() {
  await steuer('/', { area: 'badges', values: { enabled: true, required: false } });
  const philip = await join('Philip');
  const mia = await join('Mia');

  // ---------- Abzeichen an ----------
  const own = await team(philip, rankTeam, (p) => p.includes('"translate":"♛ "'));
  check('Über dem Kopf / Tab-Liste: Owner als Übersetzung „♛ “', Boolean(own), own ?? [...philip.teamsSeen].join(' | '));
  check('… in der Farbe des Rangs', Boolean(own && /ff5555|red/i.test(own)), own ?? '');
  const mod = await team(philip, rankTeam, (p) => p.includes('"translate":"⚔ "'));
  check('Moderatorin, so wie Philip sie sieht: Übersetzung „⚔ “', Boolean(mod), mod ?? '');
  const bar = await team(philip, barLine, (p) => p.includes('"translate":"♛ "'));
  check('Leiste rechts: Rang als Abzeichen (Übersetzung)', Boolean(bar), bar ?? '');
  check('… ohne Paket „♛ Owner“ (Ersatztext)', Boolean(bar && bar.includes('♛ Owner')), bar ?? '');

  // Clan-Kürzel steht weiter zwischen Abzeichen und Name.
  philip.chat('/clan create Testclan TST');
  const clan = await team(philip, rankTeam, (p) => p.includes('"translate":"♛ "') && p.includes('TST'));
  check('Clan-Kürzel neben dem Abzeichen', Boolean(clan), clan ?? '');

  // ---------- Abzeichen aus: wie bisher Symbol als Text ----------
  await steuer('/', { area: 'badges', values: { enabled: false } });
  const plain = await team(philip, rankTeam, (p) => p.includes('♛ ') && !p.includes('translate'));
  check('Abzeichen aus: Symbol „♛ “ als Text wie bisher', Boolean(plain), plain ?? '');
  const plainBar = await team(philip, barLine, (p) => p.includes('♛ Owner') && !p.includes('translate'));
  check('Abzeichen aus: Leiste „♛ Owner“ als Text', Boolean(plainBar), plainBar ?? '');

  // ---------- wieder an ----------
  await steuer('/', { area: 'badges', values: { enabled: true } });
  const again = await team(philip, rankTeam, (p) => p.includes('"translate":"♛ "'));
  check('Wieder an: Übersetzung zurück', Boolean(again), again ?? '');
  const againBar = await team(philip, barLine, (p) => p.includes('"translate":"♛ "'));
  check('Wieder an: Leiste mit Abzeichen', Boolean(againBar), againBar ?? '');

  philip.chat('/clan disband');
  await sleep(500);
  philip.chat('/clan disband');
  await sleep(1000);
  philip.quit();
  mia.quit();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} grün`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
