/* eslint-disable ts-patterns/no-magic-numbers -- render tool: sample rates, loudness and quality as the encoders take them */
/**
 * Klangdateien der Lobbymusik: jedes Lied aus `packages/builder/src/musik/lieder/` → MIDI → FluidSynth mit dem
 * Klangsatz FluidR3_GM (MIT-Lizenz) → ffmpeg (Lautheit angleichen, Ogg Vorbis) → `apps/server/musik/<lied>.ogg`.
 * `apps/server/musik/lieder.json` merkt sich je Lied einen Fingerabdruck der Noten – ändert sich ein Lied, schlägt der
 * Test `apps/server/test/lobby-music.test.ts` an, bis die Datei neu gerendert ist.
 *
 *   npx tsx tools/lobby-musik/src/render.ts [--nur id1,id2] [--proben <ordner>] [--alle]
 *
 * Ohne `--alle` rendert es nur Lieder, deren Fingerabdruck sich geändert hat (oder deren Datei fehlt).
 * Braucht `fluidsynth`, `ffmpeg` (mit libvorbis) und `/usr/share/sounds/sf2/FluidR3_GM.sf2` (Paket fluid-soundfont-gm).
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_SONGS,
  arrange,
  lengthSeconds,
  midiSeconds,
  songFingerprint,
  songMidi,
} from '../../../packages/builder/src/musik/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../apps/server/musik');
const MANIFEST = path.join(OUT, 'lieder.json');
const SF2 = process.env['MM_SF2'] ?? '/usr/share/sounds/sf2/FluidR3_GM.sf2';
const RATE = 44100;
/** Ziel-Lautheit (LUFS) – etwa wie Minecrafts eigene Musik, Spitzen unter −1,5 dB. */
const LOUDNESS = -18;
const PEAK = -1.5;
/** Vorbis-Qualität (−1 … 10): 0 ≈ 50 kbit/s in Stereo – für Blasmusik im Spiel reicht das gut. */
const QUALITY = 0;
const FADE_OUT = 1.2;

interface Entry {
  readonly fingerprint: string;
  readonly seconds: number;
  readonly bytes: number;
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = flag('--nur')?.split(',');
const samples = flag('--proben');
const all = args.includes('--alle');

const manifest: Record<string, Entry> = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
  : {};
mkdirSync(OUT, { recursive: true });
if (samples) mkdirSync(samples, { recursive: true });
const work = mkdtempSync(path.join(tmpdir(), 'lobby-musik-'));

const songs = ALL_SONGS.filter((s) => !only || only.includes(s.id));
songs.forEach((song) => {
  const a = arrange(song);
  const fingerprint = songFingerprint(a);
  const target = path.join(OUT, `${song.id}.ogg`);
  const fresh = manifest[song.id]?.fingerprint === fingerprint && existsSync(target);
  if (fresh && !all) {
    console.log(`= ${song.id} (unverändert)`);
  } else {
    const mid = path.join(work, `${song.id}.mid`);
    const wav = path.join(work, `${song.id}.wav`);
    writeFileSync(mid, songMidi(a));
    execFileSync('fluidsynth', ['-ni', '-q', '-g', '0.5', '-r', String(RATE), '-F', wav, SF2, mid], {
      stdio: 'inherit',
    });
    const length = midiSeconds(a);
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        wav,
        '-af',
        `atrim=0:${length.toFixed(3)},afade=t=out:st=${(length - FADE_OUT).toFixed(3)}:d=${FADE_OUT},loudnorm=I=${LOUDNESS}:TP=${PEAK}:LRA=11,aresample=${RATE}`,
        '-c:a',
        'libvorbis',
        '-q:a',
        String(QUALITY),
        '-ac',
        '2',
        '-fflags',
        '+bitexact',
        '-flags:a',
        '+bitexact',
        '-map_metadata',
        '-1',
        target,
      ],
      { stdio: 'inherit' },
    );
    manifest[song.id] = {
      fingerprint,
      seconds: Math.round(lengthSeconds(a) * 10) / 10,
      bytes: statSync(target).size,
    };
    console.log(
      `✓ ${song.id}: ${lengthSeconds(a).toFixed(1)} s, ${(statSync(target).size / 1024).toFixed(0)} KB`,
    );
  }
  if (samples) copyFileSync(target, path.join(samples, `${song.id}.ogg`));
});
const ordered = Object.fromEntries(
  Object.entries(manifest)
    .filter(([id]) => ALL_SONGS.some((s) => s.id === id))
    .sort(([x], [y]) => x.localeCompare(y)),
);
writeFileSync(MANIFEST, `${JSON.stringify(ordered, null, 2)}\n`);
rmSync(work, { recursive: true, force: true });
const total = Object.values(ordered).reduce((sum, e) => sum + e.bytes, 0);
console.log(`Zusammen ${(total / 1024 / 1024).toFixed(1)} MB für ${Object.keys(ordered).length} Lieder.`);
