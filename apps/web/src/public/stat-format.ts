import { DUELS_KITS } from '@moinmorni/shared';
import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE } from '~/i18n';
import { pick, useLanguage } from '~/lib/text';

/** Numbers and values of the game modes, the same everywhere on the website (profile, leaderboards, mode pages). */

export const NUMBER_LOCALE = { de: 'de-DE', en: 'en-GB' } as const;
/** `/statistiken?modus=duels` opens the leaderboard of that mode. */
export const MODE_PARAM = 'modus';
/** Gold, silver and bronze for places 1 to 3 (face and darker edge). */
export const PLACE_COLOURS = [
  { face: '#f6c544', edge: '#a87708' },
  { face: '#cfd8df', edge: '#7c8b96' },
  { face: '#d9904f', edge: '#8a4f1f' },
] as const;
/** Values whose name ends like this are times in milliseconds (best times of a course, a round …). */
export const TIME_SUFFIX = '_ms';
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MS_DIGITS = 3;
const TWO_DIGITS = 2;

/** "1:23,456" (or "23,456 s" under a minute) for a time in milliseconds. */
export function formatTime(ms: number, locale: string): string {
  const minutes = Math.floor(ms / (MS_PER_SECOND * SECONDS_PER_MINUTE));
  const seconds = (ms / MS_PER_SECOND) % SECONDS_PER_MINUTE;
  const digits = { minimumFractionDigits: MS_DIGITS, maximumFractionDigits: MS_DIGITS };
  if (!minutes) return `${new Intl.NumberFormat(locale, digits).format(seconds)} s`;
  const padded = new Intl.NumberFormat(locale, { ...digits, minimumIntegerDigits: TWO_DIGITS }).format(
    seconds,
  );
  return `${minutes}:${padded}`;
}

/** A value's own name when there is no text for it: "best_streak" → "Best streak". */
export function readable(key: string): string {
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Best time of a course or event: "time_almrundflug_ms" → "almrundflug"; not "best_time_ms" or "time_ms".
 * https://regex101.com/?flavor=javascript&regex=%5Etime_(%5Ba-z0-9%5D%5Ba-z0-9_%5D*)_ms%24&testString=time_almrundflug_ms
 */
const TIME_OF = /^time_([a-z0-9][a-z0-9_]*)_ms$/;
/**
 * A value of one fighting style, game type or course: "wins_sumo" → wins + sumo, "elo_bruecke" → elo + bruecke,
 * "finishes_klammflug" → finishes + klammflug; not "wins" or "best_streak".
 * https://regex101.com/?flavor=javascript&regex=%5E(games%7Cwins%7Closses%7Cdraws%7Celo%7Cfinishes)_(%5Ba-z0-9%5D%5Ba-z0-9_%5D*)%24&testString=elo_bruecke
 */
const KIND_OF = /^(games|wins|losses|draws|elo|finishes)_([a-z0-9][a-z0-9_]*)$/;
/** Kind of a best time: its column is called like the value "best_ms" ("Bestzeit"). */
const TIME_KIND = 'best_ms';

/** One value split into what it counts and what it belongs to ("wins_sumo" → wins of Sumo). */
export interface StatPart {
  readonly kind: string;
  readonly subject: string;
}

/** "wins_sumo" → { kind: "wins", subject: "sumo" }, "time_klammflug_ms" → best time of Klammflug; else null. */
export function statPart(key: string): StatPart | null {
  const time = TIME_OF.exec(key);
  if (time?.[1]) return { kind: TIME_KIND, subject: time[1] };
  const kind = KIND_OF.exec(key);
  return kind?.[1] && kind[2] ? { kind: kind[1], subject: kind[2] } : null;
}

/** Name of a value ("Siege") and the value itself ("1.234", "1:07,729") in the reader's language. */
export function useStatText(): {
  /** Name of a value; with the mode, its own words win ("Kämpfe" in Duels instead of "Runden"). */
  readonly label: (key: string, mode?: string) => string;
  /** Name of what a value belongs to: a fighting style, game type or course ("Brücke", "Klammflug"). */
  readonly subject: (id: string) => string;
  /** Has the value its own name (then it is not split into kind and subject, e.g. "wins_hider")? */
  readonly named: (key: string, mode?: string) => boolean;
  readonly value: (key: string, value: number) => string;
} {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const locale = NUMBER_LOCALE[language];
  const number = new Intl.NumberFormat(locale);
  // Own words of the mode first ("site.players.statsIn.duels.games"), then the general ones.
  const own = (key: string, mode?: string, what = ''): string => {
    const options = { defaultValue: '', what, course: what };
    return (
      (mode ? t(`site.players.statsIn.${mode}.${key}`, options) : '') ||
      t(`site.players.stats.${key}`, options)
    );
  };
  const subject = (id: string): string => {
    const kit = DUELS_KITS.find((k) => k.id === id);
    if (kit) return pick(kit.name, language);
    return t(`site.players.courses.${id}`, { defaultValue: readable(id) });
  };
  const label = (key: string, mode?: string): string => {
    const named = own(key, mode);
    if (named) return named;
    const part = statPart(key);
    if (!part) return readable(key);
    const kind = part.kind === TIME_KIND ? 'time' : part.kind;
    return own(`${kind}Of`, mode, subject(part.subject)) || readable(key);
  };
  return {
    label,
    subject,
    named: (key, mode) => Boolean(own(key, mode)),
    value: (key, value) => (key.endsWith(TIME_SUFFIX) ? formatTime(value, locale) : number.format(value)),
  };
}
