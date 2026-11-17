/**
 * Lobbymusik – echter Test über Velocity mit dem Lobby-Server und zwei Test-Spielern (mineflayer, Paper 26.1.2):
 * Mira lehnt das Lobby-Paket ab (hört Notenblöcke), Toni lädt es (hört die Klangdatei der Kapelle). Geprüft wird,
 * was beim Client ankommt: Geräusch-Pakete (Notenblock oder `moinmorni:lobby.musik.*`), Bereich „Plattenspieler/
 * Notenblöcke“, Stopp der Minecraft-Musik, Titel in der Aktionsleiste, /musik aus|an|leiser|weiter, gedämpft beim
 * Rundgang, Saison- und Schalter-Wechsel im Panel.
 *
 * Erwartet: Hub aus `apps/server/scripts/hub-dev.ts <proxy>:proxy:proxy <lobby>:lobby:backend --steuer=<port>`,
 * das Lobby-Paket unter der Adresse aus der server.properties der Lobby.
 *   NODE_PATH=~/mm-cache/node/node_modules node musik-test.cjs <host> <proxy-port> <steuer-port>
 */
const mineflayer = require('mineflayer');

const [HOST = '127.0.0.1', PORT = '28901', CONTROL = '28921'] = process.argv.slice(2);
/** Bereich der Geräusche: „record“ = Plattenspieler/Notenblöcke; beim Anhalten als Zahl (1 = Musik). */
const RECORDS = 'record';
const MUSIC = 1;
const STOP_SOURCE = 1;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
};
const until = async (test, ms = 15000, step = 250) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return true;
    await wait(step);
  }
  return test();
};
const control = async (area, values) => {
  const res = await fetch(`http://127.0.0.1:${CONTROL}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ area, values }),
  });
  if (!res.ok) throw new Error(`Steuerung: ${res.status}`);
};
const plain = (m) => (m == null ? '' : typeof m === 'string' ? m : JSON.stringify(m));

/** Ein Test-Spieler, der mitschreibt, was er hört. `pack`: Lobby-Paket annehmen oder ablehnen. */
async function player(name, locale, pack) {
  const bot = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: name,
    version: '26.1',
    auth: 'offline',
  });
  // mineflayer schreibt die Paket-Kennung als Objekt statt als Text (dann hängt die Anmeldung) – geradeziehen; ohne
  // Paket die Antwort auf „abgelehnt“ (1) umschreiben, mineflayer nimmt Pakete sonst von selbst an.
  const write = bot._client.write.bind(bot._client);
  bot._client.write = (packet, data) => {
    if (packet !== 'resource_pack_receive') return write(packet, data);
    const uuid = data.uuid?.ascii ?? data.uuid;
    if (pack) return write(packet, { ...data, uuid });
    // Ablehnen: nur einmal „abgelehnt“ (1) statt „angenommen“ (3), „geladen“ (0) entfällt.
    return data.result === 3 ? write(packet, { ...data, uuid, result: 1 }) : undefined;
  };
  const heard = [];
  const stops = [];
  const bars = [];
  const chats = [];
  bot.once('login', () => bot.setSettings({ locale }));
  bot._client.on('entity_sound_effect', (p) => {
    const inline = p.sound?.data?.soundName;
    const id = p.sound?.soundId;
    const known =
      id !== undefined ? (bot.registry.sounds[id - 1]?.name ?? bot.registry.sounds[id]?.name) : null;
    heard.push({
      at: Date.now(),
      name: String(inline ?? known ?? JSON.stringify(p.sound)),
      source: p.soundCategory,
      volume: p.volume,
      pitch: p.pitch,
    });
  });
  bot._client.on('stop_sound', (p) => stops.push({ at: Date.now(), ...p }));
  bot._client.on('system_chat', (p) =>
    (p.isActionBar || p.overlay ? bars : chats).push(plain(p.content ?? p)),
  );
  bot._client.on('action_bar', (p) => bars.push(plain(p)));
  bot.on('messagestr', (m) => chats.push(m));
  bot.on('kicked', (r) => console.log(name, 'gekickt:', plain(r)));
  await new Promise((r, j) => {
    bot.once('spawn', r);
    bot.once('error', j);
  });
  return { bot, heard, stops, bars, chats, name };
}

const since = (list, t) => list.filter((e) => e.at >= t);
const notes = (list) => list.filter((e) => e.name.includes('note_block'));
const custom = (list) => list.filter((e) => e.name.startsWith('moinmorni:lobby.musik.'));

async function main() {
  // Ohne automatischen Rundgang für Neue (der dämpft die Musik – das prüft weiter unten /rundgang).
  await control('lobby', {
    season: 'none',
    music: true,
    musicVolume: 70,
    musicQuiet: 40,
    musicPause: 2,
    tourForNewPlayers: false,
  });
  const mira = await player('Mira', 'de_de', false);
  await wait(3500); // Velocity: eine Anmeldung je Adresse alle 3 s
  const toni = await player('Toni', 'en_us', true);
  // Was ein früherer Lauf per /musik gemerkt hat, zurück auf die Vorgabe (an, 100 %).
  mira.bot.chat('/musik 100');
  toni.bot.chat('/music 100');
  await wait(1000);

  // --- ohne Paket: Notenblöcke ---
  check(
    'Mira hört Notenblöcke',
    await until(() => notes(mira.heard).length > 20, 20000),
    `${mira.heard.length} Geräusche`,
  );
  const kinds = new Set(notes(mira.heard).map((e) => e.name.replace('block.note_block.', '')));
  check('mehrere Notenblock-Instrumente', kinds.size >= 3, [...kinds].join(', '));
  check(
    'im Bereich Plattenspieler/Notenblöcke',
    notes(mira.heard).every((e) => e.source === RECORDS),
  );
  check(
    'Tonhöhen im Notenblock-Bereich',
    notes(mira.heard).every((e) => e.pitch >= 0.49 && e.pitch <= 2.01),
  );
  check('keine Klangdatei ohne Paket', custom(mira.heard).length === 0);
  check(
    'Titel des Stücks in der Aktionsleiste (deutsch)',
    await until(() => mira.bars.some((b) => b.includes('♪'))),
    mira.bars.find((b) => b.includes('♪')) ?? '',
  );
  check(
    'Minecrafts eigene Musik wird angehalten',
    await until(() => mira.stops.some((s) => s.flags === STOP_SOURCE && s.source === MUSIC), 5000),
  );

  // --- mit Paket: Klangdatei der Kapelle ---
  check(
    'Toni hört die Klangdatei der Kapelle',
    await until(() => custom(toni.heard).length > 0, 20000),
    custom(toni.heard)[0]?.name ?? '',
  );
  const first = custom(toni.heard)[0];
  check(
    'Klangdatei im Bereich Plattenspieler/Notenblöcke, Lautstärke 70 %',
    first?.source === RECORDS && Math.abs((first?.volume ?? 0) - 0.7) < 0.01,
    `${first?.source} ${first?.volume}`,
  );
  const tStart = first?.at ?? Date.now();
  await wait(3000);
  check('mit Paket keine Notenblöcke dazu', notes(since(toni.heard, tStart + 200)).length === 0);
  check(
    'Titel auf Englisch',
    toni.bars.some((b) => b.includes('♪')) && !toni.bars.some((b) => b.includes('Wandern')),
    toni.bars.find((b) => b.includes('♪')) ?? '',
  );

  // --- /musik ---
  let t = Date.now();
  mira.bot.chat('/musik aus');
  check('/musik aus antwortet', await until(() => mira.chats.some((c) => c.includes('ist für dich aus'))));
  await wait(1500);
  const quietFrom = Date.now();
  await wait(4000);
  check(
    'nach /musik aus keine Musik mehr',
    notes(since(mira.heard, quietFrom)).length === 0,
    `${notes(since(mira.heard, quietFrom)).length}`,
  );
  t = Date.now();
  mira.bot.chat('/musik an');
  check('/musik an: Musik kommt wieder', await until(() => notes(since(mira.heard, t)).length > 10, 15000));

  t = Date.now();
  toni.bot.chat('/music quieter');
  check(
    '/music quieter: altes Stück angehalten',
    await until(
      () => since(toni.stops, t).some((s) => String(s.sound ?? '').startsWith('moinmorni:lobby.musik.')),
      8000,
    ),
  );
  check(
    '… und das nächste leiser (75 % von 70 %)',
    await until(() => custom(since(toni.heard, t)).some((e) => Math.abs(e.volume - 0.525) < 0.01), 15000),
    `${custom(since(toni.heard, t))
      .map((e) => e.volume)
      .join(', ')}`,
  );
  const before = custom(toni.heard).at(-1)?.name;
  t = Date.now();
  toni.bot.chat('/music next');
  check(
    '/music next: ein anderes Stück',
    await until(() => custom(since(toni.heard, t)).some((e) => e.name !== before), 15000),
    `${before} → ${custom(since(toni.heard, t)).at(-1)?.name}`,
  );

  // --- gedämpft beim Rundgang: Klangdatei → leise Notenblöcke an derselben Stelle ---
  t = Date.now();
  toni.bot.chat('/rundgang');
  check(
    'Rundgang: Klangdatei angehalten',
    await until(
      () => since(toni.stops, t).some((s) => String(s.sound ?? '').startsWith('moinmorni:lobby.musik.')),
      8000,
    ),
  );
  check(
    '… weiter mit leisen Notenblöcken',
    await until(() => notes(since(toni.heard, t)).length > 5, 10000),
    `${notes(since(toni.heard, t)).length}`,
  );
  const loud = Math.max(...notes(mira.heard).map((e) => e.volume));
  const soft = Math.max(...notes(since(toni.heard, t)).map((e) => e.volume));
  check(
    '… gedämpft (leiser als ohne Rundgang)',
    soft < loud * 0.6,
    `${soft.toFixed(3)} statt bis ${loud.toFixed(3)}`,
  );
  toni.bot.chat('/rundgang stop');
  await wait(1000);
  // Nach dem Rundgang: das nächste Stück wieder als Klangdatei.
  t = Date.now();
  toni.bot.chat('/music next');
  check(
    'nach dem Rundgang wieder die Klangdatei',
    await until(() => custom(since(toni.heard, t)).length > 0, 15000),
  );

  // --- Panel: Saison wechseln, Musik aus ---
  t = Date.now();
  await control('lobby', { season: 'winter' });
  const winter = [
    'stille-nacht',
    'o-tannenbaum',
    'leise-rieselt',
    'alle-jahre',
    'o-du-froehliche',
    'ihr-kinderlein',
    'kling-gloeckchen',
    'schlittenfahrt',
  ];
  check(
    'Saison Winter im Panel: Weihnachtslied mit Paket',
    await until(
      () => custom(since(toni.heard, t)).some((e) => winter.some((w) => e.name.endsWith(w))),
      20000,
    ),
    custom(since(toni.heard, t)).at(-1)?.name ?? '',
  );
  check(
    '… und das alte Stück wurde angehalten',
    since(toni.stops, t).some((s) => String(s.sound ?? '').startsWith('moinmorni:lobby.musik.')),
  );
  check(
    '… und Notenblöcke ohne Paket',
    await until(() => notes(since(mira.heard, t + 500)).length > 5, 15000),
  );
  await control('lobby', { music: false });
  await wait(1500);
  const offFrom = Date.now();
  await wait(4000);
  check(
    'Musik im Panel aus: Stille für alle',
    notes(since(mira.heard, offFrom)).length === 0 && custom(since(toni.heard, offFrom)).length === 0,
  );
  await control('lobby', { music: true, season: 'none' });

  mira.bot.quit();
  toni.bot.quit();
  await wait(500);
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} bestanden`);
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
