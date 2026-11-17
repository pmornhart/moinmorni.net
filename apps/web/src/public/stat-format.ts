import { statHasOwnName, statName, statSubjectName, type StatTextLookup } from '@moinmorni/shared';
import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE } from '~/i18n';
import { useLanguage } from '~/lib/text';

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

/** Splitting a value into kind and subject lives in the shared package (also used by the name test there). */
export { statPart, type StatPart } from '@moinmorni/shared';

/** Name of a value ("Siege") and the value itself ("1.234", "1:07,729") in the reader's language. */
export function useStatText(): {
  /** Name of a value; with the mode, its own words win ("Kämpfe" in Duels instead of "Runden"). */
  readonly label: (key: string, mode?: string) => string;
  /** Name of what a value belongs to: a fighting style, game type or course ("Brücke", "Klammflug"). */
  readonly subject: (id: string, mode?: string) => string;
  /** Has the value its own name (then it is not split into kind and subject, e.g. "wins_hider")? */
  readonly named: (key: string, mode?: string) => boolean;
  readonly value: (key: string, value: number) => string;
} {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const locale = NUMBER_LOCALE[language];
  const number = new Intl.NumberFormat(locale);
  const text: StatTextLookup = (key, what = '') => t(key, { defaultValue: '', what, course: what });
  return {
    label: (key, mode) => statName(text, key, mode, language) || readable(key),
    subject: (id, mode) => statSubjectName(text, id, mode, language) || readable(id),
    named: (key, mode) => statHasOwnName(text, key, mode),
    value: (key, value) => (key.endsWith(TIME_SUFFIX) ? formatTime(value, locale) : number.format(value)),
  };
}
