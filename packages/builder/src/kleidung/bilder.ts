/* eslint-disable ts-patterns/no-magic-numbers -- preview figure: sizes and colours */
/**
 * Vorschau-Bilder der Kleidung: eine schlichte Holzpuppe (eigene Farben, kein Skin von Mojang), die das Stück trägt –
 * Hüte als 3D-Modell auf dem Kopf (wie Minecraft: 0,625-fach, Mitte des Modells = Mitte des Kopfes), Weste, Jacke,
 * Hosen und Stiefel mit ihrer Körper-Textur um 1 bzw. 0,5 Pixel aufgeblasen (wie Rüstung). Für die Webseite und die
 * Übersicht; gezeichnet mit `vorschau.ts`.
 */
import { Picture } from '../png.js';
import { HAT_BUILDERS } from './huete.js';
import { hash, Modell, shade, type Paint } from './modell.js';
import { figureBoxes, garment, skinRenderBoxes } from './ruestung.js';
import { render, shrink, type Scene } from './vorschau.js';

const WOOD = 0xc9a77a;
const wood: Paint = (u, v, w, h, dir) => {
  const grain = Math.sin((u + hash(v, 3) * 2) * 0.9) * 0.05;
  const edge = u === 0 || v === 0 || u === w - 1 || v === h - 1 ? -0.1 : 0;
  return shade(WOOD, grain + (hash(u, v, dir.length) - 0.5) * 0.05 + edge);
};

/** Holzpuppe in Skin-Pixeln (Füße bei y 0, vorn −z), mit angedeutetem Gesicht. */
function puppet(): Scene {
  const face: Paint = (u, v, w, h, dir, f) => {
    if (
      dir === 'north' &&
      v === Math.floor(h * 0.5) &&
      (u === Math.floor(w * 0.3) || u === Math.ceil(w * 0.7) - 1)
    )
      return 0x3a2a1a;
    return wood(u, v, w, h, dir, f);
  };
  const m = new Modell('vorschau/puppe', 1, 'moinmorni', 2)
    .box([-4, 24, -4], [4, 32, 4], face)
    .box([-4, 12, -2], [4, 24, 2], wood)
    .box([4, 12, -2], [8, 24, 2], wood)
    .box([-8, 12, -2], [-4, 24, 2], wood)
    .box([0, 0, -2], [4, 12, 2], wood)
    .box([-4, 0, -2], [0, 12, 2], wood);
  return { boxes: m.build().boxes, scale: 1, offset: [0, 0, 0] };
}

/** Szene mit dem Stück (ohne Puppe). */
function pieceScene(id: string): Scene {
  const hat = HAT_BUILDERS[id];
  if (hat) return { boxes: hat().boxes, scale: 0.625, offset: [0, 28, 0], center: [8, 8, 8] };
  const g = garment(id);
  const grow = g.layer === 'humanoid_leggings' ? 0.5 : 1;
  return {
    boxes: skinRenderBoxes(g.texture, figureBoxes(g.parts, grow), g.rows),
    scale: 1,
    offset: [0, 0, 0],
  };
}

/** Bildausschnitt: Mitte und Breite in Skin-Pixeln. */
const ZOOM: Readonly<Record<'head' | 'body', { target: [number, number, number]; span: number }>> = {
  head: { target: [0, 30, 0], span: 20 },
  body: { target: [0, 16, 0], span: 38 },
};

/**
 * Vorschau eines Stücks: Hüte nah am Kopf, Kleidung an der ganzen Figur; schräg von vorn (yaw 30°) oder von hinten
 * (yaw 210°). `size` in Pixeln, intern doppelt gezeichnet und verkleinert (glatte Kanten).
 */
export function clothingPreview(id: string, size = 128, yaw = 30, withPuppet = true): Picture {
  const zoom = ZOOM[HAT_BUILDERS[id] ? 'head' : 'body'];
  const big = render(
    [...(withPuppet ? [puppet()] : []), pieceScene(id)],
    { yaw, pitch: 18, target: zoom.target, unit: zoom.span / (size * 2) },
    size * 2,
    size * 2,
  );
  return shrink(big, 2);
}

/** Übersicht aller Stücke nebeneinander (vorn und hinten), für Bericht und Prüfung. */
export function clothingSheet(ids: readonly string[], size = 160): Picture {
  const sheet = new Picture(ids.length * size, size * 2);
  ids.forEach((id, k) =>
    [30, 210].forEach((yaw, row) => {
      const p = clothingPreview(id, size, yaw);
      Array.from({ length: size * size }, (_, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const j = (y * size + x) * 4;
        const a = p.data[j + 3] ?? 0;
        if (a)
          sheet.set(
            k * size + x,
            row * size + y,
            ((p.data[j] ?? 0) << 16) | ((p.data[j + 1] ?? 0) << 8) | (p.data[j + 2] ?? 0),
            a,
          );
      });
    }),
  );
  return sheet;
}
