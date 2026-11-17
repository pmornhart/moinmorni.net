/**
 * Ein Paket fürs ganze Netzwerk echt prüfen: Test-Spieler (mineflayer) gehen über den Velocity-Proxy ins Netzwerk.
 * Erwartet wird: beim Betreten genau EIN Angebot je Paket (Netzwerk-Paket + Abzeichen-Paket, beide vom Proxy), beim
 * Wechsel Lobby → Duels → Angelkönig → Lobby kein neues Angebot und keine Abnahme – auch wenn Lobby und Angelkönig in
 * ihrer server.properties noch ihr altes Paket stehen haben (der Proxy lässt es nicht durch). Dazu: Angelkönig 0.2.2
 * weiß aus den Metadaten, wer das Paket hat; abgelehnt → Hinweis, /paket → neues Angebot, Pflicht → hinaus.
 *   NODE_PATH=<ordner mit mineflayer> MM_STEUER=http://127.0.0.1:<port> MM_ANGEL_RCON=127.0.0.1:<port>:<passwort>
 *     node tools/netz-test/netzpaket-test.cjs [host] [port]
 * Erwartet: Proxy mit „lobby“, „duels“, „angelkoenig“ (Angelkönig ab 0.2.2, paket.json {"netz": true}), Hub aus
 * scripts/hub-dev.ts mit --steuer=<port> (liefert die Pakete).
 */
const crypto = require('node:crypto');
const net = require('node:net');
const mineflayer = require('mineflayer');

const HOST = process.argv[2] ?? '127.0.0.1';
const PORT = Number(process.argv[3] ?? 27400);
const STEUER = process.env.MM_STEUER ?? 'http://127.0.0.1:27406';
const ANGEL_RCON = process.env.MM_ANGEL_RCON ?? '';
const VERSION = process.env.MC_VERSION ?? '26.1';
const NETZ = '6d6f696e-6d6f-726e-692d-6e65747a7061';
const BADGES = '6d6f696e-6d6f-726e-692d-626164676573';
const OLD = ['6d6f696e-6d6f-726e-692d-6d6f6562656c', '6d6f696e-6d6f-726e-692d-616e67656c6b'];
const LOADED = 0;
const DECLINED = 1;
const ACCEPTED = 3;
const DOWNLOADED = 4;
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` – ${detail}` : ''}`);
}

const LOGIN_GAP_MS = 3500;
let lastLogin = 0;
async function gap() {
  const wait = lastLogin + LOGIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastLogin = Date.now();
}

/** Ein Test-Spieler: schreibt jedes Angebot und jede Abnahme mit; antwortet wie gewünscht (`mode`). */
async function join(username, mode = 'load') {
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
  bot.packs = [];
  bot.removed = [];
  bot.kickedFor = null;
  bot.answerMode = mode;
  bot.on('messagestr', (m) => bot.lines.push(m));
  bot._client.on('add_resource_pack', (p) => {
    const uuid = String(p.uuid);
    bot.packs.push({ ...p, uuid, state: bot._client.state, at: Date.now() });
    const reply = (result) => bot._client.write('resource_pack_receive', { uuid, result });
    if (bot.answerMode === 'decline') {
      reply(DECLINED);
      return;
    }
    reply(ACCEPTED);
    reply(DOWNLOADED);
    reply(LOADED);
  });
  bot._client.on('remove_resource_pack', (p) =>
    bot.removed.push(p.uuid === undefined ? 'alle' : String(p.uuid)),
  );
  bot.on('kicked', (reason) => (bot.kickedFor = JSON.stringify(reason)));
  await new Promise((resolve, reject) => {
    bot.once('spawn', resolve);
    bot.once('kicked', (reason) => reject(new Error(`kicked: ${JSON.stringify(reason)}`)));
    bot.once('error', reject);
  });
  return bot;
}

async function until(get, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const found = get();
    if (found) return found;
    await sleep(150);
  }
  return null;
}
const sees = (bot, match, ms) => until(() => bot.lines.find((l) => match.test(l)), ms);
const offers = (bot, id) => bot.packs.filter((p) => p.uuid === id).length;

async function steuer(path, body) {
  const res = await fetch(`${STEUER}${path}`, { method: 'POST', body: JSON.stringify(body) });
  return res.json();
}

/** Ein RCON-Befehl (Minecraft-RCON: Anmelden, Befehl, Antwort). */
function rcon(target, command) {
  const [host, port, pass] = target.split(':');
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(port), host);
    const packet = (id, type, body) => {
      const b = Buffer.from(body, 'utf8');
      const out = Buffer.alloc(14 + b.length);
      out.writeInt32LE(10 + b.length, 0);
      out.writeInt32LE(id, 4);
      out.writeInt32LE(type, 8);
      b.copy(out, 12);
      return out;
    };
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 4 && buf.length >= buf.readInt32LE(0) + 4) {
        const len = buf.readInt32LE(0);
        const id = buf.readInt32LE(4);
        const body = buf.subarray(12, 4 + len - 2).toString('utf8');
        buf = buf.subarray(4 + len);
        if (id === 1) sock.write(packet(2, 2, command));
        else if (id === 2) {
          sock.end();
          resolve(body);
        }
      }
    });
    sock.on('error', reject);
    sock.on('connect', () => sock.write(packet(1, 3, pass)));
  });
}

async function to(bot, server) {
  const arrived = new Promise((resolve) => {
    bot.once('respawn', resolve);
    bot.once('login', resolve);
    setTimeout(resolve, 20000);
  });
  bot.chat(`/server ${server}`);
  await arrived;
  await sleep(2500);
}

async function main() {
  await steuer('/', { area: 'badges', values: { enabled: true } });
  await steuer('/', { area: 'network', values: { packRequired: false } });

  // ---------- Betreten: einmal beide Pakete vom Proxy ----------
  const anna = await join('Anna');
  const netz = await until(() => anna.packs.find((p) => p.uuid === NETZ), 15000);
  check('Netzwerk-Paket kommt beim Betreten (vom Proxy)', Boolean(netz), netz?.url ?? '');
  check(
    'Abzeichen-Paket kommt daneben',
    Boolean(await until(() => anna.packs.find((p) => p.uuid === BADGES))),
  );
  await sleep(2000);
  check(
    'genau EIN Angebot je Paket, kein altes Lobby-Paket (Proxy lässt es nicht durch)',
    offers(anna, NETZ) === 1 && offers(anna, BADGES) === 1 && anna.packs.length === 2,
    anna.packs.map((p) => p.uuid.slice(-8)).join(', '),
  );
  const zip = Buffer.from(await (await fetch(netz.url)).arrayBuffer());
  const sha1 = crypto.createHash('sha1').update(zip).digest('hex');
  check('Paket von der Adresse passt zur SHA-1', sha1 === netz.hash, `${(zip.length / 1e6).toFixed(1)} MB`);
  check('nicht verpflichtend (Panel: aus)', netz.forced === false);
  const text = zip.toString('latin1');
  check(
    'enthält Möbel, Fische, Musik – und keinen einzigen Blockzustand',
    text.includes('models/block/moebel/stuhl.json') &&
      text.includes('models/item/fisch/hecht.json') &&
      text.includes('sounds/lobby/musik/') &&
      !text.includes('assets/minecraft/blockstates/'),
  );

  // ---------- Wechsel: nichts Neues, nichts weg ----------
  const before = anna.packs.length;
  await to(anna, 'duels');
  await to(anna, 'angelkoenig');
  await to(anna, 'lobby');
  await to(anna, 'angelkoenig');
  check(
    'Wechsel Lobby → Duels → Angelkönig → Lobby → Angelkönig: kein neues Angebot',
    anna.packs.length === before,
    `${anna.packs.length - before} neue`,
  );
  check(
    '… und nichts abgenommen',
    anna.removed.filter((r) => r === 'alle' || r === NETZ || r === BADGES).length === 0,
    JSON.stringify(anna.removed),
  );
  check(
    '… kein altes Server-Paket (Angelkönig-Eintrag in der server.properties)',
    !anna.packs.some((p) => OLD.includes(p.uuid)),
  );

  if (ANGEL_RCON) {
    const status = await rcon(ANGEL_RCON, 'angeladmin status');
    check(
      'Angelkönig weiß über die Metadaten: Anna hat das Paket',
      /Anna[^\n]*paket=true/.test(status),
      status.slice(0, 200),
    );
  }

  // ---------- Ablehnen, /paket, Pflicht ----------
  const bert = await join('Bert', 'decline');
  check(
    'Abgelehnt: Hinweis auf /paket',
    Boolean(await sees(bert, /Without our pack|Ohne unser Paket/, 10000)),
  );
  if (ANGEL_RCON) {
    await to(bert, 'angelkoenig');
    const status = await rcon(ANGEL_RCON, 'angeladmin status');
    check('Angelkönig: Bert hat es nicht', /Bert[^\n]*paket=false/.test(status), status.slice(0, 200));
  }
  bert.answerMode = 'load';
  const had = offers(bert, NETZ);
  bert.chat('/pack');
  check(
    '/paket schickt das Netzwerk-Paket noch einmal',
    Boolean(await until(() => offers(bert, NETZ) > had)),
  );
  check('… geladen: „Paket geladen“', Boolean(await sees(bert, /Pack loaded|Paket geladen/)));
  if (ANGEL_RCON) {
    const status = await until(async () => null, 3000);
    void status;
    const now = await rcon(ANGEL_RCON, 'angeladmin status');
    check('Angelkönig zieht nach: Bert hat es jetzt', /Bert[^\n]*paket=true/.test(now), now.slice(0, 200));
  }
  bert.quit();

  await steuer('/', { area: 'network', values: { packRequired: true } });
  await sleep(1000);
  await gap();
  const carl = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: 'Carl',
    version: VERSION,
    auth: 'offline',
    physicsEnabled: false,
  });
  carl.packs = [];
  const kicked = new Promise((resolve) => {
    carl.on('kicked', (r) => resolve(JSON.stringify(r)));
    setTimeout(() => resolve(null), 25000);
  });
  carl._client.on('add_resource_pack', (p) => {
    carl.packs.push(p);
    if (String(p.uuid) === NETZ)
      carl._client.write('resource_pack_receive', { uuid: String(p.uuid), result: DECLINED });
  });
  carl.on('error', () => undefined);
  const reason = await kicked;
  check(
    'Pflicht: Netzwerk-Paket abgelehnt → freundlich hinaus',
    Boolean(reason && /Resource Packs/.test(reason)),
    reason?.slice(0, 120) ?? '',
  );
  const prompt =
    carl.packs.find((p) => String(p.uuid) === NETZ)?.promptMessage ??
    carl.packs.find((p) => String(p.uuid) === NETZ)?.prompt;
  check(
    '… das Fenster sagt, dass es Pflicht ist',
    JSON.stringify(prompt ?? '').includes('need our pack') ||
      JSON.stringify(prompt ?? '').includes('brauchst du'),
  );
  await steuer('/', { area: 'network', values: { packRequired: false } });

  anna.quit();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} grün`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
