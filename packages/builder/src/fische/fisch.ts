/* eslint-disable ts-patterns/no-magic-numbers -- pixel art: colours, shapes and positions of hand-drawn fish */
/**
 * Ein Fisch als Beschreibung (Umriss, Flossen, Farben, Muster) und das Zeichnen daraus. Die Formen werden in einem
 * gedrehten Koordinatensystem bestimmt (`leinwand.ts`, `frame`) – so passt ein schlanker Fisch schräg ins Bild und
 * wirkt doch nicht zittrig. Alles ist eigene Zeichnung, keine Vorlage.
 */
import { frame, hash, Leinwand, mix, shade } from './leinwand.js';

export type Tail = 'fork' | 'round' | 'square' | 'eel';
export type DorsalKind = 'none' | 'soft' | 'spiny' | 'flag' | 'long' | 'double';

export interface Pattern {
  /** Tupfen in einer Farbe (z. B. rote Tupfen der Forelle), optional mit hellem Ring. */
  readonly spots?: {
    readonly color: number;
    readonly ring?: number;
    readonly density: number;
    readonly from: number;
    readonly to: number;
    readonly band?: [number, number];
    readonly seed: number;
    /** Tupfen auch auf Rücken- und Schwanzflosse. */
    readonly onFins?: boolean;
  };
  /** Quer-Streifen (Barsch, Zander) über den Rücken. */
  readonly bars?: {
    readonly color: number;
    readonly count: number;
    readonly from: number;
    readonly to: number;
    readonly reach: number;
  };
  /** Marmorierung (Rutte, Waller, Hecht). */
  readonly marble?: {
    readonly color: number;
    readonly amount: number;
    readonly scale: number;
    readonly seed: number;
  };
  /** Seitenlinie. */
  readonly line?: number;
  /** Farbiges Längsband (z. B. rosa Band der Forelle). */
  readonly stripe?: { readonly color: number; readonly at: number; readonly width: number };
  /** Schuppen als feines Gitter. */
  readonly scales?: number;
}

export interface FishSpec {
  readonly size: 32;
  /** Länge über alles in Pixeln (entlang der Schräge). */
  readonly length: number;
  /** Halbe Höhe des Körpers an der dicksten Stelle (Pixel). */
  readonly height: number;
  /** Wo der Körper am dicksten ist (0 … 1 des Rumpfs). */
  readonly hump: number;
  /** Schwanzstiel und Schnauze (Anteil der Höhe). */
  readonly peduncle: number;
  readonly snout: number;
  /** Bauch etwas runder als der Rücken (> 1) oder flacher (< 1). */
  readonly belly: number;
  readonly angle?: number;
  readonly tail: Tail;
  readonly tailSize: number;
  readonly dorsal: DorsalKind;
  readonly dorsalSize: number;
  readonly adipose?: boolean;
  readonly anal?: boolean;
  readonly back: number;
  readonly side: number;
  readonly underside: number;
  readonly fin: number;
  /** Farbe der unteren Flossen (z. B. rot beim Rotauge). */
  readonly lowerFin?: number;
  /** Saum der Flossen (weiß beim Saibling). */
  readonly finEdge?: number;
  readonly eye: number;
  readonly eyeSize?: 1 | 2;
  readonly pattern?: Pattern;
  /** Großes Maul (Waller, Hecht): dunkle Linie unten an der Schnauze. */
  readonly mouth?: 'small' | 'wide' | 'duck';
  /** Barteln (Waller lang, Rutte eine). */
  readonly barbels?: 'long' | 'single' | 'short';
  /** Durchscheinend (Kristallsaibling): Deckkraft des Körpers. */
  readonly glass?: number;
}

const MOUTH_LENGTH = { small: 1.2, wide: 3, duck: 3.2 } as const;
/** Länge der Barteln (16 bzw. 32 Pixel große Bilder). */
const BARBEL_REACH = { long: [4, 10], short: [2, 3], single: [2, 4] } as const;

const BODY = 1;
const FIN = 2;
const EYE = 3;

/** Halbe Höhe des Rumpfs an der Stelle x (0 = Schwanzstiel, 1 = Schnauze), Anteil von 1. */
export function profile(spec: FishSpec, x: number): number {
  if (x < 0 || x > 1) return 0;
  if (x < spec.hump) return spec.peduncle + (1 - spec.peduncle) * Math.sin((Math.PI / 2) * (x / spec.hump));
  const k = (x - spec.hump) / (1 - spec.hump);
  return spec.snout + (1 - spec.snout) * Math.sqrt(Math.max(0, 1 - k * k * k));
}

/** Wo der Rumpf beginnt (davor kommt der Schwanz). */
export const tailEnd = (spec: FishSpec): number => (spec.tail === 'eel' ? 0.02 : 0.2);

/** Zusätzliche Zeichnung auf dem Fisch (Moos, Gräten, Krone …) – im selben gedrehten Koordinatensystem. */
export type Decorate = (c: Leinwand, f: ReturnType<typeof frame>) => void;

/** Zeichenfläche mit Rand: erst groß zeichnen, dann so ausschneiden, dass alles ins Bild passt. */
const ROOM = 1.6;
const MARGIN = 1;

/**
 * Fisch zeichnen und ins Bild setzen. Passt er nicht ganz hinein (Schwanz in der Ecke, lange Barteln), wird er
 * etwas kleiner gezeichnet – so ist nie etwas abgeschnitten, und er sitzt mittig.
 */
export function drawFish(spec: FishSpec, decorate?: Decorate, scale = 1): Leinwand {
  const raw = drawRaw({ ...spec, length: spec.length * scale, height: spec.height * scale }, decorate);
  const box = bounds(raw);
  const w = box.x1 - box.x0 + 1;
  const h = box.y1 - box.y0 + 1;
  if ((w > spec.size - MARGIN * 2 || h > spec.size - MARGIN * 2) && scale > 0.5) {
    return drawFish(spec, decorate, scale * 0.96);
  }
  const out = new Leinwand(spec.size);
  const ox = Math.floor((spec.size - w) / 2) - box.x0;
  const oy = Math.floor((spec.size - h) / 2) - box.y0;
  raw.each((x, y) => {
    if (raw.filled(x, y))
      out.set(x + ox, y + oy, raw.get(x, y), raw.partAt(x, y), raw.alpha[y * raw.size + x]);
  });
  return out;
}

function bounds(c: Leinwand): { x0: number; y0: number; x1: number; y1: number } {
  const b = { x0: c.size, y0: c.size, x1: 0, y1: 0 };
  c.each((x, y) => {
    if (!c.filled(x, y)) return;
    b.x0 = Math.min(b.x0, x);
    b.y0 = Math.min(b.y0, y);
    b.x1 = Math.max(b.x1, x);
    b.y1 = Math.max(b.y1, y);
  });
  return b;
}

function drawRaw(spec: FishSpec, decorate?: Decorate): Leinwand {
  const room = Math.round(spec.size * ROOM);
  const c = new Leinwand(room);
  const f = frame(room, spec.angle ?? 45, spec.length);
  const tb = tailEnd(spec);
  const H = spec.height;
  const finColor = (t: number, v: number, base: number): number => {
    const edge = spec.finEdge;
    return edge !== undefined && Math.abs(v) > 0 && hash(t * 50, v) < 0.0001 ? edge : base;
  };

  c.each((x, y) => {
    const { t, v } = f.local(x, y);
    if (t < -0.02 || t > 1.02) return;
    const bx = (t - tb) / (1 - tb);
    const h = H * profile(spec, bx);
    const up = h;
    const down = h * spec.belly;

    // Rumpf
    if (bx >= 0 && bx <= 1 && v <= up && v >= -down) {
      c.set(x, y, bodyColor(spec, t, v, up, down), BODY, spec.glass ?? 255);
      return;
    }
    // Schwanz
    if (t >= 0 && t < tb + 0.02 && spec.tail !== 'eel') {
      const k = 1 - t / tb;
      const stem = H * spec.peduncle;
      const spread = stem + (H * spec.tailSize - stem) * Math.pow(k, 0.8);
      const notch = spec.tail === 'fork' ? H * spec.tailSize * 0.9 * Math.max(0, k - 0.45) : 0;
      const roundCut = spec.tail === 'round' ? spread * (1 - Math.sqrt(Math.max(0, 1 - Math.pow(k, 4)))) : 0;
      if (Math.abs(v) <= spread - roundCut && Math.abs(v) >= notch) {
        const ray = (Math.round(Math.abs(v) * 1.3) % 2 === 0 ? 0.06 : -0.06) * (spec.size === 32 ? 1 : 0);
        const tip = spec.finEdge !== undefined && k > 0.82 ? spec.finEdge : shade(spec.fin, ray - k * 0.12);
        c.set(x, y, tip, FIN, spec.glass ? Math.min(255, spec.glass + 30) : 255);
        return;
      }
    }
    // Rückenflosse(n)
    const dorsal = dorsalHeight(spec, bx);
    if (dorsal > 0 && v > up - 0.2 && v <= up + dorsal) {
      const spiny = spec.dorsal === 'spiny' && Math.round(t * spec.length) % 2 === 0;
      const tone =
        spec.dorsal === 'flag' ? flagColor(spec, t, v - up, dorsal) : shade(spec.fin, spiny ? -0.25 : 0);
      const top =
        spec.finEdge !== undefined && spec.glass !== undefined && v > up + dorsal - 1 ? spec.finEdge : tone;
      c.set(x, y, finColor(t, v, top), FIN, spec.glass ? Math.min(255, spec.glass + 30) : 255);
      return;
    }
    // Fettflosse der Lachsartigen
    if (spec.adipose && bx > 0.1 && bx < 0.17 && v > up - 0.2 && v <= up + Math.max(1, H * 0.3)) {
      c.set(x, y, shade(spec.back, -0.1), FIN);
      return;
    }
    // Afterflosse und Bauchflossen
    const lower = spec.lowerFin ?? spec.fin;
    if (
      spec.anal !== false &&
      bx > 0.12 &&
      bx < 0.3 &&
      v < -down + 0.2 &&
      v >= -down - Math.max(1, H * 0.45 * (1 - Math.abs(bx - 0.21) / 0.09))
    ) {
      c.set(x, y, spec.finEdge !== undefined && v < -down - H * 0.3 ? spec.finEdge : lower, FIN);
      return;
    }
    if (
      bx > 0.48 &&
      bx < 0.58 &&
      v < -down + 0.2 &&
      v >= -down - Math.max(1, H * 0.4 * (1 - Math.abs(bx - 0.53) / 0.05))
    ) {
      c.set(x, y, spec.finEdge !== undefined && v < -down - H * 0.25 ? spec.finEdge : lower, FIN);
      return;
    }
    // Aalflosse: Saum um den ganzen hinteren Körper
    if (spec.tail === 'eel' && bx >= -0.04 && bx < 0.65) {
      const fringe = Math.max(0.9, H * 0.35);
      if (Math.abs(v) <= Math.max(up, down) + fringe && (v > up || v < -down)) c.set(x, y, spec.fin, FIN);
    }
  });

  details(c, spec, f);
  decorate?.(c, f);
  c.outline();
  return c;
}

function dorsalHeight(spec: FishSpec, bx: number): number {
  const H = spec.height;
  const tri = (from: number, to: number, peak: number, height: number): number => {
    if (bx < from || bx > to) return 0;
    const k = bx < peak ? (bx - from) / (peak - from) : (to - bx) / (to - peak);
    return Math.max(0, height * k);
  };
  if (spec.dorsal === 'none' || spec.dorsal === 'long' || spec.tail === 'eel') {
    return spec.dorsal === 'long' ? tri(0.08, 0.55, 0.12, H * spec.dorsalSize) : 0;
  }
  if (spec.dorsal === 'flag') return tri(0.25, 0.7, 0.36, H * spec.dorsalSize);
  if (spec.dorsal === 'double') {
    return Math.max(
      tri(0.48, 0.7, 0.55, H * spec.dorsalSize),
      tri(0.18, 0.44, 0.25, H * spec.dorsalSize * 0.8),
    );
  }
  if (spec.dorsal === 'spiny')
    return Math.max(
      tri(0.42, 0.72, 0.55, H * spec.dorsalSize),
      tri(0.2, 0.42, 0.3, H * spec.dorsalSize * 0.6),
    );
  return tri(0.42, 0.66, 0.5, H * spec.dorsalSize);
}

function flagColor(spec: FishSpec, t: number, above: number, height: number): number {
  // Äsche: Fahne mit dunklen Tupfen und rot-violettem Saum
  if (above > height - 1.2) return 0xc0457a;
  return hash(Math.round(t * 40), Math.round(above)) < 0.28
    ? shade(spec.fin, -0.45)
    : mix(spec.fin, 0x7c5aa8, above / height / 2);
}

function bodyColor(spec: FishSpec, t: number, v: number, up: number, down: number): number {
  const y = v >= 0 ? v / Math.max(0.5, up) : v / Math.max(0.5, down); // -1 … 1
  let c = spec.side;
  if (y > 0.3) c = mix(spec.side, spec.back, Math.min(1, (y - 0.3) / 0.5));
  if (y < -0.25) c = mix(spec.side, spec.underside, Math.min(1, (-y - 0.25) / 0.45));
  const p = spec.pattern;
  if (p?.stripe && Math.abs(y - p.stripe.at) < p.stripe.width) c = mix(c, p.stripe.color, 0.75);
  if (p?.line !== undefined && Math.abs(y - 0.05) < (spec.size === 32 ? 0.07 : 0.12) && t > 0.25 && t < 0.78)
    c = mix(c, p.line, 0.6);
  if (p?.scales && spec.size === 32 && (Math.round(t * spec.length) + Math.round(v * 1.4)) % 3 === 0)
    c = shade(c, -p.scales);
  if (p?.bars) {
    const k = (t - p.bars.from) / (p.bars.to - p.bars.from);
    const phase = k * p.bars.count;
    if (k > 0 && k < 1 && phase % 1 < 0.42 && y > 1 - p.bars.reach - 0.25 * Math.sin(phase * 2.1))
      c = mix(c, p.bars.color, 0.8);
  }
  if (p?.marble) {
    const m = p.marble;
    const n =
      Math.sin(t * m.scale * 6.1 + v * 1.7 + m.seed) +
      Math.sin(v * m.scale * 0.9 - t * 9.3 + m.seed * 2) +
      hash(Math.round(t * spec.length), Math.round(v), m.seed) * 0.8;
    if (n > 2 - m.amount * 2.2 && y > -0.4) c = mix(c, m.color, 0.7);
  }
  if (p?.spots) {
    const s = p.spots;
    const [lo, hi] = s.band ?? [-0.5, 0.95];
    const gx = Math.round(t * spec.length);
    const gy = Math.round(v * 1.05);
    const spot = t > s.from && t < s.to && y > lo && y < hi && hash(gx, gy, s.seed) < s.density;
    if (spot) c = s.color;
    else if (s.ring !== undefined && spec.size === 32 && t > s.from && t < s.to && y > lo && y < hi) {
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => hash(gx + (dx ?? 0), gy + (dy ?? 0), s.seed) < s.density);
      if (near) c = mix(c, s.ring, 0.6);
    }
  }
  // Licht von oben: Rücken etwas heller an der Kante, Bauch zum Rand dunkler
  if (y > 0.75) c = shade(c, 0.08);
  if (y < -0.8) c = shade(c, -0.1);
  return c;
}

/** Auge, Kiemendeckel, Maul, Barteln, Brustflosse. */
function details(c: Leinwand, spec: FishSpec, f: ReturnType<typeof frame>): void {
  const tb = tailEnd(spec);
  const big = spec.size === 32;
  const find = (pred: (t: number, v: number, bx: number) => boolean): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    c.each((x, y) => {
      const { t, v } = f.local(x, y);
      if (pred(t, v, (t - tb) / (1 - tb))) out.push([x, y]);
    });
    return out;
  };
  const H = spec.height;
  const eyeT = 1 - (big ? 2.6 : 2.1) / spec.length - (spec.mouth === 'duck' ? 2.2 / spec.length : 0);
  const eyeV = H * profile(spec, (eyeT - tb) / (1 - tb)) * 0.3;
  // Kiemendeckel: feiner Bogen hinter dem Auge
  const gillT = eyeT - (big ? 3.4 : 2.2) / spec.length;
  find(
    (t, v, bx) =>
      Math.abs(t - gillT) < 0.5 / spec.length &&
      Math.abs(v) < H * profile(spec, bx) * 0.75 &&
      bx > 0 &&
      bx < 1,
  ).forEach(([x, y]) => {
    if (c.partAt(x, y) === BODY) c.set(x, y, shade(c.get(x, y), -0.28), BODY, c.alpha[y * c.size + x]);
  });
  // Brustflosse
  find(
    (t, v) => t > gillT - 2.4 / spec.length && t < gillT - 0.4 / spec.length && v < -H * 0.05 && v > -H * 0.5,
  ).forEach(([x, y]) => {
    if (c.partAt(x, y) === BODY)
      c.set(x, y, mix(c.get(x, y), spec.lowerFin ?? spec.fin, 0.65), BODY, c.alpha[y * c.size + x]);
  });
  // Maul
  const mouthLen = MOUTH_LENGTH[spec.mouth ?? 'small'];
  find((t, v) => t > 1 - mouthLen / spec.length && t < 1.02 && Math.abs(v + H * 0.1) < 0.5).forEach(
    ([x, y]) => {
      if (c.filled(x, y)) c.set(x, y, shade(spec.underside, -0.55), BODY);
    },
  );
  // Auge
  const eyeCells = find(
    (t, v) =>
      Math.abs((t - eyeT) * spec.length) < (spec.eyeSize === 2 ? 1.0 : 0.55) &&
      Math.abs(v - eyeV) < (spec.eyeSize === 2 ? 1.0 : 0.55),
  );
  eyeCells.forEach(([x, y]) => c.set(x, y, spec.eye, EYE));
  const pupil = eyeCells.sort((a, b) => a[0] - b[0] || b[1] - a[1])[eyeCells.length - 1];
  if (pupil && eyeCells.length > 1) c.set(pupil[0], pupil[1], 0x101010, EYE);
  if (eyeCells.length === 1 && pupil)
    c.set(pupil[0], pupil[1], spec.eye === 0x101010 ? 0x101010 : spec.eye, EYE);
  // Barteln: hängen vom Maulwinkel nach unten (Waller lang, Schleie kurz, Rutte eine am Kinn)
  if (spec.barbels) {
    const reach = BARBEL_REACH[spec.barbels][big ? 1 : 0];
    const mouthV = -H * profile(spec, 1) * 0.3;
    // Bildschirm-unten im gedrehten System: etwas zurück (u) und zum Bauch (v)
    const a = ((spec.angle ?? 45) * Math.PI) / 180;
    const down = { u: -Math.sin(a), v: -Math.cos(a) };
    const starts =
      spec.barbels === 'single'
        ? [{ u: -2.2, v: -H * profile(spec, 0.85) }]
        : [
            { u: -0.4, v: mouthV },
            { u: -1.6, v: mouthV - 1.2 },
          ];
    const points = starts.flatMap((p0, k) =>
      Array.from({ length: Math.round(reach * 4 * (k ? 0.6 : 1)) }, (_, i) => {
        const s = i / 4;
        const ahead = spec.barbels === 'single' ? 0 : 0.9 * s - 0.08 * s * s;
        return { u: p0.u + ahead + down.u * s, v: p0.v + down.v * s };
      }),
    );
    find((t, v) => {
      const u = (t - 1) * spec.length;
      return points.some((p) => Math.hypot(u - p.u, v - p.v) < 0.5);
    }).forEach(([x, y]) => {
      if (!c.filled(x, y) || c.partAt(x, y) === BODY) c.set(x, y, shade(spec.back, -0.35), 4);
    });
  }
}
