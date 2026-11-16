import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ModeStatus, Text } from '@moinmorni/shared';
import { mmApi, MmApiError } from './mm-api';

/**
 * What the public website reads (apps/server/src/public/site-routes.ts): news, leaderboard, player profiles, the
 * team, rules and links. None of it needs a login.
 */

export const NEWS_CATEGORIES = ['update', 'event', 'info'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface NewsItem {
  readonly slug: string;
  readonly category: NewsCategory;
  readonly title: Text;
  readonly body: Text;
  readonly pinned: boolean;
  readonly publishedAt: string;
  readonly author: string;
}

/** A rank as the website shows it (no rights). */
export interface PublicRole {
  readonly id: string;
  readonly name: Text;
  readonly symbol: string;
  readonly colour: string;
}

export interface TopPlayer {
  readonly rank: number;
  readonly uuid: string;
  readonly name: string;
  readonly playMinutes: number;
  readonly role: PublicRole;
}

export interface PublicProfile {
  readonly name: string;
  readonly uuid: string;
  readonly private: false;
  readonly bedrock: boolean;
  readonly role: PublicRole;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly playMinutes: number;
  /** Values per game mode, e.g. { duels: { wins: 12, losses: 4 } } – keys ending in "_ms" are times (older servers: none). */
  readonly modes?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** null = offline; `where` null = online, but not in a known mode. */
  readonly online: { readonly where: Text | null } | null;
}

export interface PrivateProfile {
  readonly name: string;
  readonly private: true;
}

export type PlayerProfile = PublicProfile | PrivateProfile;

export interface TeamGroup {
  readonly role: PublicRole;
  readonly members: readonly { readonly uuid: string; readonly name: string; readonly online: boolean }[];
}

export const SOCIALS = ['youtube', 'tiktok', 'instagram'] as const;
export type Social = (typeof SOCIALS)[number];

export interface SiteInfo {
  readonly rules: { readonly de: readonly string[]; readonly en: readonly string[] };
  /** Gemeinsame Sprachkanäle aus den Einstellungen. */
  readonly voiceChannels?: readonly string[];
  /** Rank badges: on/off and every rank in order (help page) – older servers: missing. */
  readonly badges?: { readonly enabled: boolean; readonly ranks: readonly PublicRole[] };
  readonly discordInvite: string | null;
  readonly socials: Readonly<Record<Social, string | null>>;
  /** Everyone who has ever played on MoinMorni. */
  readonly players: number;
}

const HTTP_NOT_FOUND = 404;
const MINUTE_MS = 60_000;
const MAX_RETRIES = 2;
/** The news list asks for this many (the API's limit). */
export const NEWS_ALL = 50;
export const TOP_ALL = 50;
/** Bestenliste eines Spielmodus: so viele Plätze. */
export const MODE_TOP = 10;

/** Which values a game mode reports (only public profiles counted); important ones first, times ascending. */
export interface ModeBoard {
  readonly mode: string;
  readonly keys: ReadonlyArray<{
    readonly key: string;
    readonly players: number;
    readonly order: 'asc' | 'desc';
  }>;
}

export interface ModeTopEntry {
  readonly rank: number;
  readonly uuid: string;
  readonly name: string;
  readonly value: number;
  readonly role: PublicRole;
}

/** No retry for "not found": that is an answer. */
function retryUnlessMissing(failures: number, err: Error): boolean {
  return !(err instanceof MmApiError && err.status === HTTP_NOT_FOUND) && failures < MAX_RETRIES;
}

export function isNotFound(err: unknown): boolean {
  return err instanceof MmApiError && err.status === HTTP_NOT_FOUND;
}

export function useSite(): UseQueryResult<SiteInfo> {
  return useQuery({
    queryKey: ['site'],
    queryFn: () => mmApi<SiteInfo>('/api/site'),
    staleTime: MINUTE_MS,
  });
}

export function useNews(limit: number): UseQueryResult<NewsItem[]> {
  return useQuery({
    queryKey: ['news', limit],
    queryFn: () => mmApi<NewsItem[]>(`/api/news?limit=${limit}`),
    staleTime: MINUTE_MS,
  });
}

export function useNewsItem(slug: string): UseQueryResult<NewsItem> {
  return useQuery({
    queryKey: ['news-item', slug],
    queryFn: () => mmApi<NewsItem>(`/api/news/${encodeURIComponent(slug)}`),
    retry: retryUnlessMissing,
    staleTime: MINUTE_MS,
  });
}

export function useTopPlayers(limit: number): UseQueryResult<TopPlayer[]> {
  return useQuery({
    queryKey: ['top', limit],
    queryFn: () => mmApi<TopPlayer[]>(`/api/stats/top?limit=${limit}`),
    staleTime: MINUTE_MS,
  });
}

export function useModeBoards(): UseQueryResult<ModeBoard[]> {
  return useQuery({
    queryKey: ['mode-boards'],
    queryFn: () => mmApi<ModeBoard[]>('/api/stats/boards'),
    staleTime: MINUTE_MS,
  });
}

export function useModeTop(mode: string, key: string, order: 'asc' | 'desc'): UseQueryResult<ModeTopEntry[]> {
  return useQuery({
    queryKey: ['mode-top', mode, key, order],
    queryFn: () =>
      mmApi<ModeTopEntry[]>(
        `/api/stats/${encodeURIComponent(mode)}/top?key=${encodeURIComponent(key)}&order=${order}&limit=${MODE_TOP}`,
      ),
    enabled: Boolean(mode && key),
    staleTime: MINUTE_MS,
  });
}

export function usePlayerProfile(name: string): UseQueryResult<PlayerProfile> {
  return useQuery({
    queryKey: ['player', name.toLowerCase()],
    queryFn: () => mmApi<PlayerProfile>(`/api/players/${encodeURIComponent(name)}`),
    retry: retryUnlessMissing,
  });
}

export function useTeam(): UseQueryResult<TeamGroup[]> {
  return useQuery({ queryKey: ['team'], queryFn: () => mmApi<TeamGroup[]>('/api/team') });
}

/** Modes by id, e.g. for a mode's own page. */
export function findMode(modes: readonly ModeStatus[] | undefined, id: string): ModeStatus | undefined {
  return modes?.find((m) => m.id === id);
}
