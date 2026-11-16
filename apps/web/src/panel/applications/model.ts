import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Text } from '@moinmorni/shared';
import { mmApi } from '~/lib/mm-api';

/** Shapes of the applications API (apps/server/src/applications/routes.ts): team positions and MorniCraft together. */

export type ApplicationKind = 'team' | 'mornicraft';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';
export const STATUSES: readonly ApplicationStatus[] = ['pending', 'accepted', 'rejected'];
/** Filter value for MorniCraft (instead of a team position). */
export const MORNICRAFT = 'mornicraft';

export interface PositionView {
  readonly id: string;
  readonly open: boolean;
  readonly role: {
    readonly id: string;
    readonly name: Text;
    readonly symbol: string;
    readonly colour: string;
  };
  readonly text: Text;
  readonly questions: { readonly de: readonly string[]; readonly en: readonly string[] };
}

export interface VoteCount {
  readonly up: number;
  readonly down: number;
  /** My vote: 1, -1 or 0. */
  readonly mine: number;
}

export interface ApplicationSummary {
  readonly id: number;
  readonly kind: ApplicationKind;
  readonly position: string | null;
  readonly status: ApplicationStatus;
  readonly minecraftName: string;
  readonly minecraftUuid: string | null;
  readonly discordName: string | null;
  readonly via: 'website' | 'discord';
  readonly lang: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  readonly decidedBy: string | null;
  readonly note: string | null;
  readonly votes: VoteCount;
  /** Number of internal notes. */
  readonly notes: number;
  /** I may accept or reject it (team: only who may give that role). */
  readonly canDecide: boolean;
}

export interface ApplicationList {
  readonly applications: readonly ApplicationSummary[];
  readonly pending: { readonly team: number; readonly mornicraft: number };
  readonly positions: readonly PositionView[];
}

export interface ApplicationNote {
  readonly id: number;
  readonly author: string;
  readonly text: string;
  readonly createdAt: string;
}

export interface ApplicationDetail extends ApplicationSummary {
  readonly answers: Readonly<Record<string, string>>;
  readonly discordId: string | null;
  readonly voters: readonly { readonly name: string; readonly vote: number }[];
  readonly notesList: readonly ApplicationNote[];
  /** Accepting may also create a panel account for the role. */
  readonly accountPossible: boolean;
  readonly suggestedUsername: string;
}

export interface DecideResult {
  readonly status: ApplicationStatus;
  readonly account: { readonly username: string; readonly password: string } | null;
}

export interface ApplicationFilter {
  readonly position: string;
  readonly status: ApplicationStatus | 'all';
}

/** Below ['panel', 'applications'] – the MorniCraft card on the settings page refreshes with it. */
export const APPLICATIONS_ROOT = ['panel', 'applications'] as const;
export const LIST_KEY = [...APPLICATIONS_ROOT, 'all'] as const;
export const detailKey = (id: number) => [...APPLICATIONS_ROOT, 'one', id] as const;
export const NOTE_MAX = 1000;
export const ALL = 'all';
/** The menu badge may be half a minute old. */
const BADGE_STALE_MS = 30_000;

function listPath(filter: ApplicationFilter): string {
  const query = new URLSearchParams();
  if (filter.status !== ALL) query.set('status', filter.status);
  if (filter.position !== ALL) query.set('position', filter.position);
  const text = query.toString();
  return `/api/panel/applications/all${text ? `?${text}` : ''}`;
}

export function useApplicationList(filter: ApplicationFilter): UseQueryResult<ApplicationList> {
  return useQuery({
    queryKey: [...LIST_KEY, filter.position, filter.status],
    queryFn: () => mmApi<ApplicationList>(listPath(filter)),
  });
}

export function useApplication(id: number): UseQueryResult<ApplicationDetail> {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => mmApi<ApplicationDetail>(`/api/panel/applications/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });
}

/** Open applications (team + MorniCraft) for the badge in the menu. */
export function usePendingCount(enabled: boolean): number {
  const list = useQuery({
    queryKey: [...LIST_KEY, ALL, 'pending'],
    queryFn: () => mmApi<ApplicationList>(listPath({ position: ALL, status: 'pending' })),
    enabled,
    staleTime: BADGE_STALE_MS,
  });
  const pending = list.data?.pending;
  return pending ? pending.team + pending.mornicraft : 0;
}
