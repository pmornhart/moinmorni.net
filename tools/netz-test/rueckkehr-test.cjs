/**
 * Mitten im Spiel – echter Test über Velocity mit zwei Spielservern (Lobby + „duels“) und Test-Spielern (mineflayer):
 * Nachfrage vor /lobby (Fenster, Knöpfe im Chat, zweites /lobby, Gegenstand des Modus, Schalter im Panel und per
 * Befehl) und „Zurück ins Spiel“ nach einem Abbruch (Angebot in Chat/Leiste/Schnellleiste, Klick bringt zurück,
 * Ablauf, Zurücknehmen, freiwillig gegangen, Schalter).
 *
 * Erwartet: Hub aus `apps/server/scripts/hub-dev.ts … --rang=Philip=owner --steuer=<port>`, auf dem Duels-Server
 * ein kleines Test-Plugin, das einen Spielmodus spielt (nur im Cache, nicht im Repo) und per RCON hört auf
 *   rktest playing <name> <true|false> · rktest seconds <n> · rktest hold <name> <s> · rktest item <name>
 * – beim Verlassen mitten im Spiel ruft es `holdSlot(uuid, n)`, beim Wiederkommen `playing(true)` + `holdSlot(0)`,
 * der Bett-Gegenstand ruft `askToLobby`.
 *   NODE_PATH=~/mm-cache/node/node_modules node rueckkehr-test.cjs <host> <port> <rcon-lobby> <rcon-duels> \
 *     <rcon-passwort-datei> <steuer-port>
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mineflayer = require('mineflayer');

const [
  HOST = '127.0.0.1',
  PORT = '27100',
  RCON_LOBBY = '127.0.0.1:27111',
  RCON_DUELS = '127.0.0.1:27112',
  PASS_FILE = '.rcon-pass',
  CONTROL = '27113',
] = process.argv.slice(2);
const PASS = fs.readFileSync(PASS_FILE, 'utf8').trim();
const RCON_PY = path.join(__dirname, '../mc-client/rcon.py');
/** Mitte der Schnellleiste (Inventar-Platz 36 + 4). */
const RETURN_SLOT = 40;
const YES_SLOT = 11;
const NO_SLOT = 15;

const rcon = (target, ...cmds) =>
  execFileSync('python3', [RCON_PY, target, PASS, ...cmds], { encoding: 'utf8' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
};
/** Text aus Chat-Komponenten (String, JSON-Text oder NBT-Objekt). */
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
  return JSON.stringify(m);
};
/** Text aus einer NBT-Text-Komponente (seit 1.20.3): erst `text`, dann `extra` der Reihe nach. */
const nbtText = (n) => {
  if (n == null) return '';
  if (n.type === 'compound') return nbtText(n.value);
  if (n.type === 'string') return n.value;
  if (n.type === 'list') return (n.value?.value ?? []).map((c) => nbtText(c)).join('');
  return typeof n === 'object' ? `${nbtText(n.text)}${nbtText(n.extra)}` : '';
};
/** Wartet, bis `fn` etwas liefert (oder die Zeit um ist). */
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await wait(250);
  }
  return null;
}
/** Wo ist der Spieler gerade? (RCON „list“ auf beiden Servern) */
const where = (name) => {
  if (rcon(RCON_DUELS, 'list').includes(name)) return 'duels';
  return rcon(RCON_LOBBY, 'list').includes(name) ? 'lobby' : null;
};
const isOn = (name, server, ms = 10_000) => until(() => where(name) === server, ms);
/** Wie das Panel: Einstellungen ändern (über die Steuerung von hub-dev). */
const panel = (area, values) =>
  fetch(`http://127.0.0.1:${CONTROL}/`, { method: 'POST', body: JSON.stringify({ area, values }) }).then(
    (r) => r.json(),
  );

// Velocity lässt pro Adresse nur alle 3 s eine Anmeldung zu.
let lastLogin = 0;
async function join(name, locale) {
  const gap = lastLogin + 3500 - Date.now();
  if (gap > 0) await wait(gap);
  lastLogin = Date.now();
  const bot = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: name,
    version: '26.1',
    auth: 'offline',
  });
  bot.lines = [];
  bot.bars = [];
  bot.windows = [];
  bot.on('messagestr', (m, pos) => (pos === 'game_info' ? bot.bars : bot.lines).push(m));
  bot._client.on('system_chat', (p) => {
    if (p.isActionBar || p.overlay) bot.bars.push(plain(p.content));
  });
  // Leiste über der Schnellleiste (Paper: eigenes Paket, Text als NBT) – als Text, wie ihn der Spieler liest.
  bot._client.on('action_bar', (p) => bot.bars.push(nbtText(p.text)));
  bot.on('windowOpen', (w) => bot.windows.push(w));
  // Seit 1.21.4 nimmt der Server Klicks mit Gegenständen erst an, wenn der Client „geladen“ meldet (oder nach 3 s).
  // Über Velocity kommt bei jedem Serverwechsel ein neues login- bzw. respawn-Paket.
  const arrived = () => (bot.spawnedAt = Date.now());
  bot._client.on('login', arrived);
  bot._client.on('respawn', arrived);
  bot.once('login', () => bot.setSettings({ locale }));
  await new Promise((resolve, reject) => {
    bot.once('spawn', resolve);
    bot.once('kicked', (r) => reject(new Error(`gekickt: ${plain(r)}`)));
    bot.once('error', reject);
  });
  await wait(1500);
  return bot;
}
/** Sieht der Spieler eine passende Zeile (im Chat oder über der Leiste)? Nimmt sie heraus. */
async function sees(list, re, ms = 6000) {
  return until(() => {
    const i = list.findIndex((l) => re.test(l));
    return i < 0 ? null : list.splice(i, 1)[0];
  }, ms);
}
const itemText = (item) => (item ? JSON.stringify(item) : '');
const windowText = (w) => `${plain(w.title)} ${w.slots.slice(0, 27).map(itemText).join(' ')}`;
const nextWindow = (bot, ms = 6000) => until(() => bot.windows.shift(), ms);
/** Gegenstand in der Hand benutzen (Rechtsklick) – erst, wenn der Server Klicks annimmt. */
async function use(bot, slot) {
  const ready = (bot.spawnedAt ?? 0) + 3500 - Date.now();
  if (ready > 0) await wait(ready);
  bot.setQuickBarSlot(slot);
  await wait(300);
  bot.activateItem();
}
const toDuels = async (bot, name) => {
  bot.chat('/server duels');
  return isOn(name, 'duels');
};

async function main() {
  rcon(RCON_DUELS, 'rktest seconds 90');
  await panel('network', { lobbyConfirm: true, rejoinOffer: true });

  // ---------- Nachfrage vor /lobby (Lena spielt englisch) ----------
  let lena = await join('Lena', 'en_US');
  check('Lena landet in der Lobby', (await isOn('Lena', 'lobby')) !== null);
  check('in Duels', (await toDuels(lena, 'Lena')) !== null);
  // Frisch anfangen (das Test-Plugin merkt sich Spieler aus einem früheren Lauf).
  rcon(RCON_DUELS, 'rktest playing Lena false');
  await wait(500);
  lena.chat('/lobby');
  check('wartet nur (spielt nicht): /lobby geht sofort', (await isOn('Lena', 'lobby')) !== null);

  await toDuels(lena, 'Lena');
  rcon(RCON_DUELS, 'rktest playing Lena true');
  await wait(800);
  lena.chat('/lobby');
  let w = await nextWindow(lena);
  check(
    'spielt: /lobby öffnet „Really go to the lobby?“',
    Boolean(w && /Really go to the lobby\?/.test(plain(w.title))),
    w ? plain(w.title) : 'kein Fenster',
  );
  check(
    'Fenster: „Yes, to the lobby“ und „Keep playing“',
    Boolean(
      w &&
      /Yes, to the lobby/.test(itemText(w.slots[YES_SLOT])) &&
      /Keep playing/.test(itemText(w.slots[NO_SLOT])),
    ),
  );
  const ask = await sees(lena.lines, /Really go to the lobby\?/);
  check(
    'Chat: Frage mit Knöpfen [Yes, to the lobby] [Keep playing]',
    Boolean(ask && ask.includes('[Yes, to the lobby]') && ask.includes('[Keep playing]')),
    ask ?? '',
  );
  await wait(1500);
  check('… und bleibt in Duels', where('Lena') === 'duels');

  await lena.clickWindow(NO_SLOT, 0, 0);
  check('„Keep playing“: Fenster zu', Boolean(await until(() => !lena.currentWindow)));
  check('… freundliche Antwort', Boolean(await sees(lena.lines, /have fun playing on/)));
  check('… weiter in Duels', where('Lena') === 'duels');

  lena.chat('/lobby');
  await nextWindow(lena);
  await wait(1000);
  lena.chat('/lobby');
  check('zweites /lobby innerhalb von 10 s = Ja', (await isOn('Lena', 'lobby')) !== null);

  await toDuels(lena, 'Lena');
  rcon(RCON_DUELS, 'rktest playing Lena true');
  await wait(800);
  lena.chat('/lobby');
  w = await nextWindow(lena);
  if (w) await lena.clickWindow(YES_SLOT, 0, 0);
  check('„Yes, to the lobby“ im Fenster → Lobby', (await isOn('Lena', 'lobby')) !== null);

  await toDuels(lena, 'Lena');
  rcon(RCON_DUELS, 'rktest playing Lena true');
  await wait(800);
  lena.chat('/lobby');
  await nextWindow(lena);
  lena.chat('/lobby no');
  check(
    'Knopf im Chat „Keep playing“ (/lobby no): Fenster zu',
    Boolean(await until(() => !lena.currentWindow)),
  );
  check('… bleibt in Duels', (await wait(1000), where('Lena') === 'duels'));
  lena.chat('/lobby yes');
  check('Knopf im Chat „Yes, to the lobby“ (/lobby yes) → Lobby', (await isOn('Lena', 'lobby')) !== null);

  // „Zur Lobby“ im Modus (askToLobby): Bett in der Leiste.
  await toDuels(lena, 'Lena');
  rcon(RCON_DUELS, 'rktest playing Lena true');
  rcon(RCON_DUELS, 'rktest item Lena');
  await wait(800);
  await use(lena, 8);
  w = await nextWindow(lena);
  check(
    '„Zur Lobby“ im Modus (askToLobby) fragt genauso',
    Boolean(w && /Really go to the lobby\?/.test(plain(w.title))),
  );
  if (w) await lena.clickWindow(NO_SLOT, 0, 0);
  await wait(800);
  rcon(RCON_DUELS, 'rktest playing Lena false');
  await wait(500);
  await use(lena, 8);
  check('askToLobby ohne Runde → sofort in die Lobby', (await isOn('Lena', 'lobby')) !== null);

  // Im Panel aus: sofort, auch mitten im Spiel.
  await panel('network', { lobbyConfirm: false });
  await toDuels(lena, 'Lena');
  rcon(RCON_DUELS, 'rktest playing Lena true');
  await wait(800);
  lena.chat('/lobby');
  check('Panel „Vor /lobby nachfragen“ aus → sofort in die Lobby', (await isOn('Lena', 'lobby')) !== null);
  check('… ohne Fenster', lena.windows.length === 0);
  await panel('network', { lobbyConfirm: true });

  // Philip (Owner, deutsch): deutsches Fenster; Schalter per Befehl im Spiel.
  const philip = await join('Philip', 'de_DE');
  await toDuels(philip, 'Philip');
  rcon(RCON_DUELS, 'rktest playing Philip true');
  await wait(800);
  philip.chat('/lobby');
  w = await nextWindow(philip);
  check(
    'Deutsch: „Wirklich zur Lobby?“ mit „Ja, zur Lobby“ / „Weiterspielen“',
    Boolean(
      w &&
      /Wirklich zur Lobby\?/.test(plain(w.title)) &&
      /Ja, zur Lobby/.test(itemText(w.slots[YES_SLOT])) &&
      /Weiterspielen/.test(itemText(w.slots[NO_SLOT])),
    ),
  );
  check(
    'Deutsch: Frage im Chat mit [Ja, zur Lobby] [Weiterspielen]',
    Boolean(await sees(philip.lines, /Wirklich zur Lobby\?.*\[Ja, zur Lobby\].*\[Weiterspielen\]/)),
  );
  if (w) await philip.clickWindow(YES_SLOT, 0, 0);
  await isOn('Philip', 'lobby');

  // ---------- Zurück ins Spiel ----------
  await toDuels(lena, 'Lena');
  rcon(RCON_DUELS, 'rktest playing Lena true');
  await wait(800);
  lena.quit();
  await wait(2500);
  lena = await join('Lena', 'en_US');
  check('nach dem Abbruch: wieder da, in der Lobby', (await isOn('Lena', 'lobby')) !== null);
  const offer = await sees(lena.lines, /You were in the middle of Duels/, 10_000);
  check(
    'Chat: „You were in the middle of Duels … [Back to the game]“',
    Boolean(offer && offer.includes('[Back to the game]')),
    offer ?? '',
  );
  const item = await until(() => lena.inventory.slots[RETURN_SLOT]);
  check(
    'Gegenstand in der Mitte der Leiste: „Back to the game“',
    Boolean(item && item.name === 'recovery_compass' && /Back to the game/.test(itemText(item))),
    item ? item.name : 'nichts',
  );
  check('… gleich in der Hand', lena.quickBarSlot === 4, `Platz ${lena.quickBarSlot}`);
  const bar = await sees(lena.bars, /Your spot in Duels is free for \d:\d\d more/);
  check('Restzeit über der Leiste', Boolean(bar), bar ?? lena.bars.slice(-2).join(' | '));

  await use(lena, 4);
  check('Klick auf den Gegenstand → zurück in Duels', (await isOn('Lena', 'duels')) !== null);
  check(
    '… der Modus begrüßt sie („Willkommen zurück“)',
    Boolean(await sees(lena.lines, /Willkommen zurück/)),
  );
  check(
    '… und meldet wieder „spielt“ (Nachfrage)',
    await (async () => {
      lena.chat('/lobby');
      const again = await nextWindow(lena);
      if (again) await lena.clickWindow(YES_SLOT, 0, 0);
      return Boolean(again);
    })(),
  );
  await isOn('Lena', 'lobby');
  await wait(1500);
  check('erledigt: in der Lobby kein Angebot mehr', !lena.inventory.slots[RETURN_SLOT]);
  lena.chat('/rejoin');
  check('/rejoin ohne Runde: freundlicher Hinweis', Boolean(await sees(lena.lines, /No round is waiting/)));

  // /rejoin (Knopf im Chat) bringt genauso zurück.
  await toDuels(lena, 'Lena');
  rcon(RCON_DUELS, 'rktest playing Lena true');
  await wait(800);
  lena.quit();
  await wait(2500);
  lena = await join('Lena', 'en_US');
  await sees(lena.lines, /You were in the middle of Duels/, 10_000);
  lena.chat('/rejoin');
  check('/rejoin (Knopf im Chat) → zurück in Duels', (await isOn('Lena', 'duels')) !== null);

  // Ablauf: nach der Zeit ist alles weg.
  rcon(RCON_DUELS, 'rktest seconds 12');
  await wait(500);
  lena.quit();
  await wait(2500);
  lena = await join('Lena', 'en_US');
  await sees(lena.lines, /You were in the middle of Duels/, 10_000);
  check('kurze Wartezeit: Angebot da', Boolean(await until(() => lena.inventory.slots[RETURN_SLOT])));
  check('Ablauf: Gegenstand weg', Boolean(await until(() => !lena.inventory.slots[RETURN_SLOT], 15_000)));
  check("Ablauf: Hinweis „Time's up“", Boolean(await sees(lena.lines, /Time's up/, 4000)));

  // Zurücknehmen: der Modus meldet 0 (Runde vorbei).
  rcon(RCON_DUELS, 'rktest seconds 90');
  await toDuels(lena, 'Lena');
  rcon(RCON_DUELS, 'rktest playing Lena true');
  await wait(800);
  lena.quit();
  await wait(2500);
  lena = await join('Lena', 'en_US');
  await sees(lena.lines, /You were in the middle of Duels/, 10_000);
  await until(() => lena.inventory.slots[RETURN_SLOT]);
  rcon(RCON_DUELS, 'rktest hold Lena 0');
  check(
    'Zurücknehmen (holdSlot 0): Gegenstand weg',
    Boolean(await until(() => !lena.inventory.slots[RETURN_SLOT])),
  );
  check('Zurücknehmen: Hinweis „is over by now“', Boolean(await sees(lena.lines, /is over by now/)));

  // Schalter per Befehl im Spiel (Philip): aus → kein Angebot; an → kommt wieder.
  philip.chat('/netzwerk rueckkehr aus');
  await sees(philip.lines, /Gespeichert/);
  await toDuels(lena, 'Lena');
  rcon(RCON_DUELS, 'rktest playing Lena true');
  await wait(800);
  lena.quit();
  await wait(2500);
  lena = await join('Lena', 'en_US');
  await wait(3000);
  check(
    '/netzwerk rueckkehr aus → kein Angebot',
    !lena.inventory.slots[RETURN_SLOT] && !lena.lines.some((l) => /You were in the middle/.test(l)),
  );
  philip.chat('/netzwerk rueckkehr an');
  check(
    '/netzwerk rueckkehr an → Angebot kommt',
    Boolean(await until(() => lena.inventory.slots[RETURN_SLOT])),
  );
  await use(lena, 4);
  check('… und bringt zurück', (await isOn('Lena', 'duels')) !== null);

  // Selbst gegangen („Ja“): kein Angebot, obwohl der Modus den Platz freihalten will.
  await wait(1000);
  lena.lines.length = 0;
  lena.chat('/lobby yes');
  await isOn('Lena', 'lobby');
  await wait(3000);
  check(
    'selbst gegangen: kein „Zurück ins Spiel“',
    !lena.inventory.slots[RETURN_SLOT] && !lena.lines.some((l) => /You were in the middle/.test(l)),
  );

  lena.quit();
  philip.quit();
  await wait(500);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} bestanden`);
  process.exit(failed ? 1 : 0);
}

setTimeout(() => {
  console.log('Zeit abgelaufen');
  process.exit(2);
}, 300_000);
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
