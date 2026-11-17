/**
 * Panel → „Server neu starten“ (apps/server/src/panel/restart-routes.ts): Server des Netzwerks mit Countdown neu
 * starten – nacheinander, Lobby und Proxy zuletzt. Die Wartungs-Lobby ist nie dabei: Sie nimmt die Spieler der Lobby
 * auf, solange die neu startet.
 */

/** Was ein Server im Netzwerk ist. */
export type RestartKind = 'proxy' | 'lobby' | 'build' | 'mode';

/** Zustand eines Servers: läuft, startet gerade, schläft (Netzwerk hat ihn schlafen geschickt), aus. */
export type RestartServerState = 'running' | 'starting' | 'sleeping' | 'stopped';

/** Wie weit ein Server in der laufenden bzw. letzten Runde ist. */
export type RestartStepView = 'waiting' | 'countdown' | 'restarting' | 'done' | 'failed' | 'skipped';

export interface RestartServerView {
  /** Name im Netzwerk („lobby“, „duels“, „proxy“). */
  readonly member: string;
  readonly kind: RestartKind;
  readonly name: { readonly de: string; readonly en: string };
  /** Spielmodus (für das Symbol), sonst null. */
  readonly modeId: string | null;
  readonly state: RestartServerState;
  readonly players: number;
}

export interface RestartOverview {
  readonly servers: readonly RestartServerView[];
  /** Countdown in Sekunden (Einstellungen → Updates → Countdown vor dem Neustart). */
  readonly countdown: number;
  readonly progress: {
    readonly running: boolean;
    readonly servers: ReadonlyArray<{ readonly member: string; readonly step: RestartStepView }>;
  };
}

export interface RestartRequestResult {
  /** Diese Server starten neu. */
  readonly started: readonly string[];
  /** Diese laufen nicht (schlafen, aus) – sie holen sich nichts ab, der nächste Start ist ohnehin frisch. */
  readonly skipped: readonly string[];
  /** Lief schon eine Runde? Dann kommen die neuen gleich danach dran. */
  readonly queued: boolean;
}
