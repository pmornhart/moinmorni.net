/**
 * Test der Lobby-Funktionen mit einem echten Test-Spieler (mineflayer, Paper 26.1.2 – darauf darf er sich bewegen):
 * Ankunft am Platz, Begrüßung, Ankündigungs-Leiste, Kompass + Buch, Menü, Rundgang, Launchpad, Parkour mit
 * Kontrollpunkt/Sturz/Ziel/Bestenliste, kein Schaden.
 *   NODE_PATH=~/mm-cache/node/node_modules node lobby-test.cjs <host> <port> <rcon-host:port> <rcon-passwort-datei>
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mineflayer = require('mineflayer');

const [HOST = '127.0.0.1', PORT = '25640', RCON = '127.0.0.1:25740', PASS_FILE = '.rcon-pass'] =
  process.argv.slice(2);
const PASS = fs.readFileSync(PASS_FILE, 'utf8').trim();
const RCON_PY = path.join(__dirname, '../mc-client/rcon.py');
const NAME = `Lobbytest${Date.now() % 1000}`;

const rcon = (...cmds) => execFileSync('python3', [RCON_PY, RCON, PASS, ...cmds], { encoding: 'utf8' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
};
const near = (pos, x, y, z, d = 0.8) =>
  Math.abs(pos.x - x) < d && Math.abs(pos.y - y) < d && Math.abs(pos.z - z) < d;
/** Text aus Chat-Komponenten (String, JSON-Text oder NBT-Objekt) – alle Textteile zusammen. */
const plain = (m) => {
  if (m == null) return '';
  if (typeof m === 'string') {
    try {
      return plain(JSON.parse(m));
    } catch {
      return m;
    }
  }
  if (typeof m.toString === 'function' && m.toString !== Object.prototype.toString) return m.toString();
  return (
    JSON.stringify(m)
      .match(/"(?:text|translate)":"([^"]*)"/g)
      ?.join(' ') ?? JSON.stringify(m)
  ); // eslint-disable-line -- collects text parts: '{"text":"Hi"}' → '"text":"Hi"'
};

async function main() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: NAME,
    version: '26.1',
    auth: 'offline',
  });
  const titles = [];
  const chats = [];
  const bars = [];
  const actionbars = [];
  bot.on('title', (t) => titles.push(plain(t)));
  bot.on('messagestr', (m, pos) => (pos === 'game_info' ? actionbars : chats).push(m));
  bot.on('actionBar', (m) => actionbars.push(plain(m)));
  bot.on('bossBarCreated', (b) => bars.push(plain(b.title)));
  bot.on('bossBarUpdated', (b) => bars.push(plain(b.title)));
  bot.on('kicked', (r) => console.log('gekickt:', plain(r)));
  // Rohe Pakete: Titel, Aktionsleiste, Sounds, Schub vom Server
  const sounds = [];
  const pushes = [];
  bot._client.on('set_title_text', (p) => titles.push(JSON.stringify(p)));
  bot._client.on('system_chat', (p) => {
    if (p.isActionBar || p.overlay) actionbars.push(JSON.stringify(p.content ?? p));
  });
  bot._client.on('action_bar', (p) => actionbars.push(JSON.stringify(p)));
  bot._client.on('sound_effect', (p) => sounds.push(JSON.stringify(p.sound ?? p.soundId ?? p).slice(0, 120)));
  bot.on('soundEffectHeard', (name) => sounds.push(String(name)));
  bot._client.on('entity_velocity', (p) => {
    if (p.entityId === bot.entity?.id) pushes.push(p);
  });
  await new Promise((r) => bot.once('spawn', r));
  await wait(2500);

  check(
    'Ankunft am Dorfplatz',
    near(bot.entity.position, 9.5, 65, 12.5),
    JSON.stringify(bot.entity.position),
  );
  const hotbar0 = bot.inventory.slots[36];
  const hotbar8 = bot.inventory.slots[44];
  check('Kompass in der Leiste', hotbar0?.name === 'compass', hotbar0?.name);
  check('Buch (Rundgang) in der Leiste', hotbar8?.name === 'writable_book', hotbar8?.name);
  check(
    'Begrüßung als Titel',
    titles.some((t) => t.includes('Servus auf morni.net')),
    titles.slice(0, 2).join(' | '),
  );
  check(
    'Ankündigungs-Leiste',
    bars.some((b) => b.length > 0),
    bars[0],
  );

  // Neue Spieler bekommen den Rundgang (Zuschauer-Modus, Stationen)
  await wait(4000);
  check('Rundgang startet für Neue', bot.game.gameMode === 'spectator', bot.game.gameMode);
  await wait(7500);
  check(
    'Rundgang: zweite Station',
    near(bot.entity.position, 0.5, 66, -18, 1.5),
    JSON.stringify(bot.entity.position),
  );
  bot.chat('/rundgang stop');
  await wait(1500);
  check(
    'Rundgang beenden → Abenteuer am Platz',
    bot.game.gameMode === 'adventure' && near(bot.entity.position, 9.5, 65, 12.5),
  );

  // Kompass-Menü
  bot.setQuickBarSlot(0);
  const opened = new Promise((r) => {
    bot.once('windowOpen', r);
    setTimeout(() => r(null), 4000);
  });
  bot.activateItem();
  const win = await opened;
  const modeItems = win ? win.slots.slice(0, 27).filter(Boolean) : [];
  check(
    'Kompass öffnet das Menü mit den Modi',
    modeItems.length >= 5,
    modeItems.map((i) => i.name).join(','),
  );
  if (win) bot.closeWindow(win);
  await wait(500);

  // Launchpad: vor die Platte stellen, drauflaufen
  rcon(`tp ${NAME} -13.5 65 -22.5 180 0`);
  await wait(1200);
  bot.setControlState('forward', true);
  await wait(1100);
  bot.setControlState('forward', false);
  await wait(600);
  const flying = bot.entity.position;
  check(
    'Launchpad schießt Richtung Schloss',
    flying.y > 67 || flying.z < -32 || pushes.length > 0,
    `${JSON.stringify(flying)} Schub-Pakete: ${pushes.length} Sounds: ${sounds.filter((s) => s.includes('firework')).length}`,
  );
  await wait(4000);

  // Parkour: Hilfsblöcke (Barriere) neben Start, Kontrollpunkt, oben und Ziel – draufstellen, hineinlaufen
  const walkOnto = async (bx, by, bz, fromX) => {
    rcon(`setblock ${fromX} ${by} ${bz} barrier`, `tp ${NAME} ${fromX + 0.5} ${by + 1} ${bz + 0.5} 90 0`);
    await wait(1200);
    bot.setControlState('forward', true);
    await wait(450);
    bot.setControlState('forward', false);
    await wait(900);
    rcon(`setblock ${fromX} ${by} ${bz} air`);
  };
  actionbars.length = 0;
  chats.length = 0;
  await walkOnto(-56, 64, -36, -55);
  check(
    'Parkour startet',
    actionbars.some((a) => a.includes('Los geht') || a.includes('⏱')),
    actionbars.slice(-2).join(' | '),
  );
  await walkOnto(-66, 66, -36, -65);
  check(
    'Kontrollpunkt erreicht',
    chats.some((c) => c.includes('Kontrollpunkt 1')),
    chats.slice(-1)[0],
  );
  await walkOnto(-66, 74, -36, -65);
  // Runterspringen: zurück auf den letzten Kontrollpunkt
  rcon(`tp ${NAME} -70.5 76 -36.5`);
  await wait(3500);
  check(
    'Sturz → zurück zum Kontrollpunkt',
    near(bot.entity.position, -65.5, 75, -35.5, 1.2),
    JSON.stringify(bot.entity.position),
  );
  await walkOnto(-66, 76, -46, -65);
  check(
    'Ziel: Geschafft + Bestzeit',
    titles.some((t) => t.includes('Geschafft')) && chats.some((c) => c.includes('Bestzeit')),
    chats.slice(-2).join(' | '),
  );
  chats.length = 0;
  bot.chat('/parkour');
  await wait(1200);
  check(
    'Bestenliste mit dem Test-Spieler',
    chats.some((c) => c.includes(NAME)),
    chats.slice(0, 3).join(' | '),
  );

  // Kein Schaden in der Lobby
  rcon(`damage ${NAME} 6`);
  await wait(800);
  check('Kein Schaden in der Lobby', bot.health >= 20, String(bot.health));

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} bestanden`);
  bot.quit();
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
