import { DUELS_KITS } from './mode-settings.js';

/**
 * Werte, die die Spielmodi an die Statistik des Netzwerks melden (`stats(modus, …)` in den Modus-Repos, Stand 17.11.)
 * – damit Webseite, Profil und Bestenlisten für jeden einen Namen haben. Ein Test prüft, dass jeder hier genannte Wert
 * auf Deutsch und Englisch einen Namen hat. Meldet ein Modus etwas Neues: hier eintragen und Texte unter
 * `site.players.stats` (für alle) oder `site.players.statsIn.<modus>` (nur dort) anlegen.
 */

/** Spielarten von Morni Party (`games_<spielart>`, `wins_<spielart>`; Bindestrich wird Unterstrich). */
export const PARTY_GAME_TYPES = [
  'gipfelrennen',
  'edelweiss_jagd',
  'marathon',
  'seilschaft',
  'schnell',
  'bergduell',
  'huette',
  'turnier',
  'tatzelwurm',
] as const;
/** Strecken von Gipfelsturm (`finishes_<strecke>`, `time_<strecke>_ms`). */
export const GIPFELSTURM_COURSES = [
  'almwiese',
  'gletscher',
  'kletterwand',
  'felsgrat',
  'seilbahn',
  'eishoehle',
  'gipfelkreuz',
  'wetterturm',
] as const;
/** Strecken von Adlerflug; die Strecke des Tages (`tagesflug`) hat nur Ziele, keine Bestzeit (jeden Tag anders). */
export const ADLERFLUG_COURSES = [
  'almrundflug',
  'klammflug',
  'burgruine',
  'gletscherspalte',
  'stollenflug',
  'gipfelkreuz',
  'felsenlabyrinth',
  'hoellenschlund',
] as const;
const ADLERFLUG_DAILY = 'tagesflug';
/** Disziplinen von Wintersport (`time_<disziplin>_ms`). */
export const WINTERSPORT_DISCIPLINES = ['slalom', 'biathlon', 'bob'] as const;
/** Disziplinen der Sommerspiele mit Bestzeit (`time_<disziplin>_ms`; Bogenschießen zählt Ringe: `bogen_best`). */
export const SOMMERSPIELE_DISCIPLINES = ['almlauf', 'regatta', 'seifenkiste'] as const;
/** Spielarten von Baumeister (`games_<spielart>`). */
export const BAUMEISTER_GAME_TYPES = ['klassisch', 'schnell', 'paare'] as const;

const each = (ids: readonly string[], ...kinds: readonly string[]): string[] =>
  ids.flatMap((id) => kinds.map((kind) => `${kind}_${id}`));
const timesOf = (ids: readonly string[]): string[] => ids.map((id) => `time_${id}_ms`);
const KIT_IDS = DUELS_KITS.map((k) => k.id);

/** Je Modus alle Werte, die er meldet (Lobby = Jump and Run des Netzwerk-Plugins). */
export const MODE_STAT_KEYS: Readonly<Record<string, readonly string[]>> = {
  lobby: ['jump_best', 'jump_runs', 'jumps'],
  duels: [
    'games',
    'wins',
    'losses',
    'draws',
    'kills',
    'deaths',
    'ranked_games',
    'ranked_wins',
    'hits_boxen',
    'goals_bruecke',
    'goals_labyrinth',
    'rounds_won',
    'party_games',
    'party_wins',
    'streak_best',
    ...each(KIT_IDS, 'games', 'wins', 'losses', 'draws', 'elo'),
  ],
  party: [
    'games',
    'wins',
    'edelweiss',
    'minigames_won',
    'summits',
    'edelweiss_best',
    'marathon_points_best',
    'huette_lives_best',
    'turnier_matches_best',
    'tatzelwurm_stars_best',
    ...each(PARTY_GAME_TYPES, 'games', 'wins'),
  ],
  gipfelsturm: [
    'attempts',
    'falls',
    'finishes',
    ...each(GIPFELSTURM_COURSES, 'finishes'),
    ...timesOf(GIPFELSTURM_COURSES),
  ],
  burgverlies: ['runs', 'wins', 'bosses', 'rooms', 'best_time_ms', 'best_score'],
  bollwerk: ['games', 'kills', 'waves', 'revives', 'best_wave'],
  mirni: ['sales', 'purchases', 'orders_filled', 'playtime_min', 'balance'],
  wolkenkampf: ['games', 'wins', 'kills', 'deaths', 'chests', 'best_kills'],
  versteckerl: [
    'games',
    'wins_hider',
    'wins_seeker',
    'found',
    'survived',
    'whistles',
    'points',
    'earned',
    'bonus',
    'helps',
    'best_points',
    'best_streak',
    'unlocks',
    'spent',
  ],
  wintersport: [
    'races',
    'points',
    'gold',
    'silver',
    'bronze',
    'biathlon_hits',
    'biathlon_shots',
    'events',
    'wins',
    'best_points',
    ...timesOf(WINTERSPORT_DISCIPLINES),
  ],
  adlerflug: [
    'flights',
    'finishes',
    'days',
    'medals',
    'eagles',
    'golden_eagles',
    'rings',
    'resets',
    'bonus_rings',
    ...each([...ADLERFLUG_COURSES, ADLERFLUG_DAILY], 'finishes'),
    ...timesOf(ADLERFLUG_COURSES),
  ],
  angelkoenig: ['catches', 'legendary', 'tournaments_won', 'heaviest_g', 'species'],
  maibaumklau: [
    'games',
    'wins',
    'draws',
    'tags',
    'saves',
    'lifts',
    'captures',
    'carried',
    'points',
    'best_points',
  ],
  dorfkrimi: [
    'games',
    'wins',
    'wins_wilderer',
    'wins_gendarm',
    'arrests',
    'stuns',
    'clues',
    'points',
    'best_points',
  ],
  baumeister: [
    'games',
    'wins',
    'podiums',
    'points',
    'votes_given',
    'masterworks',
    'blocks',
    'best_score',
    'best_points',
    ...each(BAUMEISTER_GAME_TYPES, 'games'),
  ],
  sommerspiele: [
    'events',
    'wins',
    'races',
    'points',
    'gold',
    'silver',
    'bronze',
    'bogen_rings',
    'bogen_centres',
    'kiste_crashes',
    'best_points',
    'bogen_best',
    ...timesOf(SOMMERSPIELE_DISCIPLINES),
  ],
};

/**
 * Bestzeit einer Strecke: "time_almrundflug_ms" → "almrundflug"; nicht "best_time_ms" oder "time_ms".
 * https://regex101.com/?flavor=javascript&regex=%5Etime_(%5Ba-z0-9%5D%5Ba-z0-9_%5D*)_ms%24&testString=time_almrundflug_ms
 */
const TIME_OF = /^time_([a-z0-9][a-z0-9_]*)_ms$/;
/**
 * Wert einer Kampfart, Spielart oder Strecke: "wins_sumo" → wins + sumo, "elo_bruecke" → elo + bruecke,
 * "finishes_klammflug" → finishes + klammflug; nicht "wins" oder "best_streak".
 * https://regex101.com/?flavor=javascript&regex=%5E(games%7Cwins%7Closses%7Cdraws%7Celo%7Cfinishes)_(%5Ba-z0-9%5D%5Ba-z0-9_%5D*)%24&testString=elo_bruecke
 */
const KIND_OF = /^(games|wins|losses|draws|elo|finishes)_([a-z0-9][a-z0-9_]*)$/;
/** Art einer Bestzeit: ihre Spalte heißt wie der Wert "best_ms" („Bestzeit“). */
export const STAT_TIME_KIND = 'best_ms';

/** Ein Wert, zerlegt in das, was er zählt, und wozu er gehört ("wins_sumo" → Siege in Sumo). */
export interface StatPart {
  readonly kind: string;
  readonly subject: string;
}

/** "wins_sumo" → { kind: "wins", subject: "sumo" }, "time_klammflug_ms" → Bestzeit Klammflug; sonst null. */
export function statPart(key: string): StatPart | null {
  const time = TIME_OF.exec(key);
  if (time?.[1]) return { kind: STAT_TIME_KIND, subject: time[1] };
  const kind = KIND_OF.exec(key);
  return kind?.[1] && kind[2] ? { kind: kind[1], subject: kind[2] } : null;
}

/** Text der Webseite nachschlagen: '' = gibt es nicht; `what` wird in `{{what}}`/`{{course}}` eingesetzt. */
export type StatTextLookup = (i18nKey: string, what?: string) => string;

const STATS = 'site.players.stats';
const STATS_IN = 'site.players.statsIn';
const COURSES = 'site.players.courses';
const COURSES_IN = 'site.players.coursesIn';

/** Eigene Wörter des Modus zuerst („Kämpfe“ in Duels statt „Runden“), dann die allgemeinen. */
function own(text: StatTextLookup, key: string, mode: string | undefined, what?: string): string {
  return (mode ? text(`${STATS_IN}.${mode}.${key}`, what) : '') || text(`${STATS}.${key}`, what);
}

/** Hat der Wert einen eigenen Namen (dann wird er nicht in Art und Gegenstand zerlegt, z. B. "wins_hider")? */
export function statHasOwnName(text: StatTextLookup, key: string, mode?: string): boolean {
  return Boolean(own(text, key, mode));
}

/**
 * Name einer Kampfart, Spielart, Strecke oder Disziplin ("sumo", "klammflug", "edelweiss_jagd"); '' = keiner.
 * Kampfarten von Duels stehen im Katalog (`DUELS_KITS`), der Rest bei der Webseite – je Modus zuerst
 * (`coursesIn.gipfelsturm.gipfelkreuz` ≠ Adlerflugs Gipfelkreuz).
 */
export function statSubjectName(
  text: StatTextLookup,
  id: string,
  mode: string | undefined,
  language: 'de' | 'en',
): string {
  const kit = DUELS_KITS.find((k) => k.id === id);
  if (kit) return kit.name[language];
  return (mode ? text(`${COURSES_IN}.${mode}.${id}`) : '') || text(`${COURSES}.${id}`);
}

/** Name eines Werts ("Siege", "Bestzeit Klammflug", "Kämpfe Sumo"); '' = keiner (dann zeigt die Webseite den Schlüssel). */
export function statName(
  text: StatTextLookup,
  key: string,
  mode: string | undefined,
  language: 'de' | 'en',
): string {
  const named = own(text, key, mode);
  if (named) return named;
  const part = statPart(key);
  if (!part) return '';
  const subject = statSubjectName(text, part.subject, mode, language);
  if (!subject) return '';
  const kind = part.kind === STAT_TIME_KIND ? 'time' : part.kind;
  return own(text, `${kind}Of`, mode, subject);
}
