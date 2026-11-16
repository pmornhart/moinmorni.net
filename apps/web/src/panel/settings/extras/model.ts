import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { mmApi } from '~/lib/mm-api';

export { isBedrockName, MINECRAFT_NAME_MAX, validMinecraftName } from '~/lib/minecraft-name';

/**
 * Shapes of the APIs behind the extra cards on some settings pages: updates (apps/server/src/system/update.ts),
 * MorniCraft applications and whitelist (apps/server/src/mornicraft/) and the build server (apps/server/src/build/).
 */

// ---------- Updates ----------

export type ChangeKind = 'new' | 'fixed' | 'improved' | 'removed';
export const CHANGE_KINDS: readonly ChangeKind[] = ['new', 'fixed', 'improved', 'removed'];

export interface UpdateChange {
  readonly sha: string;
  readonly title: string;
  readonly date: string | null;
  readonly items: readonly { readonly kind: ChangeKind; readonly text: string }[];
}

export type RunState = 'running' | 'done' | 'failed' | 'rolled_back';

export interface UpdateRun {
  readonly state: RunState;
  /** pull, build, backup, restart, check, rollback – or null when finished. */
  readonly step: string | null;
  readonly at: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly log: readonly string[];
}

export interface UpdateView {
  readonly version: string;
  readonly branch: string;
  readonly morninet: {
    readonly current: string | null;
    readonly latest: string | null;
    readonly behind: number;
    readonly changes: readonly UpdateChange[];
  };
  readonly motor: {
    readonly current: string | null;
    readonly latest: string | null;
    readonly behind: number;
  };
  readonly available: boolean;
  readonly checkedAt: string | null;
  readonly checkFailed: boolean;
  /** The update helper on the machine is set up (install.sh). */
  readonly canUpdate: boolean;
  /** Order is waiting or the script runs. */
  readonly updating: boolean;
  /** Order has been waiting for minutes; nobody picks it up. */
  readonly stuck: boolean;
  readonly run: UpdateRun | null;
}

export const UPDATES_KEY = ['panel', 'updates'] as const;

const SECOND_MS = 1000;
const POLL_SECONDS = 3;
/** While an update runs the card asks every few seconds (morni.net restarts in between – errors are expected). */
export const UPDATE_POLL_MS = POLL_SECONDS * SECOND_MS;

export function useUpdatesQuery(): UseQueryResult<UpdateView> {
  return useQuery({
    queryKey: UPDATES_KEY,
    queryFn: () => mmApi<UpdateView>('/api/panel/updates'),
    refetchInterval: (query) => (query.state.data?.updating ? UPDATE_POLL_MS : false),
    // During the restart the old data stays; failed polls are no reason to give up.
    retry: false,
  });
}

// ---------- MorniCraft: applications and whitelist ----------

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = ['pending', 'accepted', 'rejected'];

export interface Application {
  readonly id: number;
  readonly mode: string;
  readonly minecraftName: string;
  readonly discordId: string | null;
  readonly discordName: string | null;
  readonly answers: Readonly<Record<string, string>>;
  readonly via: 'website' | 'discord';
  readonly status: ApplicationStatus;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface WhitelistEntry {
  readonly id: number;
  readonly mode: string;
  readonly name: string;
  readonly displayName: string;
  /** Known once the player has been on the server with this name. */
  readonly uuid: string | null;
  readonly addedBy: string;
  readonly createdAt: string;
}

export const APPLICATIONS_KEY = ['panel', 'applications'] as const;
export const WHITELIST_KEY = ['panel', 'whitelist'] as const;

export function useApplicationsQuery(status: ApplicationStatus): UseQueryResult<Application[]> {
  return useQuery({
    queryKey: [...APPLICATIONS_KEY, status],
    queryFn: () => mmApi<Application[]>(`/api/panel/applications?status=${status}`),
  });
}

export function useWhitelistQuery(): UseQueryResult<WhitelistEntry[]> {
  return useQuery({
    queryKey: WHITELIST_KEY,
    queryFn: () => mmApi<WhitelistEntry[]>('/api/panel/whitelist'),
  });
}

/** Longest note to a decision (apps/server/src/mornicraft/applications.ts). */
export const NOTE_MAX = 300;

// ---------- Build server ----------

export interface BuildOverview {
  readonly available: boolean;
  readonly schematics: readonly {
    readonly name: string;
    readonly size: number;
    readonly modifiedAt: string;
  }[];
  readonly targets: readonly { readonly id: string; readonly name: string }[];
}

export const BUILD_KEY = ['panel', 'build'] as const;

export function useBuildQuery(): UseQueryResult<BuildOverview> {
  return useQuery({ queryKey: BUILD_KEY, queryFn: () => mmApi<BuildOverview>('/api/panel/build') });
}
