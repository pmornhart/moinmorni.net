/* eslint-disable ts-patterns/no-magic-numbers -- a decoration plan: positions, sizes and colours as the lobby needs them */
/**
 * Ostern – die Saison „Ostern“ der Lobby, ein Frühlingsfest im Dorf:
 *
 * - **Osterbrunnen um den Maibaum** (Herzstück): runder Brunnen aus hellem Kalkstein mit Wasser, darüber acht Bögen
 *   aus Tannengrün zur Osterkrone am Maibaum, an jedem Bogen bunte Ostereier, von der Krone hängen Bänder, auf dem
 *   Brunnenrand Blumentöpfe. Der Maibaum bleibt der Mast.
 * - **Eierbaum** auf der Wiese westlich vom Platz: ein blühender Kirschbaum voller Ostereier, ringsum Tulpen.
 * - **Osterhase** auf der Wiese neben der Ankunft: großer Hase aus Wolle mit Korb und bemaltem Riesen-Ei.
 * - **Frühling überall:** viele Obstbäume blühen (Kirsch- und Azaleenblüten, die Blüten fallen von selbst), auf den
 *   Wiesen wachsen Frühlingsblumen.
 * - **Ostermarkt** am Eingang (Ostereier, Osterlamm & Hefezopf), Eingangsbogen mit Blütengirlande und Eiern,
 *   Wimpel in Pastell über Straße, Gasse und von Stand zu Stand, Eier in den Vorgärten, Hasen im Gras.
 *
 * Alles eigene Gestaltung, nur Blöcke aus dem Spiel. Die Eier sind die runden Kugeln aus dem Lobby-Paket
 * (`schmuck.ts`), in die Höhe gezogen; ohne Paket kleine bunte Würfel.
 */
import { Canvas } from '../canvas.js';
import { GROUND, roundTree } from '../nature.js';
import { random } from '../noise.js';
import type { World } from '../pruefung.js';
import { disc, pairs, range } from '../range.js';
import { KUGELN, type KugelFarbe } from '../schmuck.js';
import { ellipsoid } from '../shapes.js';
import { aroundY, blockDisplay, itemDisplay, textSign, type ModelPart, type Vec } from './deko.js';
import { CHRISTBAUM } from './christbaum.js';
import { LAUNCHPADS } from './features.js';
import { anchorEnd, settle, stands } from './halt.js';
import { JUMP_AND_RUN } from './jumpandrun.js';
import { seasonPlanOf, type SeasonPlan } from './saison-plan.js';
import { BUDE_POSTS, budeGeruest, budeSign, pennants, ringCells, seasonTags, segment } from './saison-kit.js';
import { staendeThema } from './staende-thema.js';
import { budeSchmuecken, EINGANG, pointAt, staendeSchmuecken } from './weihnachtsmarkt.js';
import { OSTERN } from './girlanden.js';
import { bogenSchmuck } from './standschmuck.js';
import { geschmuecktesTor, type TorThema } from './weihnachtstor.js';
import { MARKET_ARCH_Z } from './schlossmarkt.js';
import { BASE, clearPlants, HALF, INNER, viewOf, type View } from './winter-base.js';

const S = 'easter' as const;
const tag = (kind: string): string => seasonTags(S, kind);
const PASTELL: readonly string[] = [
  'pink_wool',
  'yellow_wool',
  'light_blue_wool',
  'lime_wool',
  'magenta_wool',
];
const EIER: readonly KugelFarbe[] = ['rosa', 'gold', 'hellblau', 'gruen', 'lila', 'orange'];
const EI = { w: 0.22, h: 0.3 } as const;

/** Osterei (Mitte bei `at`), Farbe nach Nummer. */
function ei(kind: string, at: Vec, i: number, size = 1): string {
  const farbe = EIER[i % EIER.length] ?? 'rosa';
  return blockDisplay(tag(kind), at, KUGELN[farbe], { scale: [EI.w * size, EI.h * size, EI.w * size] });
}

// ---------- Osterbrunnen ----------

/** Brunnen um den Maibaum: Radius des Rands, Höhe der Osterkrone, Radius der Krone. */
export const OSTERBRUNNEN = { r: 4, top: GROUND + 5.3, crown: 1.1 } as const;
const RIB = 0.38;
const RIB_PARTS = 9;
const POTS: readonly string[] = [
  'potted_pink_tulip',
  'potted_white_tulip',
  'potted_allium',
  'potted_azure_bluet',
];

/** Punkt auf einem Bogen: Richtung (Winkel), Abstand von der Brunnenmitte, Höhe. */
function onBow(angle: number, r: number, y: number): Vec {
  return [CHRISTBAUM.x + HALF + Math.cos(angle) * r, y, CHRISTBAUM.z + HALF + Math.sin(angle) * r];
}

/** Bogen vom Brunnenrand zur Krone (als Kurve mit Stützpunkt), in `RIB_PARTS` Stücken. */
function bow(angle: number, toPole: boolean): Vec[] {
  const p0 = [OSTERBRUNNEN.r, BASE + 1 + RIB / 2] as const;
  const p1 = [3.0, OSTERBRUNNEN.top + 0.9] as const;
  const p2 = [toPole ? HALF : OSTERBRUNNEN.crown + 0.1, OSTERBRUNNEN.top] as const;
  return range(0, RIB_PARTS).map((k) => {
    const t = k / RIB_PARTS;
    const at = (i: 0 | 1): number => (1 - t) ** 2 * p0[i] + 2 * t * (1 - t) * p1[i] + t ** 2 * p2[i];
    return onBow(angle, at(0), at(1));
  });
}

function brunnen(w: Canvas, v: View): string[] {
  const { x: px, z: pz } = CHRISTBAUM;
  const [cx, cz] = [px + HALF, pz + HALF];
  disc(px, pz, OSTERBRUNNEN.r + 1).forEach(([x, z]) => clearPlants(w, v, x, z));
  const ring = ringCells(cx, cz, OSTERBRUNNEN.r);
  const isRing = new Set(ring.map(([x, z]) => `${x},${z}`));
  ring.forEach(([x, z]) => w.set(x, BASE, z, 'calcite'));
  disc(px, pz, OSTERBRUNNEN.r)
    .filter(([x, z]) => !isRing.has(`${x},${z}`) && !(x === px && z === pz))
    .forEach(([x, z]) => w.set(x, BASE, z, 'water'));
  // Blumentöpfe auf dem Rand zwischen den Bögen
  range(0, 7).forEach((k) => {
    const a = ((k + HALF) / 8) * Math.PI * 2;
    const spot = ring
      .map(
        ([x, z]) =>
          [x, z, Math.abs(Math.atan2(Math.sin(Math.atan2(z + HALF - cz, x + HALF - cx) - a), 1))] as const,
      )
      .sort((p, q) => p[2] - q[2])[0];
    if (spot) w.set(spot[0], BASE + 1, spot[1], POTS[k % POTS.length] ?? 'potted_pink_tulip');
  });
  // Acht Bögen: vier zum Maibaum, vier zur Krone
  const bows = range(0, 7).map((k) => bow((k / 8) * Math.PI * 2, k % 2 === 0));
  const ribs = bows.flatMap((pts) =>
    pts.slice(1).map((p, i) => segment(S, 'brunnen', pts[i] ?? p, p, RIB, 'spruce_leaves')),
  );
  // Eier an den Bögen: unter jedem Stück eins, daneben abwechselnd links und rechts eins
  const eggs = bows.flatMap((pts, b) =>
    pts.slice(2, -1).flatMap((p, i) => {
      const a = (b / 8) * Math.PI * 2 + Math.PI / 2;
      const side = i % 2 === 0 ? 0.26 : -0.26;
      return [
        ei('brunnen', [p[0], p[1] - RIB / 2 - EI.h / 2, p[2]], b + i),
        ei('brunnen', [p[0] + Math.cos(a) * side, p[1] - 0.12, p[2] + Math.sin(a) * side], b + i + 3),
      ];
    }),
  );
  // Osterkrone: Achteck aus Blüten am Maibaum, Eier obendrauf, Bänder hängen herunter
  const corners = range(0, 8).map((k) =>
    onBow(((k + HALF) / 8) * Math.PI * 2, OSTERBRUNNEN.crown, OSTERBRUNNEN.top),
  );
  const crown = corners
    .slice(1)
    .map((p, k) => segment(S, 'brunnen', corners[k] ?? p, p, 0.3, 'flowering_azalea_leaves'));
  const crownEggs = corners
    .slice(1)
    .map(([x, y, z], k) => ei('brunnen', [x, y + 0.15 + EI.h / 2, z], k, 1.2));
  const bands = corners.slice(1).map(([x, y, z], k) =>
    blockDisplay(tag('brunnen'), [x, y - 0.15 - 0.55, z], PASTELL[k % PASTELL.length] ?? 'pink_wool', {
      scale: [0.08, 1.1, 0.02],
      rotation: aroundY((-(k + HALF) / 8) * Math.PI * 2),
    }),
  );
  return [...ribs, ...eggs, ...crown, ...crownEggs, ...bands];
}

// ---------- Eierbaum ----------

/** Blühender Kirschbaum voller Eier auf der Wiese westlich vom Platz. */
export const EIERBAUM = { x: -40, z: -9, height: 12, radius: 4.5 } as const;
/** Anteil der Blätter mit Ei: am Eierbaum fast jedes, in den anderen blühenden Kirschbäumen ein paar (von unten sichtbar). */
const EGGS_OWN = 0.7;
const EGGS_OTHER = 0.12;

function eierbaum(w: Canvas, v: View): string[] {
  const { x, z, height, radius } = EIERBAUM;
  const rnd = random(4242);
  disc(x, z, 7).forEach(([px, pz]) => clearPlants(w, v, px, pz));
  roundTree(w, x, BASE, z, { height, radius, log: 'cherry_log', leaves: 'cherry_leaves', rnd });
  // Tulpen rundum
  const tulips = ['pink_tulip', 'white_tulip', 'red_tulip', 'orange_tulip'];
  ringCells(x + HALF, z + HALF, 6)
    .filter(([px, pz]) => v.before(px, GROUND, pz) === 'grass_block' && v.now(px, BASE, pz) === 'air')
    .forEach(([px, pz], i) => w.set(px, BASE, pz, tulips[i % tulips.length] ?? 'pink_tulip'));
  // Eier unter der Krone (unter einem Blatt, das unten frei ist). `find` sucht im ganzen Dorf – im Frühling blühen
  // dort Tausende Blätter als Kirschblüte. Vorher hing so unter fast jedem davon ein Ei (~3000, jedes ein eigenes Wesen:
  // Server-Takt, Netz und Bildrate litten). Jetzt: der Eierbaum voll, die anderen Kirschbäume nur ein paar Eier dort,
  // wo man sie von unten sieht (unter dem Blatt bis zum Boden nur Luft) – im Inneren der Kronen sah sie ohnehin keiner.
  const crown = radius + 2;
  const open = (px: number, py: number, pz: number): boolean =>
    range(BASE + 1, py - 1).every((y) => v.now(px, y, pz) === 'air');
  const eggs = w
    .find((b) => b.startsWith('cherry_leaves'))
    .filter(([px, py, pz]) => py > BASE + 3 && v.now(px, py - 1, pz) === 'air')
    .filter(([px, py, pz]) => {
      const own = Math.hypot(px - x, pz - z) <= crown;
      const chance = own ? EGGS_OWN : EGGS_OTHER;
      return rnd() < chance && (own || open(px, py, pz));
    })
    .map(([px, py, pz], i) =>
      ei(
        'eierbaum',
        [px + HALF + (rnd() - HALF) * 0.3, py - EI.h / 2 - 0.005, pz + HALF + (rnd() - HALF) * 0.3],
        i,
      ),
    );
  // Tafel
  w.set(x + 7, BASE, z, 'birch_fence');
  w.set(x + 7, BASE + 1, z, 'stripped_birch_wood');
  const sign = textSign(
    tag('eierbaum'),
    [x + 8.02, BASE + 1.5, z + HALF],
    90,
    [
      { text: 'Eierbaum\\n', color: 'light_purple', bold: true },
      { text: 'Egg tree', color: 'white' },
    ],
    0.8,
  );
  return [...eggs, sign];
}

// ---------- Osterhase ----------

/** Großer Hase aus Wolle auf der Wiese neben der Ankunft, schaut zum Weg (nach Westen). */
export const OSTERHASE = { x: 24, z: 21 } as const;

function osterhase(w: Canvas, v: View, world: World): string[] {
  const { x, z } = OSTERHASE;
  disc(x, z, 6).forEach(([px, pz]) => clearPlants(w, v, px, pz));
  const wool = 'white_wool';
  ellipsoid(w, x, BASE + 2, z, 2.2, 2.3, 2.4, wool); // Körper
  ellipsoid(w, x - 1, BASE + 5.2, z, 1.7, 1.7, 1.7, wool); // Kopf
  ellipsoid(w, x + 2.6, BASE + 1.6, z, 0.9, 0.9, 0.9, wool); // Schwänzchen
  // Ohren: zwei Spalten, vorne rosa
  [z - 1, z + 1].forEach((ez) =>
    range(BASE + 7, BASE + 9).forEach((y) => {
      w.set(x - 1, y, ez, y < BASE + 9 ? 'pink_wool' : wool);
      w.set(x, y, ez, wool);
    }),
  );
  // Gesicht: Augen, Nase, Schnauze; Pfoten
  [z - 1, z + 1].forEach((ez) => w.set(x - 2, BASE + 5, ez, 'black_wool'));
  w.set(x - 3, BASE + 4, z, 'pink_wool');
  [z - 1, z + 1].forEach((ez) => w.set(x - 3, BASE + 4, ez, wool));
  [z - 1, z + 1].forEach((ez) => w.set(x - 3, BASE, ez, wool));
  // Korb mit Eiern vor den Pfoten
  w.set(x - 4, BASE, z, 'composter');
  const basket = range(0, 4).map((i) =>
    ei(
      'hase',
      [x - 4 + HALF + (i % 2 === 0 ? -0.18 : 0.18), BASE + 1 + EI.h / 2, z + HALF + (i - 1.5) * 0.18],
      i,
      1.1,
    ),
  );
  // Bemaltes Riesen-Ei daneben
  const big =
    settle(
      world,
      [x - 4.5, BASE + 0.85, z + 3.5],
      ([ex, ey, ez]) => [
        blockDisplay(tag('hase'), [ex, ey, ez], 'light_blue_concrete', { scale: [1.2, 1.7, 1.2] }),
        blockDisplay(tag('hase'), [ex, ey + 0.1, ez], 'yellow_concrete', { scale: [1.25, 0.3, 1.25] }),
        blockDisplay(tag('hase'), [ex, ey - 0.4, ez], 'pink_concrete', { scale: [1.25, 0.2, 1.25] }),
      ],
      3,
      0.5,
    ) ?? [];
  const sign = textSign(
    tag('hase'),
    [x - 2.6, BASE + 7.6, z + HALF],
    -90,
    [{ text: 'Frohe Ostern!', color: 'light_purple', bold: true }],
    1.1,
  );
  return [...basket, ...big, sign];
}

// ---------- Frühling: Blüten an den Bäumen, Blumen auf den Wiesen ----------

/** Anteil der Kronen je Blüte (der Rest bleibt grün). */
const BLUETEN_ANTEIL: ReadonlyArray<readonly [number, string]> = [
  [0.45, 'cherry_leaves[persistent=true]'],
  [0.7, 'flowering_azalea_leaves[persistent=true]'],
];
/**
 * Laub eines Baums: "oak_leaves[distance=1,persistent=true]" oder "birch_leaves"; passt nicht: "spruce_leaves",
 * "azalea_leaves".
 * https://regex101.com/?flavor=javascript&regex=%5E(oak%7Cbirch)_leaves&testString=oak_leaves%5Bdistance%3D1%2Cpersistent%3Dtrue%5D
 */
const LAUB = /^(oak|birch)_leaves/;

/** Laubbäume im Dorf blühen: jede zusammenhängende Krone ganz in Kirschblüte, in Azaleenblüte oder grün. */
function blueten(w: Canvas, base: Canvas): void {
  const leaves = base
    .find((b) => LAUB.test(b))
    .filter(([x, y, z]) => base.originAt(x, y, z) === 'baum' && y < GROUND + 45)
    .filter(([x, , z]) => x >= INNER.from && x <= INNER.to && z >= INNER.from && z <= INNER.to);
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const open = new Map(leaves.map(([x, y, z]) => [key(x, y, z), [x, y, z] as const]));
  const crowns: Array<Array<readonly [number, number, number]>> = [];
  leaves.forEach(([x, y, z]) => {
    if (!open.has(key(x, y, z))) return;
    const crown: Array<readonly [number, number, number]> = [];
    const todo: Array<readonly [number, number, number]> = [[x, y, z]];
    open.delete(key(x, y, z));
    const visit = (): void => {
      const cell = todo.pop();
      if (!cell) return;
      crown.push(cell);
      (
        [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ] as const
      ).forEach(([dx, dy, dz]) => {
        const k = key(cell[0] + dx, cell[1] + dy, cell[2] + dz);
        const next = open.get(k);
        if (!next) return;
        open.delete(k);
        todo.push(next);
      });
    };
    Array.from({ length: leaves.length }).some(() => {
      visit();
      return todo.length === 0;
    });
    crowns.push(crown);
  });
  const rnd = random(2027);
  crowns.forEach((crown) => {
    const pick = rnd();
    const blossom = BLUETEN_ANTEIL.find(([upTo]) => pick < upTo)?.[1];
    if (blossom) crown.forEach(([x, y, z]) => w.set(x, y, z, blossom));
  });
}

const BLUMEN: readonly string[] = [
  'dandelion',
  'dandelion',
  'oxeye_daisy',
  'azure_bluet',
  'cornflower',
  'pink_tulip',
  'white_tulip',
  'red_tulip',
  'orange_tulip',
  'allium',
  'lily_of_the_valley',
  'pink_petals[facing=north,flower_amount=4]',
  'pink_petals[facing=east,flower_amount=3]',
  'wildflowers[facing=south,flower_amount=4]',
  'wildflowers[facing=west,flower_amount=2]',
];
/** Hier keine Blumen: Figuren, Launchpads, Jump and Run (Abstand in Blöcken). */
const FREI_FIGUR = 2.5;
const FREI_PAD = 4;
const FREI_JUMP = 7;
/**
 * Figur im Bau: "summon mannequin -7.5 65 14.5 {Tags:[…]}" → -7.5 und 14.5; passt nicht: "summon text_display …".
 * https://regex101.com/?flavor=javascript&regex=%5Esummon%20mannequin%20(%5B-%5Cd.%5D%2B)%20%5B-%5Cd.%5D%2B%20(%5B-%5Cd.%5D%2B)%20&testString=summon%20mannequin%20-7.5%2065%2014.5%20%7BTags%3A%5B%5D%7D
 */
const MANNEQUIN = /^summon mannequin ([-\d.]+) [-\d.]+ ([-\d.]+) /;

/** Frühlingsblumen auf den Wiesen im Dorf: in Flecken, mal dichter, mal lockerer. */
function blumen(w: Canvas, v: View, base: Canvas): void {
  const rnd = random(2028);
  const figures = base.extra
    .map((cmd) => MANNEQUIN.exec(cmd))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [Number(m[1]), Number(m[2])] as const);
  const keep = (x: number, z: number): boolean =>
    figures.some(([fx, fz]) => Math.hypot(fx - x - HALF, fz - z - HALF) < FREI_FIGUR) ||
    LAUNCHPADS.some((p) => Math.hypot(p.x - x, p.z - z) < FREI_PAD) ||
    Math.hypot(JUMP_AND_RUN.start.x - x, JUMP_AND_RUN.start.z - z) < FREI_JUMP;
  const dichte = (x: number, z: number): number => {
    const n = Math.sin(x * 0.19 + 1.3) * Math.cos(z * 0.23 - 0.7) + 0.5 * Math.sin((x + z) * 0.11);
    return 0.03 + 0.2 * Math.max(0, n);
  };
  const cells = pairs(range(INNER.from, INNER.to), range(INNER.from, INNER.to));
  cells.forEach(([x, z]) => {
    const roll = rnd();
    if (roll >= dichte(x, z)) return;
    if (
      v.before(x, GROUND, z) !== 'grass_block' ||
      v.now(x, BASE, z) !== 'air' ||
      v.now(x, BASE + 1, z) !== 'air'
    )
      return;
    if (keep(x, z)) return;
    // in Flecken meist dieselbe Blume
    const patch = Math.abs(Math.floor(x / 5) * 31 + Math.floor(z / 5) * 17) % BLUMEN.length;
    const pick = rnd() < 0.6 ? patch : Math.floor(rnd() * BLUMEN.length);
    w.set(x, BASE, z, BLUMEN[pick] ?? 'dandelion');
  });
}

// ---------- Ostermarkt und Eingang ----------

/** Großes Osterei obenauf (statt des Sterns im Winter): rosa Ei mit gelbem Band, zwei kleine daneben. */
function osterEi(size: number): ModelPart[] {
  const h = size * 0.85;
  const w = size * 0.6;
  return [
    { at: [0, 0, 0], block: KUGELN.rosa, scale: [w, h, w], light: { sky: 15, block: 12 } },
    {
      at: [-w * 0.75, -h * 0.25, 0],
      block: KUGELN.hellblau,
      scale: [w * 0.5, h * 0.5, w * 0.5],
      light: { sky: 15, block: 12 },
    },
    {
      at: [w * 0.75, -h * 0.25, 0],
      block: KUGELN.gold,
      scale: [w * 0.5, h * 0.5, w * 0.5],
      light: { sky: 15, block: 12 },
    },
  ];
}

/** Eingangsbogen wie das Weihnachtstor, im Osterstil (Philip, 17.11.: „das gleiche wie bei Weihnachten, nur mehr
 * im Osterstyle“): Blütenzweige mit Grün, Pastell-Schleifen, Ostereier, Weidenkätzchen, Osterbäumchen im Kübel,
 * Schild oben auf dem Balken (die Begrüßung bleibt frei). */
const OSTER_TOR: TorThema = {
  tags: tag('eingang'),
  stil: OSTERN,
  pfosten: 'stripped_birch_log',
  balken: 'stripped_birch_log[axis=x]',
  krone: 'flowering_azalea_leaves[persistent=true]',
  drauf: null,
  vorne: [
    { text: '✿ Frohe Ostern! ✿\\n', color: 'light_purple', bold: true },
    { text: 'Happy Easter!', color: 'white' },
  ],
  hinten: [
    { text: '✿ Frühlingsfest ✿\\n', color: 'light_purple', bold: true },
    { text: 'Spring festival', color: 'white' },
  ],
  spitze: osterEi,
  busch: 'flowering_azalea_leaves[persistent=true]',
};

function eingang(w: Canvas): string[] {
  return geschmuecktesTor(w, EINGANG, OSTER_TOR);
}

function buden(w: Canvas, v: View): string[] {
  const eier = budeGeruest(w, v, 0, 'cherry', 'cherry_planks');
  [1, 2, 3].forEach((u) => eier.set(u, 1, 1, 'barrel[facing=up]'));
  eier.set(2, 4, 1, 'light[level=14]');
  // Eier in Körben auf der Theke
  const auslage = range(0, 11).map((i) =>
    ei('bude', pointAt(eier, 1.25 + (i % 6) * 0.5, 3.0 + EI.h / 2, 0.35 + Math.floor(i / 6) * 0.3), i),
  );
  const lamm = budeGeruest(w, v, 1, 'cherry', 'cherry_planks');
  [1, 2, 3].forEach((u) => lamm.set(u, 1, 1, 'barrel[facing=up]'));
  lamm.set(2, 3, 0, 'cake');
  lamm.set(2, 4, 1, 'light[level=14]');
  const zopf = [1.4, 3.6].map((u) =>
    itemDisplay(tag('bude'), pointAt(lamm, u, 3.04, 0.5), 'bread', 0.4, aroundY(Math.PI / 2)),
  );
  const world: World = (x, y, z) => v.now(x, y, z);
  const girlanden = [eier, lamm].flatMap((f, i) =>
    budeSchmuecken(world, f, tag('bude'), OSTERN, BUDE_POSTS, i),
  );
  return [
    budeSign(S, eier, [
      { text: 'Ostereier\\n', color: 'light_purple', bold: true },
      { text: 'Easter eggs', color: 'white' },
    ]),
    budeSign(S, lamm, [
      { text: 'Osterlamm & Hefezopf\\n', color: 'light_purple', bold: true },
      { text: 'Easter lamb & sweet bread', color: 'white' },
    ]),
    ...auslage,
    ...zopf,
    ...girlanden,
  ];
}

/** Kette zwischen zwei Häusern: beide Enden rücken an die nächste Wand. */
function hung(world: World, a: Vec, b: Vec): string[] {
  const a2 = anchorEnd(world, a, b, 6, 6);
  const b2 = a2 && anchorEnd(world, b, a2, 6, 6);
  return a2 && b2 ? pennants(S, 'kette', a2, b2, 0.8, PASTELL) : [];
}

function dorf(world: World): string[] {
  const y = GROUND + 6;
  const street = [30, 44, 58, 72, 86, 100].flatMap((z) => hung(world, [-7, y, z + HALF], [8, y, z + HALF]));
  const lane = [-55, -69, -83, -97, -111].flatMap((x) => hung(world, [x + HALF, y, 0], [x + HALF, y, 15]));
  // Eier in den Vorgärten (im Gras, nicht in Zäunen oder Büschen)
  const rnd = random(2026);
  const gardens: readonly (readonly [number, number, number, number])[] = [
    [-24, 26, -16, 92],
    [16, 31, 24, 98],
    [-62, 1, -54, 3],
    [-98, 11, -90, 13],
  ];
  const eggs = gardens.flatMap(([x1, z1, x2, z2]) =>
    range(0, 4).flatMap((i) => {
      const spots = range(0, 19).map((): Vec => [
        x1 + rnd() * (x2 - x1),
        BASE + EI.h * 0.75,
        z1 + rnd() * (z2 - z1),
      ]);
      const found = spots.map((at) => [ei('garten', at, i, 1.5)]).find((egg) => stands(world, egg));
      return found ?? [];
    }),
  );
  const rabbits = [
    [-20, 40],
    [-20, 58],
    [20, 46],
    [20, 80],
    [-60, 6],
    [-34, -14],
    [-35, -3],
    [19, 16],
    [28, 25],
  ].map(
    ([x, z], i) =>
      `summon rabbit ${(x ?? 0) + HALF} ${BASE} ${(z ?? 0) + HALF} {${tag('hase')},PersistenceRequired:1b,Invulnerable:1b,RabbitType:${i % 5}}`,
  );
  return [...street, ...lane, ...eggs, ...rabbits];
}

// ---------- Alles zusammen ----------

const cache: { base?: Canvas; plan?: SeasonPlan } = {};

/** Oster-Plan über dem Bauplan der Lobby (Blöcke mit Rückweg, Anzeigen). */
export function osternPlan(base: Canvas): SeasonPlan {
  if (cache.base === base && cache.plan) return cache.plan;
  const w = new Canvas();
  const v = viewOf(base, w);
  const world: World = (x, y, z) => v.now(x, y, z);
  blueten(w, base);
  staendeThema(w, v, 'ostern');
  const displays = [
    ...brunnen(w, v),
    ...eierbaum(w, v),
    ...osterhase(w, v, world),
    ...eingang(w),
    ...buden(w, v),
    ...staendeSchmuecken(world, tag('stand'), OSTERN),
    ...bogenSchmuck(tag('bogen'), [HALF, GROUND + 7, MARKET_ARCH_Z + HALF], OSTERN),
  ];
  // Blumen erst, wenn alles steht (nicht in Bauten, Buden, Beeten)
  blumen(w, v, base);
  const moves = [
    `execute as @e[type=mannequin,tag=mm_walker,x=${CHRISTBAUM.x + HALF},y=${BASE},z=${CHRISTBAUM.z + HALF},distance=..${OSTERBRUNNEN.r + 1.5}] at @s ` +
      `facing ${CHRISTBAUM.x + HALF} ${BASE} ${CHRISTBAUM.z + HALF} run tp @s ^ ^ ^-4`,
  ];
  const plan = seasonPlanOf(v, w, [...displays, ...dorf(world)], moves);
  cache.base = base;
  cache.plan = plan;
  return plan;
}
