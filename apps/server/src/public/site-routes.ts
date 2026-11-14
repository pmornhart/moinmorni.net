import { and, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Api } from '../app.js';
import type { Db } from '../db/index.js';
import { news, players, teamMembers } from '../db/schema.js';
import type { Hub } from '../hub/index.js';
import { normalUuid } from '../hub/players.js';
import { notFound } from '../lib/errors.js';
import type { Stores } from '../panel/stores.js';

/**
 * Öffentlich, ohne Anmeldung: News, Ranglisten, Spielerprofile (außer privat), Team, Regeln und Links – alles, was
 * die Webseite zeigt. Nichts davon verrät mehr als ein Spieler im Spiel auch sehen würde.
 */

const TOP_MAX = 50;
const TOP_DEFAULT = 10;
const NEWS_MAX = 50;
const NEWS_DEFAULT = 10;
const NAME_MAX = 17;
const SLUG_MAX = 80;

const topQuery = z.object({ limit: z.coerce.number().int().min(1).max(TOP_MAX).default(TOP_DEFAULT) });
const newsQuery = z.object({ limit: z.coerce.number().int().min(1).max(NEWS_MAX).default(NEWS_DEFAULT) });

export type NewsRow = typeof news.$inferSelect;

export const newsView = (n: NewsRow) => ({
  slug: n.slug,
  category: n.category,
  title: { de: n.titleDe, en: n.titleEn },
  body: { de: n.bodyDe, en: n.bodyEn },
  pinned: n.pinned,
  publishedAt: n.publishedAt,
  author: n.author,
});

export function registerSiteRoutes(
  app: Api,
  db: Db,
  stores: Stores,
  hub: Hub,
  discordInvite: () => string | null,
): void {
  const published = () => and(isNotNull(news.publishedAt), lte(news.publishedAt, new Date().toISOString()));

  app.get('/api/news', { schema: { querystring: newsQuery } }, async (request) =>
    db
      .select()
      .from(news)
      .where(published())
      .orderBy(desc(news.pinned), desc(news.publishedAt))
      .limit(request.query.limit)
      .all()
      .map(newsView),
  );

  app.get(
    '/api/news/:slug',
    { schema: { params: z.object({ slug: z.string().min(1).max(SLUG_MAX) }) } },
    async (request) => {
      const row = db
        .select()
        .from(news)
        .where(and(eq(news.slug, request.params.slug), published()))
        .get();
      if (!row) throw notFound('news_unknown');
      return newsView(row);
    },
  );

  const roleView = (uuid: string) => {
    const r = hub.players.roleOf(uuid);
    return { id: r.id, name: r.name, symbol: r.symbol, colour: r.colour };
  };

  /** Rangliste nach Spielzeit (private Profile zählen nicht). */
  app.get('/api/stats/top', { schema: { querystring: topQuery } }, async (request) =>
    db
      .select()
      .from(players)
      .where(eq(players.privateProfile, false))
      .orderBy(desc(players.playMinutes))
      .limit(request.query.limit)
      .all()
      .map((p, i) => ({
        rank: i + 1,
        uuid: p.uuid,
        name: p.name,
        playMinutes: p.playMinutes,
        role: roleView(p.uuid),
      })),
  );

  app.get(
    '/api/players/:name',
    { schema: { params: z.object({ name: z.string().min(1).max(NAME_MAX) }) } },
    async (request) => {
      const row = hub.players.byName(request.params.name);
      if (!row) throw notFound('player_unknown');
      if (row.privateProfile) return { name: row.name, private: true };
      const online = hub.presence.get(row.uuid);
      const mode = online?.server ? stores.modes().find((m) => m.server === online.server) : undefined;
      return {
        name: row.name,
        uuid: row.uuid,
        private: false,
        bedrock: row.bedrock,
        role: roleView(row.uuid),
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
        playMinutes: row.playMinutes,
        online: online
          ? { where: mode ? mode.name : online.server === 'lobby' ? { de: 'Lobby', en: 'Lobby' } : null }
          : null,
      };
    },
  );

  /** Das Team: alle Ränge mit Panel-Zugang und wer sie hat (Name und Rang, sonst nichts). */
  app.get('/api/team', async () => {
    const roles = stores.roles().filter((r) => r.panel.length > 0);
    const linked = db.select().from(teamMembers).where(isNotNull(teamMembers.minecraftUuid)).all();
    const byRole = roles.map((role) => {
      const own = db
        .select()
        .from(players)
        .where(eq(players.roleId, role.id))
        .all()
        .map((p) => ({ uuid: p.uuid, name: p.name }));
      const team = linked
        .filter((m) => m.roleId === role.id && m.minecraftUuid)
        .map((m) => {
          const uuid = normalUuid(m.minecraftUuid ?? '');
          return { uuid, name: hub.players.get(uuid)?.name ?? m.username };
        });
      const members = [...new Map([...own, ...team].map((m) => [m.uuid, m])).values()];
      return {
        role: { id: role.id, name: role.name, symbol: role.symbol, colour: role.colour },
        members: members.map((m) => ({ ...m, online: Boolean(hub.presence.get(m.uuid)) })),
      };
    });
    return byRole.filter((r) => r.members.length > 0);
  });

  /** Regeln, Discord-Einladung, Kanäle. */
  app.get('/api/site', async () => {
    const s = stores.settings('website');
    const lines = (v: unknown): string[] =>
      String(v ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const link = (v: unknown): string | null =>
      typeof v === 'string' && v.startsWith('https://') ? v : null;
    return {
      rules: { de: lines(s['rulesDe']), en: lines(s['rulesEn']) },
      // Gemeinsame Sprachkanäle (Einstellungen „Sprachchat“), damit die Hilfe-Seite die echten Namen zeigt.
      voiceChannels: ((stores.settings('voice')['channels'] as string[] | undefined) ?? []).filter(
        (c) => typeof c === 'string' && c.trim() !== '',
      ),
      discordInvite: link(s['discordInvite']) ?? discordInvite(),
      socials: {
        youtube: link(s['youtube']),
        tiktok: link(s['tiktok']),
        instagram: link(s['instagram']),
      },
      players:
        db
          .select({ n: sql<number>`count(*)` })
          .from(players)
          .get()?.n ?? 0,
    };
  });
}
