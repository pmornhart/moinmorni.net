import type { IncomingMessage } from 'node:http';
import type { FastifyBaseLogger } from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  authProof,
  authSchema,
  frameMac,
  frameSchema,
  newNonce,
  PROTOCOL_VERSION,
  sameMac,
  seal,
  serverKeyOf,
  sessionKeyOf,
  type ServerKind,
} from './protocol.js';

/**
 * WebSocket-Seite des Hubs: Handschlag, signierte Rahmen in beide Richtungen, eine Verbindung pro Server (eine
 * neue ersetzt die alte). Was in den Nachrichten steht, entscheidet der Hub (index.ts).
 */

const HUB_PATH = '/hub';
const AUTH_TIMEOUT_MS = 10_000;
const PING_MS = 20_000;
const MAX_FRAME_BYTES = 256 * 1024;
export const CLOSE_AUTH = 4001;
export const CLOSE_FRAME = 4002;
export const CLOSE_REPLACED = 4003;
const CLOSE_NORMAL = 1000;

export interface Body {
  readonly t: string;
  readonly [key: string]: unknown;
}

export interface Connection {
  readonly server: string;
  readonly kind: ServerKind;
  readonly send: (body: Body) => void;
  readonly close: (code: number, reason: string) => void;
}

export interface TransportHandlers {
  readonly onOpen: (conn: Connection) => void;
  readonly onMessage: (conn: Connection, body: Body) => void;
  readonly onClose: (conn: Connection) => void;
}

export interface Transport {
  readonly listen: (host: string, port: number) => Promise<number>;
  readonly connection: (server: string) => Connection | undefined;
  readonly connections: () => Connection[];
  readonly close: () => Promise<void>;
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isBody = (value: unknown): value is Body =>
  typeof value === 'object' && value !== null && typeof (value as { t?: unknown }).t === 'string';

export function createTransport(
  hubSecret: Buffer,
  log: FastifyBaseLogger,
  handlers: TransportHandlers,
): Transport {
  const live = new Map<string, { conn: Connection; socket: WebSocket }>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const server = { http: null as import('node:http').Server | null };

  const attach = (socket: WebSocket, request: IncomingMessage): void => {
    const hubNonce = newNonce();
    const state = { inSeq: 0, outSeq: 0, conn: null as Connection | null, sessionKey: '', alive: true };
    const timer = setTimeout(() => socket.close(CLOSE_AUTH, 'auth timeout'), AUTH_TIMEOUT_MS);
    socket.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, nonce: hubNonce }));
    socket.on('pong', () => {
      state.alive = true;
    });

    const authenticate = (raw: unknown): void => {
      const auth = authSchema.safeParse(raw);
      const key = auth.success ? serverKeyOf(hubSecret, auth.data.server) : '';
      const ok =
        auth.success &&
        sameMac(auth.data.proof, authProof(key, hubNonce, auth.data.nonce, auth.data.server, auth.data.kind));
      clearTimeout(timer);
      if (!ok || !auth.success) {
        log.warn({ ip: request.socket.remoteAddress }, 'Hub: Anmeldung abgelehnt');
        socket.close(CLOSE_AUTH, 'auth failed');
        return;
      }
      state.sessionKey = sessionKeyOf(key, hubNonce, auth.data.nonce);
      const conn: Connection = {
        server: auth.data.server,
        kind: auth.data.kind,
        send: (body) => {
          state.outSeq += 1;
          if (socket.readyState === socket.OPEN) socket.send(seal(state.sessionKey, state.outSeq, body));
        },
        close: (code, reason) => socket.close(code, reason),
      };
      state.conn = conn;
      const previous = live.get(conn.server);
      live.set(conn.server, { conn, socket });
      if (previous) previous.socket.close(CLOSE_REPLACED, 'replaced');
      log.info({ server: conn.server, kind: conn.kind }, 'Hub: Server verbunden');
      handlers.onOpen(conn);
    };

    const receive = (raw: unknown, conn: Connection): void => {
      const frame = frameSchema.safeParse(raw);
      const valid =
        frame.success &&
        frame.data.s === state.inSeq + 1 &&
        sameMac(frame.data.h, frameMac(state.sessionKey, frame.data.s, frame.data.b));
      const body = valid && frame.success ? parseJson(frame.data.b) : null;
      if (!valid || !frame.success || !isBody(body)) {
        log.warn({ server: conn.server }, 'Hub: ungültiger Rahmen – Verbindung zu');
        socket.close(CLOSE_FRAME, 'bad frame');
        return;
      }
      state.inSeq = frame.data.s;
      try {
        handlers.onMessage(conn, body);
      } catch (err) {
        log.error({ err, server: conn.server, t: body.t }, 'Hub: Nachricht fehlgeschlagen');
      }
    };

    socket.on('message', (data) => {
      const raw = parseJson(data.toString());
      if (state.conn) receive(raw, state.conn);
      else authenticate(raw);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      const conn = state.conn;
      if (!conn) return;
      if (live.get(conn.server)?.conn === conn) live.delete(conn.server);
      log.info({ server: conn.server }, 'Hub: Server getrennt');
      handlers.onClose(conn);
    });
    socket.on('error', (err) => log.warn({ err }, 'Hub: Verbindungsfehler'));
  };

  const pinger = setInterval(() => {
    wss.clients.forEach((socket) => {
      socket.ping();
    });
  }, PING_MS);
  pinger.unref();

  return {
    listen: async (host, port) => {
      const http = await import('node:http');
      const httpServer = http.createServer((_req, res) => {
        res.writeHead(426).end('MoinMorni-Hub: nur WebSocket');
      });
      httpServer.on('upgrade', (request, socket, head) => {
        if (new URL(request.url ?? '/', 'http://hub').pathname !== HUB_PATH) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => attach(ws, request));
      });
      server.http = httpServer;
      await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
      const address = httpServer.address();
      return typeof address === 'object' && address ? address.port : port;
    },
    connection: (name) => live.get(name)?.conn,
    connections: () => [...live.values()].map((l) => l.conn),
    close: async () => {
      clearInterval(pinger);
      live.forEach(({ socket }) => socket.close(CLOSE_NORMAL, 'shutdown'));
      wss.close();
      await new Promise<void>((resolve) => {
        if (server.http) server.http.close(() => resolve());
        else resolve();
      });
    },
  };
}
