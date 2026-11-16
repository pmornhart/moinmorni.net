import { MODE_HEADLINE_STATS, type ModeStatus, type NetworkStatus, type Text } from '@moinmorni/shared';
import type {
  ModeBoard,
  ModeTopEntry,
  NewsCategory,
  NewsItem,
  PlayerProfile,
  PublicRole,
  SiteInfo,
  TeamGroup,
  TopPlayer,
} from '~/lib/site';
import fixtures from './fixtures.json';

/**
 * The demo's pretend server: answers the website's /api/… requests from fixtures.json, inside the page. Times are
 * counted back from now, so the demo never looks old; player numbers wiggle a little on every status request.
 */

interface FixturePlayer {
  readonly name: string;
  readonly role: string;
  readonly playMinutes: number;
  readonly firstSeenDaysAgo: number;
  readonly lastSeenMinutesAgo: number;
  /** Mode id or "lobby" while online. */
  readonly online?: string;
  readonly bedrock?: boolean;
  readonly private?: boolean;
  /** Values per game mode, as the modes report them. */
  readonly modes?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

interface FixtureNews {
  readonly slug: string;
  readonly category: NewsCategory;
  readonly pinned: boolean;
  readonly daysAgo: number;
  readonly author: string;
  readonly title: Text;
  readonly body: Text;
}

interface Fixtures {
  readonly status: Omit<NetworkStatus, 'players' | 'updatedAt'> & { readonly lobbyPlayers: number };
  readonly site: Omit<SiteInfo, 'players'> & { readonly players: number };
  readonly news: readonly FixtureNews[];
  readonly roles: Readonly<Record<string, PublicRole>>;
  readonly teamOrder: readonly string[];
  readonly players: readonly FixturePlayer[];
  readonly apply: {
    readonly open: boolean;
    readonly discordLogin: boolean;
    readonly demoDiscordName: string;
  };
}

interface MyApplication {
  readonly status: 'pending' | 'accepted' | 'rejected';
  readonly minecraftName: string;
  readonly createdAt: string;
}

interface DemoRequest {
  readonly method: string;
  readonly path: string;
  readonly params: URLSearchParams;
  readonly body: unknown;
  /** The part of the path after a matched prefix (a news slug, a player name). */
  readonly rest: string;
}

interface DemoResponse {
  readonly status: number;
  readonly body?: unknown;
}

type Handler = (request: DemoRequest) => DemoResponse;

// Our own fixture file: JSON loses the literal unions (mode state, news category), the shape itself is ours.
const DATA = fixtures as unknown as Fixtures;

const API = '/api/';
const DEMO_ORIGIN = 'https://demo.moinmorni.invalid';
const ANSWER_DELAY_MS = 140;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** News of the same day still get different times. */
const NEWS_HOUR_MS = 3_600_000;
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const DEFAULT_LIMIT = 10;
const LOBBY = 'lobby';
const LOBBY_NAME: Text = { de: 'Lobby', en: 'Lobby' };
/** Live player numbers wander up to half of this from the fixture on each request. */
const WIGGLE_RANGE = 4;
const HALF = 0.5;
const FNV_PRIME = 16_777_619;
const FNV_OFFSET = 2_166_136_261;
const HEX = 16;
/** Each hash gives 8 hex digits; four of them fill the x of a uuid. */
const HASH_DIGITS = 8;
const UUID_PATTERN = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

const STARTED = Date.now();

const ago = (ms: number): string => new Date(STARTED - ms).toISOString();

function hash(text: string): number {
  return Array.from(text).reduce(
    (h, c) => Math.imul(h ^ (c.codePointAt(0) ?? 0), FNV_PRIME) >>> 0,
    FNV_OFFSET,
  );
}

/** A stable made-up uuid per name, so every player keeps the same pixel face. */
function uuidOf(name: string): string {
  const hex = ['a', 'b', 'c', 'd']
    .map((salt) => hash(`${salt}:${name.toLowerCase()}`).toString(HEX).padStart(HASH_DIGITS, '0'))
    .join('');
  const filled = Array.from(UUID_PATTERN).reduce<{ readonly at: number; readonly out: string }>(
    (acc, char) =>
      char === 'x'
        ? { at: acc.at + 1, out: acc.out + (hex[acc.at] ?? '0') }
        : { at: acc.at, out: acc.out + char },
    { at: 0, out: '' },
  );
  return filled.out;
}

function roleOf(id: string): PublicRole {
  const role = DATA.roles[id] ?? DATA.roles['player'];
  if (!role) throw new Error(`demo: unknown role ${id}`);
  return role;
}

function wiggle(base: number, max: number): number {
  if (!base) return base;
  const offset = Math.round((Math.random() - HALF) * WIGGLE_RANGE);
  return Math.min(max, Math.max(1, base + offset));
}

function status(): DemoResponse {
  const modes: ModeStatus[] = DATA.status.modes.map((m) => ({
    ...m,
    players: wiggle(m.players, m.maxPlayers),
  }));
  const inModes = modes.reduce((sum, m) => sum + m.players, 0);
  const lobby = wiggle(DATA.status.lobbyPlayers, DATA.status.maxPlayers);
  const body: NetworkStatus = {
    online: DATA.status.online,
    players: lobby + inModes,
    maxPlayers: DATA.status.maxPlayers,
    javaAddress: DATA.status.javaAddress,
    bedrockAddress: DATA.status.bedrockAddress,
    bedrockPort: DATA.status.bedrockPort,
    modes,
    updatedAt: new Date().toISOString(),
  };
  return { status: HTTP_OK, body };
}

function newsView(n: FixtureNews, index: number): NewsItem {
  return {
    slug: n.slug,
    category: n.category,
    title: n.title,
    body: n.body,
    pinned: n.pinned,
    publishedAt: ago(n.daysAgo * DAY_MS + index * NEWS_HOUR_MS),
    author: n.author,
  };
}

const NEWS: readonly NewsItem[] = DATA.news
  .map(newsView)
  .toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt));

function limitOf(params: URLSearchParams): number {
  const raw = Number(params.get('limit'));
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_LIMIT;
}

const publicPlayers = (): readonly FixturePlayer[] =>
  DATA.players.filter((p) => !p.private).toSorted((a, b) => b.playMinutes - a.playMinutes);

function top(request: DemoRequest): DemoResponse {
  const body: TopPlayer[] = publicPlayers()
    .slice(0, limitOf(request.params))
    .map((p, i) => ({
      rank: i + 1,
      uuid: uuidOf(p.name),
      name: p.name,
      playMinutes: p.playMinutes,
      role: roleOf(p.role),
    }));
  return { status: HTTP_OK, body };
}

/** Values whose name ends like this are times: lower is better. */
const TIME_SUFFIX = '_ms';
const HEADLINE_KEYS = ['rating', 'wins', 'balance', 'finishes', 'points', 'best_wave', 'kills', 'games'];
const rankOfKey = (mode: string, key: string): number => {
  if (MODE_HEADLINE_STATS[mode] === key) return -1;
  const i = HEADLINE_KEYS.indexOf(key);
  return i < 0 ? HEADLINE_KEYS.length : i;
};

/** Like the real server: per mode (in panel order) the values public players have, important ones first. */
function modeBoards(): DemoResponse {
  const pairs = DATA.players
    .filter((p) => !p.private)
    .flatMap((p) =>
      Object.entries(p.modes ?? {}).flatMap(([mode, values]) =>
        Object.keys(values).map((key) => `${mode} ${key}`),
      ),
    );
  const counts = pairs.reduce<Readonly<Record<string, number>>>(
    (acc, pair) => ({ ...acc, [pair]: (acc[pair] ?? 0) + 1 }),
    {},
  );
  const body: ModeBoard[] = DATA.status.modes
    .map((m) => ({
      mode: m.id,
      keys: Object.entries(counts)
        .filter(([pair]) => pair.startsWith(`${m.id} `))
        .map(([pair, players]) => {
          const key = pair.slice(m.id.length + 1);
          return { key, players, order: key.endsWith(TIME_SUFFIX) ? ('asc' as const) : ('desc' as const) };
        })
        .toSorted((a, b) => rankOfKey(m.id, a.key) - rankOfKey(m.id, b.key) || a.key.localeCompare(b.key)),
    }))
    .filter((b) => b.keys.length);
  return { status: HTTP_OK, body };
}

/** "/api/stats/duels/top?key=wins&order=desc" */
function modeTop(request: DemoRequest): DemoResponse {
  const [mode = '', what] = decodeURIComponent(request.rest).split('/');
  const key = request.params.get('key') ?? '';
  if (what !== 'top' || !DATA.status.modes.some((m) => m.id === mode))
    return { status: HTTP_NOT_FOUND, body: { error: 'mode_unknown' } };
  const low = request.params.get('order') === 'asc';
  const valueOf = (p: FixturePlayer): number | undefined => p.modes?.[mode]?.[key];
  const body: ModeTopEntry[] = DATA.players
    .filter((p) => !p.private && valueOf(p) !== undefined)
    .toSorted((a, b) => ((valueOf(a) ?? 0) - (valueOf(b) ?? 0)) * (low ? 1 : -1))
    .slice(0, limitOf(request.params))
    .map((p, i) => ({
      rank: i + 1,
      uuid: uuidOf(p.name),
      name: p.name,
      value: valueOf(p) ?? 0,
      role: roleOf(p.role),
    }));
  return { status: HTTP_OK, body };
}

function whereOf(online: string): Text | null {
  if (online === LOBBY) return LOBBY_NAME;
  return DATA.status.modes.find((m) => m.id === online)?.name ?? null;
}

function player(request: DemoRequest): DemoResponse {
  const name = decodeURIComponent(request.rest).toLowerCase();
  const p = DATA.players.find((entry) => entry.name.toLowerCase() === name);
  if (!p) return { status: HTTP_NOT_FOUND, body: { error: 'player_unknown' } };
  if (p.private) return { status: HTTP_OK, body: { name: p.name, private: true } satisfies PlayerProfile };
  const body: PlayerProfile = {
    name: p.name,
    uuid: uuidOf(p.name),
    private: false,
    bedrock: p.bedrock === true,
    role: roleOf(p.role),
    firstSeen: ago(p.firstSeenDaysAgo * DAY_MS),
    lastSeen: ago(p.lastSeenMinutesAgo * MINUTE_MS),
    playMinutes: p.playMinutes,
    modes: p.modes ?? {},
    online: p.online ? { where: whereOf(p.online) } : null,
  };
  return { status: HTTP_OK, body };
}

function team(): DemoResponse {
  const body: TeamGroup[] = DATA.teamOrder.flatMap((roleId) => {
    const members = DATA.players
      .filter((p) => p.role === roleId)
      .map((p) => ({ uuid: uuidOf(p.name), name: p.name, online: Boolean(p.online) }));
    return members.length ? [{ role: roleOf(roleId), members }] : [];
  });
  return { status: HTTP_OK, body };
}

function newsItem(request: DemoRequest): DemoResponse {
  const slug = decodeURIComponent(request.rest);
  const found = NEWS.find((n) => n.slug === slug);
  return found
    ? { status: HTTP_OK, body: found }
    : { status: HTTP_NOT_FOUND, body: { error: 'news_unknown' } };
}

/** The application page: signed in with "Discord" or not, and the one application of this visit. */
const applyState: { me: { readonly name: string } | null; application: MyApplication | null } = {
  me: null,
  application: null,
};

/** "Mit Discord anmelden" in the demo: no trip to Discord, just signed in. */
export function demoSignIn(): void {
  applyState.me = { name: DATA.apply.demoDiscordName };
}

function applyView(): DemoResponse {
  return {
    status: HTTP_OK,
    body: {
      open: DATA.apply.open,
      discordLogin: DATA.apply.discordLogin,
      me: applyState.me,
      application: applyState.me ? applyState.application : null,
    },
  };
}

function isApplicationBody(body: unknown): body is { readonly minecraftName: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { minecraftName?: unknown }).minecraftName === 'string'
  );
}

function applySend(request: DemoRequest): DemoResponse {
  if (!applyState.me) return { status: HTTP_UNAUTHORIZED, body: { error: 'apply_login_required' } };
  if (!isApplicationBody(request.body))
    return { status: HTTP_BAD_REQUEST, body: { error: 'invalid_request' } };
  applyState.application = {
    status: 'pending',
    minecraftName: request.body.minecraftName,
    createdAt: new Date().toISOString(),
  };
  return { status: HTTP_OK, body: applyState.application };
}

function applyLogout(): DemoResponse {
  applyState.me = null;
  return { status: HTTP_NO_CONTENT };
}

const site = (): DemoResponse => ({ status: HTTP_OK, body: DATA.site });
const newsList = (request: DemoRequest): DemoResponse => ({
  status: HTTP_OK,
  body: NEWS.slice(0, limitOf(request.params)),
});

const EXACT: Readonly<Record<string, Handler>> = {
  'GET /api/status': status,
  'GET /api/site': site,
  'GET /api/news': newsList,
  'GET /api/stats/top': top,
  'GET /api/stats/boards': modeBoards,
  'GET /api/team': team,
  'GET /api/public/apply': applyView,
  'POST /api/public/apply': applySend,
  'POST /api/public/apply/logout': applyLogout,
};

const PREFIXED: readonly (readonly [method: string, prefix: string, handler: Handler])[] = [
  ['GET', '/api/news/', newsItem],
  ['GET', '/api/players/', player],
  ['GET', '/api/stats/', modeTop],
];

function route(request: Omit<DemoRequest, 'rest'>): DemoResponse {
  const exact = EXACT[`${request.method} ${request.path}`];
  if (exact) return exact({ ...request, rest: '' });
  const match = PREFIXED.find(
    ([method, prefix]) => method === request.method && request.path.startsWith(prefix),
  );
  if (!match) return { status: HTTP_NOT_FOUND, body: { error: 'not_found' } };
  const [, prefix, handler] = match;
  return handler({ ...request, rest: request.path.slice(prefix.length) });
}

function urlOf(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  return new URL(typeof input === 'string' ? input : input.url, DEMO_ORIGIN);
}

function bodyOf(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') return undefined;
  try {
    return JSON.parse(init.body) as unknown;
  } catch {
    return undefined;
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Puts the pretend server in front of fetch: /api/… is answered here, everything else goes out as usual. */
export function installDemoBackend(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    if (!url.pathname.startsWith(API)) return original(input, init);
    await wait(ANSWER_DELAY_MS);
    const answer = route({
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      params: url.searchParams,
      body: bodyOf(init),
    });
    const text = answer.body === undefined ? null : JSON.stringify(answer.body);
    return new Response(text, { status: answer.status, headers: { 'content-type': 'application/json' } });
  };
}
