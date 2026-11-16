/**
 * Lageplan eines Entwurfs als PNG (Draufsicht, oberster Block je Säule): `tsx src/plan.ts a ziel.png [radius]`.
 * Gitter alle 10 Blöcke, Achsen x/z = 0 kräftiger. Nur zum Planen, liest keine Minecraft-Dateien.
 */
import fs from 'node:fs';
import { baseName, Picture } from '@morninet/builder';
import { draftA } from './draft-a.js';
import { draftB } from './draft-b.js';
import { draftC } from './draft-c.js';

const SCALE = 3;
const GRID = 10;
const DEFAULT_RADIUS = 140;
const BUILDS = { a: draftA, b: draftB, c: draftC } as const;

/** Grobe Farbe nach Block-Namen (eigene Farbwahl, keine Texturen). */
const COLOURS: readonly (readonly [RegExp, number])[] = [
  [/water/, 0x3f76e4],
  [/leaves|azalea/, 0x2f6b2a],
  [/grass_block|short_grass|fern|moss/, 0x8fbf5a],
  [/snow/, 0xf4f8fb],
  [/stone$|andesite$|diorite$|granite$|tuff|deepslate|gravel|coarse_dirt|^dirt|podzol/, 0xa8a49a],
  [/farmland|wheat|carrots/, 0xc9a646],
  [/roof|_stairs|_slab/, 0x8a3b2a],
  [/planks|log|door|fence/, 0x9a6b3d],
  [/calcite|white_concrete|quartz/, 0xf2efe6],
  [/cobble|stone_bricks|polished_andesite|bricks/, 0x77736b],
  [/gold|emerald/, 0xf0c419],
  [/wool|carpet|concrete|terracotta/, 0xd2457a],
];

function colourOf(block: string): number {
  const name = baseName(block);
  return COLOURS.find(([re]) => re.test(name))?.[1] ?? 0x666666;
}

function main(): void {
  const [id = 'a', out = 'plan.png', r = String(DEFAULT_RADIUS)] = process.argv.slice(2);
  const build = BUILDS[id as keyof typeof BUILDS];
  const radius = Number(r);
  const { canvas } = build();
  const top = new Map<number, { y: number; block: string }>();
  const size = radius * 2 + 1;
  canvas.boxes().forEach((b) => {
    if (baseName(b.block) === 'air') return;
    for (let x = Math.max(b.x1, -radius); x <= Math.min(b.x2, radius); x += 1) {
      for (let z = Math.max(b.z1, -radius); z <= Math.min(b.z2, radius); z += 1) {
        const k = (x + radius) * size + (z + radius);
        const cur = top.get(k);
        if (!cur || cur.y < b.y2) top.set(k, { y: b.y2, block: b.block });
      }
    }
  });
  const pic = new Picture(size * SCALE, size * SCALE);
  top.forEach((v, k) => {
    const x = Math.floor(k / size) - radius;
    const z = (k % size) - radius;
    const grid = x % GRID === 0 || z % GRID === 0;
    const axis = x === 0 || z === 0;
    const base = colourOf(v.block);
    for (let dx = 0; dx < SCALE; dx += 1) {
      for (let dz = 0; dz < SCALE; dz += 1) {
        const edge = (x % GRID === 0 && dx === 0) || (z % GRID === 0 && dz === 0);
        pic.set(
          (x + radius) * SCALE + dx,
          (z + radius) * SCALE + dz,
          grid && edge ? (axis ? 0xff0000 : 0x000000) : base,
        );
      }
    }
  });
  fs.writeFileSync(out, pic.png());
  console.log('Plan:', out);
}

main();
