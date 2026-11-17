/**
 * Test der Lobby-Funktionen mit einem echten Test-Spieler (mineflayer, Paper 26.1.2 – darauf darf er sich bewegen):
 * Ankunft am Platz, Begrüßung, Ankündigungs-Leiste, Kompass + Buch, Menü, Rundgang, Launchpad, Jump and Run (Start
 * am Smaragd, Blöcke nur für den Läufer, Sprünge mit Positions-Teleport des Test-Spielers selbst, Stufe, Sturz, Rekord,
 * Tafel, Bestenliste, /parkour leitet um), Doppelsprung (Fliegen erlaubt, Schwung, nicht im Jump and Run, Schalter im
 * Panel), kein Schaden.
 *   NODE_PATH=~/mm-cache/node/node_modules node lobby-test.cjs <host> <port> <rcon-host:port> <rcon-passwort-datei>
 * Optional: MM_LOBBY_DIR (Server-Ordner: Rekord-Datei), MM_HUB_DB (hub.db: Statistik „lobby“), MM_STEUER
 * (Steuerung von scripts/hub-dev.ts, z. B. http://127.0.0.1:28891: Doppelsprung im Panel aus/an), MM_VIP (Name eines
 * zweiten Test-Spielers, den der Hub als VIP kennt – hub-dev.ts --rang=<Name>=vip: Fliegen ab VIP, /fly).
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
/** Ankunft in der Lobby (LOBBY_SPAWN_VIEW in packages/builder/src/lobby/features.ts). */
const SPAWN = { x: 0.5, y: 65, z: 27.5 };

const rcon = (...cmds) => execFileSync('python3', [RCON_PY, RCON, PASS, ...cmds], { encoding: 'utf8' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const waitFor = async (ok, ms) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(100);
  return ok();
};
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

let bot0;
let chats0;
async function main() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: NAME,
    version: '26.1',
    auth: 'offline',
  });
  // Bietet die Lobby ihr Möbel-Paket an, wartet der Server in der Anmeldung auf eine Antwort – mineflayer schickt sie
  // dort nicht richtig mit, also hier selbst: angenommen und geladen.
  bot._client.on('add_resource_pack', (data) => {
    if (bot._client.state !== 'configuration') return;
    bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 3 });
    bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 0 });
  });
  // Deutscher Client: über den Proxy kommt die Sprache aus den Client-Einstellungen (sonst wäre alles Englisch).
  bot.once('login', () => bot.setSettings({ locale: 'de_DE' }));
  const titles = [];
  const chats = [];
  bot0 = bot;
  chats0 = chats;
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
  // mineflayer teilt die Geschwindigkeit ab 26.x noch durch 8000 (neues Format) – beim Doppelsprung echt anwenden.
  let realVelocity = false;
  bot._client.on('entity_velocity', (p) => {
    if (p.entityId !== bot.entity?.id) return;
    pushes.push(p);
    if (realVelocity) setImmediate(() => bot.entity.velocity.set(p.velocity.x, p.velocity.y, p.velocity.z));
  });
  // Fliegen erlaubt? (Doppelsprung) – von Anfang an mitschreiben, der Server schickt es nur bei Änderungen.
  const abilities = [];
  bot._client.on('abilities', (p) => abilities.push(p.flags));
  await new Promise((r) => bot.once('spawn', r));
  await wait(2500);

  check(
    'Ankunft am Dorfplatz',
    near(bot.entity.position, SPAWN.x, SPAWN.y, SPAWN.z),
    JSON.stringify(bot.entity.position),
  );
  const hotbar0 = bot.inventory.slots[36];
  const hotbar8 = bot.inventory.slots[44];
  check('Kompass in der Leiste', hotbar0?.name === 'compass', hotbar0?.name);
  check('Buch (Rundgang) in der Leiste', hotbar8?.name === 'writable_book', hotbar8?.name);
  check(
    'Begrüßung als Titel',
    titles.some((t) => t.includes('Servus in MoinMorni')),
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
    bot.game.gameMode === 'adventure' && near(bot.entity.position, SPAWN.x, SPAWN.y, SPAWN.z),
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

  // ---------- Jump and Run ----------
  const particles = [];
  bot._client.on('world_particles', (p) => particles.push(p));
  const allowFlying = () => abilities.length > 0 && (abilities[abilities.length - 1] & 0x04) !== 0;
  /** Was der Test-Spieler an einer Stelle sieht: Oberkante und Mitte der Fläche (aus den Formen des Blocks). */
  const surface = (b) => {
    const shapes = b.shapes.length ? b.shapes : [[0, 0, 0, 1, 1, 1]];
    const x1 = Math.min(...shapes.map((s) => s[0]));
    const x2 = Math.max(...shapes.map((s) => s[3]));
    const z1 = Math.min(...shapes.map((s) => s[2]));
    const z2 = Math.max(...shapes.map((s) => s[5]));
    return {
      x: b.position.x + (x1 + x2) / 2,
      y: b.position.y + Math.max(...shapes.map((s) => s[4])),
      z: b.position.z + (z1 + z2) / 2,
    };
  };
  const SKIP = new Set(['air', 'cave_air', 'void_air', 'light']);
  /** Blöcke um den Test-Spieler, die es nur bei ihm gibt (oben in der Bahn ist sonst nichts). */
  const blocksAround = () => {
    const p = bot.entity.position.floored();
    const found = [];
    for (let dx = -6; dx <= 6; dx++)
      for (let dz = -6; dz <= 6; dz++)
        for (let dy = -8; dy <= 4; dy++) {
          const b = bot.blockAt(p.offset(dx, dy, dz));
          if (b && !SKIP.has(b.name)) found.push(b);
        }
    return found;
  };
  const key = (b) => `${b.position.x},${b.position.y},${b.position.z}`;

  actionbars.length = 0;
  chats.length = 0;
  titles.length = 0;
  // Von Osten her auf den Smaragd (Startfeld −60/64/−41) laufen.
  rcon(`tp ${NAME} -58.5 65 -40.5 90 0`);
  await wait(1500);
  check(
    'Doppelsprung: in der Lobby ist Fliegen erlaubt (für das zweite Springen)',
    allowFlying(),
    String(abilities),
  );
  bot.setControlState('forward', true);
  await waitFor(() => bot.entity.position.y > 140, 3000);
  bot.setControlState('forward', false);
  await waitFor(() => bot.entity.position.y > 140, 4000);
  const startPos = bot.entity.position.clone();
  check('Jump and Run: Smaragd → hoch über dem Dorf', startPos.y > 140, JSON.stringify(startPos));
  check(
    'Jump and Run: Titel beim Start',
    titles.some((t) => t.includes('Jump and Run')),
    titles.slice(-2).join(' | '),
  );
  await wait(1200);
  const under = bot.blockAt(startPos.offset(0, -0.5, 0).floored());
  check('Startblock (Smaragd) nur beim Läufer', under?.name === 'emerald_block', under?.name);
  const real = rcon(
    `execute if block ${under.position.x} ${under.position.y} ${under.position.z} minecraft:air`,
  );
  check(
    '…auf dem Server ist dort Luft (niemand sonst steht darauf)',
    /passed|bestanden/i.test(real),
    real.trim(),
  );
  check(
    'Doppelsprung: im Jump and Run nicht (Fliegen nicht mehr erlaubt)',
    await waitFor(() => !allowFlying(), 2000),
    String(abilities.slice(-2)),
  );

  let current = under;
  const JUMPS = 13;
  const kinds = new Set();
  let made = 0;
  for (let i = 0; i < JUMPS; i++) {
    const next = blocksAround().filter((b) => key(b) !== key(current));
    if (next.length !== 1) {
      console.log(
        `  Sprung ${i + 1}: ${next.length} Blöcke zu sehen`,
        next.map((b) => `${b.name}@${key(b)}`).join(' '),
      );
      if (!next.length) break;
    }
    const target = next[next.length - 1];
    kinds.add(target.name.replace(/^.*_(slab|fence|wall|trapdoor)$/, '$1'));
    const s = surface(target);
    // Positions-Teleport des Test-Spielers selbst – knapp über den Block, dann fällt er darauf wie am Ende eines
    // Sprungs (der Server zählt eine Landung von oben, nicht ein Hochrutschen).
    bot.entity.position.set(s.x, s.y + 0.7, s.z);
    bot.entity.velocity.set(0, 0, 0);
    const before = actionbars.length;
    const ok = await waitFor(() => actionbars.slice(before).some((a) => a.includes(`★ ${i + 1}`)), 2500);
    if (!ok) {
      console.log(
        `  Sprung ${i + 1} nicht gezählt (${target.name} @ ${key(target)})`,
        actionbars.slice(-2).join(' | '),
      );
      break;
    }
    made++;
    current = target;
    await wait(450);
  }
  check(`Jump and Run: ${JUMPS} Sprünge gezählt`, made === JUMPS, `${made} – ${[...kinds].join(', ')}`);
  check(
    'Jump and Run: Stufe 2 nach „schwerer ab“ (10) Punkten',
    titles.some((t) => t.includes('Stufe 2')),
    titles.slice(-3).join(' | '),
  );
  const oldBlock = blocksAround().find((b) => key(b) === key(under));
  check('Geschaffte Blöcke verschwinden wieder', !oldBlock, oldBlock?.name);

  // Daneben treten: Fallen beendet den Lauf, zurück am Startplatz.
  titles.length = 0;
  chats.length = 0;
  const here = bot.entity.position.clone();
  bot.entity.position.set(here.x + 2.5, here.y, here.z + 2.5);
  const back = await waitFor(() => bot.entity.position.y < 80, 8000);
  await wait(1200);
  check(
    'Fallen beendet den Lauf → zurück am Startplatz',
    back && near(bot.entity.position, -59.5, 65, -37.5, 1.5),
    JSON.stringify(bot.entity.position),
  );
  check(
    'Titel „Gefallen!“ und neuer Rekord',
    titles.some((t) => t.includes('Gefallen')) &&
      chats.some((c) => c.includes(`${made} Punkte`) && c.includes('Rekord')),
    `${titles.slice(-2).join(' | ')} / ${chats.slice(-1)[0]}`,
  );
  if (process.env.MM_LOBBY_DIR) {
    const file = path.join(process.env.MM_LOBBY_DIR, 'plugins/moinmorni/jumpandrun.yml');
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    check(
      'Rekord je Spieler gespeichert',
      text.includes(NAME) && text.includes(`score: ${made}`),
      text.slice(0, 160),
    );
  }
  // Erste Zeilen der Tafel (je eine Zeile nach einem Zeilenumbruch) – die ganze Schrift kürzt RCON ab.
  const boardAt = 'data get entity @e[type=text_display,x=-59.5,y=65,z=-45.9,distance=..1,limit=1]';
  const lines = Array.from({ length: 10 }, (_, k) =>
    rcon(`${boardAt} text.extra[${2 * k + 1}].text`, `${boardAt} text.extra[${2 * k + 1}].extra[0].text`),
  );
  const board = lines.find((l) => l.includes(`. ${NAME} `)) ?? lines.join(' ');
  check(
    'Tafel am Start: Top 10 mit dem Test-Spieler',
    board.includes(`. ${NAME}`) && board.includes(`★ ${made}`),
    board.replace(/\s+/g, ' ').slice(0, 200),
  );
  if (process.env.MM_HUB_DB) {
    await wait(500);
    const row = execFileSync(
      'python3',
      [
        '-c',
        'import sqlite3,sys;c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True);print(dict(c.execute("select key,value from mode_stats where mode=\'lobby\'").fetchall()))',
        process.env.MM_HUB_DB,
      ],
      { encoding: 'utf8' },
    );
    check(
      'Statistik „lobby“ im Netzwerk (Profil/Webseite)',
      row.includes(`'jump_best': ${made}`),
      row.trim(),
    );
  }
  chats.length = 0;
  bot.chat('/jnr top');
  await wait(1200);
  check(
    '/jnr top: Bestenliste mit dem Test-Spieler',
    chats.some((c) => c.includes(NAME)),
    chats.slice(0, 3).join(' | '),
  );
  chats.length = 0;
  bot.chat('/parkour');
  await waitFor(() => bot.entity.position.y > 140, 4000);
  check(
    '/parkour leitet zum Jump and Run um',
    chats.some((c) => c.includes('Jump and Run geworden')) && bot.entity.position.y > 140,
    chats.slice(0, 2).join(' | '),
  );
  bot.chat('/jnr stop');
  await waitFor(() => bot.entity.position.y < 80, 4000);
  await wait(800);

  // ---------- Doppelsprung ----------
  check(
    'Nach dem Lauf: Doppelsprung wieder möglich',
    await waitFor(allowFlying, 2000),
    String(abilities.slice(-2)),
  );
  const y0 = bot.entity.position.y;
  const p0 = bot.entity.position.clone();
  // Blick nach Süden zum Eingang (im Norden steht die Tafel), waagrecht: der Schub geht in Blickrichtung.
  await bot.look(Math.PI, 0, true);
  particles.length = 0;
  bot.setControlState('jump', true);
  await wait(150);
  bot.setControlState('jump', false);
  await wait(150);
  // Zweimal Springen will das Fliegen einschalten – das Plugin macht daraus den Schwung.
  const mark = abilities.length;
  const pushMark = pushes.length;
  realVelocity = true;
  bot._client.write('abilities', { flags: 0x02 });
  let peak = y0;
  const until = Date.now() + 3000;
  while (Date.now() < until && !(Date.now() > until - 2500 && bot.entity.onGround)) {
    peak = Math.max(peak, bot.entity.position.y);
    await wait(50);
  }
  realVelocity = false;
  const boost = pushes.slice(pushMark).find((p) => p.velocity.y > 0.8);
  const far = Math.hypot(bot.entity.position.x - p0.x, bot.entity.position.z - p0.z);
  check(
    'Doppelsprung: klassischer Schub in Blickrichtung (vorn ≥ 1,2, oben ≥ 0,9 Blöcke/Tick)',
    Boolean(boost) && Math.hypot(boost.velocity.x, boost.velocity.z) >= 1.2 && peak - y0 > 4,
    `Schub ${boost ? JSON.stringify(boost.velocity) : '–'}, höchstens ${(peak - y0).toFixed(2)} über dem Boden`,
  );
  check(
    'Doppelsprung: weit nach vorn (Süden) geflogen',
    far > 8 && bot.entity.position.z > p0.z + 6,
    `${far.toFixed(1)} Blöcke weit, z ${p0.z.toFixed(1)} → ${bot.entity.position.z.toFixed(1)}`,
  );
  console.log(`  Doppelsprung: ${far.toFixed(1)} Blöcke weit, ${(peak - y0).toFixed(1)} hoch`);
  check('Doppelsprung: Funken', particles.length > 0, `${particles.length} Partikel-Pakete`);
  check(
    'Doppelsprung: in der Luft kein zweiter (Fliegen erst nach der Landung wieder erlaubt)',
    abilities.slice(mark).some((f) => (f & 0x04) === 0),
    String(abilities.slice(mark)),
  );
  await waitFor(() => bot.entity.onGround, 3000);
  check('Nach der Landung wieder erlaubt', await waitFor(allowFlying, 2000));
  if (process.env.MM_STEUER) {
    const set = (values) =>
      fetch(process.env.MM_STEUER, { method: 'POST', body: JSON.stringify({ area: 'lobby', values }) });
    await set({ doubleJump: false });
    check('Panel: Doppelsprung aus → kein Fliegen mehr erlaubt', await waitFor(() => !allowFlying(), 4000));
    await set({ doubleJump: true });
    check('Panel: Doppelsprung an → wieder erlaubt', await waitFor(allowFlying, 4000));
  }

  // ---------- Fliegen ab VIP (MM_VIP = Name, den der Hub als VIP kennt: hub-dev.ts --rang=<Name>=vip) ----------
  if (process.env.MM_VIP) await vipFlight(process.env.MM_VIP);

  // Kein Schaden in der Lobby
  rcon(`damage ${NAME} 6`);
  await wait(800);
  check('Kein Schaden in der Lobby', bot.health >= 20, String(bot.health));

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} bestanden`);
  bot.quit();
  process.exit(ok === results.length ? 0 : 1);
}

/** Ein VIP fliegt statt doppelt zu springen; /fly wechselt; im Jump and Run nicht. */
async function vipFlight(name) {
  const vip = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: name,
    version: '26.1',
    auth: 'offline',
  });
  vip._client.on('add_resource_pack', (data) => {
    if (vip._client.state !== 'configuration') return;
    vip._client.write('resource_pack_receive', { uuid: data.uuid, result: 3 });
    vip._client.write('resource_pack_receive', { uuid: data.uuid, result: 0 });
  });
  vip.once('login', () => vip.setSettings({ locale: 'de_DE' }));
  const flags = [];
  const pushes = [];
  const said = [];
  vip._client.on('abilities', (p) => flags.push(p.flags));
  vip._client.on('entity_velocity', (p) => p.entityId === vip.entity?.id && pushes.push(p));
  vip.on('messagestr', (m) => said.push(m));
  await new Promise((r) => vip.once('spawn', r));
  const mayFly = () => flags.length > 0 && (flags.at(-1) & 0x04) !== 0;
  const flying = () => /:\s*1b\s*$/.test(rcon(`data get entity ${name} abilities.flying`).trim());
  await wait(2500);
  check('VIP: in der Lobby ist Fliegen erlaubt', await waitFor(mayFly, 5000), String(flags.slice(-2)));
  // Zweimal Leertaste = „Fliegen an“: kein Schub, er fliegt wirklich.
  const pushMark = pushes.length;
  vip._client.write('abilities', { flags: 0x02 });
  await wait(1200);
  check(
    'VIP: zweimal Leertaste → fliegt (kein Doppelsprung-Schub)',
    flying() && !pushes.slice(pushMark).some((p) => p.velocity.y > 0.8) && mayFly(),
    rcon(`data get entity ${name} abilities.flying`).trim(),
  );
  vip._client.write('abilities', { flags: 0x00 });
  await wait(800);
  check('VIP: noch einmal → landet (Fliegen aus)', !flying());
  vip.chat('/fly aus');
  check(
    'VIP: /fly aus → Doppelsprung',
    await waitFor(() => said.some((m) => m.includes('Doppelsprung an')), 4000),
  );
  const flyFile =
    process.env.MM_LOBBY_DIR && path.join(process.env.MM_LOBBY_DIR, 'plugins/moinmorni/lobby-fly.txt');
  await wait(500);
  check(
    'VIP: Wahl „Doppelsprung“ gemerkt (lobby-fly.txt)',
    !flyFile || (fs.existsSync(flyFile) && fs.readFileSync(flyFile, 'utf8').includes('16ffd946')),
  );
  await waitFor(() => vip.entity.onGround, 3000);
  vip.setControlState('jump', true);
  await wait(150);
  vip.setControlState('jump', false);
  await wait(150);
  const mark2 = pushes.length;
  vip._client.write('abilities', { flags: 0x02 });
  await wait(1200);
  check(
    'VIP: mit /fly aus gibt es den Schub statt des Fliegens',
    pushes.slice(mark2).some((p) => p.velocity.y > 0.8) && !flying(),
    String(pushes.slice(mark2).map((p) => p.velocity.y)),
  );
  await waitFor(() => vip.entity.onGround, 4000);
  vip.chat('/fliegen');
  check(
    'VIP: /fliegen → wieder fliegen',
    await waitFor(() => said.some((m) => m.includes('Fliegen an')), 4000),
  );
  await wait(500);
  const remembered = flyFile ? fs.readFileSync(flyFile, 'utf8') : '';
  check(
    'VIP: Wahl „Fliegen“ gemerkt (wieder leer)',
    !flyFile || remembered.trim() === '',
    JSON.stringify(remembered),
  );
  await waitFor(mayFly, 3000);
  vip._client.write('abilities', { flags: 0x02 });
  await wait(800);
  vip.chat('/jnr');
  await wait(2500);
  check(
    'VIP: Jump and Run → Fliegen aus und nicht erlaubt',
    !flying() && !mayFly(),
    `${rcon(`data get entity ${name} abilities.flying`).trim()} ${flags.slice(-2)}`,
  );
  vip.chat('/jnr stop');
  await wait(1500);
  check('VIP: nach dem Lauf wieder Fliegen erlaubt', await waitFor(mayFly, 4000));
  // Spieler ohne Recht: /fly erklärt es freundlich
  bot0.chat('/fly');
  check(
    'Spieler ohne Recht: /fly sagt „ab VIP“',
    await waitFor(() => chats0.some((m) => m.includes('ab VIP')), 4000),
    chats0.slice(-1).join(''),
  );
  vip.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
