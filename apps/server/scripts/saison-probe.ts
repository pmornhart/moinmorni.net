/**
 * Prüft die Blöcke und Wesen einer Saison mit Bauten (Wiesn, Ostern, Halloween; den Winter prüft `winter-probe.ts`
 * genauer) in einer echten Lobby gegen den Bauplan (über RCON, ohne Motor):
 * - „an“: an jeder Stelle, die die Saison ändert, steht ihr Block; ihre Wesen sind da; ihr Merker liegt.
 * - „aus“: überall wieder der alte Block (außer wo gerade eine andere Saison mit Bauten steht), keines ihrer Wesen,
 *   kein Merker.
 *   tsx scripts/saison-probe.ts <server-ordner> <rcon-host:port> <passwort-datei> <saison> <an|aus>
 */
import fs from 'node:fs';
import {
  buildLobby,
  forceloadCommands,
  Rcon,
  seasonPlan,
  seasonPlans,
  type Canvas,
  type Season,
  type SeasonPlan,
} from '@moinmorni/builder';

/** node + Skript stehen vor den eigenen Angaben. */
const ARGS_FROM = 2;
const GROUND = 64;
const PROGRESS_EVERY = 10_000;
const PASSED = 'Test passed';
const SHOW = 5;
/** Eigenes Biom der Saison (setzt das Lobby-Plugin, siehe LobbyWinter.java) – Winter prüft winter-probe.ts. */
const BIOMES: Readonly<Partial<Record<string, string>>> = {
  easter: 'cherry_grove',
  halloween: 'pale_garden',
};
const BIOME_TRIES = 30;
const BIOME_WAIT_MS = 2000;
/**
 * Anzahl aus der Antwort von `execute if entity`: "Test passed. Count: 1366" → 1366.
 * https://regex101.com/?flavor=javascript&regex=count%3A%20(%5Cd%2B)&flags=i&testString=Test%20passed.%20Count%3A%201366
 */
const COUNT = /count: (\d+)/i;
const AREA = 216;
const LOAD_SPAN = 4;
const LOAD_WAIT_MS = 2000;
/** Ecken des Geländes: geladen, wenn alle vier antworten. */
const EDGE = 220;
const CORNERS = [-EDGE, EDGE];
const [, addr = '127.0.0.1:25575', passFile = '.rcon-pass', name = 'wiesn', mode = 'an'] =
  process.argv.slice(ARGS_FROM);
const [host = '127.0.0.1', port = '25575'] = addr.split(':');
const on = mode === 'an';
const season = name as Season;

const predicate = (block: string): string => (block === 'air' ? 'minecraft:air' : `minecraft:${block}`);

/**
 * Stellen, die gerade eine andere Saison mit Bauten belegt (ihr Merker liegt): dort steht zu Recht deren Block – der
 * Rückweg dieser Saison gilt dort erst, wenn auch die andere wieder weg ist.
 */
async function takenByOthers(
  rcon: Rcon,
  canvas: Canvas,
  own: string,
): Promise<(x: number, y: number, z: number) => boolean> {
  const others = Object.entries(seasonPlans(canvas)).filter(([s]) => s !== own);
  const active = await others.reduce<Promise<SeasonPlan[]>>(async (prev, [s, p]) => {
    const list = await prev;
    const flag = await rcon.command(`execute if data storage moinmorni:season {${s}:1b}`);
    return flag.startsWith(PASSED) ? [...list, p] : list;
  }, Promise.resolve([]));
  return (x, y, z) => active.some((p) => p.blocks.get(x, y, z) !== undefined);
}

async function main(): Promise<void> {
  const { canvas } = buildLobby();
  const plan = seasonPlan(season, canvas);
  if (!plan) throw new Error(`Saison ohne Bauten: ${season}`);
  const rcon = new Rcon();
  await rcon.connect(host, Number(port), fs.readFileSync(passFile, 'utf8').trim());
  await forceloadCommands(0, 0, 'add', AREA, LOAD_SPAN).reduce(async (prev, cmd) => {
    await prev;
    await rcon.command(cmd);
  }, Promise.resolve());
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
  const results: boolean[] = [];
  const check = (label: string, ok: boolean, detail = ''): void => {
    results.push(ok);
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` – ${detail}` : ''}`);
  };
  const taken = on ? (): boolean => false : await takenByOthers(rcon, canvas, season);
  const all = (on ? plan.blocks : plan.restore).find(() => true);
  const expected = all.filter(([x, y, z]) => !taken(x, y, z));
  if (expected.length < all.length)
    console.log(`  ${all.length - expected.length} Stellen gehören gerade einer anderen Saison`);
  const wrong: string[] = [];
  await expected.reduce(async (prev, [x, y, z, block], i) => {
    await prev;
    const answer = await rcon.command(`execute if block ${x} ${y} ${z} ${predicate(block)}`);
    if (!answer.startsWith(PASSED)) wrong.push(`${x} ${y} ${z} soll ${block}`);
    if (i % PROGRESS_EVERY === 0) process.stdout.write(`  … ${i}/${expected.length}\n`);
  }, Promise.resolve());
  check(
    on ? `jede ${season}-Stelle gesetzt` : 'jede Stelle wieder wie vorher',
    wrong.length === 0,
    wrong.length > 0
      ? `${wrong.length} falsch, z. B. ${wrong.slice(0, SHOW).join('; ')}`
      : `${expected.length} Stellen`,
  );
  const entities = await rcon.command(`execute if entity @e[tag=mm_season_${season}]`);
  const count = Number(COUNT.exec(entities)?.[1] ?? 0);
  check(
    on ? `${season}-Wesen alle da` : `kein ${season}-Wesen mehr`,
    on ? count >= plan.displays.length : count === 0,
    `${count} (Plan: ${plan.displays.length})`,
  );
  const biome = BIOMES[season];
  if (biome) {
    const isBiome = async (): Promise<boolean> =>
      (await rcon.command(`execute if biome 0 ${GROUND + 6} 0 minecraft:${biome}`)).startsWith(PASSED);
    const settled = async (left: number): Promise<boolean> => {
      if ((await isBiome()) === on || left <= 0) return (await isBiome()) === on;
      await new Promise((r) => setTimeout(r, BIOME_WAIT_MS));
      return settled(left - 1);
    };
    check(on ? `Biom ${biome}` : `Biom nicht mehr ${biome}`, await settled(BIOME_TRIES));
  }
  const flag = await rcon.command(`execute if data storage moinmorni:season {${season}:1b}`);
  check(on ? 'Merker gesetzt' : 'Merker weg', flag.startsWith(PASSED) === on, flag);
  await forceloadCommands(0, 0, 'remove', AREA).reduce(async (prev, cmd) => {
    await prev;
    await rcon.command(cmd);
  }, Promise.resolve());
  rcon.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} Prüfungen grün`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
