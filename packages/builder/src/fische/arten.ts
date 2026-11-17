/* eslint-disable ts-patterns/no-magic-numbers -- pixel art: colours, shapes and positions of hand-drawn fish */
/**
 * Das Aussehen jeder Art im Angelkönig: heimische Alpen-Fische nach ihrem Vorbild, die Legenden mit Glanz, dazu
 * Steinkrebs und die drei Fundstücke. Kleine und mittlere Fische 16 × 16, große (Hecht, Waller, Huchen …) 32 × 32
 * mit mehr Einzelheiten. Legenden haben eine Bildfolge (Lichtstreif, Funkeln, glühende Augen).
 */
import { drawFish, profile, tailEnd, type FishSpec } from './fisch.js';
import { frame, hash, Leinwand, mix } from './leinwand.js';

/** Fertige Zeichnung einer Art: ein Bild oder eine Bildfolge (für eine bewegte Textur). */
export interface FishArt {
  readonly id: string;
  readonly size: number;
  readonly frames: readonly Leinwand[];
  /** Ticks je Bild der Bildfolge (nur mit mehreren Bildern). */
  readonly frametime?: number;
}

const SPECS: Readonly<Record<string, FishSpec>> = {
  rotauge: {
    size: 32,
    length: 34,
    height: 5.4,
    hump: 0.45,
    peduncle: 0.3,
    snout: 0.45,
    belly: 1.05,
    angle: 36,
    tail: 'fork',
    tailSize: 1.1,
    dorsal: 'soft',
    dorsalSize: 0.8,
    back: 0x4f6f78,
    side: 0xc9d3d6,
    underside: 0xeff3f2,
    fin: 0x9fa9a8,
    lowerFin: 0xd8452c,
    eye: 0xd8341f,
    pattern: { line: 0x9aa7aa },
  },
  barsch: {
    size: 32,
    length: 34,
    height: 5.9,
    hump: 0.4,
    peduncle: 0.3,
    snout: 0.45,
    belly: 1.0,
    angle: 36,
    tail: 'fork',
    tailSize: 1.0,
    dorsal: 'spiny',
    dorsalSize: 0.9,
    back: 0x3d5a2a,
    side: 0x9ab046,
    underside: 0xe8dfb4,
    fin: 0x5c6a40,
    lowerFin: 0xe2621f,
    eye: 0xd9a51d,
    pattern: { bars: { color: 0x2a3a1c, count: 5, from: 0.25, to: 0.85, reach: 1.25 } },
  },
  bachforelle: {
    size: 32,
    length: 34,
    height: 4.8,
    hump: 0.45,
    peduncle: 0.35,
    snout: 0.55,
    belly: 1.0,
    angle: 36,
    tail: 'square',
    tailSize: 1.05,
    dorsal: 'soft',
    dorsalSize: 0.8,
    adipose: true,
    back: 0x5a4a22,
    side: 0xb3913f,
    underside: 0xf2e2a6,
    fin: 0x8a6a33,
    lowerFin: 0xc79a43,
    eye: 0x101010,
    pattern: {
      spots: {
        color: 0xd02c22,
        ring: 0xf4e7c4,
        density: 0.2,
        from: 0.25,
        to: 0.85,
        seed: 3,
        band: [-0.6, 0.6],
      },
      stripe: { color: 0x1d1a12, at: 0.75, width: 0 },
    },
  },
  karausche: {
    size: 32,
    length: 32.2,
    height: 7.2,
    hump: 0.42,
    peduncle: 0.28,
    snout: 0.42,
    belly: 1.0,
    angle: 36,
    tail: 'fork',
    tailSize: 0.95,
    dorsal: 'long',
    dorsalSize: 0.55,
    back: 0x5c4a1f,
    side: 0xb8902f,
    underside: 0xe6cf86,
    fin: 0x8e6b2b,
    eye: 0xc79a20,
    pattern: { line: 0x8f7027 },
  },
  renke: {
    size: 32,
    length: 34,
    height: 4.4,
    hump: 0.45,
    peduncle: 0.3,
    snout: 0.38,
    belly: 1.0,
    angle: 36,
    tail: 'fork',
    tailSize: 1.15,
    dorsal: 'soft',
    dorsalSize: 0.9,
    adipose: true,
    back: 0x5c7f99,
    side: 0xd5dde2,
    underside: 0xf6f8f8,
    fin: 0xaebbc2,
    eye: 0x101010,
    pattern: { line: 0xa8b4bb },
  },
  aesche: {
    size: 32,
    length: 34,
    height: 4.3,
    hump: 0.45,
    peduncle: 0.3,
    snout: 0.35,
    belly: 1.0,
    angle: 36,
    tail: 'fork',
    tailSize: 1.1,
    dorsal: 'flag',
    dorsalSize: 1.7,
    adipose: true,
    back: 0x5a6670,
    side: 0xb8c0c4,
    underside: 0xe8ecec,
    fin: 0x6c5a7c,
    lowerFin: 0xa0606c,
    eye: 0x101010,
    pattern: { spots: { color: 0x2b2b2e, density: 0.12, from: 0.5, to: 0.85, seed: 7, band: [-0.2, 0.7] } },
  },
  schleie: {
    size: 32,
    length: 34,
    height: 5.8,
    hump: 0.42,
    peduncle: 0.5,
    snout: 0.5,
    belly: 1.05,
    angle: 36,
    tail: 'round',
    tailSize: 1.1,
    dorsal: 'soft',
    dorsalSize: 0.75,
    back: 0x243b18,
    side: 0x5d7a2a,
    underside: 0xb9b06a,
    fin: 0x34421f,
    eye: 0xd2321f,
    barbels: 'short',
  },
  seesaibling: {
    size: 32,
    length: 34,
    height: 4.9,
    hump: 0.45,
    peduncle: 0.35,
    snout: 0.5,
    belly: 1.05,
    angle: 36,
    tail: 'fork',
    tailSize: 1.05,
    dorsal: 'soft',
    dorsalSize: 0.8,
    adipose: true,
    back: 0x37504e,
    side: 0x7d8f6a,
    underside: 0xe34a24,
    fin: 0x5b6a58,
    lowerFin: 0xe25a2a,
    finEdge: 0xf5f5f0,
    eye: 0x101010,
    pattern: { spots: { color: 0xf0c8a0, density: 0.13, from: 0.3, to: 0.85, seed: 11, band: [0.0, 0.9] } },
  },
  hecht: {
    size: 32,
    length: 36,
    height: 4.2,
    hump: 0.4,
    peduncle: 0.5,
    snout: 0.25,
    belly: 0.95,
    angle: 40,
    tail: 'fork',
    tailSize: 1.25,
    dorsal: 'none',
    dorsalSize: 1.1,
    back: 0x2d4422,
    side: 0x6d8a3a,
    underside: 0xe6e2bc,
    fin: 0x7b6a2e,
    lowerFin: 0x9b6a2a,
    eye: 0xe0c040,
    eyeSize: 2,
    mouth: 'duck',
    pattern: { marble: { color: 0xd6d48a, amount: 0.45, scale: 1.6, seed: 5 }, scales: 0.04 },
  },
  zander: {
    size: 32,
    length: 32,
    height: 4.6,
    hump: 0.45,
    peduncle: 0.35,
    snout: 0.35,
    belly: 1.0,
    angle: 40,
    tail: 'fork',
    tailSize: 1.1,
    dorsal: 'double',
    dorsalSize: 0.9,
    back: 0x4a5250,
    side: 0x9fa69c,
    underside: 0xe8ebe4,
    fin: 0x7a8274,
    eye: 0xd8e6e0,
    eyeSize: 2,
    mouth: 'wide',
    pattern: {
      bars: { color: 0x3a403c, count: 7, from: 0.25, to: 0.88, reach: 1.25 },
      spots: { color: 0x2a2e2b, density: 0.05, from: 0.25, to: 0.7, seed: 21, band: [1.0, 3], onFins: true },
      scales: 0.05,
    },
  },
  aal: {
    size: 32,
    length: 38,
    height: 2.1,
    hump: 0.6,
    peduncle: 0.15,
    snout: 0.55,
    belly: 1.0,
    angle: 40,
    tail: 'eel',
    tailSize: 0.4,
    dorsal: 'none',
    dorsalSize: 0,
    anal: false,
    back: 0x262a17,
    side: 0x4a4b26,
    underside: 0xd8c66a,
    fin: 0x3b3c20,
    eye: 0xc9a62a,
    eyeSize: 2,
  },
  rutte: {
    size: 32,
    length: 32,
    height: 4.0,
    hump: 0.55,
    peduncle: 0.4,
    snout: 0.55,
    belly: 1.0,
    angle: 40,
    tail: 'round',
    tailSize: 1.0,
    dorsal: 'long',
    dorsalSize: 0.4,
    back: 0x3b3720,
    side: 0x7a6c3c,
    underside: 0xd3c9a0,
    fin: 0x5a5130,
    eye: 0xc0a03a,
    eyeSize: 2,
    barbels: 'single',
    mouth: 'wide',
    pattern: { marble: { color: 0x2b2715, amount: 0.55, scale: 1.4, seed: 9 } },
  },
  waller: {
    size: 32,
    length: 38,
    height: 6.6,
    hump: 0.75,
    peduncle: 0.3,
    snout: 0.62,
    belly: 1.0,
    angle: 38,
    tail: 'round',
    tailSize: 0.85,
    dorsal: 'none',
    dorsalSize: 0,
    back: 0x1f2a22,
    side: 0x4d5a45,
    underside: 0xc8c6b4,
    fin: 0x2f3a2e,
    eye: 0xb0a060,
    mouth: 'wide',
    barbels: 'long',
    pattern: { marble: { color: 0x7d8a64, amount: 0.4, scale: 1.2, seed: 13 } },
  },
  huchen: {
    size: 32,
    length: 36,
    height: 4.2,
    hump: 0.45,
    peduncle: 0.35,
    snout: 0.45,
    belly: 1.0,
    angle: 40,
    tail: 'fork',
    tailSize: 1.1,
    dorsal: 'soft',
    dorsalSize: 0.9,
    adipose: true,
    back: 0x5a3a2a,
    side: 0xc06a44,
    underside: 0xeed9c2,
    fin: 0x8a5038,
    eye: 0x101010,
    eyeSize: 2,
    mouth: 'wide',
    pattern: {
      spots: { color: 0x1c1410, density: 0.08, from: 0.3, to: 0.9, seed: 17, band: [-0.1, 0.95] },
      scales: 0.04,
    },
  },
  seeforelle: {
    size: 32,
    length: 36,
    height: 4.6,
    hump: 0.45,
    peduncle: 0.38,
    snout: 0.5,
    belly: 1.0,
    angle: 40,
    tail: 'square',
    tailSize: 1.05,
    dorsal: 'soft',
    dorsalSize: 0.85,
    adipose: true,
    back: 0x3e5560,
    side: 0xc4ccd0,
    underside: 0xf4f6f5,
    fin: 0x8a969a,
    eye: 0x101010,
    eyeSize: 2,
    pattern: {
      spots: { color: 0x15181a, density: 0.07, from: 0.25, to: 0.9, seed: 19, band: [0.0, 0.95] },
      scales: 0.035,
    },
  },
  goldforelle: {
    size: 32,
    length: 34,
    height: 4.9,
    hump: 0.45,
    peduncle: 0.35,
    snout: 0.55,
    belly: 1.0,
    angle: 36,
    tail: 'square',
    tailSize: 1.1,
    dorsal: 'soft',
    dorsalSize: 0.85,
    adipose: true,
    back: 0xc08a12,
    side: 0xffcf3a,
    underside: 0xfff2b0,
    fin: 0xe8a018,
    lowerFin: 0xff9a2a,
    finEdge: 0xfff6d0,
    eye: 0x101010,
    pattern: { spots: { color: 0xe0501e, density: 0.12, from: 0.3, to: 0.85, seed: 23, band: [-0.3, 0.8] } },
  },
  seekoenig: {
    size: 32,
    length: 40,
    height: 7.2,
    hump: 0.75,
    peduncle: 0.3,
    snout: 0.62,
    belly: 1.0,
    angle: 38,
    tail: 'round',
    tailSize: 0.9,
    dorsal: 'none',
    dorsalSize: 0,
    back: 0x14201e,
    side: 0x2c3e38,
    underside: 0x9fa894,
    fin: 0x1c2a26,
    eye: 0xffc82a,
    eyeSize: 2,
    mouth: 'wide',
    barbels: 'long',
    pattern: { marble: { color: 0x3e6a3a, amount: 0.5, scale: 1.1, seed: 29 } },
  },
  moorkoenig: {
    size: 32,
    length: 38,
    height: 4.5,
    hump: 0.4,
    peduncle: 0.5,
    snout: 0.25,
    belly: 0.95,
    angle: 40,
    tail: 'fork',
    tailSize: 1.3,
    dorsal: 'none',
    dorsalSize: 0,
    back: 0x18240f,
    side: 0x34481e,
    underside: 0x8a8a52,
    fin: 0x2a3418,
    eye: 0xffb020,
    eyeSize: 2,
    mouth: 'duck',
    pattern: { marble: { color: 0x6f8a2a, amount: 0.55, scale: 1.5, seed: 31 }, scales: 0.05 },
  },
  kristallsaibling: {
    size: 32,
    length: 34,
    height: 4.9,
    hump: 0.45,
    peduncle: 0.35,
    snout: 0.5,
    belly: 1.05,
    angle: 36,
    tail: 'fork',
    tailSize: 1.1,
    dorsal: 'soft',
    dorsalSize: 0.85,
    adipose: true,
    back: 0x9fd8ec,
    side: 0xd8f4fb,
    underside: 0xf6fdff,
    fin: 0xb8e8f4,
    lowerFin: 0xc8f0ff,
    finEdge: 0xffffff,
    eye: 0x2a6a9a,
    glass: 175,
  },
};

const LEGEND_FRAMES = 12;
/** Legenden: bewegte Textur mit Glanz. */
const LEGENDS: readonly string[] = ['goldforelle', 'seekoenig', 'moorkoenig', 'kristallsaibling'];

/** Lichtstreif, der schräg über den Fisch wandert (Goldforelle, alle Legenden ein wenig). */
function sweep(base: Leinwand, n: number, frames: number, strength: number, tint = 0xffffff): Leinwand {
  const c = base.copy();
  const span = base.size * 2.4;
  const pos = (n / frames) * span - base.size * 0.7;
  c.each((x, y) => {
    if (!c.filled(x, y)) return;
    const d = Math.abs(x - (base.size - 1 - y) - pos + base.size / 2);
    if (d < base.size * 0.14) {
      const i = y * c.size + x;
      c.color[i] = mix(c.color[i] ?? 0, tint, strength * (1 - d / (base.size * 0.14)));
    }
  });
  return c;
}

/** Funkeln: ein paar Pixel leuchten auf und vergehen wieder. */
function twinkle(base: Leinwand, n: number, seed: number, count: number, color = 0xffffff): Leinwand {
  const c = base.copy();
  const cells: Array<[number, number]> = [];
  c.each((x, y) => {
    if (c.filled(x, y)) cells.push([x, y]);
  });
  Array.from({ length: count }, (_, k) => {
    const cell = cells[Math.floor(hash(seed, k, Math.floor(n / 3)) * cells.length)];
    if (!cell) return;
    const life = (n % 3) / 2;
    const [x, y] = cell;
    c.set(x, y, mix(c.get(x, y), color, 0.55 + 0.45 * (1 - Math.abs(life - 0.5) * 2)), c.partAt(x, y), 255);
  });
  return c;
}

/** Augen pulsieren (Moorkönig, Seekönig). */
function glowEyes(base: Leinwand, n: number, frames: number, color: number): Leinwand {
  const c = base.copy();
  const pulse = 0.5 + 0.5 * Math.sin((n / frames) * Math.PI * 2);
  c.each((x, y) => {
    if (c.partAt(x, y) !== 3 || c.get(x, y) === 0x101010) return;
    c.set(x, y, mix(c.get(x, y), color, pulse * 0.7), 3);
  });
  return c;
}

function legend(id: string, base: Leinwand): Leinwand[] {
  const frames = Array.from({ length: LEGEND_FRAMES }, (_, n) => n);
  if (id === 'goldforelle')
    return frames.map((n) => twinkle(sweep(base, n, LEGEND_FRAMES, 0.65, 0xfffbe0), n, 41, 2, 0xffffff));
  if (id === 'kristallsaibling')
    return frames.map((n) => twinkle(sweep(base, n, LEGEND_FRAMES, 0.45, 0xffffff), n, 43, 3, 0xffffff));
  if (id === 'seekoenig')
    return frames.map((n) =>
      glowEyes(sweep(base, n, LEGEND_FRAMES, 0.25, 0x9cf0c8), n, LEGEND_FRAMES, 0xfff4b0),
    );
  return frames.map((n) =>
    glowEyes(sweep(base, n, LEGEND_FRAMES, 0.25, 0xd8ff8a), n, LEGEND_FRAMES, 0xfff0a0),
  );
}

/** Gräten im Kristallsaibling: dunklere Wirbelsäule und Rippen, die durch den Körper scheinen. */
function bones(c: Leinwand, f: Frame, spec: FishSpec): void {
  c.each((x, y) => {
    if (c.partAt(x, y) !== 1) return;
    const { t, v } = f.local(x, y);
    const spine = Math.abs(v) < 0.5 && t > 0.22 && t < 0.82;
    const rib = t > 0.35 && t < 0.75 && Math.round(t * spec.length) % 2 === 0 && v < 0 && v > -1.8;
    if (spine || rib) c.set(x, y, 0x7ab4cc, 1, 215);
  });
}

/** Moos und Narben der beiden Könige (Seekönig, Moorkönig). */
function weathered(c: Leinwand, f: Frame, spec: FishSpec, moss: number, scar: number): void {
  c.each((x, y) => {
    if (c.partAt(x, y) !== 1) return;
    const { t, v } = f.local(x, y);
    if (v > spec.height * 0.55 && hash(x, y, 77) < 0.35) c.set(x, y, mix(c.get(x, y), moss, 0.7), 1);
    const scarLine =
      Math.abs(v - (t - 0.55) * spec.length * 0.55) < 0.45 &&
      t > 0.45 &&
      t < 0.62 &&
      Math.abs(v) < spec.height * 0.6;
    if (scarLine) c.set(x, y, scar, 1);
  });
}

/** Krone über dem Kopf des Seekönigs: drei goldene Zacken. */
function crown(c: Leinwand, f: Frame, spec: FishSpec): void {
  c.each((x, y) => {
    if (c.filled(x, y)) return;
    const { t, v } = f.local(x, y);
    const at = (t - 0.8) * spec.length;
    const tb = tailEnd(spec);
    const base = spec.height * profile(spec, (0.8 - tb) / (1 - tb)) - 1.6;
    const above = v - base;
    if (at > -3 && at < 3 && above > 0 && above < 1.4) c.set(x, y, 0xe8b820, 4);
    if ([-2.5, 0, 2.5].some((p) => Math.abs(at - p) < 0.6) && above >= 1.4 && above < 2.8)
      c.set(x, y, 0xffd84a, 4);
  });
}

// ---------- Steinkrebs und Fundstücke (eigene Formen) ----------

/** Liegt ein Punkt (u, v) näher als r an der Strecke a → b? */
function nearSegment(u: number, v: number, a: [number, number], b: [number, number], r: number): boolean {
  const [ax, ay] = a;
  const [bx, by] = b;
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const k = len2 ? Math.max(0, Math.min(1, ((u - ax) * (bx - ax) + (v - ay) * (by - ay)) / len2)) : 0;
  return Math.hypot(u - (ax + k * (bx - ax)), v - (ay + k * (by - ay))) < r;
}

function steinkrebs(): Leinwand {
  const c = new Leinwand(32);
  const L = 26;
  const grow = 1.3;
  const f = frame(32, 78, L, 1.6);
  const shell = 0x6e5234;
  const dark = 0x3f2c19;
  const light = 0xa4835a;
  const claw = 0x7a4a2c;
  c.each((x, y) => {
    const local = f.local(x, y);
    const u = local.t * L;
    const av = Math.abs(local.v / grow);
    // Fühler (dünn, lang nach vorn außen)
    if (u > 19 && nearSegment(u, av, [19, 1], [29, 3.2], 0.4)) {
      return c.set(x, y, dark, 4);
    }
    // Schwanzfächer: fünf Blätter
    if (u >= 0 && u < 3.2 && av < 2 + (3.2 - u) * 0.9)
      return c.set(x, y, Math.round(av) % 2 ? light : shell, 2);
    // Hinterleib: Glieder mit dunkler Fuge
    if (u >= 3 && u < 12 && av < 2.4 + (u - 3) * 0.12) {
      const seam = Math.abs(u - 3 - Math.round((u - 3) / 1.8) * 1.8) < 0.35;
      return c.set(x, y, seam ? dark : mix(shell, light, av < 0.8 ? 0.35 : 0), 1);
    }
    // Kopfbrust (Panzer)
    const k = (u - 16.5) / 5;
    if (u >= 11.5 && u < 21.5 && av < 3.6 * Math.sqrt(Math.max(0, 1 - k * k))) {
      const groove = Math.abs(u - 15.2) < 0.4 && av < 2.6;
      return c.set(x, y, groove ? dark : mix(shell, light, Math.max(0, 0.45 - av * 0.15)), 1);
    }
    // Stirnspitze
    if (u >= 21.5 && u < 23.5 && av < 0.8 - (u - 21.5) * 0.3) return c.set(x, y, shell, 1);
    // Scherenarme
    if (nearSegment(u, av, [18, 3], [21.5, 5.6], 0.9)) return c.set(x, y, shell, 2);
    // Scheren: zwei Finger mit Spalt
    const cu = u - 21;
    const cv = av - 6;
    const palm = (cu - 2) ** 2 / 6 + cv ** 2 / 3.2 <= 1;
    const outer = cu >= 3.5 && cu < 7.5 && Math.abs(cv - 1.0 + (cu - 3.5) * 0.15) < 0.95 - (cu - 3.5) * 0.12;
    const inner = cu >= 3.5 && cu < 6.8 && Math.abs(cv + 1.1 - (cu - 3.5) * 0.2) < 0.8 - (cu - 3.5) * 0.1;
    if (palm || outer || inner)
      return c.set(x, y, cv > 0.3 ? mix(claw, dark, 0.25) : mix(claw, 0xc0603a, 0.4), 2);
    // Laufbeine
    const legs = [13, 15.2, 17.4].some((lu) => nearSegment(u, av, [lu, 3], [lu - 1.4, 5.6], 0.5));
    if (legs) return c.set(x, y, dark, 4);
  });
  c.each((x, y) => {
    const { t, v } = f.local(x, y);
    if (Math.hypot(t * L - 20.5, Math.abs(v / grow) - 1.6) < 0.55) c.set(x, y, 0x101010, 3);
  });
  c.outline(-0.35, 0.15);
  return c;
}

function stiefel(): Leinwand {
  const c = new Leinwand(32);
  const leather = 0x6e4b2c;
  const dark = 0x452e1a;
  const light = 0x93693f;
  c.each((x, y) => {
    const shaft = x >= 8 && x <= 18 + (y > 14 ? 1 : 0) && y >= 3 && y <= 22;
    const toe = (x - 21) ** 2 / 64 + (y - 22.5) ** 2 / 20 <= 1 && y >= 17;
    const foot = (x >= 8 && x <= 22 && y >= 18 && y <= 26) || (toe && y <= 26);
    const sole = x >= 7 && x <= 29 && y >= 27 && y <= 28 && !(x >= 18 && x <= 20 && y === 28);
    const heel = x >= 7 && x <= 12 && y >= 26 && y <= 29;
    if (sole || heel) return c.set(x, y, y === 27 ? 0x3a2a1c : 0x251a12, 1);
    if (!(shaft || foot)) return;
    let col = hash(x, y, 5) < 0.14 ? dark : leather;
    if (x <= 10) col = mix(col, light, 0.35);
    if (x >= 17 && y < 18) col = mix(col, dark, 0.3);
    c.set(x, y, col, 1);
  });
  // Stulpe oben umgeschlagen
  Array.from({ length: 13 }, (_, i) => 7 + i).forEach((x) => {
    c.set(x, 2, 0x9a7148, 1);
    c.set(x, 3, 0x7e5a36, 1);
  });
  // Schnürung
  [6, 9, 12, 15].forEach((y) => {
    c.set(14, y, 0xe0d0a8, 4);
    c.set(16, y + 1, 0xe0d0a8, 4);
    c.set(15, y, 0x2a1d12, 4);
    c.set(15, y + 1, 0x2a1d12, 4);
  });
  // Flicken mit Stichen
  [
    [18, 21],
    [19, 21],
    [20, 21],
    [18, 22],
    [19, 22],
    [20, 22],
    [18, 23],
    [19, 23],
    [20, 23],
  ].forEach(([x, y]) => c.set(x ?? 0, y ?? 0, (x ?? 0) % 2 ? 0x8f8160 : 0x7a6c50, 1));
  // Loch in der Sohle, Algen, Wassertropfen
  c.set(24, 28, 0, 0, 0);
  c.set(25, 28, 0, 0, 0);
  [
    [17, 5],
    [18, 6],
    [18, 7],
    [19, 9],
    [18, 10],
    [19, 11],
    [9, 23],
    [9, 24],
    [10, 25],
    [26, 21],
    [27, 22],
  ].forEach(([x, y], i) => c.set(x ?? 0, y ?? 0, i % 2 ? 0x4f8a2e : 0x6aa83a, 4));
  [
    [4, 15, 0x9ad8f0],
    [4, 16, 0x5aaee0],
    [5, 16, 0x3a8ac8],
    [24, 30, 0x5aaee0],
  ].forEach(([x, y, col]) => c.set(x ?? 0, y ?? 0, col ?? 0, 4, 220));
  c.outline(-0.3, 0.15);
  return c;
}

function treibholz(): Leinwand {
  const c = new Leinwand(32);
  const L = 36;
  const f = frame(32, 38, L);
  c.each((x, y) => {
    const { t, v } = f.local(x, y);
    const u = t * L;
    const wave = Math.sin(t * 6.5) * 0.9;
    const thick = 2.4 - Math.abs(t - 0.45) * 2;
    const main = t > 0 && t < 1 && Math.abs(v - wave) < thick;
    const branch = nearSegment(u, v, [19, 1], [27, 7.5], 1.1) || nearSegment(u, v, [11, -1], [15, -5], 0.8);
    if (!(main || branch)) return;
    const grain = Math.round((v - wave) * 1.6 + Math.sin(u * 0.7)) % 2 === 0 ? 0xc2baa8 : 0x9f9786;
    c.set(x, y, hash(x, y, 8) < 0.06 ? 0x6e6a60 : grain, 1);
  });
  c.each((x, y) => {
    if (c.filled(x, y) && hash(x, y, 13) < 0.06) c.set(x, y, 0x6e8a3a, 1);
  });
  // Astloch
  c.each((x, y) => {
    const { t, v } = f.local(x, y);
    if (Math.hypot(t * L - 9, v - Math.sin((9 / L) * 6.5) * 0.9) < 0.9) c.set(x, y, 0x4a463e, 4);
  });
  c.outline(-0.35, 0.12);
  return c;
}

function flaschenpost(): Leinwand {
  const c = new Leinwand(32);
  const L = 30;
  const f = frame(32, 45, L);
  c.each((x, y) => {
    const { t, v } = f.local(x, y);
    const u = t * L;
    const av = Math.abs(v);
    const body = u > 1 && u < 18 && av < 5 - (u < 2.5 ? (2.5 - u) * 1.2 : 0);
    const shoulder = u >= 18 && u < 21.5 && av < 5 - (u - 18) * 1.0;
    const neck = u >= 21.5 && u < 26.5 && av < 1.7;
    const lip = u >= 25.5 && u < 26.5 && av < 2.2;
    const cork = u >= 26.5 && u < 30 && av < 1.6;
    if (cork) return c.set(x, y, hash(x, y, 4) < 0.25 ? 0x8a5a2a : 0xb27c40, 4);
    if (!(body || shoulder || neck || lip)) return;
    const paper = u > 4 && u < 16.5 && av < 2.3;
    const glass = mix(0x2f7a4a, 0x7fc49a, Math.max(0, (v + 2) / 7));
    const note = Math.round(u) % 3 === 0 ? 0xc8b07a : 0xf1e6c4;
    c.set(x, y, paper ? note : glass, 1, paper ? 255 : 205);
  });
  c.each((x, y) => {
    const { t, v } = f.local(x, y);
    const u = t * L;
    if (Math.abs(v - 3.4) < 0.55 && u > 3 && u < 17) c.set(x, y, 0xe0f8ea, 1, 235);
    if (Math.abs(u - 10) < 0.6 && Math.abs(v) < 2.3) c.set(x, y, 0xb02a2a, 4);
    if (Math.abs(v + 3.6) < 0.5 && u > 2 && u < 9) c.set(x, y, 0xd0e8d8, 1, 120);
  });
  c.outline(-0.3, 0.1);
  return c;
}

type Frame = ReturnType<typeof frame>;

/** Besonderheiten der Legenden, im Koordinatensystem des Fischs gezeichnet. */
const DECORATE: Readonly<Record<string, (c: Leinwand, f: Frame) => void>> = {
  kristallsaibling: (c, f) => bones(c, f, SPECS['kristallsaibling'] as FishSpec),
  seekoenig: (c, f) => {
    const spec = SPECS['seekoenig'] as FishSpec;
    weathered(c, f, spec, 0x4f7a3a, 0x8a9a8a);
    crown(c, f, spec);
  },
  moorkoenig: (c, f) => weathered(c, f, SPECS['moorkoenig'] as FishSpec, 0x7aa83a, 0x5a6a3a),
};

const SPECIAL: Readonly<Record<string, () => Leinwand>> = { steinkrebs, stiefel, treibholz, flaschenpost };

const cache = new Map<string, FishArt>();

/** Zeichnung einer Art (gleiche Art = gleiche Pixel). */
export function fishArt(id: string): FishArt {
  const hit = cache.get(id);
  if (hit) return hit;
  const special = SPECIAL[id];
  const spec = SPECS[id];
  if (!special && !spec) throw new Error(`Keine Zeichnung für ${id}`);
  const base = special ? special() : drawFish(spec as FishSpec, DECORATE[id]);
  const frames = LEGENDS.includes(id) ? legend(id, base) : [base];
  const art: FishArt = { id, size: base.size, frames, ...(frames.length > 1 ? { frametime: 2 } : {}) };
  cache.set(id, art);
  return art;
}

/** Alle Arten mit Zeichnung (Reihenfolge wie im Fischbuch; gleich wie `ANGEL_FISH` in @moinmorni/shared). */
export const FISH_ART_IDS: readonly string[] = [
  ...Object.keys(SPECS).filter((id) => !LEGENDS.includes(id)),
  ...LEGENDS,
  ...Object.keys(SPECIAL),
];

/** Alle Zeichnungen. */
export const allFishArt = (ids: readonly string[] = FISH_ART_IDS): FishArt[] => ids.map((id) => fishArt(id));
