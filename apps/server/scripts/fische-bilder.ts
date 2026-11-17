/**
 * Bilder der Fische für die Webseite (Angelkönig → „Fische im Tal“): die eigenen Zeichnungen aus dem Angelkönig-Paket,
 * je 32 × 32 als PNG nach `apps/web/public/bilder/fisch-<art>.png`. Ein Test prüft, dass sie zum Paket passen.
 *
 *   npx tsx apps/server/scripts/fische-bilder.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fishPicture } from '@moinmorni/builder';
import { ANGEL_FISH } from '@moinmorni/shared';

const out = path.resolve(import.meta.dirname, '../../web/public/bilder');
fs.mkdirSync(out, { recursive: true });
ANGEL_FISH.forEach((f) => fs.writeFileSync(path.join(out, `fisch-${f.id}.png`), fishPicture(f.id)));
console.log(`${ANGEL_FISH.length} Bilder in ${out}`);
