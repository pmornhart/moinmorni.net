import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { PunishmentKind, Text } from '@moinmorni/shared';
import { mmApi } from '~/lib/mm-api';

/** Shapes of MoinMorni's player and punishment API (apps/server/src/panel/player-routes.ts). */

/** voice = muted in voice chat (writing in chat still works). */
export type PunishKind = PunishmentKind;
/** What the panel can hand out. */
export type ModKind = PunishmentKind;
/** What lasts and can be lifted. */
export type LiftKind = 'ban' | 'mute' | 'jail' | 'voice';

export const MOD_KINDS: readonly ModKind[] = ['warn', 'mute', 'voice', 'jail', 'ban', 'kick'];
export const PUNISH_KINDS: readonly PunishKind[] = ['ban', 'mute', 'voice', 'warn', 'kick', 'jail'];
const LASTING: readonly PunishKind[] = ['ban', 'mute', 'jail', 'voice'];

export function isLasting(kind: PunishKind): kind is LiftKind {
  return LASTING.includes(kind);
}

export interface PlayerRole {
  readonly id: string;
  readonly name: Text;
  readonly symbol: string;
  readonly colour: string;
}

export interface ActivePunishment {
  readonly until: string | null;
  readonly reason: string;
}

export interface PlayerView {
  readonly uuid: string;
  readonly name: string;
  readonly bedrock: boolean;
  /** The rank that counts right now (also a team role). */
  readonly role: PlayerRole;
  /** The rank given to the player (null = none of their own). */
  readonly ownRole: string | null;
  readonly online: { readonly server: string | null } | null;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly playMinutes: number;
  readonly language: string | null;
  readonly banned: ActivePunishment | null;
  readonly muted: ActivePunishment | null;
  readonly jailed: ActivePunishment | null;
  /** Muted in voice chat. */
  readonly voiceMuted: ActivePunishment | null;
}

export interface Punishment {
  readonly id: number;
  readonly playerUuid: string;
  readonly kind: PunishKind;
  readonly reason: string;
  readonly byName: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
}

/** A spot in a MorniCraft world. */
export interface McPlace {
  readonly world: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** What MorniCraft reports about a player (read-only). */
export interface MorniCraftPlayer {
  readonly online: boolean;
  readonly afk: boolean;
  readonly homes: ReadonlyArray<McPlace & { readonly name: string }>;
  readonly clan: {
    readonly name: string;
    readonly tag: string;
    readonly colour: string;
    readonly leader: boolean;
    readonly members: number;
  } | null;
  readonly graves: ReadonlyArray<McPlace & { readonly items: number; readonly since: number }>;
  readonly updatedAt: string;
}

export interface PlayerDetail extends PlayerView {
  readonly history: readonly Punishment[];
  /** null: never played MorniCraft. */
  readonly mornicraft: MorniCraftPlayer | null;
}

export interface PunishmentRow extends Punishment {
  readonly playerName: string;
  readonly active: boolean;
}

export interface PlayerList {
  readonly online: number;
  readonly players: readonly PlayerView[];
}

export const PLAYERS_KEY = ['panel', 'players'] as const;
const PLAYER_KEY = ['panel', 'player'] as const;
export const PUNISHMENTS_KEY = ['panel', 'punishments'] as const;

export function usePlayersQuery(q: string, limit: number, enabled = true): UseQueryResult<PlayerList> {
  return useQuery({
    queryKey: [...PLAYERS_KEY, q, limit],
    queryFn: () =>
      mmApi<PlayerList>(`/api/panel/players?${new URLSearchParams({ q, limit: String(limit) }).toString()}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePlayerQuery(uuid: string): UseQueryResult<PlayerDetail> {
  return useQuery({
    queryKey: [...PLAYER_KEY, uuid],
    queryFn: () => mmApi<PlayerDetail>(`/api/panel/players/${encodeURIComponent(uuid)}`),
  });
}

export function usePunishmentsQuery(): UseQueryResult<PunishmentRow[]> {
  return useQuery({
    queryKey: PUNISHMENTS_KEY,
    queryFn: () => mmApi<PunishmentRow[]>('/api/panel/punishments'),
  });
}

/** After a punishment or rank change: list, profiles and punishments load afresh. */
export function useRefreshPlayers(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      [PLAYERS_KEY, PLAYER_KEY, PUNISHMENTS_KEY].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
}

export type PunishmentState = 'active' | 'revoked' | 'expired' | 'replaced' | 'once';

/**
 * Where a punishment stands: lifted, run out, still running, replaced by a newer one of the same kind – or a
 * one-off (warning, kick) that has no duration.
 */
export function punishmentState(p: Punishment, active: boolean, now: number = Date.now()): PunishmentState {
  if (p.revokedAt) return 'revoked';
  if (!isLasting(p.kind)) return 'once';
  if (p.expiresAt && new Date(p.expiresAt).getTime() <= now) return 'expired';
  return active ? 'active' : 'replaced';
}

/** Bedrock names come with a dot in front (".Tobi_04"); the pictures use the name without it. */
export function plainName(name: string): string {
  return name.startsWith('.') ? name.slice(1) : name;
}
