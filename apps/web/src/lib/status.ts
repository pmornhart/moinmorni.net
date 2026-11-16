import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { MODE_PHASE_PAUSE, type ModeState, type ModeStatus, type NetworkStatus } from '@morninet/shared';
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

/**
 * How the website names a mode's state: open modes that are not running are "asleep" (they wake on arrival); "pause"
 * = the mode itself says it has a break (Winter Games in summer) – you can still go and look around.
 */
export type ModeLook = 'open' | 'asleep' | 'pause' | 'closed' | 'maintenance' | 'soon';

const LOOK_OF_STATE: Readonly<Record<ModeState, ModeLook>> = {
  on: 'open',
  off: 'closed',
  maintenance: 'maintenance',
  soon: 'soon',
};

export const MODE_LOOK_TONE: Readonly<Record<ModeLook, 'success' | 'neutral' | 'warning' | 'blue' | 'gold'>> =
  {
    open: 'success',
    asleep: 'blue',
    pause: 'gold',
    closed: 'neutral',
    maintenance: 'warning',
    soon: 'gold',
  };

export function modeLook(mode: ModeStatus): ModeLook {
  if (mode.state === 'on' && mode.server && mode.phase === MODE_PHASE_PAUSE) return 'pause';
  if (mode.state === 'on' && !mode.awake) return 'asleep';
  return LOOK_OF_STATE[mode.state];
}

/** Players can go in (maybe after a short wake-up). */
export function modeJoinable(mode: ModeStatus): boolean {
  return mode.state === 'on';
}
