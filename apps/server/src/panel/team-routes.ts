import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Role } from '@moinmorni/shared';
import type { Api } from '../app.js';
import type { Db } from '../db/index.js';
import { players, teamMembers } from '../db/schema.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { MotorError, type MotorClient } from '../motor/client.js';
import { linkOf, putLink, type AccountLinks } from './account-links.js';
import type { PanelAuth, PanelUser } from './auth.js';
import type { Stores } from './stores.js';

/**
 * Team-Konten: Wer ins Panel darf, legt das Team hier an. Das Konto selbst lebt im Motor (Passwort, Passkeys,
 * 2FA – alles von MorniHosting); MoinMorni merkt sich dazu die Rolle. Neue Konten bekommen ein Startpasswort,
 * das beim ersten Anmelden durch ein eigenes ersetzt werden muss. Wer die Server-Seiten sehen darf (Bereich
 * „Server“), bekommt im Motor Zugriff auf alle Server des Netzwerks: Admins als Besitzer, alle anderen als
 * Moderator. Niemand legt Konten mit einer Rolle über (oder gleich) der eigenen an – außer dem Owner.
 */

const OWNER = 'owner';
const ADMIN = 'admin';
const MOTOR_OWNER_ROLE = 'owner';
const MOTOR_MODERATOR_ROLE = 'moderator';
/** Startpasswort: drei Viererblöcke ohne Zeichen, die man verwechseln kann (0/O, 1/l/I). */
const START_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const START_BLOCKS = 3;
const START_BLOCK_LENGTH = 4;
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const EMAIL_MAX = 254;
const ROLE_ID_MAX = 24;
const HTTP_SERVER_ERROR = 500;
// Benutzername wie im Motor: Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich – z. B. "lena.mod".
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-zA-Z0-9._-%5D%2B%24&testString=lena.mod
const USERNAME = /^[a-zA-Z0-9._-]+$/;

interface MotorUser {
  readonly id: number;
  readonly username: string;
  readonly isAdmin: boolean;
  readonly disabled: boolean;
  readonly totpEnabled: boolean;
  readonly lastLoginAt: string | null;
  readonly email: string | null;
  readonly mustChangePassword: boolean;
  readonly minecraft: { readonly name: string; readonly uuid: string } | null;
}

interface MotorRole {
  readonly id: number;
  readonly name: string;
  readonly builtIn: boolean;
}

const createBody = z.object({
  username: z.string().trim().min(USERNAME_MIN).max(USERNAME_MAX).regex(USERNAME),
  email: z.string().trim().email().max(EMAIL_MAX).optional(),
  roleId: z.string().min(1).max(ROLE_ID_MAX),
  locale: z.enum(['de', 'en']).default('de'),
});
const idParams = z.object({ id: z.coerce.number().int().positive() });
const roleBody = z.object({ roleId: z.string().min(1).max(ROLE_ID_MAX) });
const disabledBody = z.object({ disabled: z.boolean() });
const resetBody = z.object({ removeSecondFactors: z.boolean().default(false) });

export function startPassword(): string {
  return Array.from({ length: START_BLOCKS }, () =>
    Array.from(
      { length: START_BLOCK_LENGTH },
      () => START_ALPHABET[crypto.randomInt(START_ALPHABET.length)] ?? '',
    ).join(''),
  ).join('-');
}

/** Motor-Fehler mit Code (z. B. username_taken) gehen so an die Oberfläche. */
function motorFailure(err: unknown): never {
  if (err instanceof MotorError && err.status < HTTP_SERVER_ERROR) throw new AppError(err.status, err.code);
  throw err;
}

/** Anfrage an den Motor; seine Fehler (409 username_taken …) kommen als eigene Fehler mit gleichem Code. */
async function ask<T>(motor: MotorClient, method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await motor.request<T>(method, path, body);
  } catch (err) {
    return motorFailure(err);
  }
}

export interface NewAccount {
  readonly username: string;
  readonly email?: string | undefined;
  readonly roleId: string;
  readonly locale: 'de' | 'en';
}

export interface TeamAccess {
  /** Server-Zugriff im Motor für alle Team-Konten nach ihrer Rolle (nach neuen Servern oder Rollen-Änderungen). */
  readonly syncAll: () => Promise<void>;
  /** Darf `me` ein Konto mit dieser Rolle anlegen? (Bereich „Rollen“, Rolle unter der eigenen, mit Panel-Bereichen) */
  readonly mayCreate: (me: PanelUser, roleId: string) => boolean;
  /** Team-Konto anlegen (Startpasswort, Pflicht-Wechsel beim ersten Anmelden) – wie unter Team im Panel. */
  readonly create: (
    me: PanelUser,
    account: NewAccount,
  ) => Promise<{ readonly username: string; readonly password: string }>;
}

export function registerTeamRoutes(
  app: Api,
  auth: PanelAuth,
  stores: Stores,
  db: Db,
  motor: MotorClient,
  links?: AccountLinks,
): TeamAccess {
  const members = () => db.select().from(teamMembers).all();
  const member = (id: number) => db.select().from(teamMembers).where(eq(teamMembers.motorUserId, id)).get();
  const roleOf = (id: string): Role => {
    const role = stores.role(id);
    if (!role) throw badRequest('role_unknown');
    return role;
  };
  /** Owner darf alles; sonst nur Rollen unter der eigenen. */
  const mayHandle = (user: PanelUser, role: Role): boolean =>
    user.role.id === OWNER || role.position > user.role.position;
  const owners = (): number => members().filter((m) => m.roleId === OWNER).length;

  /**
   * Motor-Zugriff passend zur Rolle: Owner ist im Motor Admin (alle Server und Einstellungen), alle anderen nicht –
   * wer kein Owner mehr ist, verliert das sofort. Dazu der Zugriff auf die Server-Seiten.
   */
  const syncAccess = async (motorUserId: number, role: Role, known?: readonly MotorUser[]): Promise<void> => {
    const users = known ?? (await ask<MotorUser[]>(motor, 'GET', '/api/users'));
    const admin = role.id === OWNER;
    if (users.find((u) => u.id === motorUserId)?.isAdmin !== admin)
      await ask(motor, 'PATCH', `/api/users/${motorUserId}`, { isAdmin: admin });
    if (admin) return;
    const wantsServers = role.panel.includes('servers');
    const [servers, roles] = await Promise.all([
      wantsServers ? motor.servers() : Promise.resolve([]),
      wantsServers ? ask<MotorRole[]>(motor, 'GET', '/api/roles') : Promise.resolve([]),
    ]);
    const motorRole = roles.find(
      (r) => r.name === (role.id === ADMIN ? MOTOR_OWNER_ROLE : MOTOR_MODERATOR_ROLE),
    );
    const access = motorRole ? servers.map((s) => ({ serverId: s.id, roleId: motorRole.id })) : [];
    await ask(motor, 'PUT', `/api/users/${motorUserId}/access`, { access });
  };

  const view = (m: typeof teamMembers.$inferSelect, motorUser: MotorUser | undefined, me: PanelUser) => {
    const role = stores.role(m.roleId);
    const player = m.minecraftUuid
      ? db.select().from(players).where(eq(players.uuid, m.minecraftUuid)).get()
      : undefined;
    return {
      id: m.motorUserId,
      username: m.username,
      roleId: m.roleId,
      email: motorUser?.email ?? null,
      minecraft: m.minecraftUuid
        ? {
            uuid: m.minecraftUuid,
            name: player?.name ?? motorUser?.minecraft?.name ?? '',
            confirmed: linkOf(db, m.motorUserId).confirmed !== undefined,
          }
        : null,
      discord: ((l) => (l.discordId ? { id: l.discordId, name: l.discordName ?? '' } : null))(
        linkOf(db, m.motorUserId),
      ),
      disabled: motorUser?.disabled ?? false,
      twoFactor: motorUser?.totpEnabled ?? false,
      mustChangePassword: motorUser?.mustChangePassword ?? false,
      lastLoginAt: motorUser?.lastLoginAt ?? null,
      createdAt: m.createdAt,
      self: m.motorUserId === me.motorUserId,
      /** Darf ich diese Person bearbeiten? */
      manageable: m.motorUserId !== me.motorUserId && Boolean(role && mayHandle(me, role)),
    };
  };
  const list = async (me: PanelUser) => {
    const motorUsers = await ask<MotorUser[]>(motor, 'GET', '/api/users');
    const byId = new Map(motorUsers.map((u) => [u.id, u]));
    return members()
      .map((m) => view(m, byId.get(m.motorUserId), me))
      .sort(
        (a, b) =>
          (stores.role(a.roleId)?.position ?? Number.MAX_SAFE_INTEGER) -
            (stores.role(b.roleId)?.position ?? Number.MAX_SAFE_INTEGER) ||
          a.username.localeCompare(b.username),
      );
  };
  /** Person, die ich bearbeiten darf (nicht ich selbst, Rolle unter meiner – außer als Owner). */
  const target = (me: PanelUser, id: number) => {
    const m = member(id);
    if (!m) throw notFound('team_member_unknown');
    if (m.motorUserId === me.motorUserId) throw badRequest('team_not_self');
    const role = stores.role(m.roleId);
    if (role && !mayHandle(me, role)) throw forbidden('team_higher');
    return m;
  };

  app.get('/api/panel/team', async (request) => list(await auth.require(request, 'roles')));

  /** Konto im Motor anlegen; die Rolle merkt sich MoinMorni. */
  const createAccount = async (me: PanelUser, account: NewAccount) => {
    if (!me.areas.has('roles')) throw forbidden('panel_area_forbidden');
    const role = roleOf(account.roleId);
    if (role.fallback) throw badRequest('team_role_fallback');
    // Eine Rolle ohne Panel-Bereiche sähe nach dem Anmelden nichts – dafür braucht es kein Konto.
    if (role.panel.length === 0) throw badRequest('team_role_no_panel');
    if (!mayHandle(me, role)) throw forbidden('team_higher');
    const password = startPassword();
    const created = await ask<MotorUser>(motor, 'POST', '/api/users', {
      username: account.username,
      password,
      locale: account.locale,
      isAdmin: false,
      ...(account.email ? { email: account.email } : {}),
    });
    db.insert(teamMembers)
      .values({ motorUserId: created.id, username: created.username, roleId: role.id, minecraftUuid: null })
      .run();
    await syncAccess(created.id, role);
    return { created, password };
  };

  app.post('/api/panel/team', { schema: { body: createBody } }, async (request) => {
    const me = await auth.require(request, 'roles');
    const { created, password } = await createAccount(me, request.body);
    const row = member(created.id);
    return { member: row ? view(row, created, me) : null, password };
  });

  app.patch('/api/panel/team/:id', { schema: { params: idParams, body: roleBody } }, async (request) => {
    const me = await auth.require(request, 'roles');
    const m = target(me, request.params.id);
    const role = roleOf(request.body.roleId);
    if (role.fallback) throw badRequest('team_role_fallback');
    if (!mayHandle(me, role)) throw forbidden('team_higher');
    if (m.roleId === OWNER && role.id !== OWNER && owners() <= 1) throw conflict('team_last_owner');
    db.update(teamMembers).set({ roleId: role.id }).where(eq(teamMembers.motorUserId, m.motorUserId)).run();
    // Rang im Spiel und Discord-Rolle gleich mitziehen.
    links?.changed(m.motorUserId);
    await syncAccess(m.motorUserId, role);
    return { ok: true };
  });

  app.put(
    '/api/panel/team/:id/disabled',
    { schema: { params: idParams, body: disabledBody } },
    async (request) => {
      const me = await auth.require(request, 'roles');
      const m = target(me, request.params.id);
      await ask(motor, 'PATCH', `/api/users/${m.motorUserId}`, { disabled: request.body.disabled });
      // Gesperrt: Team-Rolle gilt weder im Spiel noch in Discord (entsperrt: wieder).
      putLink(db, m.motorUserId, { disabled: request.body.disabled || null });
      links?.changed(m.motorUserId);
      return { ok: true };
    },
  );

  app.post(
    '/api/panel/team/:id/reset-password',
    { schema: { params: idParams, body: resetBody } },
    async (request) => {
      const me = await auth.require(request, 'roles');
      const m = target(me, request.params.id);
      return ask<{ password: string }>(
        motor,
        'POST',
        `/api/users/${m.motorUserId}/reset-password`,
        request.body,
      );
    },
  );

  app.delete('/api/panel/team/:id', { schema: { params: idParams } }, async (request) => {
    const me = await auth.require(request, 'roles');
    const m = target(me, request.params.id);
    if (m.roleId === OWNER && owners() <= 1) throw conflict('team_last_owner');
    await ask(motor, 'DELETE', `/api/users/${m.motorUserId}`);
    const discordId = linkOf(db, m.motorUserId).discordId;
    db.delete(teamMembers).where(eq(teamMembers.motorUserId, m.motorUserId)).run();
    putLink(db, m.motorUserId, { confirmed: null, discordId: null, discordName: null, discordAvatar: null });
    links?.emit({
      uuids: m.minecraftUuid ? [m.minecraftUuid] : [],
      discordIds: discordId ? [discordId] : [],
    });
    return { ok: true };
  });

  return {
    mayCreate: (me, roleId) => {
      const role = stores.role(roleId);
      return Boolean(
        me.areas.has('roles') && role && !role.fallback && role.panel.length > 0 && mayHandle(me, role),
      );
    },
    create: async (me, account) => {
      const { created, password } = await createAccount(me, account);
      return { username: created.username, password };
    },
    syncAll: async () => {
      const users = await ask<MotorUser[]>(motor, 'GET', '/api/users');
      // Sperre aus dem Motor spiegeln (auch für Konten, die vor dieser Fassung gesperrt wurden).
      members().forEach((m) => {
        const off = users.find((u) => u.id === m.motorUserId)?.disabled === true;
        if (off === (linkOf(db, m.motorUserId).disabled === true)) return;
        putLink(db, m.motorUserId, { disabled: off || null });
        links?.changed(m.motorUserId);
      });
      await Promise.all(
        members().map((m) => {
          const role = stores.role(m.roleId);
          return role ? syncAccess(m.motorUserId, role, users) : Promise.resolve();
        }),
      );
    },
  };
}
