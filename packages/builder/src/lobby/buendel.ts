/* eslint-disable ts-patterns/no-magic-numbers -- model maths: pixels, half sizes, angles as Minecraft needs them */
import crypto from 'node:crypto';

/**
 * Viele kleine Block-Anzeigen zu wenigen Modellen bündeln (Leistung, Philip 17.11.: „Es geht mir um die FPS“).
 *
 * Girlanden, Lichterketten, Schleifen und Christbaum-Zweige bestehen aus Tausenden kleinen Block-Anzeigen – jede ist
 * für den Client ein eigenes Wesen (eigener Zeichen-Aufruf, eigene Lage-Pakete). Hier werden alle kleinen Teile
 * (höchstens 0,5 Blöcke) mit gleichen Tags und gleichem Licht, die im selben Block liegen, zu **einer** Item-Anzeige mit
 * einem eigenen Modell im Netzwerk-Paket (`custom_model_data` = `moinmorni:deko/<prüfsumme>`). Das Modell besteht aus
 * genau diesen Würfeln mit Minecraft-Texturen (Verweise, keine Dateien von Mojang); Leuchtendes leuchtet über
 * `light_emission`. Drehungen: Minecraft-Modelle drehen ein Teil nur um eine Achse in 22,5°-Schritten – die stärkste
 * Drehachse wird genommen und gerundet (bei kleinen Zweigen kaum zu sehen).
 *
 * Ohne Paket (abgelehnt, alte Version) zeigt die Anzeige den Träger-Gegenstand als kleinen Würfel – ein schlichter
 * Rückfall (Tannengrün, Leuchtstein …), nicht mehr jedes Zweiglein. Bedrock sieht Item-Anzeigen ohnehin nicht.
 */

export const DEKO_KEY_PREFIX = 'moinmorni:deko/';
/** Größe der Anzeige (Rückfall-Würfel 1 Block, ein Bündel je 2 × 2 × 2 Blöcke); das Modell rechnet sie heraus. */
const SCALE = 1;
/** Kantenlänge eines Bündels in Blöcken. */
const CELL = 2;
const PX = 16 / SCALE;
const MAX_PART = 1;
const MIN_GROUP = 2;
/** Laubfarbe der Fichte, wie Minecraft sie für den Gegenstand nimmt. */
const SPRUCE_TINT = -10380959;
const TINTED: ReadonlySet<string> = new Set([
  'spruce_leaves',
  'oak_leaves',
  'birch_leaves',
  'dark_oak_leaves',
  'jungle_leaves',
  'acacia_leaves',
  'mangrove_leaves',
]);
/** Block → Textur (nur Blöcke mit einer Textur für alle Seiten oder passender Seitenansicht). */
const TEXTURE_SPECIAL: Readonly<Record<string, string>> = {
  ochre_froglight: 'ochre_froglight_side',
  pearlescent_froglight: 'pearlescent_froglight_side',
  verdant_froglight: 'verdant_froglight_side',
  stripped_spruce_wood: 'stripped_spruce_log',
  stripped_birch_wood: 'stripped_birch_log',
  stripped_dark_oak_log: 'stripped_dark_oak_log',
  spruce_log: 'spruce_log',
  snow_block: 'snow',
};
/**
 * Blöcke mit einer Textur für alle Seiten. Passt: "red_wool", "glowstone"; nicht: "oak_stairs".
 * https://regex101.com/?flavor=javascript&regex=%5E(%3F%3A%5Ba-z_%5D%2B_(%3F%3Awool)%7Cglowstone)%24&testString=red_wool
 */
const PLAIN =
  /^(?:[a-z_]+_(?:wool|concrete|terracotta|leaves|planks)|glowstone|shroomlight|gold_block|iron_block|coal_block|ice|terracotta)$/;
export function textureOf(block: string): string | null {
  const t = TEXTURE_SPECIAL[block] ?? (PLAIN.test(block) ? block : null);
  return t ? `minecraft:block/${t}` : null;
}
/** Träger mit ihrem gewohnten Aussehen (Rückfall ohne Paket). */
const CARRIERS: ReadonlySet<string> = new Set([
  'spruce_leaves',
  'cherry_leaves',
  'flowering_azalea_leaves',
  'azalea_leaves',
  'glowstone',
  'red_wool',
  'white_wool',
  'gold_block',
  'ice',
]);

/**
 * Block-Anzeige, wie `blockDisplay` (deko.ts) sie schreibt:
 * "summon block_display 1.5 70 2 {"Bukkit.invisible":1b,Tags:['a'],block_state:{Name:'minecraft:glowstone',id:'minecraft:glowstone'},transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[-0.1f,-0.1f,-0.1f],scale:[0.2f,0.2f,0.2f]},brightness:{sky:15,block:15}}"
 * https://regex101.com/?flavor=javascript&regex=%5Esummon%20block_display%20(%5CS%2B)%20(%5CS%2B)%20(%5CS%2B)%20%5C%7B(%3F%3A%22Bukkit%5C.invisible%22%3A1b%2C)%3F(Tags%3A%5C%5B%5B%5E%5C%5D%5D*%5C%5D)%2Cblock_state%3A%5C%7BName%3A'minecraft%3A(%5Ba-z_%5D%2B)'
 */
/** Block-Anzeige von `blockDisplay`. Passt: "summon block_display 1 2 3 {…}" (siehe oben); nicht: "summon item_display 1 2 3 {}". */
const PART =
  /^summon block_display (\S+) (\S+) (\S+) \{(?:"Bukkit\.invisible":1b,)?(Tags:\[[^\]]*\]),block_state:\{Name:'minecraft:([a-z_]+)'(?:[^{}]|\{[^{}]*\})*\},transformation:\{left_rotation:\[([^\]]+)\],right_rotation:\[0f,0f,0f,1f\],translation:\[([^\]]+)\],scale:\[([^\]]+)\]\}(,brightness:\{sky:\d+,block:\d+\})?(?:,view_range:[\d.]+f)?\}$/;

const nums = (s: string): number[] => s.split(',').map((n) => Number(n.replace('f', '')));

type V = [number, number, number];
function rot(q: readonly number[], v: V): V {
  const [x, y, z, w] = q as [number, number, number, number];
  const [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

/**
 * Lässt sich die Drehung im Modell genau nachbauen? Ein Modell-Teil dreht nur um eine Achse in 22,5°-Schritten (mit
 * Vierteldrehungen über getauschte Maße). Alles andere bleibt eine eigene Anzeige – sonst sähe die Deko anders aus.
 */
const EPS = 1e-3;
export function exact(q: readonly number[]): boolean {
  const comp = [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0].map(Math.abs);
  const big = comp.filter((c) => c > EPS);
  if (big.length === 0) return true;
  if (big.length > 1) return false;
  const i = comp.indexOf(Math.max(...comp));
  const deg = (2 * Math.atan2([q[0], q[1], q[2]][i] ?? 0, q[3] ?? 1) * 180) / Math.PI;
  const steps = deg / 22.5;
  return Math.abs(steps - Math.round(steps)) < EPS * 10;
}

/** Liegt ein Teil ganz im Bereich, den Minecraft-Modelle erlauben (−16…32 Pixel)? Sonst nicht bündeln. */
const fits = (e: Record<string, unknown>): boolean =>
  [...(e['from'] as number[]), ...(e['to'] as number[])].every((v) => v > -16 + EPS && v < 32 - EPS);

interface Part {
  readonly center: V;
  readonly block: string;
  readonly scale: V;
  readonly q: number[];
  readonly glow: boolean;
}

/** Ein Teil als Modell-Element (Pixel relativ zur Mitte der Anzeige). */
function element(p: Part, mid: V, ti: number, tinted: boolean): Record<string, unknown> {
  const axes = ['x', 'y', 'z'] as const;
  const comp = [p.q[0] ?? 0, p.q[1] ?? 0, p.q[2] ?? 0];
  const a = comp.map(Math.abs);
  const i = a.indexOf(Math.max(...a));
  const raw = (2 * Math.atan2(comp[i] ?? 0, p.q[3] ?? 1) * 180) / Math.PI;
  const turns = Math.round(raw / 90);
  const swapped = Math.abs(turns) % 2 === 1;
  const [o1, o2] = [0, 1, 2].filter((k) => k !== i) as [number, number];
  const s: V = swapped
    ? (p.scale.map((v, k) => (k === o1 ? p.scale[o2] : k === o2 ? p.scale[o1] : v)) as V)
    : [...p.scale];
  const angle = Math.round((raw - turns * 90) / 22.5) * 22.5;
  const c = p.center.map((v, k) => 8 + (v - (mid[k] ?? 0)) * PX) as V;
  const clamp = (n: number): number => Math.min(32, Math.max(-16, Number(n.toFixed(3))));
  const from = c.map((v, k) => clamp(v - ((s[k] ?? 0) * PX) / 2));
  const to = c.map((v, k) => clamp(v + ((s[k] ?? 0) * PX) / 2));
  // Feste UV über die ganze Textur: Teile reichen über den Block hinaus (−16…32), die Vorgabe-UV aus der Lage läge
  // dann außerhalb des 16×16-Bilds – Minecraft 26.x verwirft das ganze Modell („Unable to bake item model“).
  const face = { texture: `#t${ti}`, uv: [0, 0, 16, 16], ...(tinted ? { tintindex: 0 } : {}) };
  return {
    from,
    to,
    ...(angle !== 0 && a[i]! > 1e-4 ? { rotation: { angle, axis: axes[i], origin: c.map(clamp) } } : {}),
    ...(p.glow ? { light_emission: 15 } : {}),
    faces: { north: face, south: face, east: face, west: face, up: face, down: face },
  };
}
export interface DekoModels {
  /** Name (Prüfsumme) → Modell-JSON. */
  readonly models: Map<string, Record<string, unknown>>;
  /** Träger-Gegenstand → Namen der Modelle (und ob gefärbtes Laub drin ist). */
  readonly carriers: Map<string, Map<string, boolean>>;
}
export const newDekoModels = (): DekoModels => ({ models: new Map(), carriers: new Map() });

/** Alle kleinen Block-Anzeigen eines Befehls-Texts bündeln; andere Zeilen bleiben, wie sie sind. */
export function bundleDeko(text: string, into: DekoModels): string {
  const lines = text.split('\n');
  const groups = new Map<
    string,
    { first: number; idx: number[]; parts: Part[]; tags: string; light: string }
  >();
  lines.forEach((line, n) => {
    const m = PART.exec(line);
    if (!m) return;
    const [, x, y, z, tags, block, q, t, sc, bright] = m;
    const scale = nums(sc ?? '') as V;
    if (Math.max(...scale.map(Math.abs)) > MAX_PART || !textureOf(block ?? '')) return;
    const quat = nums(q ?? '');
    if (!exact(quat)) return;
    const half = rot(quat, [scale[0] / 2, scale[1] / 2, scale[2] / 2]);
    const tr = nums(t ?? '');
    const center: V = [0, 1, 2].map((k) => Number([x, y, z][k]) + (tr[k] ?? 0) + (half[k] ?? 0)) as V;
    const glow = (bright ?? '').includes('block:15}');
    const light = glow ? '' : (bright ?? '');
    const cell = center.map((v) => Math.floor(v / CELL)).join(',');
    const key = `${tags}|${light}|${cell}`;
    const g = groups.get(key) ?? { first: n, idx: [], parts: [], tags: tags ?? '', light };
    g.idx.push(n);
    g.parts.push({ center, block: block ?? '', scale, q: quat, glow });
    groups.set(key, g);
  });
  const out: (string | null)[] = [...lines];
  groups.forEach((g) => {
    const mid = g.parts[0]!.center.map((v) => (Math.floor(v / CELL) + 0.5) * CELL) as V;
    // Was über den Rand des Modells ragt, bleibt eine eigene Anzeige.
    const keep = g.parts.map((p) => fits(element(p, mid, 0, false)));
    g.idx = g.idx.filter((_, k) => keep[k]);
    g.parts = g.parts.filter((_, k) => keep[k]);
    if (g.parts.length < MIN_GROUP) return;
    g.first = g.idx[0]!;
    const blocks = [...new Set(g.parts.map((p) => p.block))].sort();
    const tinted = g.parts.some((p) => TINTED.has(p.block));
    const textures: Record<string, string> = { particle: textureOf(blocks[0]!)! };
    blocks.forEach((b, i) => (textures[`t${i}`] = textureOf(b)!));
    const model = {
      textures,
      elements: g.parts.map((p) => element(p, mid, blocks.indexOf(p.block), TINTED.has(p.block))),
    };
    const name = crypto.createHash('sha1').update(JSON.stringify(model)).digest('hex').slice(0, 16);
    into.models.set(name, model);
    const count = new Map<string, number>();
    g.parts.forEach((p) => count.set(p.block, (count.get(p.block) ?? 0) + 1));
    const best = [...count]
      .filter(([b]) => CARRIERS.has(b))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    const carrier = best ?? (g.parts.some((p) => p.glow) ? 'glowstone' : 'spruce_leaves');
    const list = into.carriers.get(carrier) ?? new Map<string, boolean>();
    list.set(name, tinted);
    into.carriers.set(carrier, list);
    const bright = g.parts.every((p) => p.glow) ? ',brightness:{sky:15,block:15}' : g.light;
    const [x, y, z] = mid.map((v) => Number(v.toFixed(4)));
    out[g.first] =
      `summon item_display ${x} ${y} ${z} {"Bukkit.invisible":1b,${g.tags},item:{id:'minecraft:${carrier}',count:1,components:{'minecraft:custom_model_data':{strings:['${DEKO_KEY_PREFIX}${name}']}}},` +
      `item_display:'none',transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[${SCALE}f,${SCALE}f,${SCALE}f]}${bright},view_range:0.6f}`;
    g.idx.slice(1).forEach((n) => (out[n] = null));
  });
  return out.filter((l): l is string => l !== null).join('\n');
}

/** Gewohntes Aussehen der Träger (Rückfall ohne Paket). */
function vanilla(item: string): Record<string, unknown> {
  return {
    type: 'minecraft:model',
    model: `minecraft:block/${item}`,
    ...(TINTED.has(item) ? { tints: [{ type: 'minecraft:constant', value: SPRUCE_TINT }] } : {}),
  };
}

/** Dateien fürs Netzwerk-Paket: Modelle und je Träger eine Auswahl nach `custom_model_data`. */
export function dekoPackEntries(
  ns: string,
  d: DekoModels = newDekoModels(),
): { name: string; data: Buffer }[] {
  const json = (v: unknown): Buffer => Buffer.from(`${JSON.stringify(v)}\n`);
  const items = [...d.carriers.keys()].sort().map((item) => ({
    name: `assets/minecraft/items/${item}.json`,
    data: json({
      model: {
        type: 'minecraft:select',
        property: 'minecraft:custom_model_data',
        index: 0,
        cases: [...(d.carriers.get(item) ?? new Map<string, boolean>())]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, tinted]) => ({
            when: `${DEKO_KEY_PREFIX}${name}`,
            model: {
              type: 'minecraft:model',
              model: `${ns}:item/deko/${name}`,
              ...(tinted ? { tints: [{ type: 'minecraft:constant', value: SPRUCE_TINT }] } : {}),
            },
          })),
        fallback: vanilla(item),
      },
    }),
  }));
  const models = [...d.models.keys()].sort().map((name) => ({
    name: `assets/${ns}/models/item/deko/${name}.json`,
    data: json(d.models.get(name)),
  }));
  return [...items, ...models];
}
