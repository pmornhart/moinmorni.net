/**
 * Canvas: eine Block-Karte im Speicher. Bauten schreiben Blöcke hinein, `commands()` macht daraus möglichst wenige
 * Minecraft-Befehle (`fill … strict`, also ohne Block-Updates: Wasser fließt nicht los, Blumen fallen nicht ab).
 */
import { range } from './range.js';

const SPAN = 65536;
const HALF = 32768;
const Y_SPAN = 1024;
const Y_OFFSET = 128;
/** Minecraft erlaubt höchstens so viele Blöcke pro `fill`. */
const FILL_LIMIT = 32768;
const HALVE = 2;
const NAMESPACE = 'minecraft:';
const STATE_START = '[';

/** Teile von Block-Namen, die erst nach den festen Blöcken kommen (brauchen Halt oder sind Flüssigkeiten). */
const FRAGILE_PARTS: readonly string[] = [
  'flower',
  'poppy',
  'dandelion',
  'tulip',
  'orchid',
  'allium',
  'bluet',
  'daisy',
  'cornflower',
  'lily',
  'rose',
  'peony',
  'lilac',
  'sunflower',
  'petals',
  'grass',
  'fern',
  'bush',
  'sapling',
  'torch',
  'lantern',
  'candle',
  'carpet',
  'rail',
  'button',
  'pressure_plate',
  'sign',
  'banner',
  'door',
  'ladder',
  'vine',
  'chain',
  'water',
  'lava',
  'snow',
  'pot',
  'lever',
  'bell',
  'head',
  'skull',
  'pickle',
  'mushroom',
  'sugar_cane',
  'bamboo',
  'berry',
  'azalea',
  'dripleaf',
  'roots',
  'lichen',
  'campfire',
  'cake',
  'leaf_litter',
  'wildflowers',
  'firefly',
  'wheat',
  'carrots',
  'beetroots',
  'reeds',
];
/** Feste Blöcke, deren Name trotzdem einen der Teile oben enthält. */
const SOLID_EXCEPTIONS: ReadonlySet<string> = new Set([
  'grass_block',
  'snow_block',
  'mushroom_stem',
  'red_mushroom_block',
  'brown_mushroom_block',
  'azalea_leaves',
  'flowering_azalea_leaves',
  'sea_lantern',
  'jack_o_lantern',
  'decorated_pot',
  'bamboo_block',
  'stripped_bamboo_block',
  'bamboo_planks',
  'bamboo_mosaic',
  'mud_bricks',
  'rooted_dirt',
  'chain_command_block',
]);

export function baseName(block: string): string {
  const plain = block.startsWith(NAMESPACE) ? block.slice(NAMESPACE.length) : block;
  return plain.split(STATE_START)[0] ?? plain;
}

export function isFragile(block: string): boolean {
  const name = baseName(block);
  return !SOLID_EXCEPTIONS.has(name) && FRAGILE_PARTS.some((part) => name.includes(part));
}

export interface Box {
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
  readonly x2: number;
  readonly y2: number;
  readonly z2: number;
}

type Point = readonly [number, number, number];
type Run = { x1: number; x2: number; y: number; z: number };
type Slab = { x1: number; x2: number; y: number; z1: number; z2: number };
type BlockBox = Box & { readonly block: string };

function key(x: number, y: number, z: number): number {
  return ((x + HALF) * SPAN + (z + HALF)) * Y_SPAN + (y + Y_OFFSET);
}

function unkey(k: number): Point {
  const y = (k % Y_SPAN) - Y_OFFSET;
  const rest = Math.floor(k / Y_SPAN);
  return [Math.floor(rest / SPAN) - HALF, y, (rest % SPAN) - HALF];
}

function volume(b: Box): number {
  return (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1) * (b.z2 - b.z1 + 1);
}

/** Schritt 1: Läufe entlang x (Punkte sind nach y, z, x sortiert). */
function toRuns(points: readonly Point[]): Run[] {
  return points.reduce<Run[]>((runs, [x, y, z]) => {
    const last = runs[runs.length - 1];
    if (last && last.y === y && last.z === z && last.x2 === x - 1) last.x2 = x;
    else runs.push({ x1: x, x2: x, y, z });
    return runs;
  }, []);
}

/** Schritt 2: gleiche Läufe in benachbarten z zu Flächen zusammenlegen. */
function toSlabs(runs: readonly Run[]): Slab[] {
  const open = new Map<string, Slab>();
  return runs.reduce<Slab[]>((slabs, r) => {
    const id = `${r.y}:${r.x1}:${r.x2}`;
    const s = open.get(id);
    if (s && s.z2 === r.z - 1) s.z2 = r.z;
    else {
      const fresh = { x1: r.x1, x2: r.x2, y: r.y, z1: r.z, z2: r.z };
      open.set(id, fresh);
      slabs.push(fresh);
    }
    return slabs;
  }, []);
}

/** Schritt 3: gleiche Flächen übereinander zu Quadern zusammenlegen. */
function toBoxes(slabs: readonly Slab[], block: string): BlockBox[] {
  const sorted = [...slabs].sort(
    (a, b) => a.x1 - b.x1 || a.z1 - b.z1 || a.x2 - b.x2 || a.z2 - b.z2 || a.y - b.y,
  );
  const boxes: BlockBox[] = [];
  sorted.forEach((s) => {
    const cur = boxes[boxes.length - 1];
    const fits =
      cur &&
      cur.x1 === s.x1 &&
      cur.x2 === s.x2 &&
      cur.z1 === s.z1 &&
      cur.z2 === s.z2 &&
      cur.y2 === s.y - 1 &&
      volume({ ...cur, y2: s.y }) <= FILL_LIMIT;
    if (fits) boxes[boxes.length - 1] = { ...cur, y2: s.y };
    else boxes.push({ x1: s.x1, x2: s.x2, y1: s.y, y2: s.y, z1: s.z1, z2: s.z2, block });
  });
  return boxes;
}

/** Teilt zu große Quader, damit jeder `fill` unter Minecrafts Grenze bleibt. */
function splitBox(b: Box): Box[] {
  if (volume(b) <= FILL_LIMIT) return [b];
  const dx = b.x2 - b.x1;
  const dz = b.z2 - b.z1;
  const dy = b.y2 - b.y1;
  if (dx >= dz && dx >= dy) {
    const m = b.x1 + Math.floor(dx / HALVE);
    return [...splitBox({ ...b, x2: m }), ...splitBox({ ...b, x1: m + 1 })];
  }
  if (dz >= dy) {
    const m = b.z1 + Math.floor(dz / HALVE);
    return [...splitBox({ ...b, z2: m }), ...splitBox({ ...b, z1: m + 1 })];
  }
  const m = b.y1 + Math.floor(dy / HALVE);
  return [...splitBox({ ...b, y2: m }), ...splitBox({ ...b, y1: m + 1 })];
}

function command(b: Box, block: string): string {
  const single = b.x1 === b.x2 && b.y1 === b.y2 && b.z1 === b.z2;
  return single
    ? `setblock ${b.x1} ${b.y1} ${b.z1} ${block} strict`
    : `fill ${b.x1} ${b.y1} ${b.z1} ${b.x2} ${b.y2} ${b.z2} ${block} strict`;
}

export class Canvas {
  private readonly cells = new Map<number, number>();
  private readonly palette: string[] = [];
  private readonly paletteIndex = new Map<string, number>();
  /** Zusätzliche Befehle nach den Blöcken (z. B. `summon` für Texte und NPCs). */
  readonly extra: string[] = [];

  private id(block: string): number {
    const known = this.paletteIndex.get(block);
    if (known !== undefined) return known;
    this.palette.push(block);
    this.paletteIndex.set(block, this.palette.length - 1);
    return this.palette.length - 1;
  }

  set(x: number, y: number, z: number, block: string): void {
    this.cells.set(key(Math.round(x), Math.round(y), Math.round(z)), this.id(block));
  }

  /** Setzt nur, wenn dort noch nichts (oder Luft) steht. */
  soft(x: number, y: number, z: number, block: string): void {
    const cur = this.get(x, y, z);
    if (cur === undefined || cur === 'air') this.set(x, y, z, block);
  }

  get(x: number, y: number, z: number): string | undefined {
    const v = this.cells.get(key(Math.round(x), Math.round(y), Math.round(z)));
    return v === undefined ? undefined : this.palette[v];
  }

  /** Alle Stellen, deren Block passt (z. B. für Prüfungen der fertigen Lobby). */
  find(match: (block: string) => boolean): Array<readonly [number, number, number, string]> {
    return [...this.cells]
      .map(([k, v]) => [unkey(k), this.palette[v] ?? 'air'] as const)
      .filter(([, block]) => match(block))
      .map(([[x, y, z], block]) => [x, y, z, block] as const);
  }

  /** Steht dort ein fester Block (nicht Luft, nichts Empfindliches)? */
  isSolidAt(x: number, y: number, z: number): boolean {
    const b = this.get(x, y, z);
    return b !== undefined && b !== 'air' && !isFragile(b);
  }

  fill(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string): void {
    const xs = range(x1, x2);
    const ys = range(y1, y2);
    const zs = range(z1, z2);
    xs.forEach((x) => ys.forEach((y) => zs.forEach((z) => this.set(x, y, z, block))));
  }

  get size(): number {
    return this.cells.size;
  }

  /** Fasst gleiche Blöcke zu Quadern zusammen: erst Reihen entlang x, dann entlang z, dann übereinander. */
  boxes(): BlockBox[] {
    const byBlock = [...this.cells].reduce((groups, [k, v]) => {
      const list = groups.get(v);
      if (list) list.push(k);
      else groups.set(v, [k]);
      return groups;
    }, new Map<number, number[]>());
    return [...byBlock].flatMap(([id, keys]) => {
      const points = keys.map(unkey).sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0]);
      return toBoxes(toSlabs(toRuns(points)), this.palette[id] as string);
    });
  }

  /** Befehle zum Bauen: feste Blöcke zuerst, dann Empfindliches (Blumen, Fackeln, Wasser …), dann `extra`. */
  commands(): string[] {
    const all = this.boxes().flatMap((b) => splitBox(b).map((part) => ({ cmd: command(part, b.block), b })));
    const solid = all.filter((c) => !isFragile(c.b.block)).map((c) => c.cmd);
    const fragile = all.filter((c) => isFragile(c.b.block)).map((c) => c.cmd);
    return [...solid, ...fragile, ...this.extra];
  }
}
