import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import type { PanelArea, Role, SettingArea } from '@moinmorni/shared';
import { setCsrfToken } from '@/lib/api';
import { mmApi, MmApiError, setPanelCsrf } from '~/lib/mm-api';

/** Who is signed in to the panel (answer of /api/panel/me). */
export interface PanelMe {
  readonly username: string;
  readonly role: Role;
  readonly areas: readonly PanelArea[];
  readonly minecraftUuid: string | null;
  /** Signed in with a start password: an own one must be set before working in the panel. */
  readonly mustChangePassword: boolean;
  readonly csrfToken: string;
}

export interface SettingsEntry {
  readonly area: SettingArea;
  readonly values: Readonly<Record<string, unknown>>;
}

export const PANEL_ME_KEY = ['panel', 'me'] as const;
export const SETTINGS_KEY = ['panel', 'settings'] as const;
export const SETUP_KEY = ['setup'] as const;
export const ROLES_KEY = ['panel', 'roles'] as const;

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const MAX_RETRIES = 2;
const MINUTE_MS = 60_000;
/** MoinMorni's server keeps "who is signed in" for 10 s (apps/server/src/panel/auth.ts); ask again after that. */
const PANEL_ME_CACHE_MS = 11_000;

/** No retry for "not signed in" or "not in the team": those are answers, not hiccups. */
function retryUnlessAnswer(failures: number, err: Error): boolean {
  const answer =
    err instanceof MmApiError && (err.status === HTTP_UNAUTHORIZED || err.status === HTTP_FORBIDDEN);
  return !answer && failures < MAX_RETRIES;
}

export function usePanelMeQuery(): UseQueryResult<PanelMe> {
  return useQuery({
    queryKey: PANEL_ME_KEY,
    queryFn: async () => {
      const me = await mmApi<PanelMe>('/api/panel/me');
      // The same token protects MoinMorni's changes and the motor's (MorniHosting's pages).
      setPanelCsrf(me.csrfToken);
      setCsrfToken(me.csrfToken);
      return me;
    },
    retry: retryUnlessAnswer,
    staleTime: MINUTE_MS,
  });
}

/**
 * Ask again who is signed in, e.g. after a new password or a linked Minecraft account: right away and once more
 * when the server's short memory of the session has run out.
 */
export function refreshPanelMe(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: PANEL_ME_KEY });
  window.setTimeout(() => void client.invalidateQueries({ queryKey: PANEL_ME_KEY }), PANEL_ME_CACHE_MS);
}

/** Does MoinMorni still need its first owner account? */
export function useSetupQuery(): UseQueryResult<{ readonly required: boolean }> {
  return useQuery({
    queryKey: SETUP_KEY,
    queryFn: () => mmApi<{ readonly required: boolean }>('/api/setup'),
    staleTime: Infinity,
  });
}

export function useSettingsQuery(): UseQueryResult<SettingsEntry[]> {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: () => mmApi<SettingsEntry[]>('/api/panel/settings') });
}

/** The role template, best rank first. Only for people who may see the roles area. */
export function useRolesQuery(enabled = true): UseQueryResult<Role[]> {
  return useQuery({
    queryKey: ROLES_KEY,
    queryFn: async () => (await mmApi<Role[]>('/api/panel/roles')).sort((a, b) => a.position - b.position),
    enabled,
    retry: retryUnlessAnswer,
  });
}

export const PanelContext = createContext<PanelMe | null>(null);

export function usePanel(): PanelMe {
  const me = useContext(PanelContext);
  if (!me) throw new Error('usePanel outside the panel');
  return me;
}

export function useCan(area: PanelArea): boolean {
  return usePanel().areas.includes(area);
}
