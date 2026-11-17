import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  modePause,
  modesNow,
  sportReplacedBy,
  type ModePause,
  type ModeState,
  type ModeStatus,
  type NetworkStatus,
  type SportMode,
} from '@moinmorni/shared';
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
 * = summer break of a seasonal mode (Winter Games outside winter), "winterPause" = winter break (Summer Games outside
 * summer) – you can still go and look around; a running mode that says it is closed (e.g. while its server stops) is
 * "closed". Winter Games and Summer Games share one place: the one that is not on right now is replaced by the other –
 * "backInWinter" (Winter Games in summer) or "backInSummer" (Summer Games in winter).
 */
export type ModeLook =
  | 'open'
  | 'asleep'
  | 'pause'
  | 'winterPause'
  | 'backInWinter'
  | 'backInSummer'
  | 'closed'
  | 'maintenance'
  | 'soon';

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
    winterPause: 'blue',
    backInWinter: 'blue',
    backInSummer: 'gold',
    closed: 'neutral',
    maintenance: 'warning',
    soon: 'gold',
  };

/** What `modePause` says, as a look: summer break, winter break or closed right now. */
const LOOK_OF_PAUSE: Readonly<Record<ModePause, ModeLook>> = {
  summer: 'pause',
  winter: 'winterPause',
  closed: 'closed',
};

/** The sports mode that comes back in winter (Winter Games) – the other one comes back in summer. */
const WINTER_SPORT: SportMode = 'wintersport';

/**
 * How a mode looks right now. With `sport` (who is at the sports stand, from `/api/status`) the other sports mode is
 * "back in winter/summer" – it is replaced, not on a break.
 */
export function modeLook(mode: ModeStatus, sport?: SportMode | null): ModeLook {
  if (sportReplacedBy(mode.id, sport)) return mode.id === WINTER_SPORT ? 'backInWinter' : 'backInSummer';
  const pause = modePause(mode);
  if (pause) return LOOK_OF_PAUSE[pause];
  if (mode.state === 'on' && !mode.awake) return 'asleep';
  return LOOK_OF_STATE[mode.state];
}

/** Players can go in (maybe after a short wake-up). */
export function modeJoinable(mode: ModeStatus): boolean {
  return mode.state === 'on';
}

/**
 * Open right now for playing: switched on and not on a break (Winter Games in summer, Summer Games in winter, a mode
 * that says it is closed).
 * A sleeping mode counts – it wakes up as soon as someone comes.
 */
export function modeOpenNow(mode: ModeStatus): boolean {
  return mode.state === 'on' && modePause(mode) === null;
}

/** `modeLook` with the sports mode that is on right now (from the status the page already has). */
export function useModeLook(mode: ModeStatus): ModeLook {
  return modeLook(mode, useNetworkStatus().data?.sport);
}

/**
 * The modes to show right now: all of them, but only the sports mode that is on (Winter Games and Summer Games share
 * one place – the other is replaced). Its own page stays reachable by link.
 */
export function shownModes(status: NetworkStatus | undefined): ModeStatus[] {
  return status ? modesNow(status.modes, status.sport) : [];
}
