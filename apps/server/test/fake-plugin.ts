/**
 * Nachgebautes Netzwerk-Plugin für Tests: spricht das Hub-Protokoll genau wie das Java-Plugin
 * (Handschlag, signierte Rahmen) – und kann absichtlich falsch spielen.
 */
import { WebSocket } from 'ws';
import { authProof, frameMac, newNonce, seal, sessionKeyOf, type ServerKind } from '../src/hub/protocol.js';

export interface Msg {
  readonly t: string;
  readonly [key: string]: unknown;
}

export interface FakePlugin {
  readonly send: (body: Msg) => void;
  readonly request: (body: Msg) => Promise<Msg>;
  /** Wartet auf die nächste (noch nicht abgeholte) Nachricht dieses Typs. */
  readonly next: (t: string, match?: (m: Msg) => boolean) => Promise<Msg>;
  readonly received: Msg[];
  /** Rohtext schicken (für Angriffe). */
  readonly raw: (text: string) => void;
  /** Zuletzt gesendeter Rahmen (für Wiederholungs-Angriff). */
  readonly lastFrame: () => string;
  readonly closed: Promise<number>;
  readonly close: () => void;
}

const WAIT_MS = 3000;

export async function connectPlugin(
  url: string,
  server: string,
  kind: ServerKind,
  key: string,
): Promise<FakePlugin> {
  const socket = new WebSocket(url);
  const received: Msg[] = [];
  const taken = new Set<Msg>();
  const waiters: Array<() => void> = [];
  const state = { sessionKey: '', outSeq: 0, inSeq: 0, last: '', nextId: 1 };
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  const ready = new Promise<void>((resolve, reject) => {
    socket.on('message', (data) => {
      const raw = JSON.parse(data.toString()) as Record<string, unknown>;
      if (raw['t'] === 'hello') {
        const pluginNonce = newNonce();
        const hubNonce = String(raw['nonce']);
        state.sessionKey = sessionKeyOf(key, hubNonce, pluginNonce);
        socket.send(
          JSON.stringify({
            t: 'auth',
            v: 1,
            server,
            kind,
            nonce: pluginNonce,
            proof: authProof(key, hubNonce, pluginNonce, server, kind),
          }),
        );
        return;
      }
      const frame = raw as { s: number; b: string; h: string };
      if (frame.s !== state.inSeq + 1 || frame.h !== frameMac(state.sessionKey, frame.s, frame.b))
        throw new Error('Hub hat falsch signiert');
      state.inSeq = frame.s;
      const body = JSON.parse(frame.b) as Msg;
      received.push(body);
      if (body.t === 'welcome') resolve();
      waiters.splice(0).forEach((w) => w());
    });
    socket.on('close', () => reject(new Error('closed')));
  });

  const next = (t: string, match: (m: Msg) => boolean = () => true): Promise<Msg> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`keine Nachricht ${t}`)), WAIT_MS);
      const look = (): void => {
        const found = received.find((m) => m.t === t && !taken.has(m) && match(m));
        if (found) {
          taken.add(found);
          clearTimeout(timer);
          resolve(found);
          return;
        }
        waiters.push(look);
      };
      look();
    });

  const send = (body: Msg): void => {
    state.outSeq += 1;
    state.last = seal(state.sessionKey, state.outSeq, body);
    socket.send(state.last);
  };

  const plugin: FakePlugin = {
    send,
    request: async (body) => {
      const id = state.nextId;
      state.nextId += 1;
      send({ ...body, id });
      return next('reply', (m) => m['id'] === id);
    },
    next,
    received,
    raw: (text) => socket.send(text),
    lastFrame: () => state.last,
    closed,
    close: () => socket.close(),
  };
  try {
    await ready;
  } catch {
    return plugin;
  }
  return plugin;
}
