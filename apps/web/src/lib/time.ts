import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE, type Language } from '~/i18n';
import { useLanguage } from './text';

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;
const HOUR_MS = MINUTES_PER_HOUR * MINUTE_MS;
const DAY_MS = HOURS_PER_DAY * HOUR_MS;
const WEEK_MS = DAYS_PER_WEEK * DAY_MS;
const MONTH_MS = DAYS_PER_MONTH * DAY_MS;
const YEAR_MS = DAYS_PER_YEAR * DAY_MS;

export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
export const MINUTES_PER_WEEK = MINUTES_PER_DAY * DAYS_PER_WEEK;
export { MINUTES_PER_HOUR };

/** Biggest unit first: "vor 3 Tagen" instead of "vor 4320 Minuten". */
const RELATIVE_STEPS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', YEAR_MS],
  ['month', MONTH_MS],
  ['week', WEEK_MS],
  ['day', DAY_MS],
  ['hour', HOUR_MS],
  ['minute', MINUTE_MS],
];

const LOCALES: Readonly<Record<Language, string>> = { de: 'de-DE', en: 'en-GB' };

/** "vor 3 Stunden" / "in 2 Tagen"; null below one minute (the caller says "gerade eben"). */
export function relativeTime(iso: string, language: Language, now: number = Date.now()): string | null {
  const diff = new Date(iso).getTime() - now;
  const step = RELATIVE_STEPS.find(([, size]) => Math.abs(diff) >= size);
  if (!step) return null;
  const [unit, size] = step;
  return new Intl.RelativeTimeFormat(LOCALES[language], { numeric: 'auto' }).format(
    Math.trunc(diff / size),
    unit,
  );
}

/** "14. Nov. 2026, 15:50" */
export function dateTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Name of a language code such as "de", "en_us" or "de-AT" in the language shown. */
export function languageName(code: string, language: Language): string {
  try {
    return (
      new Intl.DisplayNames([LOCALES[language]], { type: 'language' }).of(code.replace('_', '-')) ?? code
    );
  } catch {
    return code;
  }
}

/** Formatting with the panel's current language: relative times, dates, durations and play time. */
export function useTimeText(): {
  readonly relative: (iso: string) => string;
  readonly date: (iso: string) => string;
  readonly duration: (minutes: number) => string;
  readonly playtime: (minutes: number) => string;
} {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  return {
    relative: (iso) => relativeTime(iso, language) ?? t('time.justNow'),
    date: (iso) => dateTime(iso, language),
    // The largest unit that fits evenly: 1440 → "1 Tag", 90 → "90 Minuten".
    duration: (minutes) => {
      if (minutes % MINUTES_PER_DAY === 0) return t('time.days', { count: minutes / MINUTES_PER_DAY });
      if (minutes % MINUTES_PER_HOUR === 0) return t('time.hours', { count: minutes / MINUTES_PER_HOUR });
      return t('time.minutes', { count: minutes });
    },
    playtime: (minutes) => {
      const hours = Math.floor(minutes / MINUTES_PER_HOUR);
      const rest = minutes % MINUTES_PER_HOUR;
      if (!hours) return t('time.playMinutes', { m: rest });
      return rest ? t('time.playBoth', { h: hours, m: rest }) : t('time.playHours', { h: hours });
    },
  };
}
