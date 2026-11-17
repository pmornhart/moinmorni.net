/**
 * Test des Schlossmarkts mit einem echten Test-Spieler (mineflayer, Paper 26.1.2) nach einem Neubau der Lobby:
 * Jeder der zwölf Modi hat genau eine Figur, die neuen stehen am Schlossmarkt, ihr Schild zeigt Live-Zustände
 * (Wintersport „Sommerpause“, wenn er das meldet), ein Klick auf eine neue Figur schickt dem Hub `play` und der
 * antwortet („Ab nach Versteckerl …“), das Kompass-Menü zeigt zwölf Modi in mittigen Reihen.
 * Ohne Velocity spielt `apps/server/scripts/proxy-lauschen.ts` den Proxy (meldet den Test-Spieler als „in der Lobby“
 * und schreibt mit, was der Hub dem Proxy schickt) – dessen Ausgabe liest der Test (PROXY_LOG).
 * Mit MIRNI_HUB=<hub.json des MorniSMP-Servers> prüft er dazu „gerade geschlossen“ statt „Sommerpause“: MorniSMP
 * meldet „closed“ (wie beim Beenden) → Schild „Gerade geschlossen“, Klick bringt nicht hin; danach ist der Server weg
 * → Schild und Kompass „Schläft – Klick weckt“ (vorher blieb „Sommerpause“ stehen).
 *   PROXY_LOG=<datei> NODE_PATH=~/mm-cache/node/node_modules node schlossmarkt-test.cjs <host> <port> <rcon-host:port> <rcon-passwort-datei>
 */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mineflayer = require('mineflayer');

const [HOST = '127.0.0.1', PORT = '25990', RCON = '127.0.0.1:26090', PASS_FILE = '.rcon-pass'] =
  process.argv.slice(2);
const PASS = fs.readFileSync(PASS_FILE, 'utf8').trim();
const PROXY_LOG = process.env.PROXY_LOG ?? 'proxy-lauschen.log';
/** Was der Hub dem Proxy seit `from` Zeilen geschickt hat. */
const proxySaid = (from) =>
  fs.existsSync(PROXY_LOG) ? fs.readFileSync(PROXY_LOG, 'utf8').split('\n').slice(from).join(' ') : '';
const proxyLines = () =>
  fs.existsSync(PROXY_LOG) ? fs.readFileSync(PROXY_LOG, 'utf8').split('\n').length - 1 : 0;
const RCON_PY = path.join(__dirname, '../mc-client/rcon.py');
const NAME = 'Markttest';
const MODES = [
  'mornicraft',
  'duels',
  'party',
  'gipfelsturm',
  'burgverlies',
  'bollwerk',
  'mirni',
  'wolkenkampf',
  'versteckerl',
  'wintersport',
  'adlerflug',
  'angelkoenig',
];
/** Die neuen Modi stehen am Schlossmarkt (x der Standmitte, Figur bei z −32). */
const MARKET = { wolkenkampf: -20, versteckerl: 20, wintersport: -30, adlerflug: 30, angelkoenig: -40 };
/** MorniSMP steht am Dorfmarkt (Figur bei x −7,5, z 14,5, schaut nach Norden). */
const MIRNI = { x: -7.5, z: 14.5 };
const MIRNI_HUB = process.env.MIRNI_HUB;
const SERVER_DIR = path.join(__dirname, '../../apps/server');

const rcon = (...cmds) => execFileSync('python3', [RCON_PY, RCON, PASS, ...cmds], { encoding: 'utf8' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
};
/** Zahl aus „Test passed, count: 3“ (execute if entity …). */
const count = (answer) => Number(/count: (\d+)/i.exec(answer)?.[1] ?? 0); // e.g. "Test passed. Count: 3"; not "Test failed"
const plainText = (m) => (typeof m === 'string' ? m : JSON.stringify(m));

/** Was die Schilder (Text-Anzeigen) im Umkreis von 8 Blöcken gerade zeigen. */
const signsNear = (bot) =>
  Object.values(bot.entities)
    .filter((e) => e.position && e.position.distanceTo(bot.entity.position) < 8 && e.metadata)
    .flatMap((e) => e.metadata.filter((m) => m && (typeof m === 'object' || typeof m === 'string')))
    .map(plainText)
    .join(' ');

/** Kompass-Menü öffnen und den Eintrag dieses Modus als Text liefern (Name + Beschreibung; zu = graues Symbol). */
async function compassEntry(bot, name) {
  const compass = bot.inventory.items().find((i) => i.name === 'compass');
  if (!compass) return '';
  await bot.equip(compass, 'hand');
  const opened = new Promise((r) => bot.once('windowOpen', r));
  bot.activateItem();
  const win = await Promise.race([opened, wait(4000).then(() => null)]);
  if (!win) return '';
  const slot = win.slots
    .slice(0, win.inventoryStart)
    .find((s) => s && JSON.stringify(s.customName ?? '').includes(name));
  bot.closeWindow(win);
  // Name und Beschreibung stehen ab 1.21 in den Komponenten (Map – JSON.stringify(slot) zeigte sie nicht).
  return slot ? JSON.stringify([slot.customName, slot.customLore]) : '';
}

/** Welche Zustände die Schilder nennen (zum Nachlesen bei einem Fehlschlag). */
const statesIn = (signs) =>
  (
    signs.match(/(Schläft|Asleep|Sommerpause|Summer break|Gerade geschlossen|Closed right now)[^"\\]*/g) ?? []
  ).join(' | ');

/** Die Figur, die am nächsten an (x, z) steht (Modus-Figuren stehen hinter der Theke bei z −31,5). */
const figureAt = (bot, x, z) =>
  Object.values(bot.entities)
    .filter((e) => e !== bot.entity && e.name === 'mannequin' && e.position)
    .map((e) => ({ e, d: Math.hypot(e.position.x - x, e.position.z - z) }))
    .filter(({ d }) => d < 1)
    .sort((a, b) => a.d - b.d)[0]?.e;

async function main() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: NAME,
    version: '26.1',
    auth: 'offline',
  });
  const chats = [];
  bot.on('messagestr', (m) => chats.push(m));
  bot.on('kicked', (r) => console.log('gekickt:', plainText(r)));
  await new Promise((r) => bot.once('spawn', r));
  await wait(3000);
  // Der Test-Spieler steht am Marktbogen – Dorfmarkt und Schlossmarkt sind geladen.
  rcon(`tp ${NAME} 0.5 65 -22.5 180 0`);
  await wait(4000);
  // Figuren: jede genau einmal
  MODES.forEach((id) => {
    const n = count(rcon(`execute if entity @e[type=minecraft:mannequin,tag=mm_mode_${id}]`));
    check(`Figur ${id}`, n === 1, `${n}×`);
  });
  const all = count(rcon('execute if entity @e[type=minecraft:mannequin,tag=mm_mode_npc]'));
  check('genau zwölf Modus-Figuren', all === MODES.length, `${all}`);
  Object.entries(MARKET).forEach(([id, x]) => {
    const n = count(
      rcon(
        `execute if entity @e[type=minecraft:mannequin,tag=mm_mode_${id},x=${x - 2},y=63,z=-34,dx=4,dy=4,dz=4]`,
      ),
    );
    check(`${id} steht am Schlossmarkt`, n === 1);
  });
  const blume = count(rcon('execute if entity @e[type=minecraft:mannequin,tag=mm_skin_blumenfrau]'));
  check('Blumenfrau am sechsten Stand', blume === 1);

  // Schild über der Wintersport-Figur (Live vom Lobby-Plugin): Sommerpause, wenn der Modus das meldet.
  rcon(`tp ${NAME} -29.5 65 -27.5 180 0`);
  await wait(2500);
  const labels = Object.values(bot.entities).filter(
    (e) => e.position && e.position.distanceTo(bot.entity.position) < 8 && e.metadata,
  );
  const signs = labels
    .flatMap((e) => e.metadata.filter((m) => m && (typeof m === 'object' || typeof m === 'string')))
    .map(plainText)
    .join(' ');
  check(
    'Schild Wintersport: Sommerpause',
    /Sommerpause|Summer break/.test(signs),
    signs.match(/Sommerpause[^"]*/)?.[0] ?? '',
  );
  check('Schild Wintersport: Klick zum Anschauen', /Dorf anschauen|look around/.test(signs));

  // Klick auf die Versteckerl-Figur → Hub antwortet
  rcon(`tp ${NAME} 20.5 65 -28.5 180 0`);
  await wait(2500);
  const figure = figureAt(bot, 20.5, -31.5);
  check(
    'Versteckerl-Figur in Reichweite',
    Boolean(figure),
    figure ? `${figure.name} ${figure.position}` : '',
  );
  const before = proxyLines();
  if (figure) {
    await bot.lookAt(figure.position.offset(0, 1.6, 0), true);
    bot.activateEntity(figure);
  }
  await wait(3000);
  const answer = proxySaid(before);
  check('Klick: Hub antwortet mit Versteckerl', /Versteckerl/.test(answer), answer.slice(0, 200));

  // Klick auf Wintersport im Sommer: freundlicher Hinweis
  rcon(`tp ${NAME} -29.5 65 -28.5 180 0`);
  await wait(2500);
  const winter = figureAt(bot, -29.5, -31.5);
  check('Wintersport-Figur in Reichweite', Boolean(winter));
  const before2 = proxyLines();
  if (winter) {
    await bot.lookAt(winter.position.offset(0, 1.6, 0), true);
    bot.activateEntity(winter);
  }
  await wait(3000);
  const answer2 = proxySaid(before2);
  check('Klick auf Wintersport: Sommerpause-Hinweis', /Sommerpause|summer break/.test(answer2), answer2);

  if (MIRNI_HUB) await mirniClosed(bot);

  // Kompass-Menü: zwölf Modi, je Reihe mittig
  const compass = bot.inventory.items().find((i) => i.name === 'compass');
  check('Kompass in der Leiste', Boolean(compass));
  if (compass) {
    await bot.equip(compass, 'hand');
    const opened = new Promise((r) => bot.once('windowOpen', r));
    bot.activateItem();
    const win = await Promise.race([opened, wait(4000).then(() => null)]);
    check('Menü geht auf', Boolean(win));
    if (win) {
      const slots = win.slots.slice(0, win.inventoryStart);
      const modeSlots = slots
        .map((s, i) => [s, i])
        .filter(([s]) => s && !s.name.endsWith('stained_glass_pane'))
        .map(([s, i]) => ({ i, name: s.name }));
      check(
        'zwölf Modi im Menü',
        modeSlots.length === 12,
        modeSlots.map((s) => `${s.i}:${s.name}`).join(' '),
      );
      check('Menü mit vier Reihen', slots.length === 36, `${slots.length} Plätze`);
      const rows = [10, 11, 12, 13, 14, 15, 16, 20, 21, 22, 23, 24];
      check('Reihen mittig', JSON.stringify(modeSlots.map((s) => s.i)) === JSON.stringify(rows));
      check(
        'Symbole der neuen Modi',
        ['white_wool', 'hay_block', 'elytra', 'fishing_rod'].every((n) =>
          modeSlots.some((s) => s.name === n),
        ),
      );
      bot.closeWindow(win);
    }
  }
  bot.quit();
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} bestanden`);
  process.exit(ok === results.length ? 0 : 1);
}

/**
 * MorniSMP meldet „closed“ (das tut es beim Beenden): kein Saison-Modus → „Gerade geschlossen“, nie „Sommerpause“,
 * ein Klick bringt nicht hin. Ist der Server danach weg, schläft der Modus – die alte Meldung gilt nicht mehr.
 */
async function mirniClosed(bot) {
  // Eigene Prozessgruppe: npx gibt ein Beenden nicht an tsx weiter, darum später die ganze Gruppe beenden.
  const melder = spawn('npx', ['tsx', 'scripts/modus-melden.ts', MIRNI_HUB, 'mirni', 'closed'], {
    cwd: SERVER_DIR,
    stdio: 'ignore',
    detached: true,
  });
  await wait(8000);
  rcon(`tp ${NAME} ${MIRNI.x} 65 ${MIRNI.z - 3} 0 0`);
  await wait(3000);
  const closed = signsNear(bot);
  check(
    'Schild MorniSMP gemeldet „closed“: gerade geschlossen',
    /Gerade geschlossen|Closed right now/.test(closed),
    statesIn(closed),
  );
  check('Schild MorniSMP: keine Sommerpause', !/Sommerpause|Summer break/.test(closed));
  const smp = figureAt(bot, MIRNI.x, MIRNI.z);
  check('MorniSMP-Figur in Reichweite', Boolean(smp));
  const before = proxyLines();
  if (smp) {
    await bot.lookAt(smp.position.offset(0, 1.6, 0), true);
    bot.activateEntity(smp);
  }
  await wait(3000);
  const answer = proxySaid(before);
  check(
    'Klick auf MorniSMP (zu): „gerade geschlossen“',
    /gerade geschlossen|closed right now/.test(answer),
    answer.slice(0, 200),
  );
  check('Klick auf MorniSMP (zu): bleibt in der Lobby', !/"t":"connect"/.test(answer));
  const entryClosed = await compassEntry(bot, 'MorniSMP');
  check(
    'Kompass MorniSMP: gerade geschlossen',
    /Gerade geschlossen/.test(entryClosed) && !/Sommerpause|Klick: Mitspielen/.test(entryClosed),
    entryClosed.slice(0, 300),
  );

  process.kill(-melder.pid, 'SIGTERM');
  await wait(5000);
  const asleep = signsNear(bot);
  check(
    'Schild MorniSMP nach dem Beenden: schläft',
    /Schläft|Asleep/.test(asleep) && !/Sommerpause|Summer break|Gerade geschlossen/.test(asleep),
    statesIn(asleep),
  );
  const entryAsleep = await compassEntry(bot, 'MorniSMP');
  check(
    'Kompass MorniSMP nach dem Beenden: schläft',
    /Schläft/.test(entryAsleep) && !/Sommerpause|Gerade geschlossen/.test(entryAsleep),
    entryAsleep.slice(0, 300),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
