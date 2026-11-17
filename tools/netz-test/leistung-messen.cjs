/**
 * Leistung der Lobby messen (Test-Werkzeug): ein Test-Spieler (mineflayer, Paper 26.1.2) steht am Dorfplatz und zählt,
 * was der Server ihm schickt – Pakete und Bytes je Art (Bewegung, Metadaten, Partikel, Klänge, Blöcke …), dazu Zahl
 * der Wesen je Art (RCON) und die Tick-Zeit des Servers (`/mspt` von Paper) mit Spieler.
 *   NODE_PATH=/home/user/mm-cache/node/node_modules node leistung-messen.cjs <host> <port> <rcon-host:port> <pw-datei>
 *     [sekunden=30] [x y z]
 * Ausgabe: Tabelle auf der Konsole und eine Zeile JSON (für die Vorher/Nachher-Tabelle in STAND.md).
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mineflayer = require('mineflayer');

const [
  HOST = '127.0.0.1',
  PORT = '25640',
  RCON = '127.0.0.1:25740',
  PASS_FILE = '.rcon-pass',
  SECS = '30',
  ...AT
] = process.argv.slice(2);
const PASS = fs.readFileSync(PASS_FILE, 'utf8').trim();
const RCON_PY = path.join(__dirname, '../mc-client/rcon.py');
const rcon = (...cmds) => execFileSync('python3', [RCON_PY, RCON, PASS, ...cmds], { encoding: 'utf8' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Dorfplatz am Maibaum, Blick nach Norden über den Markt (wie Philips Bild). */
const [X, Y, Z] = AT.length === 3 ? AT.map(Number) : [0.5, 65, 27.5];
const TYPES = [
  'block_display',
  'item_display',
  'text_display',
  'interaction',
  'mannequin',
  'armor_stand',
  'marker',
];
/** "Test passed. Count: 1366" → 1366 */
const COUNT = /count: (\d+)/i;

function countEntities() {
  const out = {};
  for (const t of TYPES) {
    const a = rcon(`execute if entity @e[type=minecraft:${t}]`);
    out[t] = Number(COUNT.exec(a)?.[1] ?? 0);
  }
  const near = rcon(`execute positioned ${X} ${Y} ${Z} if entity @e[distance=..48]`);
  out['nah (48)'] = Number(COUNT.exec(near)?.[1] ?? 0);
  return out;
}

async function main() {
  const name = process.env.MM_NAME ?? 'Messung';
  const bot = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: name,
    version: '26.1',
    auth: 'offline',
  });
  bot._client.on('add_resource_pack', (data) => {
    if (bot._client.state !== 'configuration') return;
    bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 3 });
    bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 0 });
  });
  bot.on('kicked', (r) => console.log('gekickt:', JSON.stringify(r).slice(0, 200)));
  bot.on('error', (e) => console.log('Fehler:', e.message));
  const counts = new Map();
  /** Wer bewegt sich: Paket-Art + Wesen-Art → Ids und Zahl. */
  const MOVES = new Set([
    'rel_entity_move',
    'sync_entity_position',
    'entity_move_look',
    'entity_look',
    'entity_head_rotation',
    'entity_metadata',
    'entity_teleport',
  ]);
  const movers = new Map();
  const moves = new Map();
  let counting = false;
  bot._client.on('packet', (_data, meta, buffer) => {
    if (!counting || meta.state !== 'play') return;
    const c = counts.get(meta.name) ?? { n: 0, bytes: 0 };
    c.n++;
    c.bytes += buffer?.length ?? 0;
    counts.set(meta.name, c);
    if (_data && _data.entityId !== undefined && MOVES.has(meta.name)) {
      const kind = bot.entities[_data.entityId]?.name ?? '?';
      const key = `${meta.name}:${kind}`;
      movers.set(key, (movers.get(key) ?? new Set()).add(_data.entityId));
      moves.set(key, (moves.get(key) ?? 0) + 1);
    }
  });
  await new Promise((r) => bot.once('spawn', r));
  // Kein Rundgang, nicht fliegen: als Zuschauer fest an den Platz (der Spieler zählt trotzdem für die Figuren).
  rcon(`gamemode creative ${name}`, `tp ${name} ${X} ${Y} ${Z} 180 10`);
  await wait(15000);
  rcon(`tp ${name} ${X} ${Y} ${Z} 180 10`);
  await wait(3000);
  const entities = countEntities();
  counting = true;
  const secs = Number(SECS);
  const msptLines = [];
  for (let i = 0; i < secs; i += 10) {
    await wait(10000);
    msptLines.push(rcon('mspt').replace(/§./g, '').trim());
  }
  counting = false;
  const rows = [...counts.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
  const total = rows.reduce((s, [, c]) => ({ n: s.n + c.n, bytes: s.bytes + c.bytes }), { n: 0, bytes: 0 });
  console.log('Wesen:', JSON.stringify(entities));
  console.log(
    `Pakete pro Sekunde gesamt: ${(total.n / secs).toFixed(1)}, KB/s: ${(total.bytes / secs / 1024).toFixed(2)}`,
  );
  for (const [k, c] of rows.slice(0, 20))
    console.log(
      `  ${k.padEnd(32)} ${(c.n / secs).toFixed(1).padStart(8)}/s ${(c.bytes / secs / 1024).toFixed(2).padStart(8)} KB/s`,
    );
  for (const [k, ids] of [...movers.entries()].sort(
    (a, b) => (moves.get(b[0]) ?? 0) - (moves.get(a[0]) ?? 0),
  ))
    console.log(
      `  bewegt ${k.padEnd(44)} ${String(ids.size).padStart(4)} Wesen ${((moves.get(k) ?? 0) / secs).toFixed(1).padStart(7)}/s`,
    );
  console.log('mspt:', msptLines.join(' || '));
  console.log(
    'JSON',
    JSON.stringify({
      entities,
      perSec: Number((total.n / secs).toFixed(1)),
      kbPerSec: Number((total.bytes / secs / 1024).toFixed(2)),
      top: rows
        .slice(0, 12)
        .map(([k, c]) => [k, Number((c.n / secs).toFixed(1)), Number((c.bytes / secs / 1024).toFixed(2))]),
      mspt: msptLines,
    }),
  );
  bot.quit();
  await wait(500);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
