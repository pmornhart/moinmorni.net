/**
 * Treppen-Test: kommt ein echter Test-Spieler (mineflayer, Paper 26.1.2) zu Fuß überall hin – ohne Launchpads?
 * Teil A „ohne Springen“: geradeaus die neuen Treppen hinauf, nur die Vorwärts-Taste (Minecraft steigt Stufen und
 * Treppen von selbst; an einer ganzen Blockstufe bliebe er stehen): Schlosstreppe vom Schlossmarkt zum Vorplatz,
 * Freitreppe in die Bibliothek (Philips Stelle) und in den Festsaal, Prunktreppe zur Galerie.
 * Teil B „Weg finden“: mit Pathfinder vom Ankunftspunkt über Schlossmarkt und Schlosstreppe ins Schloss (Bibliothek,
 * Festsaal, Galerie, Rittersaal) und zurück zur Kapelle – Launchpads werden gemieden.
 *   NODE_PATH=<pathfinder>:~/mm-cache/node/node_modules node treppen-test.cjs <host> <port> <rcon-host:port> <rcon-passwort-datei>
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');

const [HOST = '127.0.0.1', PORT = '25990', RCON = '127.0.0.1:26090', PASS_FILE = '.rcon-pass'] =
  process.argv.slice(2);
const PASS = fs.readFileSync(PASS_FILE, 'utf8').trim();
const RCON_PY = path.join(__dirname, '../mc-client/rcon.py');
const NAME = 'Treppenlaeufer';
/** Ankunft in der Lobby (LOBBY_SPAWN_VIEW in packages/builder/src/lobby/features.ts). */
const SPAWN = { x: 0.5, y: 65, z: 27.5 };

const rcon = (...cmds) => execFileSync('python3', [RCON_PY, RCON, PASS, ...cmds], { encoding: 'utf8' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
};
const where = (bot) => {
  const p = bot.entity.position;
  return `${p.x.toFixed(1)} ${p.y.toFixed(2)} ${p.z.toFixed(1)}`;
};

/** Hinstellen (per RCON), Blickrichtung setzen und nur vorwärts laufen, bis `done` gilt oder die Zeit um ist. */
async function walkStraight(bot, from, yaw, done, ms) {
  rcon(`tp ${NAME} ${from.x} ${from.y} ${from.z} ${yaw} 0`);
  await wait(1500);
  // mineflayer zählt den Blick anders herum als Minecraft (0 = Norden … ) – in Bogenmaß, gegen den Uhrzeigersinn
  await bot.look(((180 - yaw) * Math.PI) / 180, 0, true);
  bot.clearControlStates();
  bot.setControlState('forward', true);
  const t0 = Date.now();
  while (Date.now() - t0 < ms && !done(bot.entity.position)) await wait(100);
  bot.setControlState('forward', false);
  await wait(400);
  return done(bot.entity.position);
}

/** Mit Pathfinder hingehen (ohne Graben, ohne Bauen, ohne Parkour, Launchpads meiden). */
async function walkTo(bot, goal, ms) {
  return Promise.race([
    bot.pathfinder.goto(goal).then(
      () => true,
      (err) => {
        console.log('  Pathfinder:', err.message);
        return false;
      },
    ),
    wait(ms).then(() => false),
  ]).finally(() => bot.pathfinder.setGoal(null));
}

async function main() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: Number(PORT),
    username: NAME,
    version: '26.1',
    auth: 'offline',
  });
  bot.loadPlugin(pathfinder);
  // Bietet die Lobby ihr Möbel-Paket an, wartet der Server in der Anmeldung auf eine Antwort – mineflayer schickt sie
  // dort nicht richtig mit, also hier selbst: angenommen und geladen.
  bot._client.on('add_resource_pack', (data) => {
    if (bot._client.state !== 'configuration') return;
    bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 3 });
    bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 0 });
  });
  bot.on('kicked', (r) => console.log('gekickt:', JSON.stringify(r)));
  await new Promise((r) => bot.once('spawn', r));
  await wait(2500);
  // Springen zählen (Teil A darf es nie tun)
  let jumps = 0;
  const setControl = bot.setControlState.bind(bot);
  bot.setControlState = (control, state) => {
    if (control === 'jump' && state && !bot.controlState.jump) jumps += 1;
    return setControl(control, state);
  };
  // Neue Spieler bekommen mit Hub nach ein paar Sekunden den Rundgang (Zuschauer-Modus) – abwarten, dann abbrechen
  const tourFrom = Date.now();
  while (Date.now() - tourFrom < 10000 && bot.game.gameMode !== 'spectator') await wait(250);
  bot.chat('/rundgang stop');
  await wait(2000);
  rcon(`gamemode adventure ${NAME}`, 'time set 6000', 'weather clear');

  // ---------- Teil A: ohne Springen, nur vorwärts ----------
  jumps = 0;
  check(
    'Schlosstreppe: vom Schlossmarkt geradeaus hinauf bis auf den Vorplatz (ohne Springen)',
    await walkStraight(bot, { x: 0.5, y: 65, z: -30.5 }, 180, (p) => p.z < -72 && p.y >= 90.9, 40000),
    `bei ${where(bot)}, Sprünge: ${jumps}`,
  );
  check('… dabei kein einziger Sprung', jumps === 0, String(jumps));
  jumps = 0;
  check(
    'Philips Stelle 1: von der Bastei durch die Tür in die Bibliothek (ohne Springen)',
    await walkStraight(bot, { x: -18.5, y: 91, z: -111.5 }, 90, (p) => p.x < -31 && p.y >= 92.9, 20000),
    `bei ${where(bot)}, Sprünge: ${jumps}`,
  );
  jumps = 0;
  check(
    'Festsaal: vom Ehrenhof die Freitreppe hinauf in den Saal (ohne Springen)',
    await walkStraight(bot, { x: 0.5, y: 91, z: -118.5 }, 180, (p) => p.z < -130 && p.y >= 92.9, 20000),
    `bei ${where(bot)}, Sprünge: ${jumps}`,
  );
  jumps = 0;
  check(
    'Prunktreppe: im Festsaal die Stufen hinauf zur Galerie (ohne Springen)',
    await walkStraight(bot, { x: -4.5, y: 93, z: -140.5 }, 90, (p) => p.x < -17 && p.y >= 102.9, 20000),
    `bei ${where(bot)}, Sprünge: ${jumps}`,
  );
  jumps = 0;
  check(
    'Prunktreppe rechts: ebenso zur Galerie im Osten (ohne Springen)',
    await walkStraight(bot, { x: 5.5, y: 93, z: -140.5 }, -90, (p) => p.x > 17 && p.y >= 102.9, 20000),
    `bei ${where(bot)}, Sprünge: ${jumps}`,
  );
  check('Teil A ohne einen Sprung', jumps === 0, String(jumps));

  // ---------- Teil B: Weg finden vom Ankunftspunkt ----------
  const moves = new Movements(bot);
  moves.canDig = false;
  moves.allow1by1towers = false;
  moves.allowParkour = false;
  moves.canOpenDoors = true;
  moves.scafoldingBlocks = [];
  // Anzeige-Objekte (Modelle des Prunkbrunnens, Schriften) haben im Spiel keine Kollision – Pathfinder 2.4 kennt sie
  // nicht und hielt sie für Hindernisse (kam am Brunnen nicht vorbei). Figuren bleiben Hindernisse.
  ['item_display', 'block_display', 'text_display', 'interaction', 'marker'].forEach((n) =>
    moves.passableEntities.add(n),
  );
  const plate = bot.registry.blocksByName.light_weighted_pressure_plate;
  if (plate) moves.blocksToAvoid.add(plate.id);
  bot.pathfinder.setMovements(moves);
  rcon(`tp ${NAME} ${SPAWN.x} ${SPAWN.y} ${SPAWN.z} 180 0`);
  await wait(2500);
  // Wege mit Zwischenzielen auf den Wegen (Pathfinder nimmt sonst gern Abkürzungen über Hecken, die er nicht schafft)
  const near = (x, y, z, r = 1) => new goals.GoalNear(x, y, z, r);
  /** Geradeaus gehen (Blick wie in Minecraft, 0 = Süden), bis `done`; als Schritt in einer Wegliste. */
  const forward = (yaw, done, ms) => async () => {
    await bot.look(((180 - yaw) * Math.PI) / 180, 0, true);
    bot.setControlState('forward', true);
    const t0 = Date.now();
    while (Date.now() - t0 < ms && !done(bot.entity.position)) await wait(100);
    bot.setControlState('forward', false);
    await wait(300);
    return done(bot.entity.position);
  };
  /** Tür anklicken wie ein Spieler (nur wenn sie zu ist); als Schritt in einer Wegliste. */
  const openDoor = (x, y, z) => async () => {
    const door = bot.blockAt(new Vec3(x, y, z));
    if (!door || !door.name.endsWith('_door')) return false;
    // mit leerer Hand (mit dem Kompass der Lobby in der Hand öffnet ein Rechtsklick das Menü statt der Tür)
    const empty = [...Array(9).keys()].find((i) => !bot.inventory.slots[bot.inventory.hotbarStart + i]);
    if (empty !== undefined) bot.setQuickBarSlot(empty);
    if (door.getProperties().open !== true) await bot.activateBlock(door);
    await wait(500);
    return true;
  };
  // Am Prunkbrunnen enden die Hecken des Hofs knapp neben dem Beckenrand: Pathfinder schneidet die Ecke schräg und
  // bleibt am Heckenende hängen (ein Mensch geht außen herum) – dort einzeln vorbei, Seite −1 = West, 1 = Ost.
  const aroundFountain = (side, way) =>
    ({
      // vom Querweg nach Süden zum Festsaal bzw. zurück
      south: [near(side * 5, 91, -114, 0), near(side * 4, 91, -116, 0), near(side * 4, 91, -118, 0)],
      up: [near(side * 4, 91, -118, 0), near(side * 4, 91, -116, 0), near(side * 5, 91, -114, 0)],
      // vom Querweg nach Norden zum Tor
      north: [near(side * 5, 91, -110, 0), near(side * 4, 91, -108, 0)],
    })[way];
  const legs = [
    ['Ankunft → Fuß der Schlosstreppe (Schlossmarkt)', [near(0, 65, -32)], 90000],
    ['→ Philips Stelle 2 am Schlossberg (Schlosstreppe)', [near(-4, 83, -57)], 60000],
    ['→ Schlossvorplatz', [near(0, 91, -80)], 60000],
    ['→ durch das Schlosstor in den Ehrenhof', [near(0, 91, -104)], 60000],
    [
      '→ Philips Stelle 1 auf der Bastei vor der Bibliothek',
      [near(-9, 91, -112, 2), near(-19, 91, -111)],
      90000,
    ],
    ['→ in die Bibliothek', [near(-31, 93, -111)], 60000],
    [
      '→ in den Festsaal',
      [
        near(-19, 91, -111, 2),
        near(-9, 91, -112, 2),
        ...aroundFountain(-1, 'south'),
        near(0, 91, -122, 2),
        // gerade durch die Tür (schräg hängt Pathfinder am Türrahmen fest)
        near(0, 93, -131, 0),
        near(-10, 93, -132),
      ],
      120000,
    ],
    // erst in die Mitte des Podests (schräg hängt Pathfinder am Goldpfosten am Fuß der Treppe fest), Ziel oben an der
    // Treppe – weiter hinten auf der Galerie steht unsichtbares Licht auf Kopfhöhe, das mineflayer für fest hält
    ['→ über die Prunktreppe auf die Galerie', [near(-5, 93, -141, 0), near(-19, 103, -140)], 90000],
    [
      '→ in den Rittersaal',
      [
        // die Prunktreppe hinunter, an der Rotunde vorbei, gerade durch die Tür
        near(-5, 93, -141, 0),
        near(-5, 93, -132, 0),
        near(0, 93, -131, 0),
        near(0, 93, -128, 0),
        near(0, 91, -122, 2),
        ...aroundFountain(1, 'up'),
        near(9, 91, -112, 2),
        near(19, 91, -111, 2),
        near(31, 93, -112),
      ],
      180000,
    ],
    [
      '→ zurück zum Dorf und in die Kapelle',
      [
        near(19, 91, -111, 2),
        near(9, 91, -112, 2),
        ...aroundFountain(1, 'north'),
        near(0, 91, -104, 2),
        near(0, 91, -80, 2),
        near(0, 65, -32, 2),
        near(0, 65, 27, 2),
        near(0, 65, 98, 2),
        // Kapelle: vor die Turmtür (Mitte des Blocks), Türen öffnet der Test-Spieler selbst (Pathfinder plant nicht
        // durch geschlossene Türen und bleibt an der Turmecke hängen), dann nur mit der Vorwärts-Taste hindurch
        new goals.GoalXZ(-8, 100),
        openDoor(-8, 65, 103),
        forward(0, (p) => p.z >= 105.5, 8000),
        openDoor(-8, 65, 108),
        forward(0, (p) => p.z >= 111.5, 8000),
        near(-8, 65, 112),
      ],
      300000,
    ],
  ];
  for (const [name, waypoints, ms] of legs) {
    const t0 = Date.now();
    let ok = true;
    for (const goal of waypoints) {
      if (!ok) break;
      ok =
        typeof goal === 'function'
          ? await goal()
          : await walkTo(bot, goal, Math.max(10000, ms - (Date.now() - t0)));
    }
    const p = bot.entity.position;
    const last = waypoints[waypoints.length - 1];
    check(
      name,
      ok && last.isEnd(p.floored()),
      `bei ${where(bot)} nach ${Math.round((Date.now() - t0) / 1000)} s`,
    );
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} bestanden`);
  bot.quit();
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
