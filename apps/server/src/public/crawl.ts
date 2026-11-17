import type { Mode } from '@moinmorni/shared';
import type { Api } from '../app.js';

/**
 * Für Suchmaschinen und Browser: `robots.txt` (alles außer Panel und API), `sitemap.xml` (die öffentlichen Seiten),
 * `favicon.ico` (das Wappen) – vorher kam für all das die Startseite zurück. Dazu, welche Pfade die Webseite kennt:
 * alles andere bekommt die Webseite mit Status 404 (sie zeigt dann ihre Seite „Nicht gefunden“).
 */

const HTTP_MOVED_PERMANENTLY = 301;
const HTTP_NOT_FOUND = 404;
/** Robots und Sitemap ändern sich nur mit Modi und Domain – einen Tag frisch. */
const CRAWL_CACHE = 'public, max-age=86400';
const FAVICON = '/favicon.svg';

/** Öffentliche Seiten in der Sitemap (Pfade der Webseite, `apps/web/src/public/PublicApp.tsx`). */
const SITEMAP_PAGES = ['/', '/news', '/spielmodi', '/statistiken', '/team', '/regeln', '/hilfe', '/befehle'];

/**
 * Pfade der Webseite und des Panels (wie in `PublicApp.tsx` und unter `/panel`). Ein Teil ohne „/“ für Namen
 * (`/spieler/:name`, `/spielmodi/:id`) – ob es den Spieler oder die News gibt, weiß nur die Seite selbst.
 */
const KNOWN_PAGES: readonly RegExp[] = [
  // Startseite und feste Seiten: "/", "/spielmodi", "/hilfe/" – nicht "/robots.txt" oder "/hilfe/x/y".
  // https://regex101.com/?flavor=javascript&regex=%5E%5C%2F(news%7Cspielmodi%7Cstatistiken%7Cteam%7Cregeln%7Chilfe%7Cbefehle%7Ccommands%7Cimpressum%7Cdatenschutz)%3F%5C%2F%3F%24&testString=%2Fspielmodi
  /^\/(news|spielmodi|statistiken|team|regeln|hilfe|befehle|commands|impressum|datenschutz)?\/?$/,
  // "/news/sommerfest", "/spielmodi/duels", "/spieler/Anna", "/befehle/mornicraft" – nicht "/news/a/b".
  // https://regex101.com/?flavor=javascript&regex=%5E%5C%2F(news%7Cspielmodi%7Cspieler%7Cbefehle%7Ccommands)%5C%2F%5B%5E%2F%5D%2B%5C%2F%3F%24&testString=%2Fspieler%2FAnna
  /^\/(news|spielmodi|spieler|befehle|commands)\/[^/]+\/?$/,
  // "/mornicraft/bewerben", "/team/bewerben".
  // https://regex101.com/?flavor=javascript&regex=%5E%5C%2F(mornicraft%7Cteam)%5C%2Fbewerben%5C%2F%3F%24&testString=%2Fteam%2Fbewerben
  /^\/(mornicraft|team)\/bewerben\/?$/,
  // Das Panel hat eigene Seiten darunter: "/panel", "/panel/spieler/…".
  // https://regex101.com/?flavor=javascript&regex=%5E%5C%2Fpanel(%5C%2F%7C%24)&testString=%2Fpanel%2Fspieler
  /^\/panel(\/|$)/,
];

/** Kennt die Webseite diesen Pfad (ohne Abfrage)? Sonst bekommt der Browser sie mit 404. */
export function knownPage(url: string): boolean {
  const pathname = url.split('?')[0]?.split('#')[0] ?? '';
  const decoded = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return null;
    }
  })();
  return decoded !== null && KNOWN_PAGES.some((page) => page.test(decoded));
}

/** `robots.txt`: alles erlaubt außer Panel und API; mit Domain dazu der Weg zur Sitemap. */
export function robotsTxt(domain: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /panel',
    'Disallow: /api/',
    ...(domain ? ['', `Sitemap: https://${domain}/sitemap.xml`] : []),
    '',
  ].join('\n');
}

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
// Zeichen, die in XML eine Bedeutung haben: "&", "<", ">", Anführungszeichen.
// https://regex101.com/?flavor=javascript&regex=%5B%26%3C%3E%22'%5D&flags=g&testString=a%26b%3Cc
const XML_SPECIAL = /[&<>"']/g;
const xml = (text: string): string => text.replace(XML_SPECIAL, (c) => XML_ESCAPES[c] ?? c);

/** `sitemap.xml`: die öffentlichen Seiten und die Seite jedes Spielmodus, mit der eigenen Domain. */
export function sitemapXml(domain: string, modes: readonly Pick<Mode, 'id'>[]): string {
  const paths = [...SITEMAP_PAGES, ...modes.map((m) => `/spielmodi/${encodeURIComponent(m.id)}`)];
  const urls = paths.map((p) => `  <url><loc>${xml(`https://${domain}${p}`)}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** Die drei Dateien als Routen (GET und HEAD). Ohne Domain gibt es keine Sitemap (Adressen brauchen sie). */
export function registerCrawlRoutes(
  app: Api,
  domain: string,
  modes: () => readonly Pick<Mode, 'id'>[],
): void {
  app.get('/robots.txt', async (_request, reply) =>
    reply.type('text/plain; charset=utf-8').header('cache-control', CRAWL_CACHE).send(robotsTxt(domain)),
  );
  app.get('/sitemap.xml', async (_request, reply) => {
    if (!domain) return reply.code(HTTP_NOT_FOUND).send({ error: 'not_found' });
    return reply
      .type('application/xml; charset=utf-8')
      .header('cache-control', CRAWL_CACHE)
      .send(sitemapXml(domain, modes()));
  });
  // Browser fragen ohne Hinweis nach /favicon.ico – das Wappen liegt als SVG daneben.
  app.get('/favicon.ico', async (_request, reply) => reply.redirect(FAVICON, HTTP_MOVED_PERMANENTLY));
}
