/* eslint-disable ts-patterns/no-magic-numbers -- pixel art: twice the margin, RGBA channel offsets */
/**
 * Übersicht aller Rang-Abzeichen als Bild (docs/abzeichen.png): die Rollen der Vorlage und das Gefängnis, groß und
 * pixelgenau – dieselben Pixel wie im Abzeichen-Paket, eigene Zeichnungen ohne Minecraft-Texturen.
 *   pnpm --filter @moinmorni/server exec tsx scripts/abzeichen-bild.ts [ziel.png]
 * Fehlt in der Vorlage der Supporter (✚, #22c55e – wie in Philips Vorlage und im Supporter-Branch), kommt er
 * hinter den Moderator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Picture } from '@moinmorni/builder';
import {
  DEFAULT_ROLES,
  JAIL_BADGE,
  drawBadge,
  type BadgeLook,
  type BadgePicture,
  type Role,
} from '@moinmorni/shared';

const OUT = process.argv[2] ?? path.resolve(import.meta.dirname, '../../../docs/abzeichen.png');
/** So viele Bildpunkte pro Pixel des Abzeichens. */
const SCALE = 6;
/** Rand und Abstand zwischen den Abzeichen, in Pixeln des Abzeichens. */
const MARGIN = 4;
const GAP = 3;
const BACKGROUND = 0x141416;
const RGBA = 4;
const BYTE_SHIFT = 8;
const SUPPORTER_AFTER = 'moderator';

const supporter: BadgeLook = { text: 'Supporter', symbol: '✚', colour: '#22c55e' };

function looks(roles: readonly Role[]): BadgeLook[] {
  const own = [...roles]
    .sort((a, b) => a.position - b.position)
    .flatMap((r): BadgeLook[] => {
      const look = { text: r.name.de, symbol: r.symbol, colour: r.colour };
      const extra = r.id === SUPPORTER_AFTER && !roles.some((x) => x.symbol === '✚') ? [supporter] : [];
      return [look, ...extra];
    });
  return [...own, { text: JAIL_BADGE.name.de, symbol: JAIL_BADGE.symbol, colour: JAIL_BADGE.colour }];
}

const pictures = looks(DEFAULT_ROLES)
  .map((l) => drawBadge(l))
  .filter((p): p is BadgePicture => p !== null);
const width = (Math.max(...pictures.map((p) => p.width)) + 2 * MARGIN) * SCALE;
const height =
  (pictures.reduce((sum, p) => sum + p.height, 0) + GAP * (pictures.length - 1) + 2 * MARGIN) * SCALE;
const out = new Picture(width, height);
Array.from({ length: width * height }, (_, i) => out.set(i % width, Math.floor(i / width), BACKGROUND));
pictures.reduce((top, p) => {
  Array.from({ length: p.width * p.height }, (_, i) => i)
    .filter((i) => (p.rgba[i * RGBA + 3] ?? 0) > 0)
    .forEach((i) => {
      const rgb =
        ((p.rgba[i * RGBA] ?? 0) << (BYTE_SHIFT * 2)) |
        ((p.rgba[i * RGBA + 1] ?? 0) << BYTE_SHIFT) |
        (p.rgba[i * RGBA + 2] ?? 0);
      const x = MARGIN + (i % p.width);
      const y = top + Math.floor(i / p.width);
      Array.from({ length: SCALE * SCALE }, (_, k) =>
        out.set(x * SCALE + (k % SCALE), y * SCALE + Math.floor(k / SCALE), rgb),
      );
    });
  return top + p.height + GAP;
}, MARGIN);
fs.writeFileSync(OUT, out.png());
console.log(`${pictures.length} Abzeichen → ${OUT} (${width} × ${height})`);
