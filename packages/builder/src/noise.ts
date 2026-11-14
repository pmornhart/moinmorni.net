/** Glattes Rauschen für Gelände (Berge, Wiesen) und Zufall mit festem Startwert – gleiche Eingabe, gleiche Welt. */

const HASH_A = 374761393;
const HASH_B = 668265263;
const HASH_C = 1274126177;
const HASH_SHIFT = 13;
const UINT = 4294967296;
const SMOOTH_A = 3;
const SMOOTH_B = 2;
const OCTAVE_SCALE = 2;
const OCTAVE_FADE = 0.5;
const MULBERRY = 0x6d2b79f5;
const SHIFT_15 = 15;
const SHIFT_7 = 7;
const SHIFT_14 = 14;
const SHIFT_16 = 16;
const BIT_1 = 1;
const BIT_61 = 61;

/** Fester Pseudo-Zufallswert 0…1 für eine Gitterzelle. */
function cell(seed: number, x: number, z: number): number {
  const h0 = Math.imul(x, HASH_A) + Math.imul(z, HASH_B) + Math.imul(seed, HASH_C);
  const h1 = Math.imul(h0 ^ (h0 >>> HASH_SHIFT), HASH_C);
  return ((h1 ^ (h1 >>> SHIFT_16)) >>> 0) / UINT;
}

function smooth(t: number): number {
  return t * t * (SMOOTH_A - SMOOTH_B * t);
}

/** Wert-Rauschen 0…1, glatt zwischen den Gitterpunkten (Abstand `scale`). */
export function noise2(seed: number, x: number, z: number, scale: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = smooth(fx - x0);
  const tz = smooth(fz - z0);
  const a = cell(seed, x0, z0);
  const b = cell(seed, x0 + 1, z0);
  const c = cell(seed, x0, z0 + 1);
  const d = cell(seed, x0 + 1, z0 + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Mehrere Lagen Rauschen übereinander (grob + fein), Ergebnis 0…1. */
export function fbm(seed: number, x: number, z: number, scale: number, octaves: number): number {
  const layers = Array.from({ length: octaves }, (_, i) => ({
    amp: OCTAVE_FADE ** i,
    value: noise2(seed + i, x, z, scale / OCTAVE_SCALE ** i),
  }));
  const total = layers.reduce((s, l) => s + l.amp, 0);
  return layers.reduce((s, l) => s + l.amp * l.value, 0) / total;
}

/** Zufallsgenerator mit Startwert (mulberry32). */
export function random(seed: number): () => number {
  const state = { s: seed >>> 0 };
  return () => {
    state.s = (state.s + MULBERRY) >>> 0;
    const t1 = Math.imul(state.s ^ (state.s >>> SHIFT_15), state.s | BIT_1);
    const t2 = (t1 + Math.imul(t1 ^ (t1 >>> SHIFT_7), t1 | BIT_61)) ^ t1;
    return ((t2 ^ (t2 >>> SHIFT_14)) >>> 0) / UINT;
  };
}

/** Wählt ein Element zufällig aus. */
export function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)] as T;
}
