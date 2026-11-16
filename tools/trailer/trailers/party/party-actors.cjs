#!/usr/bin/env node
// Darsteller für den Morni-Party-Trailer – wie tools/trailer/actors.cjs (ohne eigene Physik, der Server bewegt sie),
// dazu Menüs (Partie) und ein paar Handlungen mehr. Über stdin: "Anna use", "Anna click 11", "Anna attack Bert",
// "Anna chat /mitspielen", "all delay 3000" (Wartezeit vor automatischen Menü-Klicks), "Anna rule <regex> <slot>".
const mineflayer = require('mineflayer');
const [host, port, version, ...names] = process.argv.slice(2);
const bots = {};
let delay = Number(process.env.MENU_DELAY ?? 1500);
const plain = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') { try { return v.startsWith('{') || v.startsWith('[') ? plain(JSON.parse(v)) : v; } catch { return v; } }
  if (Array.isArray(v)) return v.map(plain).join('');
  if (typeof v !== 'object') return String(v);
  if (v.type === 'compound') return plain(v.value);
  if (v.type === 'list') return plain(v.value?.value ?? []);
  if (v.type === 'string') return v.value;
  let s = '';
  if ('text' in v) s += plain(v.text);
  if ('' in v) s += plain(v['']);
  if ('extra' in v) s += plain(v.extra);
  return s;
};
// Regeln: Titel-Muster → Platz (oder Name eines Gegenstands). Eigene Regeln je Darsteller gehen vor.
const RULES = [
  [/Edelweiß-Stand|Edelweiss stand/, 11],
  [/Krämerladen|Shop/, 'shop'],
  [/Gegen wen|Who do you duel/, 0],
  [/Wen trifft es|Who is it for/, 0],
  [/Rucksack|backpack/, 'ender_pearl'],
  [/Welches Spielbrett|Which board/, 13],
  [/Welche Spielart|Which game/, 14],
];
const own = {};
const click = async (bot, s) => {
  await Promise.race([bot.clickWindow(s, 0, 0).catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
};
const join = (name, wait) => setTimeout(() => {
  const bot = mineflayer.createBot({ host, port: Number(port), username: name, version, auth: 'offline', physicsEnabled: false });
  bots[name] = bot;
  bot._client.on('add_resource_pack', (p) => bot._client.write('resource_pack_receive', { uuid: p.uuid, result: 1 }));
  const write = bot._client.write.bind(bot._client);
  bot._client.write = (packet, params) => {
    if (['position', 'position_look', 'look', 'flying'].includes(packet)) return;
    write(packet, params);
  };
  bot.on('windowOpen', async (w) => {
    const title = plain(w.title);
    console.log(`MENU ${name} ${title}`);
    const rules = [...(own[name] ?? []), ...RULES];
    const r = rules.find(([re]) => re.test(title));
    if (!r) return;
    await new Promise((res) => setTimeout(res, delay));
    if (bot.currentWindow !== w) return;
    if (r[1] === 'shop') {
      await click(bot, 10);
      await new Promise((res) => setTimeout(res, delay / 2));
      if (bot.currentWindow) await click(bot, 22);
    } else if (typeof r[1] === 'string') {
      const i = w.slots.findIndex((it, k) => k < w.inventoryStart && it?.name === r[1]);
      if (i >= 0) await click(bot, i);
    } else {
      await click(bot, r[1]);
    }
  });
  bot.once('spawn', () => console.log(`ONLINE ${name}`));
  bot.on('kicked', (r) => console.log(`KICK ${name} ${JSON.stringify(r).slice(0, 200)}`));
  bot.on('error', (e) => console.log(`FEHLER ${name} ${e.message}`));
  bot.on('end', () => { console.log(`WEG ${name}`); delete bots[name]; join(name, 5000); });
}, wait);
names.forEach((n, i) => join(n, i * 3500));
require('readline').createInterface({ input: process.stdin }).on('line', async (line) => {
  const [name, act, ...rest] = line.trim().split(/\s+/);
  if (name === 'all' && act === 'delay') { delay = Number(rest[0]); return; }
  const list = name === 'all' ? Object.values(bots) : [bots[name]].filter(Boolean);
  for (const bot of list) {
    try {
      if (act === 'swing') bot.swingArm(rest[0] === 'links' ? 'left' : 'right');
      else if (act === 'chat') bot.chat(rest.join(' '));
      else if (act === 'slot') bot.setQuickBarSlot(Number(rest[0]));
      else if (act === 'use') { bot.activateItem(); setTimeout(() => bot.deactivateItem(), 100); }
      else if (act === 'unuse') bot.deactivateItem();
      else if (act === 'click') await click(bot, Number(rest[0]));
      else if (act === 'close') bot.closeWindow(bot.currentWindow);
      else if (act === 'rule') (own[bot.username] ??= []).unshift([new RegExp(rest[0]), /^\d+$/.test(rest[1]) ? Number(rest[1]) : rest[1]]);
      else if (act === 'norules') own[bot.username] = [];
      else if (act === 'attack') {
        const e = bot.players[rest[0]]?.entity;
        if (e) bot.attack(e); else bot.swingArm('right');
      } else if (act === 'dig') {
        const [x, y, z] = rest.map(Number);
        const b = bot.blockAt(new (require('vec3'))(x, y, z));
        if (b) bot._client.write('block_dig', { status: 0, location: { x, y, z }, face: 1, sequence: 0 });
        bot.swingArm('right');
      }
    } catch (e) { console.log(`FEHLER ${bot.username} ${act} ${e.message}`); }
  }
});
