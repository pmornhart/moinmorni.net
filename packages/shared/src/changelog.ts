/**
 * „Was ist neu“: die Versionsanzeige unten in der Mitte von Webseite und Panel und das Fenster mit den Änderungen
 * (apps/server/src/system/changelog.ts, `GET /api/public/changelog`).
 *
 * Versionsnummern zählen die Updates auf dem Branch, eine Ziffer pro Stelle (wie `mm_version` in update.sh und
 * install.sh): Update 188 ist „v1.8.8“, nach „v0.0.9“ kommt „v0.1.0“.
 */

/** Arten von Änderungen, in der Reihenfolge, in der sie angezeigt werden. */
export const CHANGE_KINDS = ['new', 'improved', 'fixed', 'removed', 'other'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export interface ChangeItem {
  readonly kind: ChangeKind;
  readonly text: string;
}

/** Eine Version mit ihren Änderungen. */
export interface ChangelogVersion {
  /** z. B. „v1.8.8“ */
  readonly version: string;
  /** Laufende Nummer (188). */
  readonly count: number;
  /** Kurzer Commit (7 Zeichen). */
  readonly sha: string;
  /** Wann sie auf den Branch kam (ISO), null = unbekannt. */
  readonly date: string | null;
  readonly items: readonly ChangeItem[];
  /** So viele Änderungen mehr gab es, die Liste zeigt nur die ersten. */
  readonly more: number;
}

/** Was jeder sehen darf: installierte Version, ihre Geschichte und ob eine neue bereitsteht (keine Interna). */
export interface PublicChangelog {
  /** Installierte Version, z. B. „v1.8.8“ – „dev“ ohne Nummer (Entwicklung). */
  readonly version: string;
  /** Neueste zuerst, die installierte oben. Leer, wenn es beim Bauen keine Liste gab. */
  readonly versions: readonly ChangelogVersion[];
  readonly update: {
    readonly available: boolean;
    /** Nummer der neuen Version, null = steht noch nicht fest. */
    readonly version: string | null;
  };
}

const DIGIT_BASE = 10;
// Versionsnummer: "v1.8.8" passt (auch "v1.8.8-0-gabc1234"), "dev" und "1.8.8" nicht.
// https://regex101.com/?flavor=javascript&regex=%5Ev(%5Cd%2B)%5C.(%5Cd)%5C.(%5Cd)(%3F%3A-%7C%24)&testString=v1.8.8-0-gabc1234
const VERSION = /^v(\d+)\.(\d)\.(\d)(?:-|$)/;

/** „v1.8.8“ aus der Anzahl der Updates (188). */
export function versionFromCount(count: number): string {
  const patch = count % DIGIT_BASE;
  const minor = Math.floor(count / DIGIT_BASE) % DIGIT_BASE;
  const major = Math.floor(count / (DIGIT_BASE * DIGIT_BASE));
  return `v${major}.${minor}.${patch}`;
}

/** Anzahl der Updates aus der Versionsnummer („v1.8.8“ oder „v1.8.8-0-gabc1234“ → 188), sonst null. */
export function countOfVersion(version: string): number | null {
  const m = VERSION.exec(version);
  if (!m) return null;
  return Number(m[1]) * DIGIT_BASE * DIGIT_BASE + Number(m[2]) * DIGIT_BASE + Number(m[3]);
}
