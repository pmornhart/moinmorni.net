#!/usr/bin/env node
// Alle Darsteller aus actors.json in einer Reihe aufstellen und vom echten Client fotografieren (vorne und hinten) –
// zum Prüfen der eigenen Skins. Bühne in der Oberwelt (Grasfläche hoch in der Luft, nur Himmel dahinter).
//
//   node aufstellung.cjs <host:port> <rcon-host:port> <rcon-passwort-datei> <kamera-name> <anzeige> <ausgabe-ordner>
//   (MM_EINZELN=0: je Gruppe eine Reihe statt Einzelbilder; vorher Anzeige aus: python3 ../hud.py <anzeige> aus)
//
// Der Client (tools/mc-client/launch.py) muss mit dem Skin-Paket laufen (siehe skins/README.md). Bilder nur lokal!
'use strict';
const { Ensemble, zeit } = require('./darsteller.cjs');
const { rcon } = require('./rcon.cjs');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [game, rconAddr, passFile, cam, display, out] = process.argv.slice(2);
const actors = JSON.parse(fs.readFileSync(path.join(__dirname, 'actors.json'), 'utf8')).darsteller;
const [host, port] = game.split(':');
const Y = 150, Z = 0, GAP = 1.08;
const STAGE = process.env.MM_STAGE_CMD_PREFIX || 'execute in minecraft:overworld run';

(async () => {
  const rc = await rcon(rconAddr, fs.readFileSync(passFile, 'utf8').trim());
  const O = (c) => rc(`${STAGE} ${c}`);
  fs.mkdirSync(out, { recursive: true });
  await O(`forceload add -20 -16 20 16`);
  await O(`fill -16 ${Y - 1} -12 16 ${Y - 1} 6 minecraft:grass_block`);
  await O(`fill -16 ${Y} -12 16 ${Y + 4} 6 minecraft:air`);
  await rc('time set 6000'); await rc('weather clear'); await rc('gamerule advance_time false').catch(() => {});
  await rc('gamerule doDaylightCycle false').catch(() => {});
  // Je Gruppe (schmal, breit) nur neun Darsteller gleichzeitig – spart Speicher.
  const groups = [actors.filter((a) => a.modell === 'slim'), actors.filter((a) => a.modell === 'wide')];
  let e = null;
  await rc(`regie raus ${cam}`).catch(() => {});
  await rc(`gamemode spectator ${cam}`);
  const place = async (row, face) => {
    for (const [k, a] of row.entries()) {
      const d = e.get(a.name);
      d.idle = false;
      await rc(`regie raus ${a.name}`).catch(() => {});
      await rc(`gamemode adventure ${a.name}`);
      await rc(`clear ${a.name}`);
      const x = (k - (row.length - 1) / 2) * GAP;
      await O(`tp ${a.name} ${x.toFixed(2)} ${Y} ${Z} ${face === 'vorne' ? 180 : 0} 0`);
      d.look = { yaw: face === 'vorne' ? 0 : Math.PI, pitch: -0.02 };
      d.face(d.look);
    }
  };
  const xdo = (...a) => execFileSync('xdotool', a, { env: { ...process.env, DISPLAY: display } });
  let hud = process.env.MM_EINZELN === '0';
  const single = process.env.MM_EINZELN !== '0';
  for (const [gi, row] of groups.entries()) {
    if (e) { e.close(); await zeit.wait(3000); }
    e = new Ensemble({ host, port: Number(port) });
    for (const a of row) await e.add(a.name);
    await zeit.wait(3000);
    if (!single) {
      for (const face of ['vorne', 'hinten']) {
        await place(row, face);
        await O(`tp ${cam} 0 ${Y + 1.0} ${Z - 4.3} 0 4`);
        await zeit.wait(4500);
        if (hud) { xdo('key', 'F1'); hud = false; await zeit.wait(800); }
        const f = path.join(out, `reihe-${gi === 0 ? 'schmal' : 'breit'}-${face}.png`);
        execFileSync('import', ['-window', 'root', f], { env: { ...process.env, DISPLAY: display } });
        console.log('BILD', f);
      }
      continue;
    }
    // Einzeln: jeder für sich in der Mitte, die anderen hinter der Kamera geparkt
    for (const a of row) {
      await rc(`regie raus ${a.name}`).catch(() => {});
      await rc(`gamemode adventure ${a.name}`);
      await rc(`clear ${a.name}`);
      await O(`tp ${a.name} 0.5 ${Y} -10.5`);
    }
    await O(`tp ${cam} 0.5 ${Y - 0.62} ${Z - 2.1} 0 0`);  // Augen auf Brusthöhe, 2,6 Blöcke vor der Figur
    for (const [k, a] of row.entries()) {
      const d = e.get(a.name);
      d.idle = false;
      for (const face of ['vorne', 'hinten']) {
        await O(`tp ${a.name} 0.5 ${Y} ${Z + 0.5} ${face === 'vorne' ? 180 : 0} 0`);
        d.look = { yaw: face === 'vorne' ? 0 : Math.PI, pitch: -0.03 };
        d.face(d.look);
        await zeit.wait(k === 0 && face === 'vorne' ? 3500 : 1700);
        const f = path.join(out, `einzeln-${a.name}-${face}.png`);
        execFileSync('import', ['-window', 'root', '-crop', '440x620+580+100', f], { env: { ...process.env, DISPLAY: display } });
        console.log('BILD', f);
      }
      await O(`tp ${a.name} 0.5 ${Y} -10.5`);
    }
  }
  e.close(); rc.close();
  setTimeout(() => process.exit(0), 800);
})().catch((err) => { console.error(err); process.exit(1); });
