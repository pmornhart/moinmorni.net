import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Role } from '@moinmorni/shared';
import { mmApi } from '~/lib/mm-api';

/** Shapes of MoinMorni's team API (apps/server/src/panel/team-routes.ts). */

export interface TeamMember {
  /** The account's id in the motor. */
  readonly id: number;
  readonly username: string;
  readonly roleId: string;
  readonly email: string | null;
  readonly minecraft: { readonly uuid: string; readonly name: string; readonly confirmed: boolean } | null;
  /** Discord account linked to this team account (team role there too). */
  readonly discord: { readonly id: string; readonly name: string } | null;
  readonly disabled: boolean;
  readonly twoFactor: boolean;
  /** Still signed in with (or never used) the start password. */
  readonly mustChangePassword: boolean;
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly self: boolean;
  /** May the person looking at the list change this account? */
  readonly manageable: boolean;
}

export interface CreatedMember {
  readonly member: TeamMember | null;
  readonly password: string;
}

export const TEAM_KEY = ['panel', 'team'] as const;
const OWNER = 'owner';

export function useTeamQuery(): UseQueryResult<TeamMember[]> {
  return useQuery({ queryKey: TEAM_KEY, queryFn: () => mmApi<TeamMember[]>('/api/panel/team') });
}

/**
 * Roles a team account can get from this person – the server's rule: the owner gives any, everyone else only roles
 * below their own. Never the role "for everyone else" and never roles that see nothing in the panel (VIP, Media …:
 * those are ranks for players, no account needed).
 */
export function assignableRoles(roles: readonly Role[], mine: Role): Role[] {
  return roles.filter(
    (r) => !r.fallback && r.panel.length > 0 && (mine.id === OWNER || r.position > mine.position),
  );
}
