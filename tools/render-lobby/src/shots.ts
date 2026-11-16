/* eslint-disable ts-patterns/no-magic-numbers -- render tool: Kamerapositionen */
/**
 * Die Aufnahmen für die Webseite: Kamera, Licht (Tag = Abendsonne, Nacht = Laternen), Schattenbereich und Ausgaben.
 */
import { castFor, MODE_CAST, PENDING_CAST } from '../../../packages/builder/src/cast.js';
import { MODES as LOBBY_MODES } from '../../../packages/builder/src/lobby/common.js';
import type { Figure, Shot } from './page/render.js';

type V3 = [number, number, number];
type Out = Shot['outputs'][number];

const WIDE: readonly Out[] = [
  [2560, 1440, 'png'],
  [1600, 900, 'png'],
  [2560, 1440, 'webp', 0.82],
  [1600, 900, 'webp', 0.82],
  [1600, 900, 'jpeg', 0.82],
];

function view(
  name: string,
  pos: V3,
  target: V3,
  opts: Partial<Shot> & { radius?: number; centre?: V3 } = {},
): Shot[] {
  const { radius, centre, ...rest } = opts;
  const base: Shot = {
    name,
    width: 2560,
    height: 1440,
    mode: 'day',
    camera: { pos, target, fov: 50 },
    focus: { centre: centre ?? target, radius: radius ?? 80 },
    villagers: true,
    outputs: WIDE,
    ...rest,
  };
  return [base];
}

/** Die Figuren der Spielmodi (Skins aus dem Baukasten). */
const MODES = Object.keys(MODE_CAST);
const POSES: Figure['pose'][] = [
  { armR: [-20, 8], armL: [10, 6], legR: -10, legL: 8, head: [10, -4] },
  { armR: [-70, 10], armL: [15, 12], legR: 12, legL: -12, head: [-8, 2] },
  { armR: [0, 150], armL: [0, 140], legR: 0, legL: 0, head: [0, -10] },
  { armR: [-35, 5], armL: [25, 4], legR: -18, legL: 14, head: [15, -6] },
  { armR: [-10, 6], armL: [-10, 6], legR: 4, legL: -4, head: [-12, 6] },
  { armR: [20, 10], armL: [-45, 8], legR: 8, legL: -6, head: [6, 0] },
  { armR: [-5, 4], armL: [5, 4], legR: 0, legL: 0, head: [-5, -3] },
];

function group(y: number, cx: number, cz: number, yaw: number): Figure[] {
  return MODES.map((skin, i) => {
    const t = (i - (MODES.length - 1) / 2) / ((MODES.length - 1) / 2);
    const a = (yaw * Math.PI) / 180;
    const along = t * 3.6;
    const back = t * t * 1.3;
    return {
      skin,
      x: cx + Math.cos(a) * along - Math.sin(a) * back,
      y,
      z: cz + Math.sin(a) * along + Math.cos(a) * back,
      yaw: yaw - t * 22,
      pose: POSES[i % POSES.length],
    };
  });
}

const PORTRAIT: readonly Out[] = [
  [1080, 1350, 'png'],
  [1080, 1350, 'webp', 0.82],
  [1080, 1350, 'jpeg', 0.82],
];

/** Tag und Nacht derselben Ansicht. */
function dayNight(
  name: string,
  pos: V3,
  target: V3,
  opts: Partial<Shot> & { radius?: number; centre?: V3 } = {},
): Shot[] {
  return [
    ...view(`${name}-tag`, pos, target, opts),
    ...view(`${name}-nacht`, pos, target, { ...opts, mode: 'night' }),
  ];
}

/** Die Modus-Figuren als Gruppe (freigestellt oder in der Szene). */
function groupShot(name: string, mode: Shot['mode'], scene: boolean): Shot {
  // in der Szene: unten an der Prachtstraße, hinter der Gruppe die Treppe hinauf zum Schloss
  const at: V3 = scene ? [0, 65, -27.5] : [0, 0, 0];
  return {
    name,
    width: 2000,
    height: 1100,
    mode,
    camera: scene
      ? { pos: [at[0] + 0.6, at[1] + 0.95, at[2] + 7.6], target: [at[0], at[1] + 3.2, at[2] - 2], fov: 50 }
      : { pos: [0, 1.6, 10.5], target: [0, 1.05, 0], fov: 30 },
    focus: { centre: scene ? [0, 75, -50] : at, radius: scene ? 80 : 6, depth: scene ? 1.2 : 1 },
    figuresOnly: !scene,
    shadowCatcher: !scene,
    villagers: scene,
    clearAround: [at[0], at[2], 7],
    figures: group(at[1], at[0], at[2], 0),
    fog: [120, 700],
    // nachts eine warme Laterne vor der Gruppe, damit die Gesichter nicht im Dunkeln liegen
    lights: mode === 'night' ? [[at[0] + 2.5, at[1] + 3.2, at[2] + 3.5, 0xffb060, 1.6, 16]] : [],
    outputs: [[2000, 1100, 'png'], ...(scene ? ([[2000, 1100, 'webp', 0.82]] as const) : ([] as const))],
  };
}

/**
 * Bild einer Modus-Figur (`figur-<modus>.webp`). Neue Figuren zeigen schon ihre eigene Tracht (unsere Zeichnung) –
 * im Spiel tragen sie sie, sobald der Skin signiert ist (bis dahin die Vertretung, `STAND_IN`).
 */
function portrait(mode: string, i: number): Shot {
  const skin = PENDING_CAST[mode] ? mode : castFor(mode).id;
  return {
    name: `figur-${mode}`,
    width: 800,
    height: 1000,
    mode: 'studio',
    camera: { pos: [1.9, 1.75, 3.9], target: [0, 1.0, 0], fov: 31 },
    focus: { centre: [0, 1, 0], radius: 4 },
    figuresOnly: true,
    shadowCatcher: true,
    figures: [{ skin, x: 0, y: 0, z: 0, yaw: 0, pose: POSES[i % POSES.length] }],
    outputs: [
      [800, 1000, 'png'],
      [800, 1000, 'webp', 0.85],
    ],
  };
}

/** Titelbild zusätzlich als leichte WebP/JPEG fürs Web (höchstens 400 KB). */
/** Nahe Ansichten: mehr Dunst, damit die Berge im Hintergrund ruhig bleiben. */
const NEAR_FOG: [number, number] = [55, 560];

const HERO = {
  radius: 150,
  centre: [0, 70, -20] as V3,
  outputs: [
    ...WIDE,
    [1920, 1080, 'webp', 0.84, 400_000],
    [1920, 1080, 'jpeg', 0.84, 400_000],
  ] as readonly Out[],
};

export const SHOTS: readonly Shot[] = [
  // Titelbild: Dorf, Maibaum, Prachtstraße und Schloss am Berg
  ...dayNight('hero', [55, 100, 80], [-5, 80, -80], HERO),
  ...dayNight('hero-hoch', [55, 100, 80], [-3, 84, -82], {
    ...HERO,
    width: 1080,
    height: 1350,
    outputs: PORTRAIT,
    camera: { pos: [52, 98, 76], target: [-3, 84, -82], fov: 62 },
  }),
  // Dorfplatz mit Marktständen
  ...dayNight('dorfplatz', [26, 72, 30], [-6, 67, -12], { radius: 60, centre: [0, 66, -5], fog: NEAR_FOG }),
  ...dayNight('marktstaende', [7, 67.6, 4], [0, 71, -40], {
    radius: 60,
    centre: [0, 66, -12],
    fog: NEAR_FOG,
  }),
  // ein Stand aus der Nähe (Duels) mit seiner Figur
  ...dayNight('stand', [4.6, 66.9, -7.4], [8.5, 66.7, -13.5], {
    radius: 24,
    centre: [8, 66, -12],
    fog: NEAR_FOG,
    // Sonne mehr von Westen, sonst wirft der Maibaum ein unruhiges Muster aufs Dach des Stands
    sun: { azimuth: 250, elevation: 24 },
  }),
  // Biergarten am Wirtshaus
  ...dayNight('biergarten', [26, 75, 26], [48, 65, -4], {
    radius: 50,
    centre: [45, 66, 0],
    fog: NEAR_FOG,
    // Sonne etwas höher, damit unter den Kastanien Schatten liegt, die Kronen aber nicht im Schatten der Nachbarn
    sun: { azimuth: 220, elevation: 42 },
  }),
  // Handwerkergasse nach Westen
  ...dayNight('handwerkergasse', [-44, 70.5, 7.5], [-110, 66, 7], {
    radius: 70,
    centre: [-80, 66, 7],
    fog: NEAR_FOG,
  }),
  // Schloss von Westen
  ...dayNight('schloss', [-40, 118, -40], [0, 100, -105], {
    radius: 70,
    centre: [0, 95, -100],
    fog: NEAR_FOG,
  }),
  // ein Stand am Schlossmarkt aus der Nähe (Wolkenkampf) mit seiner Figur, dahinter Mauer und Schlossberg
  ...dayNight('schlossmarkt-stand', [-14.2, 66.9, -24.6], [-20.5, 66.6, -32], {
    radius: 26,
    centre: [-20, 66, -31],
    fog: NEAR_FOG,
    sun: { azimuth: 200, elevation: 30 },
  }),
  // Schlossmarkt von oben (zum Prüfen beim Bauen)
  ...view('schlossmarkt-oben', [0, 300, -30.9], [0, 64, -31], {
    radius: 80,
    centre: [0, 66, -31],
    camera: { pos: [0, 300, -30.9], target: [0, 64, -31], ortho: 30 },
    sun: { azimuth: 225, elevation: 50 },
    fog: [2000, 3000],
    outputs: [[1600, 900, 'png']],
  }),
  // Karte von oben
  ...view('karte', [0, 420, -14.9], [0, 64, -15], {
    radius: 220,
    centre: [0, 70, -15],
    camera: { pos: [0, 420, -14.9], target: [0, 64, -15], ortho: 120 },
    sun: { azimuth: 225, elevation: 38 },
    fog: [2000, 3000],
  }),
  // Figuren
  groupShot('gruppe', 'studio', false),
  groupShot('gruppe-dorfplatz-tag', 'day', true),
  groupShot('gruppe-dorfplatz-nacht', 'night', true),
  ...LOBBY_MODES.map((m) => m.id).map(portrait),
  // Schlossmarkt: Marktbogen und die Stände links und rechts der Prachtstraße
  ...dayNight('schlossmarkt', [0.5, 78, -4], [0, 66, -31], {
    radius: 60,
    centre: [0, 66, -31],
    fog: NEAR_FOG,
  }),
];
