/* eslint-disable ts-patterns/no-magic-numbers -- 3D hats: positions, sizes and colours, built by hand */
/**
 * Die vier Kopfbedeckungen aus dem Kleiderschrank von Angelkönig als eigene 3D-Modelle (`Modell`), mit selbst
 * gezeichneten Texturen. Lage auf dem Kopf: Minecraft zeichnet Kopf-Gegenstände auf 0,625 verkleinert, die Mitte des
 * Modells (8, 8, 8) sitzt in der Mitte des Kopfes; der Kopf reicht also von 1,6 bis 14,4, die zweite Skin-Ebene bis
 * 0,8 bzw. 15,2 (oben 15,2). Vorn (Gesicht) ist Norden (kleines z).
 */
import {
  clear,
  hash,
  mix,
  Modell,
  plain,
  shade,
  type BuiltModel,
  type Dir,
  type Paint,
  type Vec,
} from './modell.js';

// ---------- Stoffe ----------

/** Baumwoll-Segeltuch: feine Leinwandbindung, Nähte in Reihen. */
function canvas(base: number, seed: number, stitch = 0): Paint {
  return (u, v, w, h, dir) => {
    const weave = (u + v) % 2 === 0 ? 0.04 : -0.03;
    const n = (hash(u, v, seed, dir.length) - 0.5) * 0.08;
    const seam = stitch > 0 && v % stitch === stitch - 1 && u % 2 === 0 ? -0.22 : 0;
    const edge = v === h - 1 || u === 0 || u === w - 1 ? -0.08 : 0;
    return shade(base, weave + n + seam + edge);
  };
}

/** Geflochtenes Stroh: schräge Bänder hell/dunkel. */
function straw(base: number, seed: number): Paint {
  return (u, v) => {
    const band = Math.floor((u + v) / 2) % 2 === 0;
    const cross = Math.floor((u - v + 64) / 2) % 2 === 0;
    const f = (band ? 0.1 : -0.06) + (cross ? 0.04 : -0.04) + (hash(u, v, seed) - 0.5) * 0.1;
    return shade(base, f);
  };
}

/** Filz: weiches Rauschen, keine Struktur. */
function felt(base: number, seed: number): Paint {
  return (u, v, w, h, dir) => {
    const n = (hash(u, v, seed, dir.length) - 0.5) * 0.1 + (hash(u >> 1, v >> 1, seed + 7) - 0.5) * 0.08;
    const edge = v === 0 && dir !== 'up' && dir !== 'down' ? 0.06 : 0;
    return shade(base, n + edge);
  };
}

const GOLD = 0xf2b52a;
const GOLD_DARK = 0xa86a12;
const GOLD_LIGHT = 0xfff0a0;
const SHINE_FRAMES = 12;
/** Grundhelligkeit von Deckel und Boden; Seiten haben einen Verlauf. */
const FACE_GROUND: Partial<Record<Dir, number>> = { up: 0.15, down: -0.35 };
/** Lichtstreif: Mitte hell, Rand halb. */
const GLINT: ReadonlyArray<[number, number]> = [
  [2, 0.75],
  [4, 0.35],
];

/**
 * Gold, das glänzt: Verlauf von hell (oben) nach dunkel, feine Gravur, und ein Lichtstreif, der schräg über alle
 * Flächen wandert (Bildfolge). `phase` versetzt den Streif je Teil, damit er über die Krone läuft.
 */
function gold(phase: number, engrave = 0): Paint {
  return (u, v, w, h, dir, frame) => {
    const ground = FACE_GROUND[dir] ?? 0.12 - (v / Math.max(1, h - 1)) * 0.38;
    const n = (hash(u, v, phase, dir.length) - 0.5) * 0.06;
    const grav = engrave > 0 && (u + v) % engrave === 0 ? -0.18 : 0;
    const pos = (u + v + phase * 3 + 60 - frame * 6) % 60;
    const glint = GLINT.find(([until]) => pos < until)?.[1] ?? 0;
    const base = mix(GOLD_DARK, GOLD, 0.75);
    const c = shade(base, ground + n + grav);
    return glint > 0 ? mix(c, GOLD_LIGHT, glint) : c;
  };
}

/** Edelstein: heller Kern, dunkler Rand, ein Funkeln, das kommt und geht. */
function gem(colour: number, seed: number): Paint {
  return (u, v, w, h, _dir, frame) => {
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const r = Math.hypot(u - cx, v - cy) / Math.max(1, Math.max(cx, cy));
    const sparkle = (frame + seed) % SHINE_FRAMES < 2 && u === Math.floor(cx) && v === 0 ? 0.8 : 0;
    const c = shade(colour, 0.35 - r * 0.6);
    return sparkle ? mix(c, 0xffffff, sparkle) : c;
  };
}

const single =
  (c: number): Paint =>
  () =>
    c;

/** Zwei Texel je Modell-Einheit: feiner als der Skin (auf dem Kopf etwa 0,3 Skin-Pixel je Texel). */
const HAT_DENSITY = 2;

// ---------- Fischerhut ----------

const OLIVE = 0x6b7b3a;

/** Fliege (Angelköder) als kleines Teil am Hutband: Körper, Federn, Haken. */
function fly(m: Modell, x: number, y: number, z: number, body: number, hackle: number, side: 1 | -1): void {
  const o = side === 1 ? 0 : -0.4;
  m.box([x + o, y, z], [x + o + 0.4, y + 1.6, z + 0.6], plain(body, 0.1, -0.15, 31), { skip: ['down'] });
  m.box([x + o, y + 1.2, z - 0.4], [x + o + 0.4, y + 2.2, z + 1], (u, v) =>
    (u + v) % 2 === 0 ? hackle : shade(hackle, -0.25),
  );
  m.box([x + o, y - 0.6, z + 0.2], [x + o + 0.2, y, z + 0.4], single(0xb8bec4));
}

export function fischerhut(): BuiltModel {
  const m = new Modell('item/kleidung/fischerhut', 1, 'moinmorni', HAT_DENSITY);
  // Krone: Wand und Deckel, Nähte rundum, Luftlöcher (Ösen) an den Seiten
  const wall = canvas(OLIVE, 3, 3);
  const eyelet: Paint = (u, v, w, h, dir, f) => {
    const side = dir === 'east' || dir === 'west';
    const holes = [8, w - 9];
    const hole = side && Math.abs(v - 4) <= 0.5 && holes.some((x) => Math.abs(u - x) <= 0.5);
    const ring = side && Math.abs(v - 4) <= 1.5 && holes.some((x) => Math.abs(u - x) <= 1.5);
    if (hole) return 0x1d2214;
    return ring ? 0xc7c9b8 : wall(u, v, w, h, dir, f);
  };
  m.box([0.4, 12.6, 0.4], [15.6, 17.6, 15.6], eyelet, { skip: ['down'] });
  m.box([1.2, 17.6, 1.2], [14.8, 19, 14.8], wall, { skip: ['down'] });
  const top: Paint = (u, v, w, h, dir, f) => {
    const r = Math.hypot(u - (w - 1) / 2, v - (h - 1) / 2);
    const seam = Math.abs(r - 7) < 0.6 && (u + v) % 2 === 0;
    return seam ? shade(OLIVE, -0.25) : canvas(shade(OLIVE, 0.05), 5)(u, v, w, h, dir, f);
  };
  m.box([2.2, 19, 2.2], [13.8, 19.8, 13.8], { up: top, north: wall, south: wall, east: wall, west: wall });
  // Hutband (dunkler, mit Schnalle vorn links)
  const band: Paint = (u, v, w) => {
    const buckle = u >= 4 && u <= 6 ? 0xc7b98a : null;
    return (
      buckle ?? shade(0x4a3a22, (hash(u, v, 9) - 0.5) * 0.1 + (v === 0 ? 0.08 : 0) + (u === w - 1 ? -0.1 : 0))
    );
  };
  m.box([0.1, 12.6, 0.1], [15.9, 14.2, 15.9], band, { skip: ['up', 'down'] });
  // Krempe: innen flach, außen hängend (vier Streifen, je 22,5° nach unten)
  const brim = canvas(shade(OLIVE, -0.04), 11, 2);
  const under = plain(shade(OLIVE, -0.3), 0.05, 0, 13);
  m.box([-0.4, 11.8, -0.4], [16.4, 12.6, 16.4], {
    up: brim,
    down: under,
    north: brim,
    south: brim,
    east: brim,
    west: brim,
  });
  const strip = (from: Vec, to: Vec, axis: 'x' | 'z', angle: number, origin: Vec): void => {
    m.box(
      from,
      to,
      { up: brim, down: under, north: brim, south: brim, east: brim, west: brim },
      { rotation: { axis, angle, origin } },
    );
  };
  strip([-2.2, 11.8, -3.2], [18.2, 12.6, 0], 'x', 22.5, [8, 12.2, 0]);
  strip([-2.2, 11.8, 16], [18.2, 12.6, 19.2], 'x', -22.5, [8, 12.2, 16]);
  strip([-3.2, 11.8, -0.4], [0, 12.6, 16.4], 'z', -22.5, [0, 12.2, 8]);
  strip([16, 11.8, -0.4], [19.2, 12.6, 16.4], 'z', 22.5, [16, 12.2, 8]);
  // Fliegen am Band (rechte Seite und vorn)
  fly(m, 15.9, 12.4, 4, 0xc8352e, 0xf2d34a, 1);
  fly(m, 15.9, 12.4, 7.5, 0x2f5fb0, 0xe9e2d0, 1);
  fly(m, 15.9, 12.4, 11, 0x3b6e2e, 0x9a6a3a, 1);
  fly(m, 0.1, 12.4, 10, 0xe07a1f, 0x6b4a2a, -1);
  return m.build(DISPLAY);
}

// ---------- Strohhut ----------

const STRAW = 0xe2c46c;

export function strohhut(): BuiltModel {
  const m = new Modell('item/kleidung/strohhut', 1, 'moinmorni', HAT_DENSITY);
  const s = straw(STRAW, 21);
  m.box([0.6, 12.4, 0.6], [15.4, 17.8, 15.4], s, { skip: ['down'] });
  m.box([1.8, 17.8, 1.8], [14.2, 18.8, 14.2], s, { skip: ['down'] });
  // breite Krempe mit dunklerem, gerolltem Rand
  const brimTop: Paint = (u, v, w, h, dir, f) => {
    const rim = u <= 1 || v <= 1 || u >= w - 2 || v >= h - 2;
    const c = straw(STRAW, 23)(u, v, w, h, dir, f) ?? STRAW;
    return rim ? shade(c, -0.18) : c;
  };
  const brimUnder = straw(shade(STRAW, -0.25), 24);
  const side = straw(shade(STRAW, -0.12), 25);
  m.box([-4, 11.6, -4], [20, 12.4, 20], {
    up: brimTop,
    down: brimUnder,
    north: side,
    south: side,
    east: side,
    west: side,
  });
  // Band: rot mit zwei weißen Streifen
  const ribbon: Paint = (u, v, w, h) => {
    const stripe = v === 1 || v === h - 2;
    return stripe ? 0xf4f1ea : shade(0xc8282e, (hash(u, v, 31) - 0.5) * 0.08 + (v === 0 ? 0.1 : 0));
  };
  m.box([0.3, 12.4, 0.3], [15.7, 14.4, 15.7], ribbon, { skip: ['up', 'down'] });
  // Schleife links (Westen): zwei Schlaufen, Knoten, zwei Enden
  const bow = plain(0xc8282e, 0.06, -0.15, 33);
  m.box([-0.6, 12.6, 5.2], [0.3, 14.2, 6.8], bow);
  m.box([-0.6, 13.2, 2.6], [0.1, 15.2, 5.2], bow, {
    rotation: { axis: 'x', angle: -22.5, origin: [0, 14, 5.2] },
  });
  m.box([-0.6, 13.2, 6.8], [0.1, 15.2, 9.4], bow, {
    rotation: { axis: 'x', angle: 22.5, origin: [0, 14, 6.8] },
  });
  m.box([-0.4, 10.6, 5.4], [0.1, 12.6, 6.2], bow, {
    rotation: { axis: 'x', angle: -22.5, origin: [0, 12.6, 5.8] },
  });
  // Blümchen vorn rechts: weiße Margerite, blauer Enzian
  const daisy: Paint = (u, v, w, h) =>
    u === Math.floor(w / 2) && v === Math.floor(h / 2) ? 0xf2c832 : 0xfbfaf4;
  m.box([11, 13, -0.2], [13, 15, 0.3], daisy, { skip: ['up', 'down', 'east', 'west'] });
  m.box([12.6, 12.6, -0.3], [14, 14, 0.3], single(0x2850c8), { skip: ['down'] });
  m.box([9.8, 12.8, -0.15], [11.2, 13.4, 0.3], single(0x4a8a2e), { skip: ['down'] });
  return m.build(DISPLAY);
}

// ---------- Trachtenhut ----------

const LODEN = 0x2e4b33;

export function trachtenhut(): BuiltModel {
  const m = new Modell('item/kleidung/trachtenhut', 1, 'moinmorni', HAT_DENSITY);
  const f = felt(LODEN, 41);
  const dark = felt(shade(LODEN, -0.3), 42);
  // Krempe: schmal, hinten etwas aufgestellt
  m.box([-0.8, 11.6, -1.4], [16.8, 12.4, 16.2], {
    up: f,
    down: dark,
    north: dark,
    south: dark,
    east: dark,
    west: dark,
  });
  m.box(
    [-0.8, 11.6, 16.2],
    [16.8, 12.4, 17.8],
    { up: f, down: dark, north: dark, south: dark, east: dark, west: dark },
    {
      rotation: { axis: 'x', angle: -22.5, origin: [8, 12, 16.2] },
    },
  );
  // Krone: unten breit, oben schmaler, mit Kniff (Delle) in der Mitte
  m.box([0.5, 12.4, 0.5], [15.5, 17.4, 15.5], f, { skip: ['down'] });
  m.box([1.6, 17.4, 1.8], [14.4, 19.4, 14.4], f, { skip: ['down'] });
  m.box([2.4, 19.4, 2.6], [7.4, 20.2, 13.6], f, { skip: ['down'] });
  m.box([8.6, 19.4, 2.6], [13.6, 20.2, 13.6], f, { skip: ['down'] });
  // Kordel: gedreht, weiß-rot-grün
  const cord: Paint = (u, v) => {
    const CORD = [0xeee8da, 0xb8282a, 0x3f7a3a];
    return CORD[Math.floor(((u + v * 2) % 6) / 2)] ?? 0xeee8da;
  };
  m.box([0.2, 12.4, 0.2], [15.8, 13.6, 15.8], cord, { skip: ['up', 'down'] });
  // Edelweiß vorn links: weißer Stern, gelbe Mitte
  const star: Paint = (u, v, w, h) => {
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const dx = Math.abs(u - cx);
    const dy = Math.abs(v - cy);
    if (dx < 0.6 && dy < 0.6) return 0xf2d13a;
    if (dx < 0.6 || dy < 0.6 || Math.abs(dx - dy) < 0.6) return (u + v) % 2 ? 0xf6f4ec : 0xdcdad0;
    return null;
  };
  m.box([2.2, 13.2, 0.1], [5.2, 16.2, 0.5], { north: star, south: clear }, {});
  m.box([4.6, 13.6, 0.3], [5.8, 14.6, 0.5], single(0x4f7d3a), { skip: ['up', 'down', 'east', 'west'] });
  // Gamsbart hinten links: Silberhülse, darüber ein Büschel aus dunklen Haaren mit hellen Spitzen
  const sleeve: Paint = (u, v) => ((u + v) % 3 === 0 ? 0xf2f2f2 : 0xa9adb3);
  m.box([12.2, 12.6, 14.2], [14.6, 14.4, 16.6], sleeve);
  const hair: Paint = (u, v, w, h) => {
    const t = v / Math.max(1, h - 1);
    const tip = t < 0.35;
    const base = tip ? mix(0xe8e2d6, 0xb9b0a0, t / 0.35) : mix(0x6a5440, 0x2a1e14, (t - 0.35) / 0.65);
    return shade(base, (hash(u, v, 51) - 0.5) * 0.18);
  };
  const tuft: Array<[number, 'x' | 'z', number]> = [
    [0, 'x', 0],
    [0.7, 'x', 22.5],
    [-0.7, 'x', -22.5],
    [0.9, 'z', 22.5],
    [-0.9, 'z', -22.5],
    [0.4, 'x', 45],
    [-0.4, 'z', -45],
    [0.3, 'z', 45],
  ];
  tuft.forEach(([d, axis, angle]) => {
    const cx = 13.4 + d * 0.5;
    const cz = 15.4 - d * 0.3;
    m.box([cx - 0.5, 14.4, cz - 0.5], [cx + 0.5, 21.6, cz + 0.5], hair, {
      rotation: { axis, angle, origin: [cx, 14.4, cz] },
      skip: ['down'],
    });
  });
  // kleine Feder rechts
  const feather: Paint = (u, v) => {
    if (v % 3 === 0) return 0xf2f2f2;
    return u === 0 ? 0x111111 : 0x2a2a2a;
  };
  m.box(
    [15.6, 13, 9],
    [15.9, 19, 10.4],
    { east: feather, west: feather },
    {
      rotation: { axis: 'x', angle: 22.5, origin: [15.7, 13, 9.7] },
    },
  );
  return m.build(DISPLAY);
}

// ---------- Königskrone ----------

export function koenigskrone(): BuiltModel {
  const m = new Modell('item/kleidung/koenigskrone', SHINE_FRAMES, 'moinmorni', HAT_DENSITY);
  const lo = 0.8;
  const hi = 15.2;
  const t = 0.8;
  // Reif: vier Wände, unten ein breiterer Wulst
  const ring = (y0: number, y1: number, inset: number, phase: number, engrave: number): void => {
    const g = gold(phase, engrave);
    const a = lo - inset;
    const b = hi + inset;
    m.box([a, y0, a], [b, y1, a + t], g);
    m.box([a, y0, b - t], [b, y1, b], gold(phase + 9, engrave));
    m.box([a, y0, a + t], [a + t, y1, b - t], gold(phase + 4, engrave));
    m.box([b - t, y0, a + t], [b, y1, b - t], gold(phase + 13, engrave));
  };
  ring(11.4, 12.4, 0.4, 0, 0);
  ring(12.4, 15.2, 0, 2, 5);
  ring(15.2, 15.8, 0.3, 6, 0);
  // Zacken: an den Ecken und in der Mitte jeder Seite, oben eine Perle
  const pearl: Paint = (u, v) => (u === 0 && v === 0 ? 0xffffff : 0xece6da);
  const spike = (x: number, z: number, k: number): void => {
    m.box([x - 1.1, 15.8, z - 1.1], [x + 1.1, 17.6, z + 1.1], gold(k * 5, 0), { skip: ['down'] });
    m.box([x - 0.6, 17.6, z - 0.6], [x + 0.6, 19.2, z + 0.6], gold(k * 5 + 2, 0), { skip: ['down'] });
    m.box([x - 0.5, 19.2, z - 0.5], [x + 0.5, 20.2, z + 0.5], pearl);
  };
  const corners: Array<[number, number]> = [
    [lo + 0.4, lo + 0.4],
    [hi - 0.4, lo + 0.4],
    [lo + 0.4, hi - 0.4],
    [hi - 0.4, hi - 0.4],
    [8, hi - 0.4],
    [lo + 0.4, 8],
    [hi - 0.4, 8],
  ];
  corners.forEach(([x, z], k) => spike(x, z, k));
  // Vorn in der Mitte ein goldener Fisch statt eines Zackens
  const fish: Paint = (u, v, w, h, dir, frame) => {
    const nx = (u + 0.5) / w;
    const ny = (v + 0.5) / h;
    const body = ((nx - 0.55) / 0.36) ** 2 + ((ny - 0.5) / 0.3) ** 2 <= 1;
    const tail = nx < 0.25 && Math.abs(ny - 0.5) < (0.25 - nx) * 1.6 + 0.05;
    if (!body && !tail) return null;
    if (body && nx > 0.74 && nx < 0.82 && ny > 0.38 && ny < 0.5) return 0x2a1606;
    return gold(3, body && Math.abs(ny - 0.5) < 0.08 ? 2 : 0)(u, v, w, h, dir, frame);
  };
  m.box([4.6, 15.6, 0.2], [11.4, 19.8, 0.6], { north: fish, south: fish }, { density: 4 });
  // Edelsteine im Reif: vorn Rubin, Seiten Saphir, hinten Smaragd, dazwischen Perlen
  const stones: Array<[Vec, Vec, number]> = [
    [[6.9, 12.9, 0.1], [9.1, 14.7, 0.8], 0xd0202e],
    [[6.9, 12.9, 15.2], [9.1, 14.7, 15.9], 0x1fa850],
    [[0.1, 12.9, 6.9], [0.8, 14.7, 9.1], 0x2a5ad8],
    [[15.2, 12.9, 6.9], [15.9, 14.7, 9.1], 0x2a5ad8],
  ];
  stones.forEach(([from, to, colour], k) => m.box(from, to, gem(colour, k * 3), { skip: ['down'] }));
  const pearls: Vec[] = [
    [3.2, 13.4, 0.2],
    [12.2, 13.4, 0.2],
    [3.2, 13.4, 15.2],
    [12.2, 13.4, 15.2],
  ];
  pearls.forEach((p) => m.box(p, [p[0] + 0.8, p[1] + 0.8, p[2] + 0.6], pearl));
  // Samtkappe mit Hermelin-Saum: rot, oben gewölbt, darauf Reichsapfel mit Kreuz
  const velvet: Paint = (u, v, w, h, dir) =>
    shade(0x9a1622, (hash(u, v, 61, dir.length) - 0.5) * 0.12 + (dir === 'up' ? 0.08 : -0.05));
  m.box([1.6, 12.4, 1.6], [14.4, 17.2, 14.4], velvet, { skip: ['down'] });
  m.box([3, 17.2, 3], [13, 18.4, 13], velvet, { skip: ['down'] });
  const ermine: Paint = (u, v) => ((u * 3 + v * 5) % 7 === 0 ? 0x1a1a1a : 0xf3f0e8);
  m.box([1.4, 15.2, 1.4], [14.6, 15.8, 14.6], { up: ermine }, {});
  m.box([7.1, 18.4, 7.1], [8.9, 20.2, 8.9], gold(7, 0), { skip: ['down'] });
  m.box([7.7, 20.2, 7.7], [8.3, 22.4, 8.3], gold(8, 0), { skip: ['down'] });
  m.box([7, 21.2, 7.7], [9, 21.8, 8.3], gold(9, 0));
  return m.build(DISPLAY);
}

/**
 * Darstellung: auf dem Kopf genau wie gebaut; im Inventar schräg von vorn oben und so klein, dass Krempe und Gamsbart
 * ins Feld passen; in der Hand und am Boden kleiner.
 */
export const DISPLAY = {
  head: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] },
  gui: { rotation: [25, 145, 0], translation: [0, -3.5, 0], scale: [0.58, 0.58, 0.58] },
  ground: { rotation: [0, 0, 0], translation: [0, -2, 0], scale: [0.4, 0.4, 0.4] },
  fixed: { rotation: [0, 180, 0], translation: [0, -3, 0], scale: [0.6, 0.6, 0.6] },
  thirdperson_righthand: { rotation: [10, 45, 0], translation: [0, -1, 1], scale: [0.4, 0.4, 0.4] },
  thirdperson_lefthand: { rotation: [10, 45, 0], translation: [0, -1, 1], scale: [0.4, 0.4, 0.4] },
  firstperson_righthand: { rotation: [0, 45, 0], translation: [0, -2, 0], scale: [0.4, 0.4, 0.4] },
  firstperson_lefthand: { rotation: [0, 225, 0], translation: [0, -2, 0], scale: [0.4, 0.4, 0.4] },
};

export const HAT_BUILDERS: Readonly<Record<string, () => BuiltModel>> = {
  fischerhut,
  strohhut,
  trachtenhut,
  koenigskrone,
};

export type { Dir };
