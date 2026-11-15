/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/**
 * Das Schloss von innen: Festsaal mit Kuppel-Rotunde und Brunnen, Thron, Säulen, Kronleuchtern, Festtafel und Galerie
 * im Obergeschoss; Bibliothek im linken, Rittersaal mit Rüstungen und Kamin im rechten Flügel. Alles eigene Entwürfe.
 *
 * Die Flügel werden in ihrem eigenen Rahmen eingerichtet (`Frame`): u = Breite (0 … w), v = Tiefe (0 = Vorderseite
 * mit Tür), y = Höhe; der Boden liegt auf y 1, die Tür in der Mitte vorne (y 2 … 5).
 */
import type { Canvas } from './canvas.js';
import type { Frame } from './frame.js';
import { range } from './range.js';
import { cylinder, discAt, stairs, STEP, type Facing } from './shapes.js';
import { decoEntity, npc, signText } from './village.js';

export type WingKind = 'festsaal' | 'bibliothek' | 'rittersaal';

const LIGHT = 'light[level=14]';
const FLOOR_A = 'polished_diorite';
const FLOOR_B = 'polished_andesite';
/** Obergeschoss im Hauptflügel (Galerie) und seine Höhe über dem Boden. */
const GALLERY_Y = 11;

interface Room {
  readonly f: Frame;
  readonly c: Canvas;
  readonly w: number;
  readonly d: number;
  readonly top: number;
}

/** Flügel innen hohl machen, Fenster hinten, Boden, unsichtbares Licht, Raum-Schild über der Tür. */
export function hollowWing(c: Canvas, f: Frame, kind: WingKind, w: number, d: number, top: number): void {
  const room: Room = { f, c, w, d, top };
  f.fill(1, 2, 1, w - 1, top - 1, d - 1, 'air');
  range(1, w - 1).forEach((u) =>
    range(1, d - 1).forEach((v) => f.set(u, 1, v, (u + v) % 2 === 0 ? FLOOR_A : FLOOR_B)),
  );
  // Fenster auch hinten (gleicher Takt wie vorne)
  const pane = `light_blue_stained_glass_pane[${f.dir('left')}=true,${f.dir('right')}=true]`;
  range(1, w - 1)
    .filter((u) => u % 4 === 2)
    .forEach((u) =>
      range(0, Math.floor(top / 5) - 1).forEach((st) => f.fill(u, st * 5 + 3, d, u, st * 5 + 5, d, pane)),
    );
  // Unsichtbares Licht: auch nachts hell genug zum Umsehen
  range(3, w - 3)
    .filter((u) => u % 6 === 3)
    .forEach((u) => [Math.floor(d / 3), d - Math.floor(d / 3)].forEach((v) => f.set(u, 8, v, LIGHT)));
  const door = Math.floor(w / 2);
  const [sx, sy, sz] = f.at(door, 8, 0);
  const [fx, fz] = STEP[f.dir('front')];
  const names: Readonly<Record<WingKind, string>> = {
    festsaal: 'Festsaal',
    bibliothek: 'Bibliothek',
    rittersaal: 'Rittersaal',
  };
  signText(c, sx + 0.5 + fx * 0.52, sy + 0.4, sz + 0.5 + fz * 0.52, f.dir('front'), [
    { text: names[kind], color: 'gold', bold: true },
  ]);
  const furnish: Readonly<Record<WingKind, (r: Room) => void>> = { festsaal, bibliothek, rittersaal };
  furnish[kind](room);
}

/** Kronleuchter: Kette von der Decke, Kreuz aus dunklem Holz, vier Laternen. */
function chandelier(r: Room, u: number, v: number, ceiling: number): void {
  const { f } = r;
  f.set(u, ceiling, v, 'iron_chain[axis=y]');
  f.set(u, ceiling - 1, v, 'iron_chain[axis=y]');
  const arm = ceiling - 2;
  f.set(u, arm, v, 'dark_oak_fence[north=true,south=true,east=true,west=true]');
  f.set(u - 1, arm, v, `dark_oak_fence[${f.dir('right')}=true]`);
  f.set(u + 1, arm, v, `dark_oak_fence[${f.dir('left')}=true]`);
  f.set(u, arm, v - 1, `dark_oak_fence[${f.dir('back')}=true]`);
  f.set(u, arm, v + 1, `dark_oak_fence[${f.dir('front')}=true]`);
  [
    [u - 1, v],
    [u + 1, v],
    [u, v - 1],
    [u, v + 1],
  ].forEach(([a = 0, b = 0]) => f.set(a, arm - 1, b, 'lantern[hanging=true]'));
}

/** Säule aus Quarz mit Goldfuß und -kapitell. */
function column(r: Room, u: number, v: number, height: number): void {
  const { f } = r;
  f.set(u, 2, v, 'gold_block');
  f.fill(u, 3, v, u, height - 1, v, 'quartz_pillar');
  f.set(u, height, v, 'chiseled_quartz_block');
}

function festsaal(r: Room): void {
  const { f, w, d, top } = r;
  const mid = Math.floor(w / 2);
  const centre = Math.floor(d / 2);
  // Galerie-Boden auf y 11: Festsaal darunter doppelt hoch
  f.fill(1, GALLERY_Y, 1, w - 1, GALLERY_Y, d - 1, 'dark_oak_planks');
  // Teppich von der Tür zur Rotunde und quer durch den Saal
  f.fill(mid - 1, 2, 1, mid + 1, 2, centre - 6, 'red_carpet');
  f.fill(2, 2, centre, w - 2, 2, centre, 'red_carpet');
  // Säulen in zwei Reihen (nicht in der Rotunde)
  range(3, w - 3)
    .filter((u) => u % 6 === 3 && Math.abs(u - mid) > 8)
    .forEach((u) => [2, d - 2].forEach((v) => column(r, u, v, GALLERY_Y - 1)));
  // Thron-Podest im Osten, Festtafel im Westen
  f.fill(w - 5, 2, 2, w - 2, 2, d - 2, 'polished_andesite');
  f.fill(w - 5, 3, centre - 1, w - 2, 3, centre + 1, 'red_carpet');
  f.set(w - 3, 3, centre, stairs('dark_oak', f.dir('left')));
  f.set(w - 2, 3, centre, 'gold_block');
  f.set(w - 2, 4, centre, 'gold_block');
  f.set(w - 3, 3, centre - 1, 'gold_block');
  f.set(w - 3, 3, centre + 1, 'gold_block');
  [centre - 3, centre + 3].forEach((v) => {
    f.fill(w - 2, 3, v, w - 2, 9, v, 'light_blue_wool');
    f.set(w - 2, 9, v, 'white_wool');
  });
  npc(r.c, {
    ...toWorld(r, w - 3, 3, centre),
    look: f.dir('left'),
    skin: 'buergermeister',
    sit: true,
    tags: ['mm_village'],
  });
  range(4, 16).forEach((u) => {
    f.set(u, 2, centre, 'dark_oak_slab[type=top]');
    if (u % 2 === 0) f.set(u, 3, centre, u % 4 === 0 ? 'white_candle[candles=3,lit=true]' : 'cake');
    f.set(u, 2, centre - 1, stairs('dark_oak', f.dir('front')));
    f.set(u, 2, centre + 1, stairs('dark_oak', f.dir('back')));
  });
  npc(r.c, {
    ...toWorld(r, 8, 2, centre - 1),
    look: f.dir('back'),
    skin: 'gast7',
    sit: true,
    tags: ['mm_village'],
  });
  npc(r.c, {
    ...toWorld(r, 11, 2, centre + 1),
    look: f.dir('front'),
    skin: 'gast8',
    sit: true,
    tags: ['mm_village'],
  });
  npc(r.c, {
    ...toWorld(r, 13, 2, centre - 2),
    look: f.dir('back'),
    skin: 'kellnerin2',
    tags: ['mm_village'],
  });
  npc(r.c, { ...toWorld(r, mid - 3, 2, 2), look: f.dir('back'), skin: 'fuehrerin', tags: ['mm_village'] });
  // Kronleuchter im Saal
  [6, 14, w - 14, w - 7].forEach((u) => chandelier(r, u, centre, GALLERY_Y - 1));
  // Treppen hinauf zur Galerie (an der Rückwand, links und rechts der Rotunde)
  [mid - 13, mid + 5].forEach((start, side) => {
    range(0, GALLERY_Y - 2).forEach((i) => {
      const u = side === 0 ? start + i : start + (GALLERY_Y - 2) - i;
      const up = side === 0 ? f.dir('right') : f.dir('left');
      f.set(u, 2 + i, d - 1, stairs('dark_oak', up));
      f.set(u, 2 + i, d - 2, stairs('dark_oak', up));
      // Kopffreiheit: Loch in der Galerie über der Treppe
      if (2 + i >= GALLERY_Y - 3) f.fill(u, GALLERY_Y, d - 2, u, GALLERY_Y, d - 1, 'air');
    });
  });
  // Galerie: Geländer an der Brüstung zur Treppe, Bänke an den Fenstern
  range(2, w - 2)
    .filter((u) => u % 6 === 0 && Math.abs(u - mid) > 8)
    .forEach((u) => f.set(u, GALLERY_Y + 1, 1, stairs('dark_oak', f.dir('front'))));
  range(2, w - 2)
    .filter((u) => u % 5 === 0)
    .forEach((u) => f.set(u, GALLERY_Y + 1, d - 3, 'potted_azalea_bush'));
  range(3, w - 3)
    .filter((u) => u % 6 === 3)
    .forEach((u) => f.set(u, top - 2, centre, LIGHT));
}

function bibliothek(r: Room): void {
  const { f, w, d, top } = r;
  const door = Math.floor(w / 2);
  // Regale an den Wänden (zwischen den Fenstern), zwei Reihen im Raum
  range(1, w - 1)
    .filter((u) => u % 4 !== 2 && Math.abs(u - door) > 1)
    .forEach((u) => [1, d - 1].forEach((v) => f.fill(u, 2, v, u, top - 3, v, 'bookshelf')));
  [1, w - 1].forEach((u) => f.fill(u, 2, 2, u, top - 3, d - 2, 'bookshelf'));
  [Math.floor(d / 2) - 1, Math.floor(d / 2) + 1].forEach((v) => {
    range(4, door - 3).forEach((u) => f.fill(u, 2, v, u, 4, v, 'bookshelf'));
    range(door + 3, w - 4).forEach((u) => f.fill(u, 2, v, u, 4, v, 'bookshelf'));
  });
  // Lesetische mit Leselicht in der Mitte
  range(door - 2, door + 2).forEach((u) => f.set(u, 2, Math.floor(d / 2), 'dark_oak_slab[type=top]'));
  f.set(door - 1, 3, Math.floor(d / 2), 'white_candle[candles=2,lit=true]');
  f.set(door + 1, 3, Math.floor(d / 2), 'lectern[facing=' + f.dir('front') + ']');
  f.fill(door - 1, 2, 2, door + 1, 2, Math.floor(d / 2) - 2, 'green_carpet');
  chandelier(r, door, Math.floor(d / 2), top - 1);
  npc(r.c, {
    ...toWorld(r, door - 2, 2, Math.floor(d / 2) + 1),
    look: f.dir('front'),
    skin: 'apothekerin',
    hand: 'book',
    tags: ['mm_village'],
  });
}

function rittersaal(r: Room): void {
  const { f, w, d, top } = r;
  const door = Math.floor(w / 2);
  const centre = Math.floor(d / 2);
  // Kamin an der Stirnseite
  f.fill(w - 2, 2, centre - 2, w - 1, top - 1, centre + 2, 'bricks');
  f.fill(w - 2, 2, centre - 1, w - 2, 4, centre + 1, 'air');
  f.set(w - 2, 2, centre, 'campfire[lit=true,signal_fire=false]');
  f.set(w - 2, 5, centre, 'stone_brick_slab[type=bottom]');
  // Lange Tafel mit Bänken
  range(6, w - 7).forEach((u) => {
    f.set(u, 2, centre, 'spruce_slab[type=top]');
    f.set(u, 2, centre - 1, stairs('spruce', f.dir('front')));
    f.set(u, 2, centre + 1, stairs('spruce', f.dir('back')));
  });
  // Banner und Rüstungen an den Wänden
  range(3, w - 4)
    .filter((u) => u % 4 === 0)
    .forEach((u) => {
      f.set(u, 6, d - 1, `${u % 8 === 0 ? 'red' : 'white'}_wall_banner[facing=${f.dir('front')}]`);
      armour(r, u, d - 2, f.dir('front'));
    });
  range(3, w - 4)
    .filter((u) => u % 4 === 2 && Math.abs(u - door) > 2)
    .forEach((u) => armour(r, u, 1, f.dir('back')));
  chandelier(r, Math.floor(w / 3), centre, top - 1);
  chandelier(r, Math.floor((2 * w) / 3), centre, top - 1);
  npc(r.c, {
    ...toWorld(r, door + 3, 2, centre - 2),
    look: f.dir('back'),
    skin: 'schmied',
    tags: ['mm_village'],
  });
}

/** Rüstung auf einem Ständer (eigene Zusammenstellung aus Spiel-Gegenständen). */
function armour(r: Room, u: number, v: number, look: Facing): void {
  const [x, y, z] = r.f.at(u, 2, v);
  decoEntity(
    r.c,
    'armor_stand',
    x + 0.5,
    y,
    z + 0.5,
    look,
    "ShowArms:1b,NoBasePlate:1b,Invulnerable:1b,DisabledSlots:4144959,equipment:{head:{id:'minecraft:iron_helmet',count:1},chest:{id:'minecraft:iron_chestplate',count:1},legs:{id:'minecraft:chainmail_leggings',count:1},feet:{id:'minecraft:iron_boots',count:1},mainhand:{id:'minecraft:iron_sword',count:1}}",
  );
}

function toWorld(r: Room, u: number, y: number, v: number): { x: number; y: number; z: number } {
  const [x, wy, z] = r.f.at(u, y, v);
  return { x, y: wy, z };
}

/**
 * Rotunde unter der Kuppel: Galerie-Boden und Dach öffnen sich bis unter die Kuppeldecke, Brunnen in der Mitte, ein
 * großer Kronleuchter hängt von oben. (cx, cz) = Mitte, floorY = Boden des Festsaals, domeTop = Kuppeldecke.
 */
export function rotunda(c: Canvas, cx: number, cz: number, floorY: number, domeTop: number): void {
  // Durch Galerie und Dach (zwischen den Außenwänden), darüber bis an das Fensterband der Kuppel
  cylinder(c, cx, cz, floorY + 10, floorY + 13, 6, 'air');
  cylinder(c, cx, cz, floorY + 14, domeTop - 1, 7, 'air');
  const ring = (r: number): Array<[number, number]> =>
    range(0, 63).map((i) => {
      const a = (i / 64) * Math.PI * 2;
      return [Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r)];
    });
  ring(7).forEach(([x, z]) => {
    if (c.get(x, floorY + 10, z) === 'dark_oak_planks') c.set(x, floorY + 11, z, 'white_stained_glass_pane');
  });
  // Mosaik auf dem Boden: Ringe in Gold und Smaragd
  ring(5).forEach(([x, z]) => c.set(x, floorY, z, 'gold_block'));
  ring(6).forEach(([x, z]) => c.set(x, floorY, z, 'emerald_block'));
  // Kronleuchter von der Kuppel bis über den Brunnen
  range(floorY + 9, domeTop - 1).forEach((y) => c.set(cx, y, cz, 'iron_chain[axis=y]'));
  discAt(c, cx, floorY + 8, cz, 2, 'gold_block');
  [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ].forEach(([dx = 0, dz = 0]) => c.set(cx + dx, floorY + 7, cz + dz, 'lantern[hanging=true]'));
  c.set(cx, floorY + 7, cz, 'light[level=15]');
}

/** Unsichtbares Licht zum Anstrahlen (wie Scheinwerfer an echten Schlössern). */
const FLOOD = 'light[level=15]';
const LANTERN_POST = ['dark_oak_fence', 'dark_oak_fence', 'lantern[hanging=false]'] as const;

/**
 * Das Schloss bei Nacht: Fassaden, Kuppel und Türme werden von unsichtbarem Licht angestrahlt (leuchten warm weiß
 * über dem dunklen Dorf, wie Schlösser in Bayern), im Ehrenhof stehen Laternen an den Wegen. Bei Tag sieht man nichts
 * davon außer den Laternen. Koordinaten im Rahmen des Schlosses (u quer, v nach hinten, y über dem Hof).
 *
 * @param half halbe Breite des Hofs (W), @param dome Mitte der Kuppel in Welt-Koordinaten (Boden des Hauptflügels)
 */
export function castleLights(
  c: Canvas,
  f: Frame,
  half: number,
  dome: readonly [number, number, number],
  towers: readonly (readonly [number, number, number, number])[],
): void {
  const flood = (u: number, y: number, v: number): void => {
    const [x, wy, z] = f.at(u, y, v);
    c.soft(x, wy, z, FLOOD);
  };
  // Hauptflügel: drei Reihen vor der Fassade (Erdgeschoss, 1. und 2. Stock)
  range(-half + 4, half - 4)
    .filter((u) => u % 6 === 0)
    .forEach((u) => [3, 8, 13].forEach((y) => flood(u, y, 30)));
  // Seitenflügel: zwei Reihen vor den Hof-Fassaden
  range(4, 28)
    .filter((v) => v % 6 === 4)
    .forEach((v) => [-half + 5, half - 5].forEach((u) => [3, 8].forEach((y) => flood(u, y, v))));
  // Kuppel: Ring um Trommel und Haube
  const [dx, dy, dz] = dome;
  range(0, 7).forEach((i) => {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.round(dx + Math.cos(a) * 11);
    const z = Math.round(dz + Math.sin(a) * 11);
    [17, 21, 27, 31].forEach((h) => c.soft(x, dy + h, z, FLOOD));
  });
  // Türme: vier Seiten, alle 7 Blöcke nach oben
  towers.forEach(([tx, ty, tz, height]) =>
    [
      [7, 0],
      [-7, 0],
      [0, 7],
      [0, -7],
    ].forEach(([ox = 0, oz = 0]) =>
      range(4, height)
        .filter((h) => h % 7 === 4)
        .forEach((h) => c.soft(tx + ox, ty + h, tz + oz, FLOOD)),
    ),
  );
  // Laternen im Ehrenhof: am Mittelweg und am Querweg
  const post = (u: number, v: number): void =>
    LANTERN_POST.forEach((block, i) => {
      const [x, y, z] = f.at(u, 1 + i, v);
      c.set(x, y, z, block);
    });
  [6, 11, 21, 26].forEach((v) => [-3, 3].forEach((u) => post(u, v)));
  [-12, -8, 8, 12].forEach((u) => post(u, 15));
}
