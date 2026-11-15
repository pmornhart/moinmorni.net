#!/usr/bin/env node
// Darsteller für Trailer: Test-Spieler (mineflayer) ohne eigene Physik. Bewegt werden sie vom Server (shot.py
// teleportiert sie in jedem Tick), damit sie zur Zeitlupe passen. Über stdin kommen Handlungen: "Anna swing".
//   node actors.cjs <host> <port> <version> Anna Bert …
const mineflayer = require('mineflayer');
const [host, port, version, ...names] = process.argv.slice(2);
const bots = {};
const join = (name, delay) => setTimeout(() => {
  const bot = mineflayer.createBot({ host, port: Number(port), username: name, version, auth: 'offline', physicsEnabled: false });
  bots[name] = bot;
  // Ressourcenpaket der Lobby ablehnen (Darsteller brauchen es nicht; sonst hängt die Anmeldung).
  bot._client.on('add_resource_pack', (p) => bot._client.write('resource_pack_receive', { uuid: p.uuid, result: 1 }));
  // Bewegung macht der Server (tp). Eigene Bewegungspakete würden über ViaVersion abgelehnt.
  const write = bot._client.write.bind(bot._client);
  bot._client.write = (packet, params) => {
    if (['position', 'position_look', 'look', 'flying'].includes(packet)) return;
    write(packet, params);
  };
  bot.once('spawn', () => console.log(`ONLINE ${name}`));
  bot.on('kicked', (r) => console.log(`KICK ${name} ${JSON.stringify(r).slice(0, 200)}`));
  bot.on('error', (e) => console.log(`FEHLER ${name} ${e.message}`));
  bot.on('end', () => { console.log(`WEG ${name}`); delete bots[name]; join(name, 5000); });
}, delay);
names.forEach((n, i) => join(n, i * 3500));
require('readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const [name, act, ...rest] = line.trim().split(/\s+/);
  const bot = bots[name];
  if (!bot) return;
  try {
    if (act === 'swing') bot.swingArm(rest[0] === 'links' ? 'left' : 'right');
    else if (act === 'chat') bot.chat(rest.join(' '));
    else if (act === 'slot') bot.setQuickBarSlot(Number(rest[0]));
    else if (act === 'use') bot.activateItem();
    else if (act === 'unuse') bot.deactivateItem();
  } catch (e) { console.log(`FEHLER ${name} ${act} ${e.message}`); }
});
