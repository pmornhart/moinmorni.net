#!/usr/bin/env node
// Darsteller für den Wolkenkampf-Trailer – wie tools/trailer/actors.cjs (ohne eigene Physik, der Server bewegt sie per
// tp). Handlungen über stdin (eine Zeile je Handlung):
//   "Anna swing" · "Anna slot 0" · "Anna use" · "Anna chat /bereit" · "Anna sneak on|off"
//   "Anna equip <Text>"            Gegenstand mit diesem Namen in die Hand
//   "Anna open x y z"              Block anklicken (Truhe öffnen) – nur das Paket, ohne Blick
//   "Anna place x y z <Seite>"     Block an die Seite (down|up|north|south|west|east) des Blocks x y z setzen
//   "Anna hit [Name]"              nächsten Spieler (oder genau diesen) in Reichweite schlagen (echter Schlag)
//   "Anna take"                    alles aus dem offenen Truhen-Fenster nehmen (Shift-Klick)
//   "Anna click <Platz>" · "Anna close" · "Anna inv"
//   node wk-actors.cjs <host> <port> <version> Anna Bert …
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');
const [host, port, version, ...names] = process.argv.slice(2);
const bots = {};
const FACES = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 };
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

let seq = 1;
function useBlock(bot, x, y, z, face) {
  bot._client.write('block_place', {
    location: new Vec3(x, y, z), direction: face, hand: 0, cursorX: 0.5, cursorY: face === 0 ? 0 : face === 1 ? 1 : 0.5,
    cursorZ: 0.5, insideBlock: false, sequence: seq++, worldBorderHit: false,
  });
  bot.swingArm('right');
}

function hit(bot, who) {
  const me = bot.entity.position;
  const t = Object.values(bot.entities).filter((e) => e.type === 'player' && e.username !== bot.username
      && (!who || e.username === who) && e.position.distanceTo(me) < 5.5)
    .sort((a, b) => a.position.distanceTo(me) - b.position.distanceTo(me))[0];
  if (t) bot.attack(t); else { bot.swingArm('right'); console.log(`LEER ${bot.username} hit ${who || ''}`); }
}

async function take(bot) {
  const w = bot.currentWindow;
  if (!w) { console.log(`LEER ${bot.username} take: kein Fenster`); return; }
  for (let i = 0; i < w.inventoryStart; i++) {
    if (w.slots[i]) { await bot.clickWindow(i, 0, 1); await new Promise((r) => setTimeout(r, 120)); }
  }
}

async function equip(bot, text) {
  let item = null;
  for (const want of text.toLowerCase().split('|')) {  // Alternativen: "sword|axe"
    item = bot.inventory.items().find((i) => (plain(i.customName) + ' ' + i.name).toLowerCase().includes(want));
    if (item) break;
  }
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
    else if (act === 'open') useBlock(bot, ...rest.slice(0, 3).map(Number), 1);
    else if (act === 'place') useBlock(bot, ...rest.slice(0, 3).map(Number), FACES[rest[3]] ?? 1);
    else if (act === 'hit') hit(bot, rest[0]);
    else if (act === 'click') bot.clickWindow(Number(rest[0]), 0, 0).catch((e) => console.log(`FEHLER ${name} click ${e.message}`));
    else if (act === 'take') take(bot).catch((e) => console.log(`FEHLER ${name} take ${e.message}`));
    else if (act === 'close') { if (bot.currentWindow) bot.closeWindow(bot.currentWindow); }
    else if (act === 'inv') console.log(`INV ${name} ${bot.inventory.items().map((i) => `${i.slot}:${i.name}:${i.count}`).join(' | ')} hand=${bot.heldItem && bot.heldItem.name}`);
  } catch (e) { console.log(`FEHLER ${name} ${act} ${e.message}`); }
});
