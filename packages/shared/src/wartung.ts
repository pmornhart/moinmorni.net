/**
 * Wartungs-Lobby: ein kleiner Paper-Server „Wartung“, den das Netzwerk selbst anlegt (immer an, schläft nie). Dort
 * wartet, wer gerade nicht in die Lobby kann (Neustart, Update, Absturz) oder während der Wartung des Netzwerks nicht
 * hinein darf. Sie ist immer die zweite Wahl nach der Lobby – nie geht es weiter auf Bau-Server oder Modi.
 */

/** Name des Servers im Netzwerk (Velocity). */
export const WARTUNG_SERVER = 'wartung';
/** Arbeitsspeicher der Wartungs-Lobby: eine kleine Welt, wenige Wesen – 768 MB reichen. */
export const WARTUNG_MEMORY_MB = 768;
/** Countdown, bevor die Wartenden automatisch zurück in die Lobby kommen. */
export const WARTUNG_RETURN_SECONDS = 10;

/**
 * Angekündigte Wartung (`/wartung an 10m Grund`, `/wartung neustart 10m Grund`, Panel → Netzwerk → Wartung): erst ein
 * Countdown für alle – großer Titel, Chat, Leiste oben –, dann Wartung an bzw. alle in die Wartungs-Lobby und alle
 * Server neu starten (apps/server/src/hub/wartung-plan.ts).
 */

/** Länger als sechs Stunden lässt sich nichts ankündigen. */
export const WARTUNG_ANNOUNCE_MAX_SECONDS = 6 * 3600;
/** Grund: so lang wie der Wartungs-Text im Panel. */
export const WARTUNG_REASON_MAX = 120;

/** Was angekündigt ist: Wartung einschalten oder Wartungs-Neustart (alle in die Wartungs-Lobby, alles neu starten). */
export type WartungPlanKind = 'on' | 'restart';

/** Stand für Panel und `/wartung status`. */
export interface WartungPlanView {
  /** Wartung des Netzwerks gerade an? */
  readonly maintenance: boolean;
  /** Angekündigt (Countdown läuft) bzw. Neustart läuft gerade – sonst null. */
  readonly plan: {
    readonly kind: WartungPlanKind;
    readonly phase: 'announce' | 'restarting';
    readonly reason: string;
    /** Wann der Countdown endet (ISO); in der Phase „restarting“ null. */
    readonly at: string | null;
    readonly seconds: number;
    /** Auch der Proxy startet neu (alle fliegen kurz raus). */
    readonly proxy: boolean;
    readonly by: string;
    /** Wie weit der Neustart ist (nur in der Phase „restarting“). */
    readonly progress: { readonly done: number; readonly total: number } | null;
  } | null;
  /** Kann MoinMorni gerade neu starten (Motor da)? Ohne: nur Wartung an/aus. */
  readonly canRestart: boolean;
}

// Zeit wie „30s“, „10m“, „10min“, „1h“, „1h30m“, „90“ (Sekunden) – Einheiten auch deutsch/englisch ausgeschrieben.
// https://regex101.com/?flavor=javascript&regex=%5E(%3F%3A(%5Cd%2B)%5Cs*(h%7Cstd%7Cstunden%3F%7Chours%3F)%5Cs*)%3F(%3F%3A(%5Cd%2B)%5Cs*(m%7Cmin%7Cminuten%3F%7Cminutes%3F)%5Cs*)%3F(%3F%3A(%5Cd%2B)%5Cs*(s%7Csek%7Csec%7Csekunden%3F%7Cseconds%3F)%3F)%3F%24&testString=1h30m
const DURATION =
  /^(?:(\d+)\s*(h|std|stunden?|hours?)\s*)?(?:(\d+)\s*(m|min|minuten?|minutes?)\s*)?(?:(\d+)\s*(s|sek|sec|sekunden?|seconds?)?)?$/;
const HOUR = 3600;
const MINUTE = 60;
const HALF_MINUTE = 30;

/**
 * Zeit eines Countdowns in Sekunden; null = keine Zeit (passt nicht oder 0). „0“ und „sofort“/„now“ = 0 (gleich).
 * Mehr als sechs Stunden: null.
 */
export function parseCountdown(value: string | undefined): number | null {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'sofort' || v === 'now' || v === 'jetzt' || v === '0') return 0;
  const m = DURATION.exec(v);
  if (!v || !m || !(m[1] ?? m[3] ?? m[5])) return null;
  const s = Number(m[1] ?? 0) * HOUR + Number(m[3] ?? 0) * MINUTE + Number(m[5] ?? 0);
  return s > 0 && s <= WARTUNG_ANNOUNCE_MAX_SECONDS ? s : null;
}

/** Sekunden lesbar: „10 Minuten“, „1 Stunde 5 Minuten“, „30 Sekunden“ (de) bzw. „10 minutes“ (en). */
export function countdownWords(seconds: number, lang: 'de' | 'en'): string {
  const h = Math.floor(seconds / HOUR);
  const m = Math.floor((seconds % HOUR) / MINUTE);
  const s = seconds % MINUTE;
  const word = (n: number, de: [string, string], en: [string, string]): string =>
    `${n} ${(lang === 'de' ? de : en)[n === 1 ? 0 : 1]}`;
  const parts = [
    h ? word(h, ['Stunde', 'Stunden'], ['hour', 'hours']) : '',
    m ? word(m, ['Minute', 'Minuten'], ['minute', 'minutes']) : '',
    s || (!h && !m) ? word(s, ['Sekunde', 'Sekunden'], ['second', 'seconds']) : '',
  ].filter(Boolean);
  return parts.join(' ');
}

/** Zeiten zur Auswahl im Panel (Sekunden); 0 = sofort. */
export const WARTUNG_TIME_CHOICES: readonly number[] = [
  0,
  HALF_MINUTE,
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
];
/** Vorgabe im Panel: fünf Minuten Vorwarnung. */
export const WARTUNG_TIME_DEFAULT = 5 * MINUTE;
