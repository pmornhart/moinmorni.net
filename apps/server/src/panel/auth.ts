import crypto from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { PanelArea, Role } from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import { teamMembers } from '../db/schema.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { MotorClient } from '../motor/client.js';
import type { Stores } from './stores.js';

/**
 * Login-Brücke: Das Team meldet sich beim Motor an (Passkeys, 2FA – alles von MorniHosting), über
 * moinmorni.net/panel/motor/…, also mit dem Cookie des Motors auf unserer Domain. MoinMorni fragt den Motor,
 * wer zum Cookie gehört, und gibt dem Konto seine MoinMorni-Rolle. Das allererste Admin-Konto wird Owner.
 */

const CACHE_MS = 10_000;
const UNSAFE: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SERVICE_PREFIX = 'dienst-';
const OWNER = 'owner';

export interface PanelUser {
  readonly motorUserId: number;
  readonly username: string;
  readonly role: Role;
  readonly areas: ReadonlySet<PanelArea>;
  readonly minecraftUuid: string | null;
  readonly csrfToken: string;
}

export interface PanelAuth {
  /** Wer ist angemeldet und im Team? null = nicht angemeldet oder nicht im Team. */
  readonly resolve: (request: FastifyRequest) => Promise<PanelUser | null>;
  /** Wie `resolve`, wirft aber 401/403 – und prüft bei ändernden Anfragen das CSRF-Token des Motors. */
  readonly require: (request: FastifyRequest, area?: PanelArea) => Promise<PanelUser>;
}

export function createPanelAuth(db: Db, motor: MotorClient, stores: Stores): PanelAuth {
  const cache = new Map<string, { at: number; user: PanelUser | null; signedIn: boolean }>();

  const lookup = async (cookie: string): Promise<{ user: PanelUser | null; signedIn: boolean }> => {
    const key = crypto.createHash('sha256').update(cookie).digest('hex');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    const me = await motor.me(cookie);
    if (!me) {
      const result = { at: Date.now(), user: null, signedIn: false };
      cache.set(key, result);
      return result;
    }
    const member = db.select().from(teamMembers).where(eq(teamMembers.motorUserId, me.user.id)).get();
    const owners =
      db.select({ n: count() }).from(teamMembers).where(eq(teamMembers.roleId, OWNER)).get()?.n ?? 0;
    // Erstes Admin-Konto (kein Dienst-Konto) wird Owner – so kommt Philip nach der Einrichtung sofort hinein.
    const bootstrap =
      !member && owners === 0 && me.user.isAdmin && !me.user.username.startsWith(SERVICE_PREFIX);
    if (bootstrap)
      db.insert(teamMembers)
        .values({ motorUserId: me.user.id, username: me.user.username, roleId: OWNER })
        .run();
    const roleId = member?.roleId ?? (bootstrap ? OWNER : null);
    const role = roleId ? stores.role(roleId) : undefined;
    const user: PanelUser | null = role
      ? {
          motorUserId: me.user.id,
          username: me.user.username,
          role,
          areas: new Set(role.panel),
          minecraftUuid: me.user.minecraftUuid ?? null,
          csrfToken: me.csrfToken,
        }
      : null;
    const result = { at: Date.now(), user, signedIn: true };
    cache.set(key, result);
    return result;
  };

  const resolve = async (request: FastifyRequest): Promise<PanelUser | null> =>
    (await lookup(request.headers.cookie ?? '')).user;

  return {
    resolve,
    require: async (request, area) => {
      const { user, signedIn } = await lookup(request.headers.cookie ?? '');
      if (!signedIn) throw unauthorized();
      if (!user) throw forbidden('not_in_team');
      if (area && !user.areas.has(area)) throw forbidden('panel_area_forbidden');
      if (UNSAFE.has(request.method) && request.headers['x-csrf-token'] !== user.csrfToken)
        throw forbidden('csrf');
      return user;
    },
  };
}
