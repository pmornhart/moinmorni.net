import type { Lang } from './texts.js';
import { normalUuid } from './players.js';

/** Wer gerade im Netzwerk ist und auf welchem Server – meldet der Proxy. */

export interface Online {
  readonly uuid: string;
  readonly name: string;
  readonly bedrock: boolean;
  lang: Lang;
  /** null = gerade beim Verbinden (noch auf keinem Server). */
  server: string | null;
  readonly since: number;
  /** Letzte Chat-Nachricht (für den Langsam-Modus). */
  lastChatAt: number;
  /** Wem /r antwortet. */
  replyTo: string | null;
}

export interface Presence {
  readonly join: (p: { uuid: string; name: string; bedrock: boolean; lang: Lang }) => Online;
  readonly move: (uuid: string, server: string) => Online | undefined;
  readonly leave: (uuid: string) => Online | undefined;
  readonly get: (uuid: string) => Online | undefined;
  readonly byName: (name: string) => Online | undefined;
  readonly all: () => Online[];
  readonly on: (server: string) => Online[];
  /** Spieler pro Server (für Status, Webseite, Lobby-Figuren). */
  readonly counts: () => Record<string, number>;
}

export function createPresence(now: () => number = Date.now): Presence {
  const online = new Map<string, Online>();
  const all = (): Online[] => [...online.values()];
  return {
    join: ({ uuid, name, bedrock, lang }) => {
      const id = normalUuid(uuid);
      const before = online.get(id);
      const entry: Online = {
        uuid: id,
        name,
        bedrock,
        lang,
        server: before?.server ?? null,
        since: before?.since ?? now(),
        lastChatAt: before?.lastChatAt ?? 0,
        replyTo: before?.replyTo ?? null,
      };
      online.set(id, entry);
      return entry;
    },
    move: (uuid, server) => {
      const entry = online.get(normalUuid(uuid));
      if (entry) entry.server = server;
      return entry;
    },
    leave: (uuid) => {
      const id = normalUuid(uuid);
      const entry = online.get(id);
      online.delete(id);
      return entry;
    },
    get: (uuid) => online.get(normalUuid(uuid)),
    byName: (name) => all().find((p) => p.name.toLowerCase() === name.toLowerCase()),
    all,
    on: (server) => all().filter((p) => p.server === server),
    counts: () =>
      all().reduce<Record<string, number>>((acc, p) => {
        if (p.server) acc[p.server] = (acc[p.server] ?? 0) + 1;
        return acc;
      }, {}),
  };
}
