/**
 * Bilder der Kleidung für die Webseite (Angelkönig → „Hüte und Kleidung“): je Stück eine Holzpuppe, die es trägt –
 * gezeichnet aus denselben Modellen und Texturen wie im Angelkönig-Paket (`packages/builder/src/kleidung/`), 160 × 160
 * als PNG nach `apps/web/public/bilder/kleidung-<stück>.png`. Ein Test prüft, dass sie zum Paket passen.
 *
 *   npx tsx apps/server/scripts/kleidung-bilder.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { clothingPreview } from '@moinmorni/builder';
import { ANGEL_CLOTHES } from '@moinmorni/shared';

/** Größe der Bilder (gleich wie im Test). */
const CLOTHING_PICTURE_SIZE = 160;

const out = path.resolve(import.meta.dirname, '../../web/public/bilder');
fs.mkdirSync(out, { recursive: true });
ANGEL_CLOTHES.forEach((c) =>
  fs.writeFileSync(
    path.join(out, `kleidung-${c.id}.png`),
    clothingPreview(c.id, CLOTHING_PICTURE_SIZE).png(),
  ),
);
console.log(`${ANGEL_CLOTHES.length} Bilder in ${out}`);
