import { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Schlanker Discord-Client für den MoinMorni-Bot: REST-Aufrufe (mit Warten bei „zu viele Anfragen“) und das Gateway
 * für Ereignisse (Klicks, Befehle, neue Mitglieder). Das Gateway braucht keinen offenen Port – der Bot baut die
 * Verbindung selbst auf. https://docs.discord.com/developers/topics/gateway
 */

const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_RESUME = 6;
const OP_RECONNECT = 7;
const OP_INVALID_SESSION = 9;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;
export const INTENT_GUILDS = 1;
export const INTENT_GUILD_MEMBERS = 2;
/** Wer in welchem Sprachkanal sitzt (kein besonderes Recht nötig) – für Sprachchat-Stumm. */
export const INTENT_GUILD_VOICE_STATES = 128;
/** Discord: „Disallowed intents“ – der Mitglieder-Intent ist im Entwicklerportal nicht eingeschaltet. */
const CLOSE_DISALLOWED_INTENTS = 4014;
const CLOSE_AUTH_FAILED = 4004;
const RETRY_MAX = 3;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 120_000;
const MS = 1000;
const HTTP_TOO_MANY = 429;
const HTTP_NO_CONTENT = 204;
const TIMEOUT_MS = 15_000;

export class DiscordError extends Error {
  override readonly name = 'DiscordError';
  constructor(
    readonly status: number,
    readonly code: number | null,
    message: string,
  ) {
    super(message);
  }
}

export interface GatewayEvent {
  readonly t: string;
  readonly d: Record<string, unknown>;
}

export interface DiscordClient {
  readonly rest: <T>(method: string, path: string, body?: unknown, reason?: string) => Promise<T>;
  /** Gateway verbinden; Ereignisse kommen an `onEvent`. */
  readonly connect: (onEvent: (e: GatewayEvent) => void) => void;
  readonly close: () => void;
  /** Gateway-Zustand fürs Panel. */
  readonly state: () => { connected: boolean; membersIntent: boolean; error: string | null };
}

interface Gateway {
  socket: WebSocket | null;
  seq: number | null;
  sessionId: string | null;
  resumeUrl: string | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  acked: boolean;
  retryMs: number;
  stopped: boolean;
  intents: number;
  connected: boolean;
  error: string | null;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createDiscordClient(
  token: string,
  apiBase: string,
  log: FastifyBaseLogger,
  fetchImpl: typeof fetch = fetch,
): DiscordClient {
  const request = async <T>(
    method: string,
    path: string,
    body: unknown,
    reason: string | undefined,
    tries: number,
  ): Promise<T> => {
    const res = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers: {
        authorization: `Bot ${token}`,
        'user-agent': 'DiscordBot (https://moinmorni.net, 1.0) MoinMorni',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(reason ? { 'x-audit-log-reason': encodeURIComponent(reason) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === HTTP_TOO_MANY && tries < RETRY_MAX) {
      const wait = Number(
        ((await res.json().catch(() => ({}))) as { retry_after?: number }).retry_after ?? 1,
      );
      await sleep(Math.ceil(wait * MS));
      return request(method, path, body, reason, tries + 1);
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      throw new DiscordError(res.status, err.code ?? null, `${method} ${path}: ${err.message ?? res.status}`);
    }
    if (res.status === HTTP_NO_CONTENT) return undefined as T;
    return (await res.json()) as T;
  };
  const rest = <T>(method: string, path: string, body?: unknown, reason?: string): Promise<T> =>
    request<T>(method, path, body, reason, 0);

  const gw: Gateway = {
    socket: null,
    seq: null,
    sessionId: null,
    resumeUrl: null,
    heartbeat: null,
    acked: true,
    retryMs: RECONNECT_MIN_MS,
    stopped: false,
    intents: INTENT_GUILDS | INTENT_GUILD_MEMBERS | INTENT_GUILD_VOICE_STATES,
    connected: false,
    error: null,
  };

  const send = (op: number, d: unknown): void => {
    if (gw.socket?.readyState === WebSocket.OPEN) gw.socket.send(JSON.stringify({ op, d }));
  };
  const stopHeartbeat = (): void => {
    if (gw.heartbeat) clearInterval(gw.heartbeat);
    gw.heartbeat = null;
  };

  const open = (onEvent: (e: GatewayEvent) => void): void => {
    void (async () => {
      const base =
        gw.resumeUrl ??
        (await rest<{ url: string }>('GET', '/gateway/bot')
          .then((g) => g.url)
          .catch(() => null));
      if (!base) {
        schedule(onEvent);
        return;
      }
      const socket = new WebSocket(`${base}/?v=10&encoding=json`);
      gw.socket = socket;
      socket.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as {
          op: number;
          d: unknown;
          s: number | null;
          t: string | null;
        };
        if (msg.s !== null) gw.seq = msg.s;
        const handlers: Readonly<Record<number, () => void>> = {
          [OP_HELLO]: () => {
            const interval = Number((msg.d as { heartbeat_interval: number }).heartbeat_interval);
            stopHeartbeat();
            gw.acked = true;
            gw.heartbeat = setInterval(() => {
              if (!gw.acked) {
                socket.terminate();
                return;
              }
              gw.acked = false;
              send(OP_HEARTBEAT, gw.seq);
            }, interval);
            gw.heartbeat.unref();
            if (gw.sessionId && gw.resumeUrl)
              send(OP_RESUME, { token, session_id: gw.sessionId, seq: gw.seq });
            else
              send(OP_IDENTIFY, {
                token,
                intents: gw.intents,
                properties: { os: 'linux', browser: 'moinmorni', device: 'moinmorni' },
              });
          },
          [OP_HEARTBEAT]: () => send(OP_HEARTBEAT, gw.seq),
          [OP_HEARTBEAT_ACK]: () => {
            gw.acked = true;
          },
          [OP_RECONNECT]: () => socket.close(),
          [OP_INVALID_SESSION]: () => {
            gw.sessionId = null;
            gw.resumeUrl = null;
            socket.close();
          },
          [OP_DISPATCH]: () => {
            const d = (msg.d ?? {}) as Record<string, unknown>;
            if (msg.t === 'READY') {
              gw.sessionId = String(d['session_id'] ?? '');
              gw.resumeUrl = typeof d['resume_gateway_url'] === 'string' ? d['resume_gateway_url'] : null;
              gw.connected = true;
              gw.retryMs = RECONNECT_MIN_MS;
              gw.error = null;
              log.info('Discord: Bot ist verbunden');
            }
            if (msg.t === 'RESUMED') gw.connected = true;
            if (msg.t) onEvent({ t: msg.t, d });
          },
        };
        handlers[msg.op]?.();
      });
      socket.on('close', (code) => {
        stopHeartbeat();
        gw.connected = false;
        if (code === CLOSE_DISALLOWED_INTENTS) {
          gw.intents = INTENT_GUILDS | INTENT_GUILD_VOICE_STATES;
          gw.sessionId = null;
          gw.resumeUrl = null;
          gw.error = 'members_intent_missing';
          log.warn(
            'Discord: Mitglieder-Intent fehlt im Entwicklerportal – Begrüßung neuer Mitglieder ist aus',
          );
        }
        if (code === CLOSE_AUTH_FAILED) {
          gw.error = 'token_invalid';
          log.error('Discord: Der Bot-Token stimmt nicht');
          return;
        }
        schedule(onEvent);
      });
      socket.on('error', (err) => log.warn({ err }, 'Discord: Gateway-Fehler'));
    })();
  };

  function schedule(onEvent: (e: GatewayEvent) => void): void {
    if (gw.stopped) return;
    const wait = gw.retryMs;
    gw.retryMs = Math.min(gw.retryMs * 2, RECONNECT_MAX_MS);
    setTimeout(() => open(onEvent), wait).unref();
  }

  return {
    rest,
    connect: (onEvent) => {
      gw.stopped = false;
      open(onEvent);
    },
    close: () => {
      gw.stopped = true;
      stopHeartbeat();
      gw.socket?.close();
    },
    state: () => ({
      connected: gw.connected,
      membersIntent: (gw.intents & INTENT_GUILD_MEMBERS) !== 0,
      error: gw.error,
    }),
  };
}
