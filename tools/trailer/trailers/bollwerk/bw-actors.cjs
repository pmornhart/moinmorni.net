#!/usr/bin/env node
// Darsteller für den Bollwerk-Trailer – wie tools/trailer/actors.cjs (ohne eigene Physik, der Server bewegt sie per
// tp), dazu Handlungen für die Verteidigung. Über stdin (eine Zeile je Handlung):
//   "Anna swing" · "Anna slot 0" · "Anna use" · "Anna chat /bereit"
//   "Anna sneak on|off"            Schleichen (rettet Mitspieler am Boden)
//   "Anna equip <Text>"            Gegenstand mit diesem Namen in die Hand (z. B. Bauplan „Pfeilturm“)
//   "Anna activate x y z"          Block anklicken (Bauplatz, Turm) – ohne Blick, nur das Paket
//   "Anna trader"                  die Krämerin anklicken (nächster Dorfbewohner)
//   "Anna hit"                     nächsten Gegner in Reichweite schlagen (echter Schlag)
//   "Anna click <Platz>" · "Anna close"   im geöffneten Menü
//   node bw-actors.cjs <host> <port> <version> Anna Bert …
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');
const [host, port, version, ...names] = process.argv.slice(2);
const bots = {};
const ENEMIES = new Set(['zombie', 'pillager', 'vindicator', 'ravager', 'witch']);
const plain = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
const join = (name, delay) => setTimeout(() => {
  const bot = mineflayer.createBot({ host, port: Number(port), username: name, version, auth: 'offline', physicsEnabled: false });
  bots[name] = bot;
  bot._client.on('add_resource_pack', (p) => bot._client.write('resource_pack_receive', { uuid: p.uuid, result: 1 }));
  // Bewegung macht der Server (tp). Eigene Bewegungspakete würden über ViaVersion abgelehnt.
  const write = bot._client.write.bind(bot._client);
  bot._client.write = (packet, params) => {
    if (['position', 'position_look', 'look', 'flying'].includes(packet)) return;
    write(packet, params);
  };
  bot.once('spawn', () => console.log(`ONLINE ${name}`));
  bot.on('windowOpen', (w) => console.log(`MENU ${name} ${JSON.stringify(w.title).slice(0, 80)}`));
  if (process.env.MM_ACTORS_CHAT) bot.on('messagestr', (m) => console.log(`CHAT ${name}: ${m}`));
  bot.on('kicked', (r) => console.log(`KICK ${name} ${JSON.stringify(r).slice(0, 200)}`));
  bot.on('error', (e) => console.log(`FEHLER ${name} ${e.message}`));
  bot.on('end', () => { console.log(`WEG ${name}`); delete bots[name]; join(name, 5000); });
}, delay);
names.forEach((n, i) => join(n, i * 3500));

function activate(bot, x, y, z) {
  bot._client.write('block_place', {
    location: new Vec3(x, y, z), direction: 1, hand: 0, cursorX: 0.5, cursorY: 1.0, cursorZ: 0.5,
    insideBlock: false, sequence: 0, worldBorderHit: false,
  });
  bot.swingArm('right');
}

function trader(bot) {
  const me = bot.entity.position;
  const v = Object.values(bot.entities).filter((e) => e.name === 'villager')
    .sort((a, b) => a.position.distanceTo(me) - b.position.distanceTo(me))[0];
  if (!v) { console.log(`FEHLER ${bot.username} trader: keiner da`); return; }
  bot._client.write('use_entity', { target: v.id, mouse: 0, sneaking: false, hand: 0, location: new Vec3(0, 0, 0) });
  bot.swingArm('right');
}

function hit(bot) {
  const me = bot.entity.position;
  const t = Object.values(bot.entities).filter((e) => ENEMIES.has(e.name) && e.position.distanceTo(me) < 5.5)
    .sort((a, b) => a.position.distanceTo(me) - b.position.distanceTo(me))[0];
  if (t) bot.attack(t); else bot.swingArm('right');
}

async function equip(bot, text) {
  const want = text.toLowerCase();
  const item = bot.inventory.items().find((i) => (plain(i.customName) + ' ' + i.name).toLowerCase().includes(want));
  if (!item) { console.log(`FEHLER ${bot.username} equip: ${text} nicht da (${bot.inventory.items().map((i) => i.name).join(',')})`); return; }
  await bot.equip(item, 'hand');
}

require('readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const [name, act, ...rest] = line.trim().split(/\s+/);
  const bot = bots[name];
  if (!bot) return;
  try {
    if (act === 'swing') bot.swingArm(rest[0] === 'links' ? 'left' : 'right');
    else if (act === 'chat') bot.chat(rest.join(' '));
    else if (act === 'slot') bot.setQuickBarSlot(Number(rest[0]));
    else if (act === 'use') { bot.activateItem(); setTimeout(() => bot.deactivateItem(), 150); }
    else if (act === 'sneak') bot.setControlState('sneak', rest[0] !== 'off');
    else if (act === 'equip') equip(bot, rest.join(' ')).catch((e) => console.log(`FEHLER ${name} equip ${e.message}`));
    else if (act === 'activate') activate(bot, ...rest.slice(0, 3).map(Number));
    else if (act === 'trader') trader(bot);
    else if (act === 'hit') hit(bot);
    else if (act === 'click') bot.clickWindow(Number(rest[0]), 0, 0).catch((e) => console.log(`FEHLER ${name} click ${e.message}`));
    else if (act === 'close') { if (bot.currentWindow) bot.closeWindow(bot.currentWindow); }
    else if (act === 'inv') console.log(`INV ${name} ${bot.inventory.items().map((i) => `${i.slot}:${i.name}:${plain(i.customName).slice(0, 60)}`).join(' | ')}`);
  } catch (e) { console.log(`FEHLER ${name} ${act} ${e.message}`); }
});
