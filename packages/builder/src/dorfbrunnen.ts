/* eslint-disable ts-patterns/no-magic-numbers -- Modell-Maße in 1/16 Block (Minecraft-Modellkoordinaten) und der Bauplan */
/**
 * Dorfbrunnen (Handwerkergasse, Oberdorf) als eigenes 3D-Modell im Möbel-Paket – kleiner und ländlicher als der
 * Prunkbrunnen im Schlosshof (`brunnen.ts`), aber genauso fein gearbeitet: achteckiger Trog aus Tuffstein mit Sockel,
 * glatter Abdeckung und Zierfeldern, in der Mitte die Brunnensäule mit Kupferband, Kapitell und goldenem Zapfen (wie
 * die Zirbelnuss auf alten Brunnen in Bayern), vier Wasserspeier aus Kupfer, deren Strahlen ins Becken fallen. Auf dem
 * Rand Geranien in Töpfen, an den Ecken Blumenbeete im Pflaster.
 *
 * Ohne Paket (oder auf Bedrock) bleibt ein schlichter Brunnen aus Blöcken: niedrige Tuffziegel-Mauer als Becken, Säule
 * aus Mauer-Pfosten mit Endstab als Fontäne, dieselben Blumen. Mauer und Endstab gibt es in der Lobby nur an den
 * Brunnen – das Paket blendet sie aus (wie beim Prunkbrunnen); beide haben keine volle Seitenfläche, daneben entstehen
 * keine Löcher. Das Wasser ist echtes Wasser, rundum von der Mauer gehalten.
 *
 * Maße in 1/16 Block („px“), y = 0 ist die Höhe, auf der man neben dem Brunnen steht.
 */
import type { Canvas } from './canvas.js';
import {
  BLOCK,
  BRUNNEN_ERSATZ,
  brunnenModelJson,
  centred,
  ITEM_DISPLAY_TURN,
  itemOf,
  MITTE,
  r4,
  round,
  segment,
  SPRITZER,
  type Box,
  type Part,
  type Ring,
  type Vec,
} from './brunnen.js';
import { lobbyTags } from './lobby-tags.js';
import { pairs, range } from './range.js';
import { STEP, type Facing } from './shapes.js';

/** Achteckiger Trog: so viele Seiten, Mitte der Stücke (px vom Brunnenmittelpunkt). */
const SIDES = 8;
const TROG_RC = 31;
/** Trog im Querschnitt: Sockel, Wand (innen ein Hauch über dem Wasser), Abdeckung mit Überstand (px). */
const TROG: readonly Ring[] = [
  { r1: 36, r2: 40, y1: 0, y2: 2.5, tex: 'tuffziegel' },
  { r1: 23.5, r2: 37, y1: 0, y2: 13, tex: 'tuff' },
  { r1: 22.5, r2: 39, y1: 13, y2: 16, tex: 'glatt' },
];
/** Zierfeld auf jeder Außenseite (etwas schmaler als die Seite). */
const FELD = { r1: 36.9, r2: 37.6, y1: 4, y2: 10.5, inset: 3.5 } as const;
/**
 * Wasserspeier: Höhe des Rohrs, Rohrende, wo der Strahl aufs Wasser trifft (px). Jeder Speier ist ein eigenes
 * Anzeige-Objekt, `rc` vom Mittelpunkt entfernt – an einer Stelle stünde nach einem wiederholten Bau nur eines.
 */
const SPEIER = { y: 24, from: 5.6, tip: 13.2, lands: 20.2, water: 14, rc: 12 } as const;
const JET_STEPS = 6;
/** Wie die Teile im Spiel leuchten: Himmel wie draußen, dazu etwas Licht der Laternen in der Gasse. */
const LIGHT = '{sky:15,block:10}';

/** Ein Trog-Stück (Sockel, Wand, Abdeckung, Zierfeld) um `TROG_RC`, `lift` gegen Flimmern der Überlappungen. */
function trogStueck(lift: number): Box[] {
  const half = TROG[1] ? TROG[1].r2 * Math.tan(Math.PI / SIDES) - FELD.inset : 0;
  return [
    ...segment(TROG, SIDES, TROG_RC, lift),
    {
      from: [FELD.r1 - TROG_RC, FELD.y1, -half],
      to: [FELD.r2 - TROG_RC, FELD.y2, half],
      tex: 'tuffzier',
    },
  ];
}

/** Säule unten: Fuß im Wasser, Wulst, Schaft mit Kupferband (dort sitzen die Speier). */
function saeuleUnten(): Box[] {
  return [
    ...round(7.5, 0, 15, 'tuffziegel'),
    ...round(8.5, 15, 17, 'glatt'),
    ...round(5, 17, 34, 'tuff'),
    ...round(5.6, SPEIER.y - 2, SPEIER.y + 2, 'kupfer'),
  ];
}

/** Säule oben: Schaft, Kapitell, Deckplatte, goldener Zapfen. */
function saeuleOben(): Box[] {
  const zapfen: ReadonlyArray<readonly [number, number, number]> = [
    [3, 49, 50.5],
    [4.2, 50.5, 53.5],
    [4.6, 53.5, 56],
    [3.8, 56, 58.5],
    [2.6, 58.5, 60.5],
    [1.4, 60.5, 62],
    [0.6, 62, 63.5],
  ];
  return [
    ...round(5, 34, 42, 'tuff'),
    ...round(6.5, 42, 45, 'tuffzier'),
    ...round(8, 45, 47, 'glatt'),
    ...round(4.5, 47, 49, 'tuffziegel'),
    ...zapfen.flatMap(([r, y1, y2]) => round(r, y1, y2, 'gold')),
  ];
}

/**
 * Wasserstrahl als Bogen nach außen (+x): Punkte → Stücke mit erlaubten Neigungen (−45 … 45°). Minecraft neigt bei
 * negativem Winkel um z das äußere Ende nach unten – genau so fällt der Strahl.
 */
function strahl(points: ReadonlyArray<readonly [number, number]>, thickness: number): Box[] {
  return points.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = points[i] ?? [x2, y2];
    const length = Math.hypot(x2 - x1, y2 - y1);
    const slope = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const angle = Math.max(-45, Math.min(45, Math.round(slope / 22.5) * 22.5));
    const [cx, cy, t] = [(x1 + x2) / 2, (y1 + y2) / 2, thickness / 2];
    return {
      from: [cx - length / 2, cy - t, -t] as Vec,
      to: [cx + length / 2, cy + t, t] as Vec,
      tex: 'flut' as const,
      rot: { axis: 'z' as const, angle, origin: [cx, cy, 0] as Vec },
    };
  });
}

/** Wasserspeier (zeigt nach +x): Rosette an der Säule, Rohr mit gebogenem Ende, Strahl bis aufs Wasser. */
function speier(): Box[] {
  const drop = SPEIER.y - 1.6;
  const points = range(0, JET_STEPS).map((i): [number, number] => {
    const t = i / JET_STEPS;
    return [
      SPEIER.tip + (SPEIER.lands - SPEIER.tip) * t,
      drop + 1.2 * t - (drop + 1.2 - SPEIER.water) * t * t,
    ];
  });
  const boxes: Box[] = [
    { from: [4.6, SPEIER.y - 2.5, -2.5], to: [SPEIER.from, SPEIER.y + 2.5, 2.5], tex: 'kupfer' },
    { from: [SPEIER.from, SPEIER.y - 0.7, -0.7], to: [SPEIER.tip, SPEIER.y + 0.7, 0.7], tex: 'kupfer' },
    { from: [SPEIER.tip - 1.4, SPEIER.y - 2, -0.8], to: [SPEIER.tip, SPEIER.y - 0.7, 0.8], tex: 'kupfer' },
    ...strahl(points, 1.2),
  ];
  // relativ zur Stelle des Anzeige-Objekts (rc nach außen)
  const shift = (v: Vec): Vec => [v[0] - SPEIER.rc, v[1], v[2]];
  return boxes.map((b) => ({
    ...b,
    from: shift(b.from),
    to: shift(b.to),
    ...(b.rot ? { rot: { ...b.rot, origin: shift(b.rot.origin) } } : {}),
  }));
}

/** Alle Teile des Dorfbrunnens (Name → Modell mit Höhe). */
function parts(): Readonly<Record<string, Part>> {
  return {
    dorf_trog_a: centred(trogStueck(0)),
    dorf_trog_b: centred(trogStueck(0.06)),
    dorf_saeule_unten: centred(saeuleUnten()),
    dorf_saeule_oben: centred(saeuleOben()),
    dorf_speier: centred(speier()),
  };
}

/** Modelle für das Paket (Name → Modell-JSON, unter `models/item/brunnen/`). */
export function dorfbrunnenModels(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(parts()).map(([name, part]) => [name, brunnenModelJson(part.boxes)]),
  );
}

/** Für Tests: alle Kästen aller Modelle. */
export function dorfbrunnenBoxes(): Readonly<Record<string, readonly Box[]>> {
  return Object.fromEntries(Object.entries(parts()).map(([name, part]) => [name, part.boxes]));
}

/** Anzeige-Objekt eines Teils: Mitte in der Welt, Drehung um y (Grad). */
export interface DorfbrunnenTeil {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** Wo die Teile stehen. (cx, cz) = Mitte des Brunnens, y0 = Höhe, auf der man daneben steht. */
export function dorfbrunnenTeile(cx: number, y0: number, cz: number): DorfbrunnenTeil[] {
  const all = parts();
  const at = (name: string, radial: number, deg: number): DorfbrunnenTeil => {
    const a = (deg * Math.PI) / 180;
    return {
      name,
      x: r4(cx + (Math.cos(a) * radial) / BLOCK),
      y: r4(y0 + (all[name]?.centre ?? 0) / BLOCK),
      z: r4(cz + (Math.sin(a) * radial) / BLOCK),
      yaw: r4((deg + ITEM_DISPLAY_TURN) % 360),
    };
  };
  return [
    ...range(0, SIDES - 1).map((i) => at(`dorf_trog_${i % 2 ? 'b' : 'a'}`, TROG_RC, (i * 360) / SIDES)),
    at('dorf_saeule_unten', 0, 0),
    at('dorf_saeule_oben', 0, 0),
    ...[0, 90, 180, 270].map((deg) => at('dorf_speier', SPEIER.rc, deg)),
  ];
}

const HORIZONTAL: readonly Facing[] = ['north', 'east', 'south', 'west'];
/** Geranien auf dem Rand (je Achse eine), Blumen in den Eckbeeten. */
const RAND_BLUMEN = ['potted_red_tulip', 'potted_poppy', 'potted_red_tulip', 'potted_poppy'] as const;
const BEET_BLUMEN = ['red_tulip', 'cornflower', 'oxeye_daisy', 'poppy', 'allium', 'pink_tulip'] as const;

/**
 * Dorfbrunnen bauen: (x, z) = Block in der Mitte, y = Pflaster unter dem Brunnen. Becken 5 × 5 (Mauer ringsum, innen
 * Wasser), Säule in der Mitte, Töpfe auf den Mauer-Pfosten der Achsen, Blumenbeete an den vier Ecken.
 */
export function dorfbrunnen(c: Canvas, x: number, y: number, z: number): void {
  const isRing = (dx: number, dz: number): boolean => Math.max(Math.abs(dx), Math.abs(dz)) === 2;
  const spots = pairs(range(-2, 2), range(-2, 2));
  spots.forEach(([dx, dz]) => {
    c.set(x + dx, y, z + dz, 'polished_tuff');
    range(y + 2, y + 4).forEach((py) => c.set(x + dx, py, z + dz, 'air'));
  });
  // Rand: niedrige Mauer, ringsum verbunden; Pfosten an den Ecken und unter den Töpfen
  spots
    .filter(([dx, dz]) => isRing(dx, dz))
    .forEach(([dx, dz]) => {
      const arms = HORIZONTAL.map((d) => {
        const [sx, sz] = STEP[d];
        return `${d}=${isRing(dx + sx, dz + sz) && Math.abs(dx + sx) <= 2 && Math.abs(dz + sz) <= 2 ? 'low' : 'none'}`;
      });
      const post = Math.abs(dx) === Math.abs(dz) || dx === 0 || dz === 0;
      c.set(x + dx, y + 1, z + dz, `${BRUNNEN_ERSATZ.rand}[${arms.join(',')},up=${post}]`);
    });
  spots
    .filter(([dx, dz]) => !isRing(dx, dz) && (dx !== 0 || dz !== 0))
    .forEach(([dx, dz]) => c.set(x + dx, y + 1, z + dz, 'water'));
  // Säule mit Fontäne (Ersatz ohne Paket)
  range(y + 1, y + 3).forEach((py) => c.set(x, py, z, BRUNNEN_ERSATZ.rand));
  c.set(x, y + 4, z, BRUNNEN_ERSATZ.fontaene);
  // Geranien auf dem Rand, Blumenbeete an den Ecken
  [
    [2, 0],
    [0, 2],
    [-2, 0],
    [0, -2],
  ].forEach(([dx = 0, dz = 0], i) => c.set(x + dx, y + 2, z + dz, RAND_BLUMEN[i] ?? 'potted_poppy'));
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) =>
      [
        [3, 3],
        [3, 2],
        [2, 3],
      ].forEach(([a = 0, b = 0], i) => {
        c.set(x + sx * a, y, z + sz * b, 'grass_block');
        c.set(
          x + sx * a,
          y + 1,
          z + sz * b,
          BEET_BLUMEN[(i + sx + 2 * sz + 3) % BEET_BLUMEN.length] ?? 'poppy',
        );
      }),
    ),
  );
  // Spritzer dort, wo die Strahlen aufs Wasser treffen, Plätschern in der Mitte (Lobby-Plugin)
  [0, 90, 180, 270].forEach((deg) => {
    const a = (deg * Math.PI) / 180;
    const sx = r4(x + 0.5 + (Math.cos(a) * SPEIER.lands) / BLOCK);
    const sz = r4(z + 0.5 + (Math.sin(a) * SPEIER.lands) / BLOCK);
    c.extra.push(
      `summon marker ${sx} ${r4(y + 1 + (SPEIER.water + 0.3) / BLOCK)} ${sz} {Tags:[${lobbyTags([SPRITZER])}]}`,
    );
  });
  c.extra.push(`summon marker ${x + 0.5} ${y + 2} ${z + 0.5} {Tags:[${lobbyTags([MITTE])}]}`);
  const tags = lobbyTags(['mm_deco', 'mm_brunnen']);
  dorfbrunnenTeile(x + 0.5, y + 1, z + 0.5).forEach((t) =>
    c.extra.push(
      `summon item_display ${t.x} ${t.y} ${t.z} {Tags:[${tags}],item:${itemOf(t.name)},item_display:'none',Rotation:[${t.yaw}f,0f],brightness:${LIGHT},view_range:1.5f,transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[1f,1f,1f]}}`,
    ),
  );
}
