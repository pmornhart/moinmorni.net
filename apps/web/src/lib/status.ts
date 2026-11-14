import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ModeState, NetworkStatus } from '@moinmorni/shared';
import { mmApi } from './mm-api';

const MS_PER_SECOND = 1000;
const REFRESH_SECONDS = 15;
/** The website and the panel overview ask every 15 seconds who is online. */
export const STATUS_REFRESH_MS = REFRESH_SECONDS * MS_PER_SECOND;

export function useNetworkStatus(): UseQueryResult<NetworkStatus> {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => mmApi<NetworkStatus>('/api/status'),
    refetchInterval: STATUS_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
}

/** Colour of a mode's state badge. */
export const MODE_STATE_TONE: Readonly<Record<ModeState, 'success' | 'neutral' | 'warning' | 'blue'>> = {
  on: 'success',
  off: 'neutral',
  maintenance: 'warning',
  soon: 'blue',
};
