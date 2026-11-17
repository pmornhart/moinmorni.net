#!/usr/bin/env node
// Darsteller per Befehl steuern (für Drehbücher und shot.py): liest Zeilen „<Name> <befehl> [werte …]“ von stdin.
//
//   node regie.cjs <host> <port> [version] Name1 Name2 …          (Version Standard 26.1)
//   tail -n0 -F /tmp/regie | node regie.cjs 127.0.0.1 26110 Mila_Sonne Toni_Wandert
//
// Befehle (Zeiten in Spielzeit-Sekunden, Orte als x y z):
//   geh x y z [sprint] [genau=0.4] [blick=Ziel]     hingehen mit Wegsuche   · lauf x y z  (rennen)
//   folge <Name> [abstand]                           hinterher               · stopp
//   blick <Name|x y z|kamera|frei>                   Kopf auf ein Ziel (frei = wieder umherschauen)
//   leute <0..1> · kamera <0..1>                     wie oft der Blick zu Leuten bzw. zur Kamera springt
//   kaempfe <Gegner> [dauer=8] [stil=modern|klassisch] [cps=8] [krit=0.35] [schild=0] [waffe=sword] [treffer=n]
//   bruecke <nord|sued|ost|west> [anzahl] [material=planks]
//   truhe x y z [nimm=alles|text] [dann=sword]       hingehen, öffnen, ausräumen
//   essen · nimm <text> · slot <0-8> · chat <text …> · gruss · springe [n] · schleiche an|aus
//   bogen <Ziel> [spannen=1.1] · schild [s] · klick x y z [seite] · setze x y z <seite>
//   grabe x y z                                      Block abbauen (mit Blick, Werkzeug in der Hand)
//   bahn x,y,z,t x,y,z,t …                           geführte Bahn (weich, Beine laufen mit)
//   renne x z [sekunden] [springe]                   stur geradeaus rennen (ohne Wegsuche, z. B. über einen Heuwagen)
//   physik an|aus                                   eigene Physik aus, wenn der Server den Darsteller führt
//   * kamera x y z                                   Ort der Kamera (shot.py meldet ihn laufend)
// Alte Befehle aus actors.cjs/wk-actors.cjs gehen weiter: swing, use, unuse, attack, hit, equip, open, place, take,
// click, close, inv, sneak.
'use strict';
const { Ensemble, Vec3 } = require('./darsteller.cjs');
const zeit = require('./zeit.cjs');

const [host, port, maybeVersion, ...rest] = process.argv.slice(2);
const version = /^\d+\.\d+/.test(maybeVersion || '') ? maybeVersion : '26.1';
const names = /^\d+\.\d+/.test(maybeVersion || '') ? rest : [maybeVersion, ...rest].filter(Boolean);
const ens = new Ensemble({ host, port: Number(port), version });
for (const n of names) ens.add(n).catch((e) => console.log('FEHLER', n, e.message));

const FACES = ['down', 'up', 'north', 'south', 'west', 'east'];

function opts(args) {
  const o = {}, pos = [];
  for (const a of args) {
    const m = /^([a-zäöü]+)=(.*)$/i.exec(a);
    if (m) o[m[1]] = /^-?\d+(\.\d+)?$/.test(m[2]) ? Number(m[2]) : m[2];
    else pos.push(a);
  }
  return [o, pos];
}

const nums = (a) => a.slice(0, 3).map(Number);

async function handle(line) {
  const parts = line.trim().split(/\s+/);
  if (!parts[0] || parts[0].startsWith('#')) return;
  const [name, act, ...args] = parts;
  if (name === '*') {
    if (act === 'kamera') ens.camera = nums(args);
    else if (act === 'kameraname') ens.cameraName = args[0];
    else for (const a of Object.values(ens.actors)) handle(`${a.name} ${act} ${args.join(' ')}`);
    return;
  }
  const a = ens.get(name);
  if (!a || !a.bot) return;
  const bot = a.bot;
  const [o, pos] = opts(args);
  switch (act) {
    case 'geh': case 'lauf': {
      const blick = o.blick ? (/,/.test(o.blick) ? o.blick.split(',').map(Number) : o.blick) : null;
      return a.geh(nums(pos), { sprint: act === 'lauf' || pos.includes('sprint'), genau: o.genau ?? 0.4, blick });
    }
    case 'folge': return a.folge(pos[0], { abstand: Number(pos[1] || o.abstand || 2.5), sprint: pos.includes('sprint') });
    case 'stopp': a.run('stopp', async () => {}); return a.stop();
    case 'blick':
      if (pos[0] === 'frei') { a.look = null; return; }
      if (pos.length >= 3 && !Number.isNaN(Number(pos[0]))) { a.look = new Vec3(...nums(pos)); return; }
      a.look = pos[0];
      return;
    case 'leute': a.mood.leute = Number(pos[0]); return;
    case 'kamera': a.mood.kamera = Number(pos[0]); return;
    case 'leerlauf': a.idle = pos[0] !== 'aus'; return;
    case 'kaempfe': return a.kaempfe(pos[0], o);
    case 'bruecke': return a.bruecke(pos[0], Number(pos[1] || 6), o.material ? { material: o.material } : {});
    case 'truhe': return a.truhe(...nums(pos), o);
    case 'essen': return a.essen(pos[0]);
    case 'nimm': case 'equip': return a.nimm(pos.join(' '));
    case 'slot': return a.slot(Number(pos[0]));
    case 'chat': return a.chat(args.join(' '));
    case 'gruss': return a.gruss(Number(pos[0] || 3));
    case 'springe': return a.springe(Number(pos[0] || 1));
    case 'schleiche': case 'sneak': return a.schleiche(pos[0] !== 'aus' && pos[0] !== 'off');
    case 'bogen': return a.bogen(pos[0], o);
    case 'schild': return a.schild(Number(pos[0] || 1));
    case 'klick': return a.klick(...nums(pos), pos[3] || 'up');
    case 'grabe': case 'dig': return a.grabe(...nums(pos));
    case 'setze': case 'place': return a.setze(...nums(pos), pos[3] || 'up');
    // Physik aus, wenn der Server den Darsteller selbst führt (z. B. ein Test-Autopilot, der ihn jeden Tick versetzt)
    case 'physik': bot.physicsEnabled = !['aus', 'off'].includes(pos[0]); if (!bot.physicsEnabled) a.stop(); return;
    case 'renne': {  // renne x z [sekunden] [springe]: stur geradeaus Richtung (x|z), ohne Wegsuche (z. B. auf einen Heuwagen)
      a.stop();
      const [x, z, sek] = [Number(pos[0]), Number(pos[1]), Number(pos[2] || 2)];
      a.look = new Vec3(x, bot.entity.position.y + 1.6, z);  // Kopf (und damit Laufrichtung) erst hindrehen
      await zeit.wait(450);
      bot.setControlState('forward', true); bot.setControlState('sprint', true);
      if (pos.includes('springe')) bot.setControlState('jump', true);
      await zeit.wait(sek * 1000);
      for (const c of ['forward', 'sprint', 'jump']) bot.setControlState(c, false);
      a.look = null;
      a.log('FERTIG', 'renne');
      return;
    }
    case 'bahn': return a.bahn(pos.map((s) => { const v = s.split(',').map(Number); return { p: v.slice(0, 3), t: v[3] || 0 }; }));
    // ältere Befehle
    case 'swing': return a.schwing(pos[0] === 'links' ? 'left' : 'right');
    case 'use': bot.activateItem(pos[0] === 'off'); return;
    case 'unuse': bot.deactivateItem(); return;
    case 'attack': case 'hit': {
      const t = bot.players[pos[0]] && bot.players[pos[0]].entity;
      if (t) bot.attack(t); else bot.swingArm('right');
      return;
    }
    case 'open': return a.useBlock(...nums(pos), 1);
    case 'take': {
      const w = bot.currentWindow;
      if (!w) return;
      for (let s = 0; s < w.inventoryStart; s++) if (w.slots[s]) { await bot.clickWindow(s, 0, 1).catch(() => {}); await zeit.wait(120); }
      return;
    }
    case 'click': return bot.clickWindow(Number(pos[0]), 0, 0).catch((e) => a.log('FEHLER', 'click', e.message));
    case 'close': if (bot.currentWindow) bot.closeWindow(bot.currentWindow); return;
    case 'inv': a.log('INV', bot.inventory.items().map((i) => `${i.name}×${i.count}`).join(', ')); return;
    default: a.log('FEHLER', `unbekannter Befehl ${act}`);
  }
}

require('readline').createInterface({ input: process.stdin }).on('line', (line) => {
  Promise.resolve(handle(line)).catch((e) => console.log('FEHLER', line, e.message));
});
process.on('SIGTERM', () => { ens.close(); setTimeout(() => process.exit(0), 500); });
process.on('SIGINT', () => { ens.close(); setTimeout(() => process.exit(0), 500); });
void FACES;
