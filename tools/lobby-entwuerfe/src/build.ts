/**
 * Baut Entwürfe in eine Test-Welt: `tsx src/build.ts a [b c]`.
 * Umgebung: MM_RCON=host:port, MM_RCON_PASS_FILE=Pfad zur Passwort-Datei.
 */
import fs from 'node:fs';
import { clearCommands, forceloadCommands, Rcon, runAll, type Canvas } from '@moinmorni/builder';
import { A, draftA } from './draft-a.js';
import { B, draftB } from './draft-b.js';
import { C, draftC } from './draft-c.js';

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
    await runAll(rcon, forceloadCommands(d.cx, d.cz, 'add'));
    await runAll(rcon, [`kill @e[type=!player,x=${d.cx},y=64,z=${d.cz},distance=..320]`]);
    await runAll(rcon, clearCommands(d.cx, d.cz));
    await runAll(rcon, [`kill @e[type=item,x=${d.cx},y=64,z=${d.cz},distance=..320]`]);
    const errors = await runAll(rcon, cmds, (done, total) => process.stdout.write(`\r  ${done}/${total}`));
    console.log(`\n  fertig in ${Math.round((Date.now() - t0) / MS)} s`);
    const real = errors.filter((e) => !e.includes('Could not set the block'));
    real.slice(0, 15).forEach((e) => console.log('  ✗', e.slice(0, 220)));
    await runAll(rcon, forceloadCommands(d.cx, d.cz, 'remove'));
  }, Promise.resolve());
  rcon.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
