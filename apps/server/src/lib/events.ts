import { EventEmitter } from 'node:events';

/** Ereignisse innerhalb von MoinMorni (z. B. Hub und Bot hören auf geänderte Einstellungen). */
export interface Events {
  'settings.changed': { area: string; values: Record<string, unknown>; by: string };
  'modes.changed': { by: string };
  'roles.changed': { by: string };
  /** Owner-Konto angelegt – jetzt richtet sich das Netzwerk ein. */
  'setup.done': { owner: string };
  /** Strafe verhängt oder aufgehoben (Panel lädt neu, Discord zieht nach). */
  'punishments.changed': {
    uuid: string;
    /** voice = im Sprachchat stumm. */
    kind: 'ban' | 'mute' | 'warn' | 'kick' | 'jail' | 'voice';
    action: 'add' | 'lift';
    until: string | null;
    reason: string;
    by: string;
  };
  /** News veröffentlicht (Discord postet sie in #ankündigungen). */
  'news.published': { slug: string };
  /** Rang oder Name eines Spielers geändert (Discord zieht die Rolle nach). */
  'player.changed': { uuid: string };
  /** Neue Bewerbung – MorniCraft oder Team (Discord postet sie in den Bewerbungs-Eingang). */
  'application.created': { id: number };
  /**
   * Bewerbung entschieden (Discord passt die Nachricht an und sagt es der Person). `account`: bei einer Zusage wurde
   * auch ein Team-Konto fürs Panel angelegt.
   */
  'application.decided': { id: number; account?: boolean };
  /** Ein Spielserver hat sich beim Hub angemeldet (z. B. nach einem Neustart). */
  'server.connected': { server: string };
  /**
   * Einstellungen eines Spielmodus: Muss sein Server neu starten, damit sie gelten (`needed`), oder nicht mehr (alter
   * Wert zurück, Server neu gestartet oder gestoppt)? MoinMorni startet ihn neu, sobald gerade niemand spielt.
   */
  'mode.restart': { mode: string; server: string; needed: boolean };
}

export interface EventBus {
  readonly on: <K extends keyof Events>(name: K, listener: (payload: Events[K]) => void) => () => void;
  readonly emit: <K extends keyof Events>(name: K, payload: Events[K]) => void;
}

export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    on: (name, listener) => {
      emitter.on(name, listener as (p: unknown) => void);
      return () => emitter.off(name, listener as (p: unknown) => void);
    },
    emit: (name, payload) => {
      emitter.emit(name, payload);
    },
  };
}
