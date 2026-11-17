/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: block offsets as the build needs them */
/**
 * Sport-Stand am Schlossmarkt (17.11., Philip: „Der Winterspiele-Stand soll einen Spezial-Look bekommen, weil er nur
 * saisonal da ist“): Wintersport und Sommerspiele teilen sich einen Stand – es steht dort immer, wer gerade offen ist.
 *
 * - **Winter:** verschneite Skihütte mit Dachüberstand, Eiszapfen, Skiern am Pfosten, Startnummern, Laternen und einer
 *   Bank mit Fell – davor die Skifahrerin.
 * - **Sommer:** Bootshaus am Bergsee mit Ruderboot, gekreuzten Paddeln, Rettungsring, Bogenscheibe, Sonnenschirm,
 *   Blumenkästen und Wimpelkette – davor die Ruderin.
 *
 * Im Bauplan der Lobby steht die Skihütte (ohne Figur). Die Sommer-Blöcke setzt `sport/sommerspiele_on` und nimmt
 * `sport/sommerspiele_off` wieder weg – genau die alten Blöcke an genau den geänderten Stellen (wie die Saisons, siehe
 * `saison-plan.ts`). Jede Funktion läuft in einem Tick: Ein Absturz trifft immer einen ganzen Stand, nie einen halben.
 * Welcher Stand gerade steht, sagt ein Merker-Block unter dem Boden (`SPORT_STAND.sentinel`). Figur, Schild und
 * Deko sind Anzeige-Wesen mit dem Tag `mm_sport` + `mm_sport_<modus>` (`sport/<modus>`). Das Lobby-Plugin
 * (`LobbySportStand.java`) vergleicht Merker und Wesen mit dem, was der Hub sagt, und baut um.
 *
 * Saison-Deko (Wiesn, Winter, Ostern, Halloween) lässt den Stand in Ruhe (`inSportZone`): Beide Stände bringen ihren
 * eigenen Schmuck mit.
 */
import { Canvas } from '../canvas.js';
import { Frame } from '../frame.js';
import { GROUND } from '../nature.js';
import { range } from '../range.js';
import { BUILD_PLACEHOLDER, LOBBY_TAG, npc, signText, tintTag } from '../village.js';
import { MODES } from './common.js';
import { aroundX, aroundY, aroundZ, blockDisplay, multiply, type Vec } from './deko.js';

/** Wintersport hat den Stand, die Sommerspiele kommen zu Besuch. */
export const SPORT_HOST = 'wintersport';
export const SPORT_GUEST = 'sommerspiele';
export const SPORT_LOOKS = [SPORT_HOST, SPORT_GUEST] as const;
export type SportLook = (typeof SPORT_LOOKS)[number];

/** Mitte der Vorderkante (Slot des Schlossmarkts, Stand schaut nach Süden). */
const X = -26;
const Z = -31;
/** Merker unter dem Boden: Packeis = Skihütte, Sandstein = Bootshaus. */
const SENTINEL = { x: X, y: GROUND - 2, z: Z - 2 } as const;
const SENTINEL_BLOCK: Readonly<Record<SportLook, string>> = {
  wintersport: 'packed_ice',
  sommerspiele: 'sandstone',
};
/** Bereich, den nur der Sport-Stand ändert (Saisons nicht): der Stand selbst, ohne die Gassen links und rechts. */
const ZONE = { x1: X - 3, x2: X + 3, z1: Z - 5, z2: Z + 3, y1: GROUND - 2, y2: GROUND + 10 } as const;
/** Die Figur steht hier (Mitte des Blocks) und schaut nach Süden. */
const FIGURE = { x: X, y: GROUND + 1, z: Z - 1 } as const;

/** Was das Lobby-Plugin über den Stand wissen muss (geht über `lobby-settings` an die Lobby). */
export const SPORT_STAND = {
  /** Im Bauplan steht sein Stand (Skihütte); der Gast kommt per Umbau darüber. */
  host: SPORT_HOST,
  modes: SPORT_LOOKS,
  sentinel: [SENTINEL.x, SENTINEL.y, SENTINEL.z],
  blocks: SENTINEL_BLOCK,
  center: [FIGURE.x + 0.5, FIGURE.y, FIGURE.z + 0.5],
  /** So weit um die Mitte gehören Wesen mit `mm_sport` zum Stand. */
  radius: 8,
  /** Funktionen im Saison-Paket (Namensraum `moinmorni_season`). */
  functions: {
    on: `sport/${SPORT_GUEST}_on`,
    off: `sport/${SPORT_GUEST}_off`,
    show: { wintersport: `sport/${SPORT_HOST}`, sommerspiele: `sport/${SPORT_GUEST}` },
  },
} as const;

/** Gehört die Stelle zum Sport-Stand? (Saison-Deko setzt dort nichts.) */
export function inSportZone(x: number, y: number, z: number): boolean {
  return x >= ZONE.x1 && x <= ZONE.x2 && z >= ZONE.z1 && z <= ZONE.z2 && y >= ZONE.y1 && y <= ZONE.y2;
}

/** Rahmen wie bei den Marktständen: u = nach Osten (0 … 6), v = nach hinten (Norden), y über dem Boden. */
const frame = (c: Canvas): Frame => new Frame(c, X - 3, GROUND, Z, 'south');

// ---------------------------------------------------------------------------------------------------------------
// Blöcke
// ---------------------------------------------------------------------------------------------------------------

/** Was beide Stände gemeinsam haben: freier Raum, Merker, Boden der Vorderseite. */
function clearStand(f: Frame, look: SportLook): void {
  f.fill(0, 1, -3, 6, 10, 5, 'air');
  const [sx, sy, sz] = [SENTINEL.x, SENTINEL.y, SENTINEL.z];
  f.c.set(sx, sy, sz, SENTINEL_BLOCK[look]);
}

/** Skihütte (Wintersport): dunkles Fichtenholz, Stufendach mit dickem Schnee, Theke mit Fässern, Bank mit Fell. */
function skiHut(c: Canvas): void {
  const f = frame(c);
  clearStand(f, 'wintersport');
  f.fill(0, 0, -3, 6, 0, -1, 'polished_andesite');
  f.fill(0, 0, 0, 6, 0, 5, 'spruce_planks');
  // Eckpfosten, Seitenwände mit Fenster, Rückwand
  [0, 6].forEach((u) => [0, 4].forEach((v) => f.fill(u, 1, v, u, 3, v, 'stripped_spruce_log[axis=y]')));
  [0, 6].forEach((u) => {
    f.fill(u, 1, 1, u, 3, 3, 'spruce_planks');
    f.set(u, 2, 2, 'glass');
  });
  f.fill(1, 1, 4, 5, 3, 4, 'spruce_planks');
  f.set(3, 2, 4, 'glass');
  // Theke vorn: Fässer mit Ware außen, Brett dazwischen, in der Mitte frei (dort steht die Skifahrerin dahinter)
  [1, 5].forEach((u) => f.set(u, 1, 0, 'barrel[facing=up]'));
  f.set(1, 2, 0, 'snow_block');
  f.set(5, 2, 0, 'potted_spruce_sapling');
  [2, 4].forEach((u) => f.set(u, 1, 0, 'spruce_slab[type=top]'));
  f.set(2, 2, 0, 'blue_ice');
  // Stufendach mit Überstand vorn (zwei Reihen) und hinten, oben überall Schnee
  range(0, 3).forEach((step) => {
    const y = 4 + step;
    f.fill(step, y, -2, 6 - step, y, 5, 'dark_oak_planks');
    [step, 6 - step].forEach((u) => f.fill(u, y + 1, -2, u, y + 1, 5, `snow[layers=${step === 3 ? 4 : 3}]`));
  });
  // Laternen unter dem Überstand
  [1, 5].forEach((u) => f.set(u, 3, -2, 'lantern[hanging=true]'));
  // Startnummern-Banner an den Pfosten (die Nummern stehen als Schrift darauf, `sportShow`)
  [0, 6].forEach((u) => f.set(u, 3, -1, 'white_wall_banner[facing=south]'));
  // Bank mit Fell links vor der Hütte (das Fell ist eine Anzeige), Schnee an den Ecken
  [0, 1].forEach((u) => f.set(u, 1, -3, 'spruce_stairs[facing=north]'));
  f.set(6, 1, -3, 'snow[layers=2]');
  f.set(5, 1, -3, 'snow[layers=1]');
  f.set(6, 1, -2, 'snow[layers=1]');
  // Lager in der Hütte: Schneeschuhe und Skiwachs (Fässer), ein Ofen in der Ecke
  f.set(1, 1, 3, 'barrel[facing=up]');
  f.set(5, 1, 3, 'furnace[facing=south,lit=true]');
}

/** Bootshaus (Sommerspiele): helles Birkenholz, Satteldach, Ruderboot, Blumenkästen, Bogenscheibe auf dem Strohballen. */
function boatHouse(c: Canvas): void {
  const f = frame(c);
  clearStand(f, 'sommerspiele');
  f.fill(0, 0, -3, 6, 0, -1, 'birch_planks');
  f.fill(0, 0, 0, 6, 0, 5, 'oak_planks');
  // Pfosten, halbhohe Seitenwände mit Blumenkästen, Rückwand mit Fenster
  [0, 6].forEach((u) => [0, 4].forEach((v) => f.fill(u, 1, v, u, 3, v, 'stripped_birch_log[axis=y]')));
  [0, 6].forEach((u) => f.fill(u, 1, 1, u, 2, 3, 'birch_planks'));
  [0, 6].forEach((u) =>
    [1, 2, 3].forEach((v, i) =>
      f.set(
        u,
        3,
        v,
        ['potted_red_tulip', 'potted_cornflower', 'potted_poppy'][(i + u) % 3] ?? 'potted_poppy',
      ),
    ),
  );
  f.fill(1, 1, 4, 5, 3, 4, 'birch_planks');
  f.set(3, 2, 4, 'glass');
  // Pfosten vorn am Steg (dort hängt die Wimpelkette)
  [0, 6].forEach((u) => f.fill(u, 1, -3, u, 3, -3, 'birch_fence'));
  // Satteldach aus dunkler Eiche, Überstand bis über den Steg, Giebel vorn und hinten
  range(0, 2).forEach((step) => {
    const y = 4 + step;
    f.fill(step, y, -3, step, y, 5, 'dark_oak_stairs[facing=east]');
    f.fill(6 - step, y, -3, 6 - step, y, 5, 'dark_oak_stairs[facing=west]');
  });
  f.fill(3, 7, -3, 3, 7, 5, 'dark_oak_slab[type=bottom]');
  [0, 4].forEach((v) => {
    f.fill(1, 4, v, 5, 4, v, 'birch_planks');
    f.fill(2, 5, v, 4, 5, v, 'birch_planks');
    f.set(3, 6, v, 'birch_planks');
  });
  // Vereinsfahnen an den Eckpfosten (über der Mitte hängt das Schild der Figur), Laternen unter dem Überstand
  [0, 6].forEach((u) => f.set(u, 3, -1, 'lime_wall_banner[facing=south]'));
  [1, 5].forEach((u) => f.set(u, 4, -2, 'lantern[hanging=true]'));
  // Theke: Fässer mit Ware, dazwischen ein Brett
  [1, 5].forEach((u) => f.set(u, 1, 0, 'barrel[facing=up]'));
  f.set(1, 2, 0, 'melon');
  f.set(5, 2, 0, 'cake');
  [2, 4].forEach((u) => f.set(u, 1, 0, 'spruce_slab[type=top]'));
  f.set(4, 2, 0, 'potted_cornflower');
  // Ruderboot hinten an der Wand: Bug und Heck aus Treppen, dazwischen der Rumpf, eine Ruderbank
  f.set(1, 1, 3, 'oak_stairs[facing=east]');
  f.fill(2, 1, 3, 4, 1, 3, 'oak_slab[type=bottom]');
  f.set(5, 1, 3, 'oak_stairs[facing=west]');
  f.set(3, 1, 2, 'oak_trapdoor[facing=south,half=bottom,open=false]');
  // Bogenscheibe auf dem Strohballen rechts vorn, Sonnenschirm-Stange links (Schirm: Anzeige)
  f.set(6, 1, -2, 'hay_block');
  f.set(6, 2, -2, 'target');
  f.set(5, 1, -2, 'hay_block');
  f.fill(1, 1, -2, 1, 2, -2, 'birch_fence');
  f.set(1, 1, -3, 'oak_stairs[facing=north]');
}

/** Im Bauplan der Lobby: die Skihütte (der Stand im Winter). */
export function buildSportStand(c: Canvas, x: number, z: number): void {
  if (x !== X || z !== Z)
    throw new Error(`Sport-Stand bei ${x}/${z} erwartet ${X}/${Z} (SPORT_STAND nachziehen)`);
  c.place('Sport-Stand', X - 3, GROUND + 1, Z + 1, X + 3, Z + 3);
  c.tagged('stand wintersport', () => skiHut(c));
}

// ---------------------------------------------------------------------------------------------------------------
// Umbau zum Bootshaus
// ---------------------------------------------------------------------------------------------------------------

/** Blöcke des Bootshauses über dem Bauplan: was es setzt und was danach wieder hin muss. */
export interface SportPlan {
  readonly on: readonly string[];
  readonly off: readonly string[];
  readonly blocks: Canvas;
  readonly restore: Canvas;
}

/** Umbau Skihütte → Bootshaus: genau die Stellen, an denen sich etwas ändert. */
export function sportPlan(base: Canvas): SportPlan {
  const w = new Canvas();
  w.tagged('stand sommerspiele', () => boatHouse(w));
  const blocks = new Canvas();
  const restore = new Canvas();
  w.find(() => true).forEach(([x, y, z, b]) => {
    const old = base.get(x, y, z) ?? 'air';
    if (old === b) return;
    blocks.tagged('stand sommerspiele', () => blocks.set(x, y, z, b));
    restore.set(x, y, z, old);
  });
  // Was nur die Skihütte hat (und das Bootshaus nicht neu setzt), kommt weg
  range(ZONE.x1, ZONE.x2).forEach((x) =>
    range(GROUND + 1, ZONE.y2).forEach((y) =>
      range(ZONE.z1, ZONE.z2).forEach((z) => {
        if (w.get(x, y, z) !== undefined) return;
        const old = base.get(x, y, z);
        if (!old || old === 'air') return;
        blocks.set(x, y, z, 'air');
        restore.set(x, y, z, old);
      }),
    ),
  );
  return { on: blocks.commands(), off: restore.commands(), blocks, restore };
}

// ---------------------------------------------------------------------------------------------------------------
// Figur, Schild und Deko (Anzeige-Wesen)
// ---------------------------------------------------------------------------------------------------------------

const lobbyTagsInList = `'${LOBBY_TAG}','${BUILD_PLACEHOLDER}'`;
const tagsOf = (look: SportLook, kind: string): string =>
  `Tags:['mm_sport','mm_sport_${look}','mm_sport_${kind}']`;
/** Wesen aus `npc()`/`signText()` tragen die Lobby-Tags – am Sport-Stand stattdessen die eigenen. */
const sportTagged =
  (look: SportLook) =>
  (cmd: string): string =>
    cmd.replaceAll(lobbyTagsInList, `'mm_sport','mm_sport_${look}'`);

/** Figur, Name auf dem Giebel und die Deko eines Stands (ohne Aufräumen davor). */
function standEntities(look: SportLook): string[] {
  const mode = MODES.find((m) => m.id === look);
  if (!mode) throw new Error(`Modus ${look} fehlt in MODES`);
  const e = new Canvas();
  const tint = mode.tint ?? '#ffaa00';
  npc(e, {
    ...FIGURE,
    look: 'south',
    skin: mode.skin,
    ...(mode.holds ?? { hand: mode.icon }),
    tags: ['mm_mode_npc', `mm_mode_${mode.id}`, tintTag(tint), 'mm_sport_figure'],
    labelTags: ['mm_mode_label'],
    label: [
      { size: 'name', parts: [{ text: mode.name, color: tint, bold: true }] },
      { size: 'state', parts: [{ text: mode.line, color: 'green' }] },
      { size: 'hint', parts: [{ text: mode.status, color: '#c8c8c8' }] },
    ],
  });
  const winter = look === SPORT_HOST;
  // Name auf dem Giebel: Skihütte vorn an der Stufe über dem Überstand, Bootshaus am Giebel unter dem Dach
  signText(
    e,
    X + 0.5,
    winter ? GROUND + 5.55 : GROUND + 5.15,
    winter ? Z + 3.02 : Z + 1.02,
    'south',
    [{ text: mode.name, color: tint, bold: true }],
    winter ? 1.05 : 0.95,
  );
  return [...e.extra, ...(winter ? skiHutDeco() : boatHouseDeco())].map(sportTagged(look));
}

/** Skier am Pfosten, Startnummern, Fell auf der Bank, Eiszapfen am Überstand. */
function skiHutDeco(): string[] {
  const t = (kind: string): string => tagsOf('wintersport', kind);
  // Drei Paar Ski lehnen rechts vorn am Eckpfosten (leicht gefächert)
  const skis = ['red_concrete', 'blue_concrete', 'yellow_concrete'].flatMap((block, i) =>
    [0, 1].map((k) =>
      blockDisplay(t('ski'), [X + 2.2 + i * 0.22 + k * 0.1, GROUND + 1.95, Z + 1.12], block, {
        scale: [0.09, 1.85, 0.04],
        rotation: aroundZ((-6 + i * 4) * (Math.PI / 180)),
      }),
    ),
  );
  // Startnummern auf den weißen Bannern (7 und 12)
  const numbers = [
    { u: -3, n: '7' },
    { u: 3, n: '12' },
  ].map(
    ({ u, n }) =>
      `summon text_display ${X + u + 0.5} ${GROUND + 2.75} ${Z + 1.32} {${t('nummer')},billboard:'fixed',Rotation:[0f,0f],text:{text:'${n}',color:'#d0342a',bold:true},background:0,shadow:false,transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[1.1f,1.1f,1.1f]}}`,
  );
  // Fell auf der Bank (zwei Stufen links vorn)
  const fur = blockDisplay(t('fell'), [X - 2.0, GROUND + 1.53, Z + 3.45], 'white_wool', {
    scale: [1.7, 0.08, 0.62],
  });
  // Eiszapfen vorn am Überstand, unterschiedlich lang
  const icicles = [0.15, 0.85, 1.55, 2.4, 3.1, 3.75, 4.6, 5.3, 6.05, 6.8].map((u, i) => {
    const length = 0.25 + ((i * 7) % 5) * 0.11;
    return blockDisplay(t('eiszapfen'), [X - 3 + u, GROUND + 4 - length / 2 + 0.02, Z + 2.85], 'ice', {
      scale: [0.09, length, 0.09],
      rotation: aroundY(Math.PI / 4),
    });
  });
  return [...skis, ...numbers, fur, ...icicles];
}

/** Sonnenschirm, gekreuzte Paddel an der Rückwand, Rettungsring, Wimpelkette zwischen den Stegpfosten. */
function boatHouseDeco(): string[] {
  const t = (kind: string): string => tagsOf('sommerspiele', kind);
  // Sonnenschirm über der Stange vorn neben der Bank: acht Bahnen, gelb und weiß, leicht geneigt
  const pole: Vec = [X - 1.5, GROUND + 3.3, Z + 2.5];
  const umbrella = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const at: Vec = [pole[0] + Math.sin(angle) * 0.46, pole[1] - 0.1, pole[2] + Math.cos(angle) * 0.46];
    return blockDisplay(t('schirm'), at, i % 2 === 0 ? 'yellow_wool' : 'white_wool', {
      scale: [0.46, 0.05, 0.95],
      rotation: multiply(aroundY(angle), aroundX(0.32)),
    });
  });
  const top = blockDisplay(t('schirm'), [pole[0], pole[1] + 0.02, pole[2]], 'yellow_wool', {
    scale: [0.22, 0.14, 0.22],
  });
  // Die Stange reicht vom Zaunpfosten bis unter den Schirm
  const stick = blockDisplay(t('schirm'), [pole[0], GROUND + 3 + 0.17, pole[2]], 'stripped_birch_wood', {
    scale: [0.12, 0.34, 0.12],
  });
  // Zwei gekreuzte Paddel an der Rückwand über der Figur (Schaft hell, Blatt limettengrün)
  const paddles = [-1, 1].flatMap((s) => {
    const turn = aroundZ((s * 40 * Math.PI) / 180);
    return [
      blockDisplay(t('paddel'), [X + 0.5, GROUND + 3.0, Z - 2.9], 'stripped_birch_wood', {
        scale: [0.09, 2.1, 0.06],
        rotation: turn,
      }),
      blockDisplay(t('paddel'), [X + 0.5 + s * 0.78, GROUND + 3.0 + 0.66, Z - 2.9], 'lime_concrete', {
        scale: [0.3, 0.55, 0.05],
        rotation: turn,
      }),
    ];
  });
  // Rettungsring am rechten Eckpfosten: acht Stücke rot und weiß
  const ring = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    return blockDisplay(
      t('ring'),
      [X + 3.5 + Math.sin(angle) * 0.36, GROUND + 2.3 + Math.cos(angle) * 0.36, Z + 1.07],
      i % 2 === 0 ? 'red_concrete' : 'white_concrete',
      { scale: [0.2, 0.2, 0.08], rotation: aroundZ(-angle) },
    );
  });
  // Wimpelketten an beiden Seiten unter der Traufe: vom Stegpfosten zum Eckpfosten (vorn bleibt die Figur frei)
  const colours = ['lime_wool', 'yellow_wool', 'light_blue_wool', 'white_wool', 'orange_wool'];
  const [az, bz, y] = [Z + 3.5, Z + 0.95, GROUND + 4.0];
  const flags = [X - 2.5, X + 3.5].flatMap((x) =>
    Array.from({ length: 4 }, (_, i) => {
      const k = 0.26 + i * 0.19;
      return blockDisplay(
        t('wimpel'),
        [x, y - 0.06 * 4 * k * (1 - k) - 0.25, az + (bz - az) * k],
        colours[(i + (x > X ? 2 : 0)) % 5] ?? 'white_wool',
        { scale: [0.03, 0.34, 0.34], rotation: aroundX(Math.PI / 4) },
      );
    }),
  );
  return [...umbrella, top, stick, ...paddles, ...ring, ...flags];
}

/** Befehle einer Funktion `sport/<modus>`: alle Wesen des Stands weg, dann Figur, Schild und Deko des Modus. */
export function sportShowCommands(look: SportLook): string[] {
  const [cx, cy, cz] = SPORT_STAND.center;
  return [
    `kill @e[tag=mm_sport,x=${cx},y=${cy},z=${cz},distance=..${SPORT_STAND.radius}]`,
    ...standEntities(look),
  ];
}

/** Nur die Wesen (für die Bauplan-Prüfung). */
export function sportEntities(look: SportLook): string[] {
  return standEntities(look);
}

/** Merker, Mitte, Funktionen: Aufbereitet für das Lobby-Plugin (lobby-settings → features.sport). */
export const SPORT_SENTINEL = SENTINEL;
