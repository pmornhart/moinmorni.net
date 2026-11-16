import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { mmApi } from '~/lib/mm-api';

/** Shapes of MoinMorni's Discord API (apps/server/src/discord/bot.ts, setup.ts, appearance.ts). */

export type CredentialSource = 'env' | 'panel';

export interface CredentialState {
  readonly set: boolean;
  readonly source: CredentialSource | null;
}

export type SetupStepKey = 'check' | 'roles' | 'channels' | 'messages' | 'commands' | 'community' | 'icon';
export type StepState = 'waiting' | 'running' | 'done' | 'skipped' | 'failed';

export interface SetupStep {
  readonly key: SetupStepKey;
  readonly state: StepState;
  readonly done: number;
  readonly total: number;
  readonly error: string | null;
}

export interface SetupReport {
  readonly roles: number;
  readonly channels: number;
  readonly messages: number;
  readonly created: number;
  readonly kept: readonly string[];
  readonly community: 'ok' | 'failed' | 'already';
  readonly icon: 'set' | 'kept' | 'unchanged' | 'failed';
  readonly missing: readonly string[];
  readonly ownerAdminManual: boolean;
}

export interface SetupProgress {
  readonly running: boolean;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly waitUntil: string | null;
  readonly error: string | null;
  readonly missing: readonly string[];
  readonly steps: readonly SetupStep[];
  readonly report: SetupReport | null;
}

export interface BotStatus {
  readonly configured: boolean;
  readonly connected: boolean;
  readonly error: 'members_intent_missing' | 'token_invalid' | null;
  readonly membersIntent: boolean;
  readonly inviteUrl: string | null;
  /** The rights the invite link asks for (names like "manageRoles"). */
  readonly permissions: readonly string[];
  readonly guild: { readonly id: string; readonly name: string } | null;
  readonly setupDone: boolean;
  readonly credentials: { readonly token: CredentialState; readonly clientSecret: CredentialState };
  readonly bot: { readonly id: string; readonly name: string } | null;
  /** Goes into the Developer Portal under OAuth2 → Redirects (Discord sign-in on the website). */
  readonly redirectUrl: string;
  readonly setup: SetupProgress;
  /** Only the owner changes token and client secret. */
  readonly canEditAccess: boolean;
}

export interface AppearanceView {
  readonly guild: {
    readonly name: string;
    readonly icon: string | null;
    readonly iconIsLogo: boolean;
    readonly banner: string | null;
    readonly premiumTier: number;
    readonly animatedIcon: boolean;
    readonly banners: boolean;
    readonly animatedBanner: boolean;
    /** Role icons (a picture next to the role's name) – from boost level 2. */
    readonly roleIcons: boolean;
  } | null;
  /**
   * How Discord shows the ranks: the badge as role icon ("icons") or the symbol in the name ("names") – and why
   * ("boost": server below level 2, "badges_off": badges switched off in the panel). No server: null.
   */
  readonly ranks: {
    readonly look: 'icons' | 'names';
    readonly reason: 'boost' | 'badges_off' | null;
    /** The ranks the way Discord shows them, best first. */
    readonly roles: readonly RankView[];
  } | null;
  readonly bot: {
    readonly name: string;
    readonly avatar: string | null;
    readonly avatarIsLogo: boolean;
  } | null;
}

export interface RankView {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly colour: string;
  /** The role's name in Discord ("Moderator" with the picture next to it, or "⚔ Moderator"). */
  readonly discordName: string;
  /** Gets the badge as role icon. */
  readonly icon: boolean;
  /** Already exists in Discord (after the setup). */
  readonly inDiscord: boolean;
}

export const DISCORD_KEY = ['panel', 'discord'] as const;
export const APPEARANCE_KEY = ['panel', 'discord', 'appearance'] as const;

const SECOND_MS = 1000;
const REFRESH_SECONDS = 10;
const RUNNING_SECONDS = 1.5;
const REFRESH_MS = REFRESH_SECONDS * SECOND_MS;
/** While the bot sets the server up, the page asks more often (progress). */
const RUNNING_MS = RUNNING_SECONDS * SECOND_MS;

export function useDiscordStatus(): UseQueryResult<BotStatus> {
  return useQuery({
    queryKey: DISCORD_KEY,
    queryFn: () => mmApi<BotStatus>('/api/panel/discord'),
    refetchInterval: (query) => (query.state.data?.setup.running ? RUNNING_MS : REFRESH_MS),
  });
}

export function useAppearance(enabled: boolean): UseQueryResult<AppearanceView> {
  return useQuery({
    queryKey: APPEARANCE_KEY,
    queryFn: () => mmApi<AppearanceView>('/api/panel/discord/appearance'),
    enabled,
  });
}
