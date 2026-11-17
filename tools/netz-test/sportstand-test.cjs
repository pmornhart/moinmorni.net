/**
 * Echter Test des Sport-Stands am Schlossmarkt (Paper 26.1.2 + Netzwerk-Plugin + Test-Hub): Wintersport und
 * Sommerspiele teilen sich einen Stand – Skihütte mit Skifahrerin oder Bootshaus mit Ruderin. Prüft jeden Block, den
 * der Umbau ändert (aus `apps/server/scripts/sport-stand-plan.ts`), den Merker, Figur und Schild, den Kompass (nur der
 * Modus am Stand) und den Klick – erst so, wie der Hub es von selbst entscheidet (Saison bzw. Meldungen der Modi),
 * dann fest eingestellt im Panel (Steuerung des Test-Hubs), dann über die Meldungen der Modi (Winter- bzw.
 * Sommerpause) und wieder zurück.
 *   SPORT_PLAN=<json> STATE_DIR=<ordner mit winter.state/sommer.state> MM_STEUER=http://127.0.0.1:<port>/ \
 *   PROXY_LOG=<datei> NODE_PATH=~/mm-cache/node/node_modules node sportstand-test.cjs <host> <port> <rcon> <passwort-datei>
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mineflayer = require('mineflayer');

const [HOST = '127.0.0.1', PORT = '25990', RCON = '127.0.0.1:26090', PASS_FILE = '.rcon-pass'] =
  process.argv.slice(2);
const PASS = fs.readFileSync(PASS_FILE, 'utf8').trim();
const PLAN = JSON.parse(fs.readFileSync(process.env.SPORT_PLAN ?? 'sport-plan.json', 'utf8'));
const STATE_DIR = process.env.STATE_DIR;
const STEUER = process.env.MM_STEUER;
const PROXY_LOG = process.env.PROXY_LOG ?? 'proxy-lauschen.log';
const RCON_PY = path.join(__dirname, '../mc-client/rcon.py');
const NAME = 'Markttest';
const [SX, SY, SZ] = PLAN.stand.sentinel;
const [CX, , CZ] = PLAN.stand.center;
const ICON = { wintersport: 'oak_boat', sommerspiele: 'sunflower' };
const BREAK = { wintersport: /Sommerpause|Summer break/, sommerspiele: /Winterpause|Winter break/ };

const rcon = (...cmds) => execFileSync('python3', [RCON_PY, RCON, PASS, ...cmds], { encoding: 'utf8' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
};
const count = (answer) => Number(/count: (\d+)/i.exec(answer)?.[1] ?? 0);
const plainText = (m) => (typeof m === 'string' ? m : JSON.stringify(m));
const proxyLines = () =>
  fs.existsSync(PROXY_LOG) ? fs.readFileSync(PROXY_LOG, 'utf8').split('\n').length - 1 : 0;
const proxySaid = (from) =>
  fs.existsSync(PROXY_LOG) ? fs.readFileSync(PROXY_LOG, 'utf8').split('\n').slice(from).join(' ') : '';

/** Wie viele der erwarteten Blöcke eines Stands wirklich dastehen (in Portionen über RCON). */
function blocksOk(look) {
  const want = PLAN[look];
  const cmds = want.map(
    ([x, y, z, b]) => `execute if block ${x} ${y} ${z} ${b.startsWith('minecraft:') ? b : `minecraft:${b}`}`,
  );
  const ok = [];
  for (let i = 0; i < cmds.length; i += 60) {
    const out = rcon(...cmds.slice(i, i + 60));
    ok.push(...out.split('\n').filter((l) => /Test passed/i.test(l)));
  }
  return { ok: ok.length, of: want.length };
}
const sentinel = () =>
  /Test passed/i.test(rcon(`execute if block ${SX} ${SY} ${SZ} minecraft:sandstone`))
    ? 'sommerspiele'
    : /Test passed/i.test(rcon(`execute if block ${SX} ${SY} ${SZ} minecraft:packed_ice`))
      ? 'wintersport'
      : '?';
const figures = (id) => count(rcon(`execute if entity @e[type=minecraft:mannequin,tag=mm_mode_${id}]`));

async function until(fn, ms = 40000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(1500);
  }
  return false;
}

async function compass(bot) {
  const item = bot.inventory.items().find((i) => i.name === 'compass');
  if (!item) return [];
  await bot.equip(item, 'hand');
  const opened = new Promise((r) => bot.once('windowOpen', r));
  bot.activateItem();
  const win = await Promise.race([opened, wait(4000).then(() => null)]);
  if (!win) return [];
  const names = win.slots
    .slice(0, win.inventoryStart)
    .filter((s) => s && !s.name.endsWith('stained_glass_pane'))
    .map((s) => s.name);
  bot.closeWindow(win);
  return names;
}

const signsNear = (bot) =>
  Object.values(bot.entities)
    .filter((e) => e.position && e.position.distanceTo(bot.entity.position) < 8 && e.metadata)
    .flatMap((e) => e.metadata.filter((m) => m && (typeof m === 'object' || typeof m === 'string')))
    .map(plainText)
    .join(' ');

async function steuer(values) {
  await fetch(STEUER, { method: 'POST', body: JSON.stringify({ area: 'lobby', values }) });
}
function states(winter, sommer) {
  fs.writeFileSync(path.join(STATE_DIR, 'winter.state'), winter);
  fs.writeFileSync(path.join(STATE_DIR, 'sommer.state'), sommer);
}

/** Alles, was zu einem Stand gehört, prüfen – `breakShown`: zeigt das Schild die Saison-Pause? */
async function standIs(bot, look, label, breakShown) {
  const other = look === 'wintersport' ? 'sommerspiele' : 'wintersport';
  const switched = await until(
    () => sentinel() === look && figures(look) === 1 && figures(other) === 0,
    60000,
  );
  check(
    `${label}: Merker und Figur ${look}`,
    switched,
    `Merker ${sentinel()}, ${look} ${figures(look)}×, ${other} ${figures(other)}×`,
  );
  const b = blocksOk(look);
  check(`${label}: alle ${b.of} Blöcke des Stands`, b.ok === b.of, `${b.ok}/${b.of}`);
  const near = count(
    rcon(
      `execute if entity @e[type=minecraft:mannequin,tag=mm_mode_${look},x=${CX - 1},y=63,z=${CZ - 1},dx=2,dy=4,dz=2]`,
    ),
  );
  check(`${label}: Figur steht hinter der Theke`, near === 1);
  const other_deko = count(rcon(`execute if entity @e[tag=mm_sport_${other}]`));
  check(`${label}: keine Deko des anderen Stands`, other_deko === 0, `${other_deko}`);
  const deko = count(rcon(`execute if entity @e[tag=mm_sport_${look}]`));
  check(`${label}: Deko und Schild da`, deko > 5, `${deko} Wesen`);
  rcon(`tp ${NAME} ${CX} 65 ${CZ + 4} 180 0`);
  await wait(3000);
  const signs = signsNear(bot);
  const name = look === 'wintersport' ? 'Wintersport' : 'Sommerspiele';
  check(`${label}: Schild „${name}“`, signs.includes(name));
  check(
    `${label}: Schild ${breakShown ? 'mit' : 'ohne'} Saison-Pause`,
    breakShown ? BREAK[look].test(signs) : !BREAK[look].test(signs),
    (signs.match(/(Sommerpause|Winterpause|spielen|spielt|Schläft)[^"\\]*/g) ?? []).join(' | '),
  );
  const menu = await compass(bot);
  check(
    `${label}: Kompass mit ${look}, ohne ${other}`,
    menu.includes(ICON[look]) && !menu.includes(ICON[other]) && menu.length === 15,
    `${menu.length} Modi`,
  );
  const fig = Object.values(bot.entities).find(
    (e) => e.name === 'mannequin' && e.position && Math.hypot(e.position.x - CX, e.position.z - CZ) < 1,
  );
  const before = proxyLines();
  if (fig) {
    await bot.lookAt(fig.position.offset(0, 1.6, 0), true);
    bot.activateEntity(fig);
  }
  await wait(3000);
  check(
    `${label}: Klick bringt nach ${name}`,
    new RegExp(name).test(proxySaid(before)),
    proxySaid(before).slice(0, 160),
  );
}

async function main() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: NAME,
    version: '26.1',
    auth: 'offline',
  });
  bot.on('kicked', (r) => console.log('gekickt:', plainText(r)));
  await new Promise((r) => bot.once('spawn', r));
  await wait(3000);
  rcon(`tp ${NAME} ${CX} 65 ${CZ + 4} 180 0`);
  await wait(3000);

  // 1. Von selbst: Wintersport meldet Sommerpause → Bootshaus mit Ruderin
  states('closed', 'waiting');
  await steuer({ sportStand: 'auto' });
  await standIs(bot, 'sommerspiele', 'Sommer (von selbst)', false);
  // 2. Fest im Panel: Wintersport (mit Sommerpause auf dem Schild)
  await steuer({ sportStand: 'wintersport' });
  await standIs(bot, 'wintersport', 'Panel fest Wintersport', true);
  // 3. Von selbst über die Meldungen: Sommerspiele haben Winterpause, Wintersport ist offen → Skihütte bleibt
  states('waiting', 'closed');
  await wait(25000);
  await steuer({ sportStand: 'auto' });
  await wait(8000);
  await standIs(bot, 'wintersport', 'Winter (von selbst)', false);
  // 4. Zurück: Wintersport wieder Sommerpause → Bootshaus
  states('closed', 'waiting');
  await standIs(bot, 'sommerspiele', 'wieder Sommer', false);

  bot.quit();
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} bestanden`);
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
