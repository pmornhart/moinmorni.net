#!/usr/bin/env node
// Markt für den MorniSMP-Trailer einrichten – alles über die echten Abläufe des Plugins: Test-Spieler mieten Stände
// über das Standschild, eröffnen Ladenkisten mit „[Laden]“-Schild (Preis im Menü eintippen) und stellen Angebote ins
// Auktionshaus (/ah verkaufen). Nur Kisten/Fässer/Schilder stellt die Konsole hin (wie ein Spieler sie hinstellen würde).
//   NODE_PATH=…/node_modules node markt.cjs <host> <port> <rcon host:port> <rcon-passwort-datei> [schritt …]
// Schritte: staende · auktion (ohne Angabe: beide) · angebot:<Name>:<Ware>:<Menge>:<Preis> (ein Angebot nachlegen)
const fs = require('node:fs');
const net = require('node:net');
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');

const [HOST, PORT, RCON, PASS_FILE, ...STEPS] = process.argv.slice(2);
const PASS = fs.readFileSync(PASS_FILE, 'utf8').trim();
const DIM = 'minecraft:smp_spawn';
const G = 90; // Bodenschicht der Marktstadt (y = 0 im Plan)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rcon(...commands) {
  const [host, port] = RCON.split(':');
  const packet = (id, type, body) => {
    const data = Buffer.from(body, 'utf8');
    const buf = Buffer.alloc(14 + data.length);
    buf.writeInt32LE(10 + data.length, 0); buf.writeInt32LE(id, 4); buf.writeInt32LE(type, 8); data.copy(buf, 12);
    return buf;
  };
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port: Number(port) });
    let buf = Buffer.alloc(0); const out = []; let i = -1;
    const next = () => { i++; if (i >= commands.length) { s.end(); resolve(out); } else s.write(packet(i + 2, 2, commands[i])); };
    s.setTimeout(15000, () => reject(new Error('RCON Zeit')));
    s.on('error', reject);
    s.on('connect', () => s.write(packet(1, 3, PASS)));
    s.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      while (buf.length >= 4) {
        const size = buf.readInt32LE(0);
        if (buf.length < size + 4) return;
        const id = buf.readInt32LE(4);
        const body = buf.subarray(12, size + 2).toString('utf8');
        buf = buf.subarray(size + 4);
        if (id !== 1) out.push(body.replace(/§./g, ''));
        next();
      }
    });
  });
}

// ------------------------------------------------------------ Stände (wie TownPlan.stall)
const DIRS = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const ORDER = ['north', 'east', 'south', 'west'];
const leftOf = (d) => ORDER[(ORDER.indexOf(d) + 3) % 4];
const RANGES = [[-13, -10], [-8, -5], [5, 8], [10, 13]];
const ROT = { south: 0, west: 4, north: 8, east: 12 };

/** Stand-Nummer → Rahmen (Ursprung, Vorderseite, rechts) wie im Plugin. */
function stall(id) {
  const side = Math.floor((id - 1) / 4);
  const front = ['south', 'west', 'north', 'east'][side];
  const [from, to] = RANGES[(id - 1) % 4];
  const right = leftOf(front);
  const [rdx, rdz] = DIRS[right];
  let ox; let oz;
  if (front === 'south') { ox = rdx > 0 ? from : to; oz = -14; }
  else if (front === 'north') { ox = rdx > 0 ? from : to; oz = 14; }
  else if (front === 'west') { ox = 14; oz = rdz > 0 ? from : to; }
  else { ox = -14; oz = rdz > 0 ? from : to; }
  const [fdx, fdz] = DIRS[front];
  const at = (u, v) => [ox + u * rdx - v * fdx, oz + u * rdz - v * fdz];
  return { id, front, at, sign: [...at(1, -1)] };
}

// Wer welchen Stand hat und was dort verkauft wird: [Behälter, Stelle u, Ware, Menge, Preis]
const STALLS = [
  { who: 'Anna', id: 2, wood: 'spruce', shops: [['chest', 1, 'bread', 16, '12'], ['barrel', 2, 'pumpkin_pie', 8, '15']],
    back: ['barrel', 'barrel'], title: ['Annas', 'Backstube'] },
  { who: 'Bert', id: 3, wood: 'oak', shops: [['barrel', 1, 'oak_log', 32, '24'], ['chest', 2, 'spruce_log', 32, '24']],
    back: ['barrel', 'chest'], title: ['Holz', 'vom Bert'] },
  { who: 'Resi', id: 1, wood: 'birch', shops: [['chest', 1, 'honey_bottle', 4, '18'], ['barrel', 2, 'sweet_berries', 32, '10']],
    back: ['barrel', 'barrel'], title: ['Resis', 'Honig'] },
  { who: 'Toni', id: 4, wood: 'dark_oak', shops: [['barrel', 1, 'arrow', 32, '16'], ['chest', 2, 'bow', 1, '35']],
    back: ['chest', 'barrel'], title: ['Bogen &', 'Pfeile'] },
  { who: 'Clara', id: 6, wood: 'cherry', shops: [['chest', 1, 'cornflower', 16, '6'], ['barrel', 2, 'white_wool', 32, '20']],
    back: ['barrel', 'barrel'], title: ['Claras', 'Blumen'] },
  { who: 'Emil', id: 7, wood: 'spruce', shops: [['barrel', 1, 'iron_ingot', 16, '40'], ['chest', 2, 'coal', 32, '16']],
    back: ['barrel', 'chest'], title: ['Erz &', 'Kohle'] },
  { who: 'Vroni', id: 14, wood: 'oak', shops: [['chest', 1, 'carrot', 32, '10'], ['barrel', 2, 'potato', 32, '10']],
    back: ['barrel', 'barrel'], title: ['Vronis', 'Gemüse'] },
  { who: 'Sepp', id: 15, wood: 'spruce', shops: [['barrel', 1, 'iron_pickaxe', 1, '30'], ['chest', 2, 'shears', 1, '15']],
    back: ['chest', 'barrel'], title: ['Sepps', 'Werkzeug'] },
  { who: 'Liesl', id: 9, wood: 'birch', shops: [['chest', 1, 'glass', 32, '16'], ['barrel', 2, 'lantern', 8, '24']],
    back: ['barrel', 'barrel'], title: ['Glas &', 'Laternen'] },
  { who: 'Hansi', id: 10, wood: 'jungle', shops: [['barrel', 1, 'cooked_salmon', 16, '14'], ['chest', 2, 'cod', 16, '8']],
    back: ['barrel', 'chest'], title: ['Hansis', 'Fisch'] },
  { who: 'Fritz', id: 5, wood: 'spruce', shops: [['chest', 1, 'torch', 64, '8'], ['barrel', 2, 'ladder', 32, '10']],
    back: ['barrel', 'barrel'], title: ['Allerlei', ''] },
  { who: 'Gretl', id: 13, wood: 'oak', shops: [['barrel', 1, 'cake', 1, '20'], ['chest', 2, 'cookie', 32, '12']],
    back: ['barrel', 'chest'], title: ['Gretls', 'Süßes'] },
];

// Auktionshaus: Verkäufer → [Ware (mit Bestandteilen), Menge, Preis]
const AUCTION = {
  Sepp: [['diamond', 16, 240], ['diamond_pickaxe[enchantments={efficiency:5,unbreaking:3,mending:1}]', 1, 650], ['netherite_ingot', 1, 900]],
  Vroni: [['golden_carrot', 32, 48], ['enchanted_golden_apple', 1, 1100], ['cake', 1, 25]],
  Liesl: [['enchanted_book[stored_enchantments={mending:1}]', 1, 450], ['enchanted_book[stored_enchantments={efficiency:5}]', 1, 300], ['name_tag', 1, 60]],
  Hansi: [['ender_pearl', 16, 96], ['blaze_rod', 8, 120], ['saddle', 1, 80]],
  Anna: [['bread', 32, 30], ['honey_bottle', 8, 40]],
  Bert: [['oak_log', 64, 48], ['glass', 64, 70], ['bookshelf', 16, 90]],
  Clara: [['white_wool', 64, 55], ['cherry_sapling', 8, 40], ['cornflower', 32, 20]],
  Emil: [['iron_ingot', 64, 160], ['gold_ingot', 32, 140], ['redstone', 64, 60], ['emerald', 16, 120]],
  Resi: [['totem_of_undying', 1, 700], ['elytra', 1, 2500], ['trident[enchantments={loyalty:3}]', 1, 900]],
  Toni: [['shulker_box', 1, 350], ['firework_rocket', 64, 80], ['diamond_sword[enchantments={sharpness:5}]', 1, 420]],
};

// ------------------------------------------------------------ Test-Spieler
let lastJoin = 0;
async function join(name) {
  const wait = lastJoin + 4500 - Date.now();
  if (wait > 0) await sleep(wait);
  lastJoin = Date.now();
  const bot = mineflayer.createBot({ host: HOST, port: Number(PORT), username: name, version: '26.1', auth: 'offline' });
  bot.chats = [];
  bot.on('messagestr', (m, pos) => { if (pos !== 'game_info') bot.chats.push(m); });
  bot.on('kicked', (r) => console.log(`  ${name} gekickt: ${JSON.stringify(r).slice(0, 160)}`));
  bot.on('error', (e) => console.log(`  ${name}: ${e.message}`));
  await new Promise((res, rej) => { bot.once('spawn', res); setTimeout(() => rej(new Error(`${name}: kein Spawn`)), 30000); });
  await sleep(2500);
  return bot;
}

function nextWindow(bot, ms = 6000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    bot.once('windowOpen', (w) => { clearTimeout(t); resolve(w); });
  });
}
const title = (w) => { try { return JSON.stringify(w?.title ?? '').replace(/"/g, ''); } catch { return '?'; } };

async function waitChat(bot, re, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (bot.chats.some((c) => re.test(c))) return bot.chats.find((c) => re.test(c));
    await sleep(100);
  }
  return '';
}

async function clickIn(bot, slot, expect = true) {
  const w = expect ? nextWindow(bot) : null;
  await bot.clickWindow(slot, 0, 0);
  return w;
}

async function rentStall(bot, st) {
  const s = stall(st.id);
  const [sx, sz] = s.sign;
  await rcon(`execute in ${DIM} run tp ${bot.username} ${sx + 0.5} ${G + 1} ${sz + 0.5}`);
  await sleep(1500);
  const w = nextWindow(bot);
  await bot.activateBlock(bot.blockAt(new Vec3(sx, G + 3, sz)));
  const menu = await w;
  if (!menu) { console.log(`  Stand ${st.id}: kein Menü`); return false; }
  bot.chats.length = 0;
  await bot.clickWindow(13, 0, 0);
  const ok = await waitChat(bot, /gehört dir/);
  console.log(`  Stand ${st.id}: ${ok || 'nicht gemietet?'}`);
  return Boolean(ok);
}

async function openShop(bot, st, [kind, u, item, amount, price]) {
  const s = stall(st.id);
  const [x, z] = s.at(u, 0);
  const facing = s.front;
  await rcon(
    `execute in ${DIM} run setblock ${x} ${G + 1} ${z} ${kind}[facing=${kind === 'barrel' ? 'up' : facing}]`,
    `execute in ${DIM} run setblock ${x} ${G + 2} ${z} ${st.wood}_sign[rotation=${ROT[facing]}]`,
    `clear ${bot.username}`, `give ${bot.username} ${item} ${amount}`);
  await sleep(1200);
  // vor den Stand stellen, Blick aufs Schild
  const [fx, fz] = s.at(u, -2);
  await rcon(`execute in ${DIM} run tp ${bot.username} ${fx + 0.5} ${G + 1} ${fz + 0.5} facing ${x + 0.5} ${G + 2.5} ${z + 0.5}`);
  await sleep(1500);
  const sign = bot.blockAt(new Vec3(x, G + 2, z));
  if (!sign || !/sign/.test(sign.name)) { console.log(`  Laden ${item}: kein Schild (${sign?.name})`); return; }
  await bot.activateBlock(sign);
  await sleep(800);
  const setup = nextWindow(bot);
  bot.updateSign(bot.blockAt(new Vec3(x, G + 2, z)), '[Laden]');
  let w = await setup;
  if (!w) { console.log(`  Laden ${item}: kein Einrichtungs-Menü – ${bot.chats.slice(-3).join(' | ')}`); return; }
  await sleep(500);
  w = await clickIn(bot, 14); // Preis
  await sleep(500);
  await bot.clickWindow(13, 0, 0); // eintippen
  await sleep(900);
  const back = nextWindow(bot);
  bot.chat(price);
  w = await back;
  await sleep(500);
  w = await clickIn(bot, 31); // OK → zurück zum Einrichten
  await sleep(500);
  bot.chats.length = 0;
  await bot.clickWindow(16, 0, 0); // eröffnen
  const ok = await waitChat(bot, /offen/);
  console.log(`  Laden ${item} ${amount}× ${price} ₮: ${ok || 'nicht offen? ' + bot.chats.slice(-2).join(' | ')}`);
  // Vorrat
  const stock = [];
  for (let i = 0; i < 9; i++) stock.push(`execute in ${DIM} run item replace block ${x} ${G + 1} ${z} container.${i} with ${item} ${Math.min(64, amount * 3)}`);
  await rcon(...stock);
}

async function decorate(st) {
  const s = stall(st.id);
  const cmds = [];
  st.back.forEach((kind, i) => {
    const [x, z] = s.at(1 + i, 2);
    cmds.push(`execute in ${DIM} run setblock ${x} ${G + 1} ${z} ${kind}[facing=${kind === 'barrel' ? 'up' : s.front}]`);
  });
  // Hängeschild mit dem Namen des Stands unter der Markise (Mitte, vorne)
  const [hx, hz] = s.at(2, 0);
  const axisRot = ROT[s.front];
  cmds.push(`execute in ${DIM} run setblock ${hx} ${G + 3} ${hz} ${st.wood}_hanging_sign[rotation=${axisRot},attached=true]` +
    `{front_text:{messages:["","${st.title[0]}","${st.title[1]}",""]}}`);
  await rcon(...cmds);
}

async function stalls() {
  for (const st of STALLS) {
    console.log(`== ${st.who}: Stand ${st.id}`);
    await rcon(`smpadmin geld geben ${st.who} 5000`).catch(() => {});
    const bot = await join(st.who);
    await rcon(`smpadmin geld geben ${st.who} 5000`, `gamemode survival ${st.who}`);
    if (await rentStall(bot, st)) {
      for (const shop of st.shops) await openShop(bot, st, shop);
      await decorate(st);
    }
    await rcon(`clear ${st.who}`);
    bot.quit();
    await sleep(1000);
  }
}

async function auction() {
  for (const [who, list] of Object.entries(AUCTION)) {
    console.log(`== ${who}: Auktionshaus`);
    const bot = await join(who);
    await rcon(`gamemode survival ${who}`);
    for (const [item, n, price] of list) {
      await rcon(`clear ${who}`, `give ${who} ${item} ${n}`);
      await sleep(900);
      bot.chats.length = 0;
      bot.chat(`/ah verkaufen ${price}`);
      const ok = await waitChat(bot, /Angeboten|nicht|kein/i);
      console.log(`  ${item} ${n}× ${price}: ${ok}`);
      await sleep(400);
    }
    bot.quit();
    await sleep(1000);
  }
}

(async () => {
  const steps = STEPS.length ? STEPS : ['staende', 'auktion'];
  if (steps.includes('staende')) await stalls();
  if (steps.includes('auktion')) await auction();
  for (const st of steps.filter((x) => x.startsWith('angebot:'))) {
    const [, who, item, n, price] = st.split(':');
    const bot = await join(who);
    await rcon(`gamemode survival ${who}`, `clear ${who}`, `give ${who} ${item} ${n}`);
    await sleep(900);
    bot.chat(`/ah verkaufen ${price}`);
    console.log(`  ${who}: ${await waitChat(bot, /Angeboten|nicht|kein/i)}`);
    bot.quit();
    await sleep(1000);
  }
  console.log(await rcon('smpadmin info'));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
