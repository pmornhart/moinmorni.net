import { desc, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import { mayAssign } from '@moinmorni/shared';
import type { Api } from '../app.js';
import type { Db } from '../db/index.js';
import { players, punishments } from '../db/schema.js';
import type { Hub } from '../hub/index.js';
import { normalUuid } from '../hub/players.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import type { PanelAuth, PanelUser } from './auth.js';
import type { Stores } from './stores.js';

/**
 * Panel: Spieler (Suche, Profil, Rang) und Strafen (verhängen, aufheben, Verlauf). Strafen laufen über dieselbe
 * Moderation wie /ban im Spiel – Rauswurf, Bann-Liste und Hinweis ans Team inklusive.
 */

const LIST_MAX = 100;
const LIST_DEFAULT = 50;
const QUERY_MAX = 32;
const REASON_MAX = 200;
const MINUTES_MAX = 5_256_000; // zehn Jahre
const HISTORY_MAX = 200;
// Platzhalter in LIKE-Suchen entschärfen: "a_b" sucht wirklich „a_b“, nicht „a?b“.
// https://regex101.com/?flavor=javascript&regex=%5B%25_%5C%5C%5D&flags=g&testString=a_b%25
const LIKE_SPECIAL = /[%_\\]/g;

const listQuery = z.object({
  q: z.string().trim().max(QUERY_MAX).optional(),
  limit: z.coerce.number().int().min(1).max(LIST_MAX).default(LIST_DEFAULT),
});
const uuidParams = z.object({ uuid: z.string().min(1).max(40) });
const roleBody = z.object({ roleId: z.string().min(1).max(24).nullable() });
const punishBody = z.object({
  player: z.string().trim().min(1).max(40),
  kind: z.enum(['ban', 'mute', 'jail', 'warn', 'kick']),
  /** null = für immer (nur Bann, Stumm und Gefängnis). */
  minutes: z.number().int().min(1).max(MINUTES_MAX).nullable(),
  reason: z.string().trim().max(REASON_MAX).default(''),
});
const liftParams = z.object({ uuid: z.string().min(1).max(40), kind: z.enum(['ban', 'mute', 'jail']) });
const LASTING: ReadonlySet<string> = new Set(['ban', 'mute', 'jail', 'voice']);

export function registerPlayerRoutes(app: Api, auth: PanelAuth, stores: Stores, hub: Hub, db: Db): void {
  const view = (row: typeof players.$inferSelect) => {
    const online = hub.presence.get(row.uuid);
    const role = hub.players.roleOf(row.uuid);
    const ban = hub.punish.active(row.uuid, 'ban');
    const mute = hub.punish.active(row.uuid, 'mute');
    const jail = hub.punish.active(row.uuid, 'jail');
    return {
      uuid: row.uuid,
      name: row.name,
      bedrock: row.bedrock,
      role: {
        id: role.id,
        name: role.name,
        symbol: role.symbol,
        colour: role.colour,
        position: role.position,
      },
      ownRole: row.roleId,
      online: online ? { server: online.server } : null,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      playMinutes: row.playMinutes,
      language: row.language ?? row.clientLocale,
      banned: ban ? { until: ban.expiresAt, reason: ban.reason } : null,
      muted: mute ? { until: mute.expiresAt, reason: mute.reason } : null,
      jailed: jail ? { until: jail.expiresAt, reason: jail.reason } : null,
    };
  };

  /** Wie im Spiel: niemand bestraft oder ändert jemanden mit gleichem oder höherem Rang (außer Owner). */
  const higher = (user: PanelUser, uuid: string): boolean =>
    user.role.id === 'owner' || hub.players.roleOf(uuid).position > user.role.position;

  app.get('/api/panel/players', { schema: { querystring: listQuery } }, async (request) => {
    await auth.require(request, 'players');
    const { q, limit } = request.query;
    const rows = db
      .select()
      .from(players)
      .where(
        q
          ? like(sql`lower(${players.name})`, `%${q.toLowerCase().replace(LIKE_SPECIAL, '\\$&')}%`)
          : undefined,
      )
      .orderBy(desc(players.lastSeen))
      .limit(limit)
      .all();
    return {
      online: hub.presence.all().length,
      players: rows.map(view).sort((a, b) => Number(Boolean(b.online)) - Number(Boolean(a.online))),
    };
  });

  app.get('/api/panel/players/:uuid', { schema: { params: uuidParams } }, async (request) => {
    await auth.require(request, 'players');
    const row = hub.players.get(normalUuid(request.params.uuid));
    if (!row) throw notFound('player_unknown');
    return {
      ...view(row),
      history: hub.punish.history(row.uuid).map((p) => ({
        ...p,
        active: LASTING.has(p.kind) && hub.punish.active(row.uuid, p.kind)?.id === p.id,
      })),
    };
  });

  app.put(
    '/api/panel/players/:uuid/role',
    { schema: { params: uuidParams, body: roleBody } },
    async (request) => {
      const user = await auth.require(request, 'players');
      const row = hub.players.get(normalUuid(request.params.uuid));
      if (!row) throw notFound('player_unknown');
      const roles = stores.roles();
      const wanted = request.body.roleId ? roles.find((r) => r.id === request.body.roleId) : undefined;
      if (request.body.roleId && !wanted) throw badRequest('role_unknown');
      if (!higher(user, row.uuid)) throw forbidden('player_higher');
      if (wanted && !mayAssign(roles, user.role.id, wanted.id)) throw forbidden('role_too_high');
      hub.players.setRole(row.uuid, wanted && !wanted.fallback ? wanted.id : null);
      hub.refreshProfile(row.uuid);
      const fresh = hub.players.get(row.uuid);
      return fresh ? view(fresh) : null;
    },
  );

  app.get('/api/panel/punishments', async (request) => {
    await auth.require(request, 'punishments');
    const rows = db.select().from(punishments).orderBy(desc(punishments.id)).limit(HISTORY_MAX).all();
    return rows.map((p) => ({
      ...p,
      playerName: hub.players.get(p.playerUuid)?.name ?? p.playerUuid,
      // Nur was dauert, kann „aktiv“ sein – Verwarnung und Rauswurf sind einmalig.
      active: LASTING.has(p.kind) && hub.punish.active(p.playerUuid, p.kind)?.id === p.id,
    }));
  });

  app.post('/api/panel/punishments', { schema: { body: punishBody } }, async (request) => {
    const user = await auth.require(request, 'punishments');
    const t = hub.moderation.target(request.body.player);
    if (!t) throw notFound('player_unknown');
    if (!higher(user, t.uuid)) throw forbidden('player_higher');
    if (request.body.kind === 'kick' && !t.online) throw badRequest('player_offline');
    return hub.moderation.punish(
      t,
      request.body.kind,
      request.body.minutes,
      request.body.reason,
      user.username,
    );
  });

  app.delete('/api/panel/punishments/:uuid/:kind', { schema: { params: liftParams } }, async (request) => {
    const user = await auth.require(request, 'punishments');
    const t = hub.moderation.target(request.params.uuid);
    if (!t) throw notFound('player_unknown');
    if (!higher(user, t.uuid)) throw forbidden('player_higher');
    if (!hub.moderation.lift(t, request.params.kind, user.username)) throw notFound('punishment_none');
    return { ok: true };
  });
}
