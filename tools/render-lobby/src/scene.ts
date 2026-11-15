/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-loop-statements, ts-patterns/no-nested-ternary -- render tool: Pixel- und Voxel-Schleifen */
/**
 * Lobby → Dreiecke: baut die Lobby mit dem Baukasten, wirft verdeckte Flächen weg und schreibt pro Material-Gruppe
 * (fest, ausgeschnitten, Glas, Wasser) Puffer mit Position, Normale, Textur-Koordinate, Farbe (Umgebungsverdeckung +
 * leichte Farbunterschiede) und Leuchten (Blocklicht von Laternen, Selbstleuchten, Fenster). Dazu ein Textur-Atlas aus
 * eigenen Kacheln und die Figuren-Skins.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildLobby } from '../../../packages/builder/src/lobby/dorfplatz.js';
import { castSkinPng, CAST } from '../../../packages/builder/src/cast.js';
import { Picture } from '../../../packages/builder/src/png.js';
import {
  classify,
  FACE_DIR,
  FACES,
  fenceParts,
  paneParts,
  wallParts,
  type BlockInfo,
  type Face,
  type Group,
  type Part,
} from './blocks.js';
import { paint, TILE } from './textures.js';

const X0 = -224;
const Z0 = -224;
const Y0 = 48;
const NX = 448;
const NZ = 448;
const NY = 160;

const CELL = 32;
const PAD = (CELL - TILE) / 2;
const ATLAS_COLS = 32;
const ATLAS = CELL * ATLAS_COLS;

const AO_LEVELS = [0.42, 0.62, 0.82, 1];

class Grow<T extends Float32Array | Int8Array | Uint16Array | Uint8Array | Uint32Array> {
  n = 0;
  constructor(
    public a: T,
    private readonly make: (len: number) => T,
  ) {}
  push3(x: number, y: number, z: number): void {
    this.ensure(3);
    this.a[this.n++] = x;
    this.a[this.n++] = y;
    this.a[this.n++] = z;
  }
  push2(x: number, y: number): void {
    this.ensure(2);
    this.a[this.n++] = x;
    this.a[this.n++] = y;
  }
  ensure(k: number): void {
    if (this.n + k <= this.a.length) return;
    const b = this.make(Math.max(this.a.length * 2, 1024));
    b.set(this.a);
    this.a = b;
  }
  done(): T {
    return this.a.subarray(0, this.n) as T;
  }
}

class Mesh {
  readonly pos = new Grow(new Float32Array(1 << 16), (n) => new Float32Array(n));
  readonly nrm = new Grow(new Int8Array(1 << 16), (n) => new Int8Array(n));
  readonly uv = new Grow(new Uint16Array(1 << 16), (n) => new Uint16Array(n));
  readonly col = new Grow(new Uint8Array(1 << 16), (n) => new Uint8Array(n));
  readonly glow = new Grow(new Uint8Array(1 << 16), (n) => new Uint8Array(n));
  readonly idx = new Grow(new Uint32Array(1 << 16), (n) => new Uint32Array(n));
  verts = 0;
}

type V3 = readonly [number, number, number];

interface Corner {
  readonly p: V3;
  readonly u: number;
  readonly v: number;
  readonly c: V3;
  readonly g: V3;
}

/** Ecken einer Quader-Seite (von außen gesehen: oben links, oben rechts, unten rechts, unten links). */
function faceCorners(
  f: Face,
  b: { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number },
): V3[] {
  const { x1, y1, z1, x2, y2, z2 } = b;
  const table: Record<Face, V3[]> = {
    south: [
      [x1, y2, z2],
      [x2, y2, z2],
      [x2, y1, z2],
      [x1, y1, z2],
    ],
    north: [
      [x2, y2, z1],
      [x1, y2, z1],
      [x1, y1, z1],
      [x2, y1, z1],
    ],
    east: [
      [x2, y2, z2],
      [x2, y2, z1],
      [x2, y1, z1],
      [x2, y1, z2],
    ],
    west: [
      [x1, y2, z1],
      [x1, y2, z2],
      [x1, y1, z2],
      [x1, y1, z1],
    ],
    top: [
      [x1, y2, z1],
      [x2, y2, z1],
      [x2, y2, z2],
      [x1, y2, z2],
    ],
    bottom: [
      [x1, y1, z2],
      [x2, y1, z2],
      [x2, y1, z1],
      [x1, y1, z1],
    ],
  };
  return table[f];
}

/** Textur-Pixel (0 … 16) einer Ecke in Block-Koordinaten (0 … 1). */
function texPx(f: Face, p: V3): [number, number] {
  const [x, y, z] = p;
  const map: Record<Face, [number, number]> = {
    south: [x * 16, (1 - y) * 16],
    north: [(1 - x) * 16, (1 - y) * 16],
    east: [(1 - z) * 16, (1 - y) * 16],
    west: [z * 16, (1 - y) * 16],
    top: [x * 16, z * 16],
    bottom: [x * 16, (1 - z) * 16],
  };
  return map[f];
}

/** Tangenten-Achsen einer Seite (für Umgebungsverdeckung). */
const TANGENTS: Record<Face, readonly [V3, V3]> = {
  top: [
    [1, 0, 0],
    [0, 0, 1],
  ],
  bottom: [
    [1, 0, 0],
    [0, 0, 1],
  ],
  north: [
    [1, 0, 0],
    [0, 1, 0],
  ],
  south: [
    [1, 0, 0],
    [0, 1, 0],
  ],
  east: [
    [0, 0, 1],
    [0, 1, 0],
  ],
  west: [
    [0, 0, 1],
    [0, 1, 0],
  ],
};

function byte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, scale: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const s = (t: number): number => t * t * (3 - 2 * t);
  const a = hash3(ix, 7, iz);
  const b = hash3(ix + 1, 7, iz);
  const c = hash3(ix, 7, iz + 1);
  const d = hash3(ix + 1, 7, iz + 1);
  return a + (b - a) * s(tx) + (c - a) * s(tz) + (a - b - c + d) * s(tx) * s(tz);
}

export interface Npc {
  readonly skin: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly sit: boolean;
  readonly scale: number;
  /** Blocklicht am Kopf der Figur (0 … 1), damit sie nachts von Laternen beleuchtet wird. */
  readonly light: number;
}

/** Figuren aus den `summon`-Befehlen der Lobby (Mannequins, sitzende auf Block-Displays). */
function npcsOf(extra: readonly string[]): Omit<Npc, 'light'>[] {
  return extra
    .filter((cmd) => cmd.includes('mm_skin_'))
    .map((cmd) => {
      const [, , xs, ys, zs] = cmd.split(' ');
      const skinStart = cmd.indexOf('mm_skin_') + 'mm_skin_'.length;
      const skin = cmd.slice(skinStart, cmd.indexOf("'", skinStart));
      const rotAt = cmd.indexOf('Rotation:[');
      const yaw = rotAt < 0 ? 0 : Number.parseFloat(cmd.slice(rotAt + 'Rotation:['.length));
      const scaleAt = cmd.indexOf("minecraft:scale',base:");
      const scale = scaleAt < 0 ? 1 : Number.parseFloat(cmd.slice(scaleAt + "minecraft:scale',base:".length));
      const sit = cmd.startsWith('summon block_display');
      return { skin, x: Number(xs), y: Number(ys), z: Number(zs), yaw, sit, scale };
    });
}

export interface SceneManifest {
  readonly atlas: { readonly size: number };
  readonly groups: Record<
    Group,
    { readonly verts: number; readonly indices: number; readonly offsets: Record<string, number> }
  >;
  readonly npcs: readonly Npc[];
  readonly skins: readonly string[];
  readonly bounds: { readonly x1: number; readonly z1: number; readonly x2: number; readonly z2: number };
}

export function exportScene(outDir: string): SceneManifest {
  const started = Date.now();
  const { canvas, height } = buildLobby();
  console.log(`Lobby gebaut: ${canvas.size} Blöcke (${Date.now() - started} ms)`);

  // --- dichtes Gitter ---
  const palette: string[] = ['air'];
  const palIndex = new Map<string, number>([['air', 0]]);
  const grid = new Uint16Array(NX * NY * NZ);
  const at = (x: number, y: number, z: number): number => ((x - X0) * NZ + (z - Z0)) * NY + (y - Y0);
  const inside = (x: number, y: number, z: number): boolean =>
    x >= X0 && x < X0 + NX && z >= Z0 && z < Z0 + NZ && y >= Y0 && y < Y0 + NY;
  canvas
    .find(() => true)
    .forEach(([x, y, z, block]) => {
      if (!inside(x, y, z)) return;
      let id = palIndex.get(block);
      if (id === undefined) {
        id = palette.length;
        palette.push(block);
        palIndex.set(block, id);
      }
      grid[at(x, y, z)] = id;
    });
  // Unter der Geländeoberfläche, wo der Baukasten nichts gesetzt hat, ist Fels (nur die Haut wird gebaut).
  const ground = new Int16Array(NX * NZ);
  for (let x = X0; x < X0 + NX; x++)
    for (let z = Z0; z < Z0 + NZ; z++) ground[(x - X0) * NZ + (z - Z0)] = height(x, z);
  const ROCK = palette.length;
  palette.push('stone');
  const DIRT = palette.length;
  palette.push('dirt');
  const GRASS = palette.length;
  palette.push('grass_block');
  for (let x = X0; x < X0 + NX; x++)
    for (let z = Z0; z < Z0 + NZ; z++) {
      const h = Math.min(ground[(x - X0) * NZ + (z - Z0)]!, Y0 + NY);
      for (let y = Y0; y < h; y++) if (grid[at(x, y, z)] === 0) grid[at(x, y, z)] = y >= h - 3 ? DIRT : ROCK;
      // flaches Land baut der Baukasten nicht (die Lobby-Welt ist dort schon Wiese)
      if (h < Y0 + NY && grid[at(x, h, z)] === 0) grid[at(x, h, z)] = GRASS;
    }
  const infos: BlockInfo[] = palette.map((b) => classify(b));
  const opaque = Uint8Array.from(infos.map((i) => (i.opaque ? 1 : 0)));
  /** Außerhalb des Gitters: unten Fels, sonst Luft. */
  const outside = (y: number): BlockInfo | undefined => (y < Y0 ? infos[ROCK] : undefined);
  const kindAt = (x: number, y: number, z: number): BlockInfo | undefined =>
    inside(x, y, z) ? infos[grid[at(x, y, z)]!] : outside(y);
  const occ = (x: number, y: number, z: number): number =>
    inside(x, y, z) ? opaque[grid[at(x, y, z)]!]! : y < Y0 ? 1 : 0;

  // --- Blocklicht (wie in Minecraft: 15 an der Quelle, 1 weniger pro Schritt) ---
  const light = new Uint8Array(NX * NY * NZ);
  const queue: number[] = [];
  for (let x = X0; x < X0 + NX; x++)
    for (let z = Z0; z < Z0 + NZ; z++)
      for (let y = Y0; y < Y0 + NY; y++) {
        const i = at(x, y, z);
        const l = infos[grid[i]!]!.light;
        if (l > 0) {
          light[i] = l;
          queue.push(x, y, z);
        }
      }
  for (let q = 0; q < queue.length; q += 3) {
    const x = queue[q]!;
    const y = queue[q + 1]!;
    const z = queue[q + 2]!;
    const l = light[at(x, y, z)]!;
    if (l <= 1) continue;
    for (const f of FACES) {
      const [dx, dy, dz] = FACE_DIR[f];
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inside(nx, ny, nz)) continue;
      const ni = at(nx, ny, nz);
      if (opaque[grid[ni]!]) continue;
      if (light[ni]! >= l - 1) continue;
      light[ni] = l - 1;
      queue.push(nx, ny, nz);
    }
  }
  const lightAt = (x: number, y: number, z: number): number => (inside(x, y, z) ? light[at(x, y, z)]! : 0);

  // --- Atlas ---
  const tiles = new Map<string, number>();
  const tileOf = (key: string): number => {
    let t = tiles.get(key);
    if (t === undefined) {
      t = tiles.size;
      tiles.set(key, t);
    }
    return t;
  };

  const meshes: Record<Group, Mesh> = {
    opaque: new Mesh(),
    cutout: new Mesh(),
    glass: new Mesh(),
    water: new Mesh(),
  };

  const quad = (group: Group, corners: readonly Corner[], normal: V3, flip: boolean): void => {
    const m = meshes[group];
    const base = m.verts;
    corners.forEach((c) => {
      m.pos.push3(c.p[0], c.p[1], c.p[2]);
      m.nrm.push3(normal[0] * 127, normal[1] * 127, normal[2] * 127);
      m.uv.push2(Math.round((c.u / ATLAS) * 65535), Math.round((c.v / ATLAS) * 65535));
      m.col.push3(byte(c.c[0]), byte(c.c[1]), byte(c.c[2]));
      m.glow.push3(byte(c.g[0]), byte(c.g[1]), byte(c.g[2]));
    });
    m.verts += 4;
    // Reihenfolge: oben links (0), oben rechts (1), unten rechts (2), unten links (3) → gegen den Uhrzeigersinn
    if (flip) {
      m.idx.push3(base + 3, base + 2, base + 1);
      m.idx.push3(base + 3, base + 1, base);
    } else {
      m.idx.push3(base, base + 3, base + 2);
      m.idx.push3(base, base + 2, base + 1);
    }
  };

  const tintOf = (info: BlockInfo, x: number, y: number, z: number): V3 => {
    const j = 0.96 + hash3(x, y, z) * 0.08;
    if (info.tint === 'grass') {
      const n = valueNoise(x, z, 38);
      const m2 = valueNoise(x + 500, z - 300, 13);
      return [j * (0.9 + n * 0.16), j * (0.97 + m2 * 0.06), j * (0.88 + (1 - n) * 0.1)];
    }
    if (info.tint === 'rock') {
      // ruhiger als einzelne Blöcke: kaum Zufall pro Block, dafür große warme/kühle Flächen und unten etwas Moos
      const k = 0.985 + hash3(x, y, z) * 0.03;
      const n = valueNoise(x, z, 44);
      const m = valueNoise(x - 900, z + 400, 17);
      const low = Math.max(0, Math.min(1, (120 - y) / 50));
      return [
        k * (0.97 + n * 0.08 - low * 0.05),
        k * (0.97 + n * 0.04 + low * 0.02 + m * 0.02),
        k * (0.98 - n * 0.05 - low * 0.06),
      ];
    }
    if (info.tint === 'leaves') {
      const n = valueNoise(x, z, 9);
      return [j * (0.88 + n * 0.18), j * (0.95 + n * 0.08), j * (0.9 + (1 - n) * 0.1)];
    }
    return [j, j, j];
  };

  /** Eine Quader-Seite mit Umgebungsverdeckung und Licht. */
  const emitFace = (
    group: Group,
    info: BlockInfo,
    bx: number,
    by: number,
    bz: number,
    part: { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number },
    f: Face,
    tex: string,
    boundary: boolean,
    glowSelf: number,
  ): void => {
    const [nx, ny, nz] = FACE_DIR[f];
    const fx = boundary ? bx + nx : bx;
    const fy = boundary ? by + ny : by;
    const fz = boundary ? bz + nz : bz;
    const [tu, tv] = TANGENTS[f];
    const local = faceCorners(f, part);
    const px = local.map((p) => texPx(f, p));
    const us = px.map((q) => q[0]);
    const vs = px.map((q) => q[1]);
    const remap = (vals: number[]): number[] => {
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      if (lo >= -0.001 && hi <= 16.001) return vals;
      return vals.map((v) => (hi === lo ? 0 : ((v - lo) / (hi - lo)) * 16));
    };
    const U = remap(us);
    const V = remap(vs);
    const t = tileOf(tex);
    const cx = (t % ATLAS_COLS) * CELL + PAD;
    const cy = Math.floor(t / ATLAS_COLS) * CELL + PAD;
    const tint = tintOf(info, bx, by, bz);
    const aos: number[] = [];
    const corners: Corner[] = local.map((p, i) => {
      const su = (p[0] - 0.5) * tu[0] + (p[1] - 0.5) * tu[1] + (p[2] - 0.5) * tu[2] > 0 ? 1 : -1;
      const sv = (p[0] - 0.5) * tv[0] + (p[1] - 0.5) * tv[1] + (p[2] - 0.5) * tv[2] > 0 ? 1 : -1;
      const ax = fx + tu[0] * su;
      const ay = fy + tu[1] * su;
      const az = fz + tu[2] * su;
      const bx2 = fx + tv[0] * sv;
      const by2 = fy + tv[1] * sv;
      const bz2 = fz + tv[2] * sv;
      const s1 = occ(ax, ay, az);
      const s2 = occ(bx2, by2, bz2);
      const c = occ(ax + tv[0] * sv, ay + tv[1] * sv, az + tv[2] * sv);
      const level = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
      aos.push(level);
      const ao = AO_LEVELS[level]!;
      // weiches Blocklicht: Mittel der offenen Nachbarzellen
      const cells: V3[] = [
        [fx, fy, fz],
        [ax, ay, az],
        [bx2, by2, bz2],
        [ax + tv[0] * sv, ay + tv[1] * sv, az + tv[2] * sv],
      ];
      const open = cells.filter(([x, y, z]) => !occ(x, y, z) || (x === bx && y === by && z === bz));
      const lsum = open.reduce((s, [x, y, z]) => s + lightAt(x, y, z), 0);
      const bl = open.length ? lsum / open.length / 15 : 0;
      return {
        p: [bx + p[0], by + p[1], bz + p[2]],
        u: cx + U[i]!,
        v: cy + V[i]!,
        c: [tint[0] * ao, tint[1] * ao, tint[2] * ao],
        g: [bl, glowSelf, info.window ? 1 : 0],
      };
    });
    const flip = aos[0]! + aos[2]! < aos[1]! + aos[3]!;
    quad(group, corners, [nx, ny, nz], flip);
  };

  const emitCross = (
    info: BlockInfo,
    x: number,
    y: number,
    z: number,
    cross: NonNullable<BlockInfo['cross']>,
  ): void => {
    const t = tileOf(cross.tex);
    const cx = (t % ATLAS_COLS) * CELL + PAD;
    const cy = Math.floor(t / ATLAS_COLS) * CELL + PAD;
    const r = (0.5 * cross.scale) / Math.SQRT2;
    const crop = info.name.includes('wheat') || info.name.includes('carrot') || info.name === 'sugar_cane';
    const jitter = crop || cross.scale < 1 ? 0 : 0.18;
    const ox = 0.5 + (hash3(x, 1, z) - 0.5) * 2 * jitter;
    const oz = 0.5 + (hash3(x, 2, z) - 0.5) * 2 * jitter;
    const y1 = y + cross.y1 / 16;
    const h = (cross.y2 - cross.y1) / 16;
    const y2 = y1 + h * (info.name === 'short_grass' ? 0.55 + hash3(x, 3, z) * 0.4 : 1);
    const tint = tintOf(info, x, y, z);
    const upper = info.props.half === 'upper';
    const lo = upper ? 0.85 : 0.62;
    const hi = upper || info.props.half !== 'lower' ? 1 : 0.85;
    const bl = lightAt(x, y, z) / 15;
    const fire = cross.tex === 'fire' ? 1 : 0;
    const diag: [number, number, number, number][] = [
      [-r, -r, r, r],
      [-r, r, r, -r],
    ];
    diag.forEach(([ax, az, bx, bz]) => {
      const c = (f: number): V3 => [tint[0] * f, tint[1] * f, tint[2] * f];
      const corners: Corner[] = [
        { p: [x + ox + ax, y2, z + oz + az], u: cx, v: cy, c: c(hi), g: [bl, fire, 0] },
        { p: [x + ox + bx, y2, z + oz + bz], u: cx + 16, v: cy, c: c(hi), g: [bl, fire, 0] },
        { p: [x + ox + bx, y1, z + oz + bz], u: cx + 16, v: cy + 16, c: c(lo), g: [bl, fire, 0] },
        { p: [x + ox + ax, y1, z + oz + az], u: cx, v: cy + 16, c: c(lo), g: [bl, fire, 0] },
      ];
      quad('cutout', corners, [0, 1, 0], false);
    });
  };

  const linksOf = (
    x: number,
    y: number,
    z: number,
    info: BlockInfo,
  ): Record<'north' | 'south' | 'east' | 'west', boolean> => {
    const dirs = ['north', 'south', 'east', 'west'] as const;
    const hasState = dirs.some((d) => info.props[d] !== undefined);
    return Object.fromEntries(
      dirs.map((d) => {
        if (hasState)
          return [d, info.props[d] === 'true' || info.props[d] === 'low' || info.props[d] === 'tall'];
        const [dx, , dz] = FACE_DIR[d];
        const n = kindAt(x + dx, y, z + dz);
        return [d, !!n && (n.opaque || n.kind === info.kind)];
      }),
    ) as Record<'north' | 'south' | 'east' | 'west', boolean>;
  };

  const emitParts = (
    info: BlockInfo,
    x: number,
    y: number,
    z: number,
    parts: readonly Part[],
    group: Group,
  ): void => {
    parts.forEach((part) => {
      const b = {
        x1: part.x1 / 16,
        y1: part.y1 / 16,
        z1: part.z1 / 16,
        x2: part.x2 / 16,
        y2: part.y2 / 16,
        z2: part.z2 / 16,
      };
      FACES.forEach((f) => {
        const [dx, dy, dz] = FACE_DIR[f];
        const onEdge =
          (f === 'top' && part.y2 === 16) ||
          (f === 'bottom' && part.y1 === 0) ||
          (f === 'east' && part.x2 === 16) ||
          (f === 'west' && part.x1 === 0) ||
          (f === 'south' && part.z2 === 16) ||
          (f === 'north' && part.z1 === 0);
        if (onEdge) {
          const n = kindAt(x + dx, y + dy, z + dz);
          if (
            n &&
            (n.opaque ||
              (n.kind === info.kind &&
                (info.kind === 'pane' || info.kind === 'fence' || info.kind === 'wall')))
          )
            return;
        }
        const tex = part.tex[f] ?? part.tex.side ?? 'stone';
        emitFace(group, info, x, y, z, b, f, tex, onEdge, info.emit);
      });
    });
  };

  let faces = 0;
  const t0 = Date.now();
  for (let x = X0; x < X0 + NX; x++)
    for (let z = Z0; z < Z0 + NZ; z++)
      for (let y = Y0; y < Y0 + NY; y++) {
        const id = grid[at(x, y, z)]!;
        if (id === 0 || id === ROCK) continue;
        const info = infos[id]!;
        if (info.kind === 'air') continue;
        if (info.kind === 'cube' || info.kind === 'glass') {
          FACES.forEach((f) => {
            const [dx, dy, dz] = FACE_DIR[f];
            const n = kindAt(x + dx, y + dy, z + dz);
            if (n && n.opaque) return;
            if (info.kind === 'glass' && n && n.name === info.name) return;
            const group: Group = info.kind === 'glass' ? 'glass' : 'opaque';
            emitFace(
              group,
              info,
              x,
              y,
              z,
              { x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1 },
              f,
              info.tex[f],
              true,
              info.emit,
            );
            faces++;
          });
        } else if (info.kind === 'water') {
          const above = kindAt(x, y + 1, z);
          const topOpen = !above || above.kind !== 'water';
          const h = topOpen ? 14 / 16 : 1;
          FACES.forEach((f) => {
            const [dx, dy, dz] = FACE_DIR[f];
            const n = kindAt(x + dx, y + dy, z + dz);
            if (f === 'top' && !topOpen) return;
            if (f !== 'top' && (!n || n.opaque || n.kind === 'water')) return;
            emitFace(
              'water',
              info,
              x,
              y,
              z,
              { x1: 0, y1: 0, z1: 0, x2: 1, y2: h, z2: 1 },
              f,
              'water',
              f !== 'top',
              0,
            );
            faces++;
          });
        } else if (info.kind === 'cross' && info.cross) {
          emitCross(info, x, y, z, info.cross);
          faces += 2;
        } else if (info.kind === 'parts') {
          emitParts(info, x, y, z, info.parts, info.group);
          if (info.cross) emitCross(info, x, y, z, info.cross);
          faces += info.parts.length * 6;
        } else if (info.kind === 'fence' || info.kind === 'wall' || info.kind === 'pane') {
          const links = linksOf(x, y, z, info);
          const tex = info.tex.top;
          const parts =
            info.kind === 'fence'
              ? fenceParts(tex, links)
              : info.kind === 'wall'
                ? wallParts(tex, links)
                : paneParts(tex, links);
          emitParts(info, x, y, z, parts, info.group);
          faces += parts.length * 6;
        }
      }
  console.log(`Flächen: ~${faces} (${Date.now() - t0} ms), Kacheln: ${tiles.size}`);

  // --- Atlas malen ---
  const atlas = new Picture(ATLAS, ATLAS);
  [...tiles].forEach(([key, t]) => {
    const px = paint(key);
    const ox = (t % ATLAS_COLS) * CELL;
    const oy = Math.floor(t / ATLAS_COLS) * CELL;
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const sx = (((x - PAD) % TILE) + TILE) % TILE;
        const sy = (((y - PAD) % TILE) + TILE) % TILE;
        const i = (sy * TILE + sx) * 4;
        const rgb = (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!;
        atlas.set(ox + x, oy + y, rgb, px[i + 3]!);
      }
  });
  if (tiles.size > ATLAS_COLS * ATLAS_COLS) throw new Error('Atlas zu klein');
  fs.mkdirSync(path.join(outDir, 'skins'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'atlas.png'), atlas.png());

  // --- Puffer schreiben ---
  const chunks: Buffer[] = [];
  let offset = 0;
  const groups = {} as SceneManifest['groups'] & Record<Group, unknown>;
  (Object.keys(meshes) as Group[]).forEach((g) => {
    const m = meshes[g];
    const offsets: Record<string, number> = {};
    const parts: [string, ArrayBufferView][] = [
      ['pos', m.pos.done()],
      ['nrm', m.nrm.done()],
      ['uv', m.uv.done()],
      ['col', m.col.done()],
      ['glow', m.glow.done()],
      ['idx', m.idx.done()],
    ];
    parts.forEach(([name, arr]) => {
      const pad = (4 - (offset % 4)) % 4;
      if (pad) {
        chunks.push(Buffer.alloc(pad));
        offset += pad;
      }
      offsets[name] = offset;
      const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
      chunks.push(buf);
      offset += buf.byteLength;
    });
    (groups as Record<Group, unknown>)[g] = { verts: m.verts, indices: m.idx.n, offsets };
  });
  fs.writeFileSync(path.join(outDir, 'scene.bin'), Buffer.concat(chunks));

  const skins = Object.keys(CAST).sort();
  skins.forEach((id) => fs.writeFileSync(path.join(outDir, 'skins', `${id}.png`), castSkinPng(id)));

  const manifest: SceneManifest = {
    atlas: { size: ATLAS },
    groups,
    npcs: npcsOf(canvas.extra).map((n) => ({
      ...n,
      light: lightAt(Math.floor(n.x), Math.floor(n.y + 1), Math.floor(n.z)) / 15,
    })),
    skins,
    bounds: { x1: X0, z1: Z0, x2: X0 + NX, z2: Z0 + NZ },
  };
  fs.writeFileSync(path.join(outDir, 'scene.json'), JSON.stringify(manifest));
  console.log(
    `Szene geschrieben: ${(offset / 1e6).toFixed(1)} MB, ${Object.entries(groups)
      .map(([g, v]) => `${g} ${v.verts / 4} Flächen`)
      .join(', ')}, ${manifest.npcs.length} Figuren (${Date.now() - started} ms)`,
  );
  return manifest;
}
