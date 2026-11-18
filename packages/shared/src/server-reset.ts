/**
 * Panel → „Server zurücksetzen“ (apps/server/src/panel/reset-routes.ts, nur Owner): Welt und/oder Spielstand eines
 * Servers (oder aller zusammen) löschen. Vorher legt der Motor immer eine Sicherung an. Ränge, Strafen, Einstellungen,
 * Team und die Einstellungen der Plugins bleiben.
 */

/** Welt neu (Lobby und Wartungs-Lobby bauen sich danach selbst), Spielstand (Statistiken, Spielerdaten) oder beides. */
export type ResetWhat = 'world' | 'progress' | 'both';
export const RESET_WHATS: readonly ResetWhat[] = ['world', 'progress', 'both'];

/** Bestätigung für mehrere Server auf einmal. */
export const RESET_ALL_WORD = 'ALLE';

export interface ResetServerView {
  readonly member: string;
  readonly kind: 'lobby' | 'wartung' | 'build' | 'mode';
  readonly name: { readonly de: string; readonly en: string };
  readonly modeId: string | null;
  readonly running: boolean;
}

export type ResetStep = 'backup' | 'waiting' | 'wiping' | 'done' | 'failed';

export interface ResetOverview {
  readonly servers: readonly ResetServerView[];
  readonly progress: {
    readonly running: boolean;
    readonly servers: ReadonlyArray<{
      readonly member: string;
      readonly step: ResetStep;
      readonly error?: string;
    }>;
  };
}

/** Bestätigung: bei einem Server dessen Name (de oder en, ohne Groß/Klein), bei mehreren „ALLE“. */
export function resetConfirmOk(
  typed: string,
  picked: ReadonlyArray<{ readonly name: { readonly de: string; readonly en: string } }>,
): boolean {
  const t = typed.trim().toLowerCase();
  if (!t || picked.length === 0) return false;
  if (picked.length > 1) return t === RESET_ALL_WORD.toLowerCase();
  const one = picked[0]!;
  return t === one.name.de.toLowerCase() || t === one.name.en.toLowerCase();
}
