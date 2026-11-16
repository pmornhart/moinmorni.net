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

/**
 * Best time of a course or event: "time_almrundflug_ms" → "almrundflug"; not "best_time_ms" or "time_ms".
 * https://regex101.com/?flavor=javascript&regex=%5Etime_(%5Ba-z0-9%5D%5Ba-z0-9_%5D*)_ms%24&testString=time_almrundflug_ms
 */
const TIME_OF = /^time_([a-z0-9][a-z0-9_]*)_ms$/;
/**
 * Finishes of one course: "finishes_klammflug" → "klammflug"; not "finishes".
 * https://regex101.com/?flavor=javascript&regex=%5Efinishes_(%5Ba-z0-9_%5D%2B)%24&testString=finishes_klammflug
 */
const FINISHES_OF = /^finishes_([a-z0-9_]+)$/;

/** Name of a value ("Siege") and the value itself ("1.234", "1:07,729") in the reader's language. */
export function useStatText(): {
  readonly label: (key: string) => string;
  readonly value: (key: string, value: number) => string;
} {
  const { t } = useTranslation(MM_NAMESPACE);
  const locale = NUMBER_LOCALE[useLanguage()];
  const number = new Intl.NumberFormat(locale);
  const course = (id: string): string => t(`site.players.courses.${id}`, { defaultValue: readable(id) });
  const label = (key: string): string => {
    const own = t(`site.players.stats.${key}`, { defaultValue: '' });
    if (own) return own;
    const time = TIME_OF.exec(key);
    if (time?.[1]) return t('site.players.stats.timeOf', { course: course(time[1]) });
    const finishes = FINISHES_OF.exec(key);
    if (finishes?.[1]) return t('site.players.stats.finishesOf', { course: course(finishes[1]) });
    return readable(key);
  };
  return {
    label,
    value: (key, value) => (key.endsWith(TIME_SUFFIX) ? formatTime(value, locale) : number.format(value)),
  };
}
