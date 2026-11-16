/**
 * Prüft das Winter-Wunderland in einer echten Lobby gegen den Bauplan (über RCON, ohne Motor):
 * - „an“: an jeder Stelle, die der Winter ändert, steht der Winter-Block; außen an den Bergen ist Gras Schneeblock;
 *   alle Winter-Wesen sind da; der Merker liegt; das Biom ist „Verschneite Ebene“ (vorher gemerkte Biome kommen in
 *   eine Kopie neben dem Server, für den Rückweg).
 * - „aus“: überall wieder der alte Block (auch außen Gras), kein Winter-Wesen, kein Merker, die gemerkten Biome sind
 *   zurück.
 *   tsx scripts/winter-probe.ts <server-ordner> <rcon-host:port> <passwort-datei> <an|aus>
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildLobby, forceloadCommands, Rcon, winterPlan, type Canvas } from '@moinmorni/builder';

/** node + Skript stehen vor den eigenen Angaben. */
const ARGS_FROM = 2;
const GROUND = 64;
const SAMPLE_EVERY = 7;
const BIOME_SAMPLES = 400;
const PROGRESS_EVERY = 10_000;
const PASSED = 'Test passed';
/** So viele Beispiele zeigt eine Prüfung, die nicht passt. */
const SHOW = 5;
/**
 * Anzahl aus der Antwort von `execute if entity`: "Test passed. Count: 1366" → 1366; "Test failed" passt nicht.
 * https://regex101.com/?flavor=javascript&regex=count%3A%20(%5Cd%2B)&flags=i&testString=Test%20passed.%20Count%3A%201366
 */
const COUNT = /count: (\d+)/i;
/** Gelände der Lobby festhalten (wie beim Umschalten der Saison), sonst sind die Stellen „not loaded“. */
const AREA = 216;
const LOAD_SPAN = 4;
const LOAD_WAIT_MS = 2000;
const CORNERS = [-220, 220];
/** Biom-Zellen sind 4 Blöcke groß; geprüft wird auf Höhe 100 (mitten im gemerkten Bereich 48 … 255). */
const CELL = 4;
const BIOME_Y = 100;
const [dir = '.', addr = '127.0.0.1:25575', passFile = '.rcon-pass', mode = 'an'] =
  process.argv.slice(ARGS_FROM);
const [host = '127.0.0.1', port = '25575'] = addr.split(':');
const winterOn = mode === 'an';

interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Block als Bedingung für `execute if block` (ohne Zustand bei Luft). */
const predicate = (block: string): string => (block === 'air' ? 'minecraft:air' : `minecraft:${block}`);

async function positions(
  rcon: Rcon,
  list: ReadonlyArray<readonly [number, number, number, string]>,
): Promise<string[]> {
  const wrong: string[] = [];
  await list.reduce(async (prev, [x, y, z, block], i) => {
    await prev;
    const answer = await rcon.command(`execute if block ${x} ${y} ${z} ${predicate(block)}`);
    if (!answer.startsWith(PASSED)) wrong.push(`${x} ${y} ${z} soll ${block}`);
    if (i % PROGRESS_EVERY === 0) process.stdout.write(`  … ${i}/${list.length}\n`);
  }, Promise.resolve());
  return wrong;
}

/** Gras an den Bergen (außen, Würfel des Plans): Stichprobe. */
function mountainSample(
  canvas: Canvas,
  boxes: ReturnType<typeof winterPlan>['mountains'],
): Array<[number, number, number, string]> {
  const inBox = (x: number, y: number, z: number): boolean =>
    boxes.some((b) => x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2 && z >= b.z1 && z <= b.z2);
  return canvas
    .find((b) => b === 'grass_block')
    .filter(([x, y, z], i) => i % SAMPLE_EVERY === 0 && inBox(x, y, z))
    .map(([x, y, z]) => [x, y, z, winterOn ? 'snow_block' : 'grass_block']);
}

async function main(): Promise<void> {
  // Erst rechnen (dauert ein paar Sekunden), dann verbinden – sonst schließt RCON die stille Verbindung.
  const { canvas } = buildLobby();
  const plan = winterPlan(canvas);
  const rcon = new Rcon();
  await rcon.connect(host, Number(port), fs.readFileSync(passFile, 'utf8').trim());
  await forceloadCommands(0, 0, 'add', AREA, LOAD_SPAN).reduce(async (prev, cmd) => {
    await prev;
    await rcon.command(cmd);
  }, Promise.resolve());
  // Nacheinander fragen: Minecrafts RCON trennt, wenn mehrere Befehle auf einmal ankommen.
  const loaded = async (): Promise<boolean> => {
    const answers = await CORNERS.flatMap((x) => CORNERS.map((z) => [x, z] as const)).reduce<
      Promise<string[]>
    >(
      async (prev, [x, z]) => [...(await prev), await rcon.command(`execute if loaded ${x} ${GROUND} ${z}`)],
      Promise.resolve([]),
    );
    return answers.every((a) => a.startsWith(PASSED));
  };
  const waitLoaded = async (): Promise<void> => {
    if (await loaded()) return;
    await new Promise((r) => setTimeout(r, LOAD_WAIT_MS));
    return waitLoaded();
  };
  await waitLoaded();
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail = ''): void => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` – ${detail}` : ''}`);
  };
  const expected = (winterOn ? plan.blocks : plan.restore).find(() => true);
  console.log(`Stellen innen: ${expected.length}`);
  const wrong = await positions(rcon, expected);
  check(
    winterOn ? 'innen: jede Winter-Stelle gesetzt' : 'innen: jede Stelle wieder wie vorher',
    wrong.length === 0,
    wrong.length > 0
      ? `${wrong.length} falsch, z. B. ${wrong.slice(0, SHOW).join('; ')}`
      : `${expected.length} Stellen`,
  );
  const outer = mountainSample(canvas, plan.mountains);
  const wrongOuter = await positions(rcon, outer);
  check(
    winterOn ? 'außen: Gras an den Bergen ist Schnee' : 'außen: Gras an den Bergen wieder Gras',
    wrongOuter.length === 0,
    wrongOuter.length > 0
      ? `${wrongOuter.length} falsch, z. B. ${wrongOuter.slice(0, SHOW).join('; ')}`
      : `${outer.length} Stichproben`,
  );
  const entities = await rcon.command('execute if entity @e[tag=mm_season_winter]');
  const count = Number(COUNT.exec(entities)?.[1] ?? 0);
  const shown = plan.displays.length;
  check(
    winterOn ? 'Winter-Wesen alle da' : 'kein Winter-Wesen mehr',
    winterOn ? count >= shown : count === 0,
    `${count} (Plan: ${shown} + Lichter über den Gassen)`,
  );
  const flag = await rcon.command('execute if data storage moinmorni:season {winter:1b}');
  check(
    winterOn ? 'Merker „Winter liegt“ gesetzt' : 'Merker weg',
    flag.startsWith(PASSED) === winterOn,
    flag,
  );
  // Biome: Kopie der gemerkten Biome (das Plugin löscht seine Datei nach dem Rückweg)
  const kept = path.join(dir, 'plugins/moinmorni/winter-biome.txt');
  const copy = path.join(dir, 'winter-biome.probe.txt');
  if (winterOn && fs.existsSync(kept)) fs.copyFileSync(kept, copy);
  const lines = fs.existsSync(copy) ? fs.readFileSync(copy, 'utf8').trim().split('\n') : [];
  // `execute if biome` liest Minecrafts „unscharfes“ Biom (auch aus der Nachbarzelle) – darum nur Säulen prüfen,
  // deren Nachbarn dasselbe Biom hatten, und mitten in der Höhe (das Plugin merkt Zellen ab y 48).
  const biomeAt = new Map(lines.map((l) => l.split(' ')).map((p) => [`${p[0]},${p[1]}`, p[4] ?? '']));
  const calm = lines
    .map((l) => l.split(' '))
    .filter(([x = '0', z = '0', , , biome]) =>
      [-CELL, 0, CELL].every((dx) =>
        [-CELL, 0, CELL].every((dz) => biomeAt.get(`${Number(x) + dx},${Number(z) + dz}`) === biome),
      ),
    );
  const sample = calm.filter((_, i) => i % Math.max(1, Math.floor(calm.length / BIOME_SAMPLES)) === 0);
  const biomeWrong = await sample.reduce<Promise<string[]>>(async (prev, [x, z, , , biome]) => {
    const list = await prev;
    const want = winterOn ? 'minecraft:snowy_plains' : (biome ?? '');
    const answer = await rcon.command(`execute if biome ${x} ${BIOME_Y} ${z} ${want}`);
    return answer.startsWith(PASSED) ? list : [...list, `${x} ${BIOME_Y} ${z} soll ${want}`];
  }, Promise.resolve([]));
  check(
    winterOn ? 'Biom: verschneit (Stichprobe)' : 'Biom: wieder wie vorher (Stichprobe)',
    sample.length > 0 && biomeWrong.length === 0,
    `${sample.length} Stellen${biomeWrong.length > 0 ? `, falsch: ${biomeWrong.slice(0, SHOW).join('; ')}` : ''}`,
  );
  await forceloadCommands(0, 0, 'remove', AREA).reduce(async (prev, cmd) => {
    await prev;
    await rcon.command(cmd);
  }, Promise.resolve());
  rcon.close();
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} Prüfungen grün`);
  // Kein process.exit(): in eine Pipe geschriebene Zeilen kämen sonst nicht mehr an.
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
