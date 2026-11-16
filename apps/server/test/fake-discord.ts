/**
 * Nachgebautes Discord für Tests: REST (Rollen, Kanäle, Nachrichten, Mitglieder, Banns, Befehle, Threads,
 * Antworten auf Klicks) und ein Gateway, das READY und GUILD_CREATE schickt. Nur was der morni.net-Bot braucht.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

interface FRole {
  id: string;
  name: string;
  color: number;
  permissions: string;
  hoist: boolean;
  mentionable: boolean;
}
interface FChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  topic?: string;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
  archived?: boolean;
  locked?: boolean;
  members?: string[];
}
interface FMessage {
  id: string;
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
}

export interface FakeDiscord {
  readonly api: string;
  readonly guild: {
    id: string;
    name: string;
    features: string[];
    verification_level: number;
    roles: Map<string, FRole>;
    channels: Map<string, FChannel>;
    members: Map<string, { roles: string[]; communication_disabled_until: string | null }>;
    bans: Set<string>;
  };
  readonly messages: Map<string, FMessage[]>;
  readonly commands: unknown[];
  readonly replies: Array<{ id: string; body: { type: number; data: Record<string, unknown> } }>;
  readonly identified: () => number;
  readonly dispatch: (t: string, d: unknown) => void;
  readonly close: () => Promise<void>;
}

export async function startFakeDiscord(): Promise<FakeDiscord> {
  const ids = { n: 1000 };
  const next = (): string => String((ids.n += 1));
  const guild = {
    id: '900',
    name: 'morni.net',
    features: [] as string[],
    verification_level: 0,
    roles: new Map<string, FRole>([
      ['900', { id: '900', name: '@everyone', color: 0, permissions: '0', hoist: false, mentionable: false }],
    ]),
    channels: new Map<string, FChannel>(),
    members: new Map<string, { roles: string[]; communication_disabled_until: string | null }>(),
    bans: new Set<string>(),
  };
  const messages = new Map<string, FMessage[]>();
  const commands: unknown[] = [];
  const replies: Array<{ id: string; body: { type: number; data: Record<string, unknown> } }> = [];
  const sockets = new Set<WebSocket>();
  const state = { identified: 0, seq: 0 };

  const json = (res: http.ServerResponse, status: number, body?: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const notFound = (res: http.ServerResponse): void => json(res, 404, { code: 10003, message: 'Unknown' });

  type Handler = (m: RegExpMatchArray, body: Record<string, unknown>, res: http.ServerResponse) => void;
  const routes: Array<[string, RegExp, Handler]> = [
    ['GET', /^\/gateway\/bot$/, (_m, _b, res) => json(res, 200, { url: `ws://127.0.0.1:${port()}` })],
    ['GET', /^\/applications\/@me$/, (_m, _b, res) => json(res, 200, { id: '777', name: 'morni.net' })],
    [
      'GET',
      /^\/guilds\/(\d+)$/,
      (_m, _b, res) => json(res, 200, { id: guild.id, name: guild.name, features: guild.features }),
    ],
    [
      'PATCH',
      /^\/guilds\/(\d+)$/,
      (_m, b, res) => {
        guild.features = (b['features'] as string[]) ?? guild.features;
        guild.verification_level = Number(b['verification_level'] ?? guild.verification_level);
        json(res, 200, { id: guild.id });
      },
    ],
    ['GET', /^\/guilds\/(\d+)\/roles$/, (_m, _b, res) => json(res, 200, [...guild.roles.values()])],
    [
      'POST',
      /^\/guilds\/(\d+)\/roles$/,
      (_m, b, res) => {
        const role = { ...(b as unknown as FRole), id: next() };
        guild.roles.set(role.id, role);
        json(res, 200, role);
      },
    ],
    [
      'PATCH',
      /^\/guilds\/(\d+)\/roles\/(\d+)$/,
      (m, b, res) => {
        const role = guild.roles.get(m[2] ?? '');
        if (!role) return notFound(res);
        Object.assign(role, b);
        return json(res, 200, role);
      },
    ],
    ['GET', /^\/guilds\/(\d+)\/channels$/, (_m, _b, res) => json(res, 200, [...guild.channels.values()])],
    [
      'POST',
      /^\/guilds\/(\d+)\/channels$/,
      (_m, b, res) => {
        const ch = { ...(b as unknown as FChannel), id: next() };
        guild.channels.set(ch.id, ch);
        json(res, 200, ch);
      },
    ],
    [
      'PATCH',
      /^\/channels\/(\d+)$/,
      (m, b, res) => {
        const ch = guild.channels.get(m[1] ?? '');
        if (!ch) return notFound(res);
        Object.assign(ch, b);
        return json(res, 200, ch);
      },
    ],
    [
      'POST',
      /^\/channels\/(\d+)\/messages$/,
      (m, b, res) => {
        const msg = { ...(b as unknown as FMessage), id: next() };
        messages.set(m[1] ?? '', [...(messages.get(m[1] ?? '') ?? []), msg]);
        json(res, 200, msg);
      },
    ],
    [
      'PATCH',
      /^\/channels\/(\d+)\/messages\/(\d+)$/,
      (m, b, res) => {
        const msg = (messages.get(m[1] ?? '') ?? []).find((x) => x.id === m[2]);
        if (!msg) return notFound(res);
        Object.assign(msg, b);
        return json(res, 200, msg);
      },
    ],
    ['POST', /^\/channels\/(\d+)\/invites$/, (_m, _b, res) => json(res, 200, { code: 'morninet' })],
    [
      'POST',
      /^\/channels\/(\d+)\/threads$/,
      (m, b, res) => {
        const th = { ...(b as unknown as FChannel), id: next(), parent_id: m[1] ?? null, members: [] };
        guild.channels.set(th.id, th);
        json(res, 200, th);
      },
    ],
    [
      'PUT',
      /^\/channels\/(\d+)\/thread-members\/(\d+)$/,
      (m, _b, res) => {
        guild.channels.get(m[1] ?? '')?.members?.push(m[2] ?? '');
        json(res, 204);
      },
    ],
    [
      'GET',
      /^\/guilds\/(\d+)\/members\/(\d+)$/,
      (m, _b, res) => {
        const mem = guild.members.get(m[2] ?? '');
        return mem ? json(res, 200, { user: { id: m[2] }, ...mem }) : notFound(res);
      },
    ],
    [
      'PATCH',
      /^\/guilds\/(\d+)\/members\/(\d+)$/,
      (m, b, res) => {
        const mem = guild.members.get(m[2] ?? '');
        if (!mem) return notFound(res);
        if ('communication_disabled_until' in b)
          mem.communication_disabled_until = (b['communication_disabled_until'] as string | null) ?? null;
        return json(res, 200, mem);
      },
    ],
    [
      'PUT',
      /^\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/,
      (m, _b, res) => {
        const mem = guild.members.get(m[2] ?? '');
        if (!mem) return notFound(res);
        if (!mem.roles.includes(m[3] ?? '')) mem.roles.push(m[3] ?? '');
        return json(res, 204);
      },
    ],
    [
      'DELETE',
      /^\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/,
      (m, _b, res) => {
        const mem = guild.members.get(m[2] ?? '');
        if (!mem) return notFound(res);
        mem.roles = mem.roles.filter((r) => r !== m[3]);
        return json(res, 204);
      },
    ],
    [
      'PUT',
      /^\/guilds\/(\d+)\/bans\/(\d+)$/,
      (m, _b, res) => {
        guild.bans.add(m[2] ?? '');
        guild.members.delete(m[2] ?? '');
        json(res, 204);
      },
    ],
    [
      'DELETE',
      /^\/guilds\/(\d+)\/bans\/(\d+)$/,
      (m, _b, res) => {
        if (!guild.bans.delete(m[2] ?? '')) return notFound(res);
        return json(res, 204);
      },
    ],
    [
      'PUT',
      /^\/applications\/(\d+)\/guilds\/(\d+)\/commands$/,
      (_m, b, res) => {
        commands.splice(0, commands.length, ...(b as unknown as unknown[]));
        json(res, 200, commands);
      },
    ],
    // Direktnachricht: Kanal „8<Empfänger>“, Nachrichten landen wie in jedem Kanal in `messages`.
    [
      'POST',
      /^\/users\/@me\/channels$/,
      (_m, b, res) => json(res, 200, { id: `8${String(b['recipient_id'])}`, type: 1 }),
    ],
    [
      'POST',
      /^\/interactions\/(\w+)\/([\w-]+)\/callback$/,
      (m, b, res) => {
        replies.push({ id: m[1] ?? '', body: b as { type: number; data: Record<string, unknown> } });
        json(res, 204);
      },
    ],
  ];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const oauthPath = (req.url ?? '').replace(/^\/api\/v10/, '');
      // „Mit Discord anmelden“ (Webseite): Code gegen Schlüssel tauschen, dann „wer bin ich“.
      if (req.method === 'POST' && oauthPath === '/oauth2/token') {
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        return form.get('code') === 'good-code' && form.get('client_secret') === 'client-secret'
          ? json(res, 200, { access_token: 'user-token', token_type: 'Bearer' })
          : json(res, 400, { error: 'invalid_grant' });
      }
      if (
        req.method === 'GET' &&
        oauthPath === '/users/@me' &&
        req.headers.authorization === 'Bearer user-token'
      )
        return json(res, 200, { id: '5555', username: 'lena_dc', global_name: 'Lena' });
      if (req.headers.authorization !== 'Bot test-token')
        return json(res, 401, { code: 0, message: '401: Unauthorized' });
      const path = (req.url ?? '').replace(/^\/api\/v10/, '');
      const raw = Buffer.concat(chunks).toString();
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const route = routes.find(([method, re]) => method === req.method && re.test(path));
      if (!route) return json(res, 404, { code: 0, message: `fake: ${req.method} ${path}` });
      return route[2](path.match(route[1]) ?? ([] as unknown as RegExpMatchArray), body, res);
    });
  });
  const wss = new WebSocketServer({ server });
  const send = (ws: WebSocket, msg: unknown): void => ws.send(JSON.stringify(msg));
  wss.on('connection', (ws) => {
    sockets.add(ws);
    send(ws, { op: 10, d: { heartbeat_interval: 45_000 }, s: null, t: null });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as { op: number };
      if (msg.op === 2) {
        state.identified += 1;
        state.seq += 1;
        send(ws, {
          op: 0,
          t: 'READY',
          s: state.seq,
          d: { session_id: 'sess', resume_gateway_url: `ws://127.0.0.1:${port()}`, user: { id: '777' } },
        });
        state.seq += 1;
        send(ws, { op: 0, t: 'GUILD_CREATE', s: state.seq, d: { id: guild.id, name: guild.name } });
      }
      if (msg.op === 1) send(ws, { op: 11, d: null, s: null, t: null });
    });
    ws.on('close', () => sockets.delete(ws));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  function port(): number {
    return (server.address() as AddressInfo).port;
  }

  return {
    api: `http://127.0.0.1:${port()}/api/v10`,
    guild,
    messages,
    commands,
    replies,
    identified: () => state.identified,
    dispatch: (t, d) => {
      state.seq += 1;
      sockets.forEach((ws) => send(ws, { op: 0, t, s: state.seq, d }));
    },
    close: async () => {
      sockets.forEach((ws) => ws.terminate());
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
