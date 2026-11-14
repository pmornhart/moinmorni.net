import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Api } from '../app.js';
import type { Db } from '../db/index.js';
import { news } from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import type { EventBus } from '../lib/events.js';
import { newsView } from '../public/site-routes.js';
import type { PanelAuth } from './auth.js';

/** Panel: News schreiben, als Entwurf halten, veröffentlichen (geht auch in Discord #ankündigungen). */

const TITLE_MAX = 120;
const BODY_MAX = 20_000;
const SLUG_LENGTH = 60;
// Für die Adresse: alles außer a–z, 0–9 wird zu „-“. "Neu: Morni Party!" → "neu-morni-party".
// https://regex101.com/?flavor=javascript&regex=%5B%5Ea-z0-9%5D%2B&flags=g&testString=neu%3A%20morni%20party!
const NOT_SLUG = /[^a-z0-9]+/g;
// Striche am Rand weg: "-neu-" → "neu".
// https://regex101.com/?flavor=javascript&regex=%5E-%2B%7C-%2B%24&flags=g&testString=-neu-
const EDGE_DASHES = /^-+|-+$/g;
const UMLAUTS: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
// Umlaute: "Mönch" → "Moench" (vor dem Slug).
// https://regex101.com/?flavor=javascript&regex=%5B%C3%A4%C3%B6%C3%BC%C3%9F%5D&flags=g&testString=m%C3%B6nch
const UMLAUT = /[äöüß]/g;

const body = z.object({
  category: z.enum(['update', 'event', 'info']),
  title: z.object({ de: z.string().trim().min(1).max(TITLE_MAX), en: z.string().trim().max(TITLE_MAX) }),
  body: z.object({ de: z.string().trim().min(1).max(BODY_MAX), en: z.string().trim().max(BODY_MAX) }),
  pinned: z.boolean().default(false),
  /** true = jetzt veröffentlichen (bleibt veröffentlicht), false = Entwurf. */
  publish: z.boolean(),
});
const idParams = z.object({ id: z.coerce.number().int().positive() });

const slugOf = (title: string): string =>
  title
    .toLowerCase()
    .replace(UMLAUT, (c) => UMLAUTS[c] ?? c)
    .replace(NOT_SLUG, '-')
    .replace(EDGE_DASHES, '')
    .slice(0, SLUG_LENGTH) || 'news';

export function registerNewsRoutes(app: Api, auth: PanelAuth, db: Db, events: EventBus): void {
  const free = (base: string, id?: number): string => {
    const taken = (slug: string): boolean => {
      const row = db.select().from(news).where(eq(news.slug, slug)).get();
      return Boolean(row && row.id !== id);
    };
    const tries = Array.from({ length: 50 }, (_, i) => (i === 0 ? base : `${base}-${i + 1}`));
    return tries.find((slug) => !taken(slug)) ?? `${base}-${Date.now()}`;
  };
  const panelView = (n: typeof news.$inferSelect) => ({ id: n.id, ...newsView(n), createdAt: n.createdAt });

  app.get('/api/panel/news', async (request) => {
    await auth.require(request, 'content');
    return db.select().from(news).orderBy(desc(news.id)).all().map(panelView);
  });

  app.post('/api/panel/news', { schema: { body } }, async (request) => {
    const user = await auth.require(request, 'content');
    const b = request.body;
    const at = new Date().toISOString();
    const row = db
      .insert(news)
      .values({
        slug: free(slugOf(b.title.de)),
        category: b.category,
        titleDe: b.title.de,
        titleEn: b.title.en || b.title.de,
        bodyDe: b.body.de,
        bodyEn: b.body.en || b.body.de,
        pinned: b.pinned,
        publishedAt: b.publish ? at : null,
        author: user.username,
      })
      .returning()
      .get();
    if (row.publishedAt) events.emit('news.published', { slug: row.slug });
    return panelView(row);
  });

  app.put('/api/panel/news/:id', { schema: { params: idParams, body } }, async (request) => {
    await auth.require(request, 'content');
    const before = db.select().from(news).where(eq(news.id, request.params.id)).get();
    if (!before) throw notFound('news_unknown');
    const b = request.body;
    const publishedAt = b.publish ? (before.publishedAt ?? new Date().toISOString()) : null;
    const row = db
      .update(news)
      .set({
        category: b.category,
        titleDe: b.title.de,
        titleEn: b.title.en || b.title.de,
        bodyDe: b.body.de,
        bodyEn: b.body.en || b.body.de,
        pinned: b.pinned,
        publishedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(news.id, before.id))
      .returning()
      .get();
    if (!before.publishedAt && row.publishedAt) events.emit('news.published', { slug: row.slug });
    return panelView(row);
  });

  app.delete('/api/panel/news/:id', { schema: { params: idParams } }, async (request) => {
    await auth.require(request, 'content');
    db.delete(news).where(eq(news.id, request.params.id)).run();
    return { ok: true };
  });
}
