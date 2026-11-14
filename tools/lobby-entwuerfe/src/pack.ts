/**
 * Texturpaket mit den Figuren der Lobby schreiben (+ Vorschau aller Figuren von vorne):
 * `tsx src/pack.ts <ziel.zip> [vorschau.png]`.
 */
import fs from 'node:fs';
import { CAST, castPack, Picture, skinPicture } from '@moinmorni/builder';

const SCALE = 8;
const FIGURE_W = 16;
const FIGURE_H = 32;
const GAP = 4;
const PER_ROW = 9;
const BACKDROP = 0xdfe8d8;
const RGBA = 4;

/** Vorderansicht: [Quelle x, y, Breite, Höhe, Ziel x, y] – Kopf, Hut-Ebene, Körper, Arme, Beine. */
const FRONT: readonly (readonly [number, number, number, number, number, number])[] = [
  [8, 8, 8, 8, 4, 0],
  [40, 8, 8, 8, 4, 0],
  [20, 20, 8, 12, 4, 8],
  [44, 20, 4, 12, 0, 8],
  [36, 52, 4, 12, 12, 8],
  [4, 20, 4, 12, 4, 20],
  [20, 52, 4, 12, 8, 20],
];

function preview(): Picture {
  const ids = Object.keys(CAST);
  const rows = Math.ceil(ids.length / PER_ROW);
  const cellW = (FIGURE_W + GAP) * SCALE;
  const cellH = (FIGURE_H + GAP) * SCALE;
  const pic = new Picture(PER_ROW * cellW, rows * cellH);
  Array.from({ length: pic.width * pic.height }).forEach((_, i) =>
    pic.set(i % pic.width, Math.floor(i / pic.width), BACKDROP),
  );
  ids.forEach((id, n) => {
    const skin = skinPicture(CAST[id]!, Object.keys(CAST).sort().indexOf(id) + 1);
    const ox = (n % PER_ROW) * cellW + (GAP * SCALE) / 2;
    const oy = Math.floor(n / PER_ROW) * cellH + (GAP * SCALE) / 2;
    FRONT.forEach(([sx, sy, w, h, dx, dy]) =>
      Array.from({ length: w * h }).forEach((__, k) => {
        const x = k % w;
        const y = Math.floor(k / w);
        const at = ((sy + y) * skin.width + sx + x) * RGBA;
        if ((skin.data[at + 3] ?? 0) === 0) return;
        const rgb = ((skin.data[at] ?? 0) << 16) | ((skin.data[at + 1] ?? 0) << 8) | (skin.data[at + 2] ?? 0);
        Array.from({ length: SCALE * SCALE }).forEach((___, p) =>
          pic.set(ox + (dx + x) * SCALE + (p % SCALE), oy + (dy + y) * SCALE + Math.floor(p / SCALE), rgb),
        );
      }),
    );
  });
  return pic;
}

const [zip = 'MoinMorni-Lobby.zip', png] = process.argv.slice(2);
fs.writeFileSync(zip, castPack());
console.log('Texturpaket:', zip, Object.keys(CAST).length, 'Figuren');
if (png) {
  fs.writeFileSync(png, preview().png());
  console.log('Vorschau:', png);
}
