/**
 * Netzwerk-Test mit echten Servern: Test-Spieler (mineflayer) gehen über den Velocity-Proxy ins Netzwerk und
 * prüfen Chat über Server hinweg, /msg, /mute, /ban, Rechte, Tab-Vorschläge, Rang in der Tab-Liste und MOTD.
 *   NODE_PATH=<ordner mit mineflayer> node tools/netz-test/netz-test.cjs [host] [port]
 * Erwartet: Proxy mit Servern „lobby“ und „duels“, Hub mit Philip = owner (scripts/hub-dev.ts --rang=Philip=owner).
 * Mit NETZ_EIN_SERVER=1 reicht die Lobby allein (ein Spielserver gleichzeitig) – dann ohne die Prüfungen über zwei
 * Server hinweg.
 */
const mineflayer = require('mineflayer');
const mc = require('minecraft-protocol');

const HOST = process.argv[2] ?? '127.0.0.1';
const PORT = Number(process.argv[3] ?? 25620);
const VERSION = process.env.MC_VERSION ?? '1.21.11';
const ONE_SERVER = process.env.NETZ_EIN_SERVER === '1';
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
    const bot = mineflayer.createBot({ host: HOST, port: PORT, username, version: VERSION, auth: 'offline', physicsEnabled: false });
    bot.lines = [];
    bot.on('messagestr', (m) => bot.lines.push(m));
    bot.once('spawn', () => resolve(bot));
    bot.once('kicked', (reason) => reject(new Error(`kicked: ${plain(reason)}`)));
    bot.once('error', reject);
  });
}

/** Wartet, bis der Bot eine Zeile sieht, die passt. */
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

/** Anmeldung, die abgelehnt werden soll: liefert den Text des Rauswurfs. */
async function refused(username) {
  await gap();
  return new Promise((resolve) => {
    const bot = mineflayer.createBot({ host: HOST, port: PORT, username, version: VERSION, auth: 'offline', physicsEnabled: false });
    bot.once('spawn', () => {
      bot.quit();
      resolve(null);
    });
    bot.once('kicked', (reason) => resolve(plain(reason)));
    bot.once('error', () => resolve('error'));
  });
}

async function main() {
  const ping = await mc.ping({ host: HOST, port: PORT });
  const motd = JSON.stringify(ping.description);
  check('MOTD kommt aus dem Panel', motd.includes('morni.net'), motd.slice(0, 80));
  check('Spielerzahl aus dem Panel', ping.players.max === 200, `max ${ping.players.max}`);

  const philip = await join('Philip');
  const lena = await join('Lena');
  await sleep(1500);

  const entry = philip.players['Lena'];
  const self = lena.players['Philip'];
  check('Rang-Symbol in der Tab-Liste', self && JSON.stringify(self.displayName?.json ?? self.displayName).includes('♛'), JSON.stringify(self?.displayName?.json ?? '').slice(0, 80));
  check('Spieler ohne Rang ohne Symbol', entry && !JSON.stringify(entry.displayName?.json ?? '').includes('♛'));

  if (ONE_SERVER) {
    lena.chat('Servus aus der Lobby');
    const line = await sees(philip, /Servus aus der Lobby/);
    check('Chat kommt über den Hub an', Boolean(line), line ?? '');
  } else {
    lena.chat('/server duels');
    await sleep(2500);
    lena.chat('Servus aus Duels');
    const line = await sees(philip, /Servus aus Duels/);
    check('Chat kommt über Server hinweg an (Duels → Lobby)', Boolean(line), line ?? '');
    check('Chat zeigt den Server', Boolean(line && /\[Duels\]/.test(line)));
  }

  philip.chat('Hallo <red>Lena');
  const own = await sees(lena, /Hallo/);
  check('Chat mit Rang, Tags werden nicht ausgeführt', Boolean(own && own.includes('♛ Philip') && own.includes('<red>')), own ?? '');

  philip.chat('/msg Lena Kommst du in die Lobby?');
  const whisper = await sees(lena, /Philip → (you|dich)/);
  check(ONE_SERVER ? '/msg' : '/msg über Server hinweg', Boolean(whisper), whisper ?? '');
  lena.chat('/r Gleich!');
  check('/r antwortet', Boolean(await sees(philip, /Lena → (dich|you).*Gleich/)));

  lena.chat('/ban Philip');
  check('Spieler darf nicht bannen', Boolean(await sees(lena, /not allowed|nicht/)));

  const tab = await philip.tabComplete('/ban L');
  const names = tab.map((t) => (typeof t === 'string' ? t : t.match));
  check('Tab-Vorschläge kommen vom Hub', names.includes('Lena'), JSON.stringify(names));

  philip.chat('/mute Lena 10m Spam');
  check('/mute: Lena erfährt es', Boolean(await sees(lena, /muted|stummgeschaltet/)));
  lena.chat('Bin ich stumm?');
  check('Stumm: Chat wird geblockt', Boolean(await sees(lena, /You are muted|Du bist stumm/)));
  check('Stumm: andere sehen nichts', !(await sees(philip, /Bin ich stumm/, 1500)));
  philip.chat('/unmute Lena');
  check('/unmute', Boolean(await sees(lena, /chat again|wieder schreiben/)));

  const kicked = new Promise((resolve) => lena.once('kicked', (r) => resolve(plain(r))));
  philip.chat('/ban Lena 1h Testbann');
  const kickText = await Promise.race([kicked, sleep(4000).then(() => null)]);
  check('/ban wirft raus mit Grund', Boolean(kickText && kickText.includes('Testbann')), (kickText ?? '').slice(0, 120));
  check('Team bekommt Hinweis', Boolean(await sees(philip, /banned|gebannt/)));
  await sleep(1000);
  const again = await refused('Lena');
  check('Gebannt: Anmeldung wird abgelehnt', Boolean(again && again.includes('Testbann')), (again ?? 'kam rein').slice(0, 120));
  philip.chat('/unban Lena');
  await sleep(1000);
  const back = await join('Lena').then((b) => b, () => null);
  check('/unban: Lena kommt wieder rein', Boolean(back));
  back?.quit();

  philip.chat('/strafen Lena');
  check('/strafen zeigt den Verlauf', Boolean(await sees(philip, /Testbann/)));

  philip.quit();
  await sleep(500);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} bestanden`);
  process.exit(failed ? 1 : 0);
}

setTimeout(() => {
  console.log('Zeit abgelaufen');
  process.exit(2);
}, 90_000);
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
