import { EventEmitter } from 'node:events';

/** Ereignisse innerhalb von MoinMorni (z. B. Hub und Bot hören auf geänderte Einstellungen). */
export interface Events {
  'settings.changed': { area: string; values: Record<string, unknown>; by: string };
  'modes.changed': { by: string };
  'roles.changed': { by: string };
  /** Owner-Konto angelegt – jetzt richtet sich das Netzwerk ein. */
  'setup.done': { owner: string };
  /** Strafe verhängt oder aufgehoben (Panel lädt neu, Discord zieht nach). */
  'punishments.changed': Record<string, never>;
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
