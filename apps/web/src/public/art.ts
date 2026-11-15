import type { ResolvedTheme } from '~/lib/theme';
import type { NewsCategory } from '~/lib/site';

/**
 * Our own 3D renders of the lobby (own textures and skins, never Mojang files), in apps/web/public/bilder/. Every
 * path is written out exactly once here: the demo build swaps these strings for embedded pictures.
 */
const IMAGES = {
  heroDay: '/bilder/hero-tag.webp',
  heroNight: '/bilder/hero-nacht.webp',
  heroTallDay: '/bilder/hero-hoch-tag.webp',
  heroTallNight: '/bilder/hero-hoch-nacht.webp',
  dorfplatzDay: '/bilder/dorfplatz-tag.webp',
  dorfplatzNight: '/bilder/dorfplatz-nacht.webp',
  marktstaendeDay: '/bilder/marktstaende-tag.webp',
  marktstaendeNight: '/bilder/marktstaende-nacht.webp',
  standDay: '/bilder/stand-tag.webp',
  standNight: '/bilder/stand-nacht.webp',
  biergartenDay: '/bilder/biergarten-tag.webp',
  biergartenNight: '/bilder/biergarten-nacht.webp',
  gasseDay: '/bilder/handwerkergasse-tag.webp',
  gasseNight: '/bilder/handwerkergasse-nacht.webp',
  schlossDay: '/bilder/schloss-tag.webp',
  schlossNight: '/bilder/schloss-nacht.webp',
  karte: '/bilder/karte.webp',
  group: '/bilder/gruppe.webp',
  figureMornicraft: '/bilder/figur-mornicraft.webp',
  figureDuels: '/bilder/figur-duels.webp',
  figureParty: '/bilder/figur-party.webp',
  figureGipfelsturm: '/bilder/figur-gipfelsturm.webp',
  figureBurgverlies: '/bilder/figur-burgverlies.webp',
  figureBollwerk: '/bilder/figur-bollwerk.webp',
  figureMirni: '/bilder/figur-mirni.webp',
} as const;

export const GROUP_IMAGE = IMAGES.group;

export function heroImage(theme: ResolvedTheme, tall: boolean): string {
  if (tall) return theme === 'dark' ? IMAGES.heroTallNight : IMAGES.heroTallDay;
  return theme === 'dark' ? IMAGES.heroNight : IMAGES.heroDay;
}

/** Places in the village we have pictures of (day and night; the map is the same at both times). */
const SCENES = [
  'dorfplatz',
  'marktstaende',
  'stand',
  'biergarten',
  'handwerkergasse',
  'schloss',
  'karte',
] as const;
export type Scene = (typeof SCENES)[number];

const SCENE_IMAGES: Readonly<Record<Scene, { readonly day: string; readonly night: string }>> = {
  dorfplatz: { day: IMAGES.dorfplatzDay, night: IMAGES.dorfplatzNight },
  marktstaende: { day: IMAGES.marktstaendeDay, night: IMAGES.marktstaendeNight },
  stand: { day: IMAGES.standDay, night: IMAGES.standNight },
  biergarten: { day: IMAGES.biergartenDay, night: IMAGES.biergartenNight },
  handwerkergasse: { day: IMAGES.gasseDay, night: IMAGES.gasseNight },
  schloss: { day: IMAGES.schlossDay, night: IMAGES.schlossNight },
  karte: { day: IMAGES.karte, night: IMAGES.karte },
};

export type DayTime = 'day' | 'night';

export function timeOf(theme: ResolvedTheme): DayTime {
  return theme === 'dark' ? 'night' : 'day';
}

export function sceneImage(scene: Scene, time: DayTime): string {
  return SCENE_IMAGES[scene][time];
}

/** How a game mode looks: its figure from the lobby, two colours and a place in the village. */
export interface ModeArt {
  readonly figure: string | null;
  /** Bright colour (light, buttons, bars). */
  readonly a: string;
  /** Deep colour (bottom of gradients). */
  readonly b: string;
  readonly scene: Scene;
}

const MODE_ART: Readonly<Record<string, ModeArt>> = {
  mornicraft: { figure: IMAGES.figureMornicraft, a: '#6cc644', b: '#1d5418', scene: 'schloss' },
  duels: { figure: IMAGES.figureDuels, a: '#ef4b3f', b: '#5c1210', scene: 'stand' },
  party: { figure: IMAGES.figureParty, a: '#ffc93c', b: '#c2387f', scene: 'marktstaende' },
  gipfelsturm: { figure: IMAGES.figureGipfelsturm, a: '#4cb4f0', b: '#163f8a', scene: 'schloss' },
  burgverlies: { figure: IMAGES.figureBurgverlies, a: '#a660f2', b: '#2e1263', scene: 'handwerkergasse' },
  bollwerk: { figure: IMAGES.figureBollwerk, a: '#ff9a2e', b: '#7a2405', scene: 'dorfplatz' },
  mirni: { figure: IMAGES.figureMirni, a: '#9fb0ba', b: '#2f3b42', scene: 'biergarten' },
};

/** Modes Philip adds later have no figure yet: emerald and the market. */
const FALLBACK_ART: ModeArt = { figure: null, a: '#2fd27a', b: '#0b4d2c', scene: 'marktstaende' };

export function modeArt(id: string): ModeArt {
  return MODE_ART[id] ?? FALLBACK_ART;
}

/** The figures in the order they stand in the lobby (shown while the live list is loading). */
export const KNOWN_MODES = Object.keys(MODE_ART);

/** Pictures for news posts: each kind of post has its own places; the post's address picks one. */
const NEWS_SCENES: Readonly<Record<NewsCategory, readonly Scene[]>> = {
  update: ['marktstaende', 'handwerkergasse', 'schloss', 'stand', 'karte'],
  event: ['biergarten', 'dorfplatz', 'stand', 'marktstaende', 'schloss'],
  info: ['dorfplatz', 'karte', 'schloss', 'handwerkergasse', 'biergarten'],
};

const FNV_PRIME = 16_777_619;
const FNV_OFFSET = 2_166_136_261;

/** A small, stable number from a text (FNV-1a). */
function hash(text: string): number {
  return Array.from(text).reduce(
    (h, c) => Math.imul(h ^ (c.codePointAt(0) ?? 0), FNV_PRIME) >>> 0,
    FNV_OFFSET,
  );
}

/** Size of the range of `hash` (2³²). */
const HASH_RANGE = 4_294_967_296;

/** A stable "random" number in [0, 1) for a key – the same on every visit (decoration positions). */
export function seededFraction(key: string): number {
  return hash(key) / HASH_RANGE;
}

export function newsScene(category: NewsCategory, slug: string): Scene {
  const pool = NEWS_SCENES[category];
  return pool[hash(slug) % pool.length] ?? 'dorfplatz';
}
