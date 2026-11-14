/**
 * Baut Entwürfe in eine Test-Welt: `tsx src/build.ts a [b c]`.
 * Umgebung: MM_RCON=host:port, MM_RCON_PASS_FILE=Pfad zur Passwort-Datei.
 */
import fs from 'node:fs';
import { Rcon, runAll, type Canvas } from '@moinmorni/builder';
import { A, draftA } from './draft-a.js';
import { B, draftB } from './draft-b.js';
import { C, draftC } from './draft-c.js';

const CHUNK = 16;
const FORCELOAD_SPAN = 12;
const RADIUS = 216;
const SLICE = 128;
const TOP = 320;
const MS = 1000;

type Draft = {
  readonly cx: number;
  readonly cz: number;
  readonly name: string;
  readonly build: () => { canvas: Canvas };
};
const DRAFTS: Readonly<Record<string, Draft>> = {
  a: { ...A, build: draftA },
  b: { ...B, build: draftB },
  c: { ...C, build: draftC },
};

/** forceload-Befehle in Stücken (Minecraft erlaubt höchstens 256 Chunks pro Befehl). */
function forceload(cx: number, cz: number, action: 'add' | 'remove'): string[] {
  const from = (v: number): number => Math.floor((v - RADIUS) / CHUNK);
  const to = (v: number): number => Math.floor((v + RADIUS) / CHUNK);
  const xs = Array.from({ length: to(cx) - from(cx) + 1 }, (_, i) => from(cx) + i).filter(
    (v, i) => i % FORCELOAD_SPAN === 0,
  );
  const zs = Array.from({ length: to(cz) - from(cz) + 1 }, (_, i) => from(cz) + i).filter(
    (v, i) => i % FORCELOAD_SPAN === 0,
  );
  return xs.flatMap((x) =>
    zs.map((z) => {
      const x2 = Math.min(to(cx), x + FORCELOAD_SPAN - 1);
      const z2 = Math.min(to(cz), z + FORCELOAD_SPAN - 1);
      return `forceload ${action} ${x * CHUNK} ${z * CHUNK} ${x2 * CHUNK} ${z2 * CHUNK}`;
    }),
  );
}

/** Fläche auf die flache Grundwelt zurücksetzen (Stein, Erde, Gras auf 64, darüber Luft). */
function clear(cx: number, cz: number): string[] {
  const chunks = (v: number): number[] => {
    const a = Math.floor((v - RADIUS) / CHUNK);
    const b = Math.floor((v + RADIUS) / CHUNK);
    return Array.from({ length: b - a + 1 }, (_, i) => (a + i) * CHUNK);
  };
  const end = CHUNK - 1;
  return chunks(cx).flatMap((x) =>
    chunks(cz).flatMap((z) => [
      `fill ${x} 48 ${z} ${x + end} 60 ${z + end} stone strict`,
      `fill ${x} 61 ${z} ${x + end} 63 ${z + end} dirt strict`,
      `fill ${x} 64 ${z} ${x + end} 64 ${z + end} grass_block strict`,
      `fill ${x} 65 ${z} ${x + end} ${64 + SLICE} ${z + end} air strict`,
      `fill ${x} ${65 + SLICE} ${z} ${x + end} ${64 + 2 * SLICE} ${z + end} air strict`,
      `fill ${x} ${65 + 2 * SLICE} ${z} ${x + end} ${TOP} ${z + end} air strict`,
    ]),
  );
}

async function main(): Promise<void> {
  const [host = '127.0.0.1', port = '25710'] = (process.env.MM_RCON ?? '127.0.0.1:25710').split(':');
  const password = fs.readFileSync(process.env.MM_RCON_PASS_FILE ?? '.rcon-pass', 'utf8').trim();
  const wanted = process.argv.slice(2);
  const rcon = new Rcon();
  await rcon.connect(host, Number(port), password);
  await wanted.reduce(async (prev, id) => {
    await prev;
    const d = DRAFTS[id];
    if (!d) throw new Error(`Unbekannter Entwurf: ${id}`);
    const t0 = Date.now();
    const { canvas } = d.build();
    const cmds = canvas.commands();
    console.log(
      `Entwurf ${id} (${d.name}): ${canvas.size} Blöcke → ${cmds.length} Befehle (${Date.now() - t0} ms)`,
    );
    await runAll(rcon, forceload(d.cx, d.cz, 'add'));
    await runAll(rcon, [`kill @e[type=!player,x=${d.cx},y=64,z=${d.cz},distance=..320]`]);
    await runAll(rcon, clear(d.cx, d.cz));
    await runAll(rcon, [`kill @e[type=item,x=${d.cx},y=64,z=${d.cz},distance=..320]`]);
    const errors = await runAll(rcon, cmds, (done, total) => process.stdout.write(`\r  ${done}/${total}`));
    console.log(`\n  fertig in ${Math.round((Date.now() - t0) / MS)} s`);
    const real = errors.filter((e) => !e.includes('Could not set the block'));
    real.slice(0, 15).forEach((e) => console.log('  ✗', e.slice(0, 220)));
    await runAll(rcon, forceload(d.cx, d.cz, 'remove'));
  }, Promise.resolve());
  rcon.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
