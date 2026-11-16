#!/usr/bin/env node
// Darsteller für den MorniCraft-Trailer (aus dem MorniSMP-Trailer übernommen) – wie tools/trailer/actors.cjs (ohne eigene Physik, der Server bewegt sie per
// tp), dazu Handlungen für Markt und Wildnis. Über stdin (eine Zeile je Handlung, z. B. per `tail -n0 -F datei`):
//   "Anna swing" · "Anna slot 0" · "Anna use" · "Anna chat /gs sichern"
//   "Anna activate x y z"          Block anklicken (Schild, Kiste, Tresen) – nur das Paket, ohne Blick
//   "Anna click <Platz> [shift]"   im geöffneten Menü klicken · "Anna close"
//   "Anna attack Bert"             echter Schlag (wie Linksklick)
//   "Anna respawn"                 nach dem Tod wieder einsteigen
//   "Anna step x y z"              ein echtes Bewegungspaket (z. B. ins Reisetor – das Plugin reagiert nur darauf)
//   node mc-actors.cjs <host> <port> <version> Anna Bert …
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');
const [host, port, version, ...names] = process.argv.slice(2);
const bots = {};
const join = (name, delay) => setTimeout(() => {
  const bot = mineflayer.createBot({ host, port: Number(port), username: name, version, auth: 'offline',
    physicsEnabled: false, respawn: false });
  bots[name] = bot;
  bot._client.on('add_resource_pack', (p) => bot._client.write('resource_pack_receive', { uuid: p.uuid, result: 1 }));
  // Bewegung macht der Server (tp); eigene Bewegungspakete stören nur.
  const write = bot._client.write.bind(bot._client);
  bot.realWrite = write;
  bot._client.write = (packet, params) => {
    if (['position', 'position_look', 'look', 'flying'].includes(packet)) return;
    write(packet, params);
  };
  bot.once('spawn', () => console.log(`ONLINE ${name}`));
  bot.on('windowOpen', (w) => console.log(`MENU ${name} ${JSON.stringify(w.title).slice(0, 80)}`));
  bot.on('death', () => console.log(`TOT ${name}`));
  if (process.env.MM_ACTORS_CHAT) bot.on('messagestr', (m) => console.log(`CHAT ${name}: ${m}`));
  bot.on('kicked', (r) => console.log(`KICK ${name} ${JSON.stringify(r).slice(0, 200)}`));
  bot.on('error', (e) => console.log(`FEHLER ${name} ${e.message}`));
  bot.on('end', () => { console.log(`WEG ${name}`); delete bots[name]; join(name, 5000); });
}, delay);
names.forEach((n, i) => join(n, i * 4500));

function activate(bot, x, y, z) {
  bot._client.write('block_place', {
    location: new Vec3(x, y, z), direction: 3, hand: 0, cursorX: 0.5, cursorY: 0.5, cursorZ: 0.5,
    insideBlock: false, sequence: 0, worldBorderHit: false,
  });
  bot.swingArm('right');
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
    else if (act === 'activate') activate(bot, ...rest.slice(0, 3).map(Number));
    else if (act === 'click') bot.clickWindow(Number(rest[0]), 0, rest[1] === 'shift' ? 1 : 0)
      .catch((e) => console.log(`FEHLER ${name} click ${e.message}`));
    else if (act === 'close') { if (bot.currentWindow) bot.closeWindow(bot.currentWindow); }
    else if (act === 'attack') {
      const t = bot.players[rest[0]]?.entity;
      if (t) bot.attack(t); else { console.log(`FEHLER ${name} attack: ${rest[0]} nicht da`); bot.swingArm('right'); }
    } else if (act === 'respawn') bot.respawn();
    else if (act === 'step') {
      // ein echter Schritt (Bewegungspaket) – z. B. ins Reisetor, damit das Plugin ihn bemerkt
      const [x, y, z] = rest.slice(0, 3).map(Number);
      bot.realWrite('position', { x, y, z, flags: { onGround: true, hasHorizontalCollision: false } });
    }
  } catch (e) { console.log(`FEHLER ${name} ${act} ${e.message}`); }
});
