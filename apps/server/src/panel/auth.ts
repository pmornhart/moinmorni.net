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

/** So heißt das Sitzungs-Cookie des Motors (MorniHosting `auth/sessions.ts`). */
const SESSION_COOKIE = 'mh_session';
/** Höchstens so viele Sitzungen merken (Schutz vor Anfragen mit immer neuen Cookies). */
const CACHE_MAX = 2000;
// Sitzungs-Token des Motors: base64url, z. B. "mh_session=Qm9vb..." → "Qm9vb..."; mit Leerzeichen oder ";" nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9_-%5D%7B20%2C128%7D%24&testString=Qm9vb2tzX2FyZV9ncmVhdF8xMjM0NTY
const SESSION_TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

function sessionTokenOf(header: string): string | null {
  const part = header
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  const value = part ? decodeURIComponent(part.slice(SESSION_COOKIE.length + 1)) : '';
  return SESSION_TOKEN.test(value) ? value : null;
}

export interface PanelUser {
  readonly motorUserId: number;
  readonly username: string;
  readonly role: Role;
  readonly areas: ReadonlySet<PanelArea>;
  readonly minecraftUuid: string | null;
  readonly mustChangePassword: boolean;
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

  /** Merken, aber nie unbegrenzt: Abgelaufenes fliegt raus, und bei zu vielen Einträgen die ältesten. */
  const remember = (key: string, value: { at: number; user: PanelUser | null; signedIn: boolean }): void => {
    const now = Date.now();
    [...cache].filter(([, v]) => now - v.at >= CACHE_MS).forEach(([k]) => cache.delete(k));
    [...cache.keys()].slice(0, Math.max(0, cache.size - CACHE_MAX + 1)).forEach((k) => cache.delete(k));
    cache.set(key, value);
  };

  const lookup = async (
    cookieHeader: string,
    ip: string,
  ): Promise<{ user: PanelUser | null; signedIn: boolean }> => {
    // Nur das Sitzungs-Cookie des Motors zählt; ohne (oder mit Unsinn darin) gar nicht erst beim Motor nachfragen.
    const token = sessionTokenOf(cookieHeader);
    if (!token) return { user: null, signedIn: false };
    const cookie = `${SESSION_COOKIE}=${token}`;
    const key = crypto.createHash('sha256').update(token).digest('hex');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    const me = await motor.me(cookie, ip);
    if (!me) {
      const result = { at: Date.now(), user: null, signedIn: false };
      remember(key, result);
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
        .values({
          motorUserId: me.user.id,
          username: me.user.username,
          roleId: OWNER,
          minecraftUuid: me.user.minecraftUuid ?? null,
        })
        .run();
    // Verbundenes Minecraft-Konto merken: dort gilt die Team-Rolle auch im Spiel (Hub).
    const minecraftUuid = me.user.minecraftUuid ?? null;
    if (member && member.minecraftUuid !== minecraftUuid)
      db.update(teamMembers).set({ minecraftUuid }).where(eq(teamMembers.motorUserId, me.user.id)).run();
    const roleId = member?.roleId ?? (bootstrap ? OWNER : null);
    const role = roleId ? stores.role(roleId) : undefined;
    const user: PanelUser | null = role
      ? {
          motorUserId: me.user.id,
          username: me.user.username,
          role,
          areas: new Set(role.panel),
          minecraftUuid,
          mustChangePassword: me.user.mustChangePassword === true,
          csrfToken: me.csrfToken,
        }
      : null;
    const result = { at: Date.now(), user, signedIn: true };
    remember(key, result);
    return result;
  };

  const resolve = async (request: FastifyRequest): Promise<PanelUser | null> =>
    (await lookup(request.headers.cookie ?? '', request.ip)).user;

  return {
    resolve,
    require: async (request, area) => {
      const { user, signedIn } = await lookup(request.headers.cookie ?? '', request.ip);
      if (!signedIn) throw unauthorized();
      if (!user) throw forbidden('not_in_team');
      if (area && !user.areas.has(area)) throw forbidden('panel_area_forbidden');
      if (UNSAFE.has(request.method) && request.headers['x-csrf-token'] !== user.csrfToken)
        throw forbidden('csrf');
      return user;
    },
  };
}
