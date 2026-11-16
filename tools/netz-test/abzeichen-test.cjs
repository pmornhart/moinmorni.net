/**
 * Rang-Abzeichen echt prüfen: Test-Spieler (mineflayer) gehen über den Velocity-Proxy ins Netzwerk. Geprüft wird,
 * was beim Client ankommt – das Abzeichen-Paket vom Proxy (eigene Kennung neben dem Möbel-Paket der Lobby), die
 * Antworten des Hubs (abgelehnt, /abzeichen, Pflicht), Chat, Tab-Liste und Teams als Übersetzung mit dem Schlüssel
 * „Symbol + Leerzeichen“, der Serverwechsel (Paket bleibt, Möbel-Paket geht) sowie An/Aus und Rollen aus dem Panel.
 *   NODE_PATH=<ordner mit mineflayer> MM_STEUER=http://127.0.0.1:<port> node tools/netz-test/abzeichen-test.cjs [host] [port]
 * Erwartet: Proxy mit „lobby“ (Möbel-Paket in der server.properties) und „duels“, Hub aus scripts/hub-dev.ts mit
 * --steuer=<port> (liefert die Pakete) und --rang=Lena=moderator.
 */
const crypto = require('node:crypto');
const mineflayer = require('mineflayer');
const nbt = require('prismarine-nbt');

const HOST = process.argv[2] ?? '127.0.0.1';
const PORT = Number(process.argv[3] ?? 26390);
const STEUER = process.env.MM_STEUER ?? 'http://127.0.0.1:26396';
const VERSION = process.env.MC_VERSION ?? '26.1';
const BADGES = '6d6f696e-6d6f-726e-692d-626164676573';
const MOEBEL = '6d6f696e-6d6f-726e-692d-6d6f6562656c';
// Antworten auf ein Paket (Minecraft ab 1.20.3).
const LOADED = 0;
const DECLINED = 1;
const ACCEPTED = 3;
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

/** Text als JSON – auch wenn er als NBT ankommt (ab 1.20.3). */
const asJson = (x) =>
  JSON.stringify(x && typeof x === 'object' && 'type' in x && 'value' in x ? nbt.simplify(x) : x);

/** Ein Test-Spieler, der alles mitschreibt: Chat (roh), Pakete, Teams. */
async function join(username) {
  await gap();
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
  bot.packs = [];
  bot.removed = [];
  bot.mmTeams = new Map();
  bot.kickedFor = null;
  bot.on('messagestr', (m) => bot.lines.push(m));
  bot.on('message', (msg) => bot.raw.push(JSON.stringify(msg.json)));
  bot._client.on('add_resource_pack', (p) => {
    bot.packs.push({ ...p, uuid: String(p.uuid) });
    // Während des Einrichtens (Möbel-Paket der Lobby) wartet der Server auf die Antwort. mineflayer antwortet dort mit
    // einer falsch verpackten Kennung – darum hier selbst, mit der Kennung wie sie kam.
    if (bot._client.state === 'configuration') {
      bot._client.write('resource_pack_receive', { uuid: String(p.uuid), result: ACCEPTED });
      bot._client.write('resource_pack_receive', { uuid: String(p.uuid), result: LOADED });
    }
  });
  bot._client.on('remove_resource_pack', (p) =>
    bot.removed.push(p.uuid === undefined ? 'alle' : String(p.uuid)),
  );
  bot._client.on('teams', (p) => {
    if (p.team?.startsWith('mm') && p.prefix !== undefined) bot.mmTeams.set(p.team, asJson(p.prefix));
  });
  bot.on('kicked', (reason) => (bot.kickedFor = JSON.stringify(reason)));
  await new Promise((resolve, reject) => {
    bot.once('spawn', resolve);
    bot.once('kicked', (reason) => reject(new Error(`kicked: ${JSON.stringify(reason)}`)));
    bot.once('error', reject);
  });
  return bot;
}

/** Wartet, bis etwas da ist (Liste wird von hinten durchsucht). */
async function until(get, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const found = get();
    if (found) return found;
    await sleep(150);
  }
  return null;
}
const offerOf = (bot, after = 0) => until(() => bot.packs.slice(after).find((p) => p.uuid === BADGES));
const sees = (bot, match, ms) => until(() => bot.lines.find((l) => match.test(l)), ms);
const answer = (bot, result) => bot._client.write('resource_pack_receive', { uuid: BADGES, result });

async function steuer(path, body) {
  const res = await fetch(`${STEUER}${path}`, { method: 'POST', body: JSON.stringify(body) });
  return res.json();
}

async function main() {
  await steuer('/', { area: 'badges', values: { enabled: true, required: false } });
  const lena = await join('Lena');

  // ---------- Paket vom Proxy ----------
  const offer = await offerOf(lena);
  check('Proxy bietet das Abzeichen-Paket an (eigene Kennung)', Boolean(offer), offer?.url ?? '');
  check(
    'Möbel-Paket der Lobby kommt daneben',
    lena.packs.some((p) => p.uuid === MOEBEL),
  );
  const zip = Buffer.from(await (await fetch(offer.url)).arrayBuffer());
  const sha1 = crypto.createHash('sha1').update(zip).digest('hex');
  check('Paket von der Adresse passt zur SHA-1', sha1 === offer.hash, `${zip.length} Bytes`);
  check('nicht verpflichtend (Panel: aus)', offer.forced === false);

  // Ablehnen → freundlicher Hinweis; /abzeichen → nochmal, annehmen → „da!“
  answer(lena, DECLINED);
  check(
    'Abgelehnt: Hinweis auf /abzeichen',
    Boolean(await sees(lena, /Without the badge pack|Ohne Abzeichen-Paket/)),
  );
  const before = lena.packs.length;
  lena.chat('/badges');
  const again = await offerOf(lena, before);
  check('/abzeichen schickt das Paket noch einmal', Boolean(again));
  check('… und sagt Bescheid', Boolean(await sees(lena, /on its way|kommt gleich/)));
  answer(lena, ACCEPTED);
  answer(lena, LOADED);
  check('Geladen: „Abzeichen sind da“', Boolean(await sees(lena, /Badges are here|Abzeichen sind da/)));

  // ---------- Chat, Tab-Liste, über dem Kopf ----------
  lena.chat('Servus mit Abzeichen');
  const line = await until(() => lena.raw.find((r) => r.includes('Servus mit Abzeichen')));
  check(
    'Chat: Rang als Übersetzung „⚔ “ in Blau',
    Boolean(line && line.includes('"translate":"⚔ "') && /55aaff|aqua|blue/i.test(line)),
    line?.slice(0, 160),
  );
  const tab = await until(() => {
    const name = lena.players['Lena']?.displayName;
    const json = name ? JSON.stringify(name.json ?? name) : '';
    return json.includes('⚔ ') && json.includes('translate') ? json : null;
  });
  check('Tab-Liste: Übersetzung vor dem Namen', Boolean(tab), tab?.slice(0, 120));
  const team = await until(() => [...lena.mmTeams.values()].find((p) => p.includes('⚔ ')));
  check('Über dem Kopf (Team-Präfix): Übersetzung', Boolean(team && team.includes('translate')), team ?? '');

  // ---------- Serverwechsel: Abzeichen bleibt, Möbel-Paket geht ----------
  lena.removed.length = 0;
  lena.chat('/server duels');
  await sleep(6000);
  check(
    'Wechsel nach Duels: Möbel-Paket abgenommen',
    lena.removed.includes(MOEBEL),
    JSON.stringify(lena.removed),
  );
  check('… Abzeichen-Paket bleibt', !lena.removed.includes(BADGES) && !lena.removed.includes('alle'));
  lena.chat('Servus aus Duels');
  const duelsLine = await until(() => lena.raw.find((r) => r.includes('Servus aus Duels')));
  check(
    'Chat auf Duels: weiter Übersetzung',
    Boolean(duelsLine && duelsLine.includes('"translate":"⚔ "')),
    duelsLine?.slice(0, 120),
  );
  const duelsTab = await until(() => {
    const json = JSON.stringify(lena.players['Lena']?.displayName?.json ?? '');
    return json.includes('translate') ? json : null;
  });
  check('Tab-Liste auf Duels: Übersetzung', Boolean(duelsTab));
  const offersBefore = lena.packs.filter((p) => p.uuid === BADGES).length;
  lena.chat('/server lobby');
  await sleep(6000);
  check(
    'Zurück in der Lobby: kein neues Abzeichen-Angebot',
    lena.packs.filter((p) => p.uuid === BADGES).length === offersBefore,
  );

  // ---------- Rolle im Panel geändert → neue Fassung ----------
  const original = await (await fetch(`${STEUER}/rollen`)).json();
  // Moderator bekommt eine andere Farbe – wie im Panel (alles andere bleibt, auch die Rechte).
  const rolesWith = (moderatorColour) =>
    original.map((r) => (r.id === 'moderator' ? { ...r, colour: moderatorColour } : r));
  const n = lena.packs.length;
  // Moderator bekommt eine andere Farbe – wie im Panel.
  await steuer('/rollen', { roles: rolesWith('#3b82f6') });
  const newer = await offerOf(lena, n);
  check(
    'Rolle geändert → neue Fassung mit neuer SHA-1',
    Boolean(newer && newer.hash !== offer.hash),
    newer?.hash ?? '',
  );
  answer(lena, ACCEPTED);
  answer(lena, LOADED);

  // ---------- Pflicht ----------
  await steuer('/', { area: 'badges', values: { required: true } });
  const finn = await join('Finn');
  const forced = await offerOf(finn);
  // Nie „verpflichtend“ an Minecraft (sonst wirft Velocity mit einer knappen Meldung hinaus) – Pflicht steht im Fenster.
  check(
    'Pflicht: steht im Fenster',
    Boolean(forced && /brauchst|need/.test(asJson(forced.promptMessage))),
    asJson(forced?.promptMessage).slice(0, 120),
  );
  answer(finn, DECLINED);
  const kicked = await until(() => finn.kickedFor, 8000);
  check(
    'Pflicht + abgelehnt: freundlich hinaus mit Erklärung',
    Boolean(kicked && /Resource Packs|Ressourcenpakete/.test(kicked)),
    kicked?.slice(0, 140),
  );
  await steuer('/', { area: 'badges', values: { required: false } });

  // ---------- Aus und wieder an ----------
  lena.removed.length = 0;
  await steuer('/', { area: 'badges', values: { enabled: false } });
  check('Aus: Proxy nimmt das Paket ab', Boolean(await until(() => lena.removed.includes(BADGES))));
  await sleep(1000);
  lena.chat('Servus ohne Abzeichen');
  const plain = await until(() => lena.raw.find((r) => r.includes('Servus ohne Abzeichen')));
  check(
    'Aus: Chat wieder mit Symbol (keine Übersetzung)',
    Boolean(plain && plain.includes('"text":"⚔"') && !plain.includes('translate')),
    plain?.slice(0, 160),
  );
  const m = lena.packs.length;
  await steuer('/', { area: 'badges', values: { enabled: true } });
  check('Wieder an: Paket kommt wieder', Boolean(await offerOf(lena, m)));

  // Rollen wieder genau wie vorher.
  await steuer('/rollen', { roles: original });
  lena.quit();
  await sleep(500);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} grün`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
