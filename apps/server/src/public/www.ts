import type { Api } from '../app.js';

/**
 * `www.<Domain>` → `https://<Domain>` mit gleichem Pfad und gleicher Abfrage (301, dauerhaft). NetBird reicht beide
 * Namen an die Webseite weiter („Pass Host Header“). Umgeleitet wird nur genau dieser eine Name, und das Ziel ist immer
 * die eigene Domain – nie ein Name aus der Anfrage (kein offener Umleiter).
 */

const HTTP_MOVED_PERMANENTLY = 301;
const WWW = 'www.';
// Punkt am Ende eines vollständigen Namens: "www.moinmorni.net." → "www.moinmorni.net"; "moinmorni.net" bleibt.
// https://regex101.com/?flavor=javascript&regex=%5C.%24&testString=www.moinmorni.net.
const TRAILING_DOT = /\.$/;

const plainName = (name: string): string => name.trim().toLowerCase().replace(TRAILING_DOT, '');

/** Pfad und Abfrage einer Anfrage; kommt eine ganze Adresse („http://…/x“), nur deren Pfad – sonst die Startseite. */
function pathOf(url: string): string {
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/';
  }
}

/**
 * Wohin eine Anfrage an `www.<Domain>` gehört – oder null, wenn sie bleibt. `host` ohne Port (Fastify `hostname`),
 * `url` wie angefragt (Pfad und Abfrage). Das Ziel nennt immer die eigene Domain, darum bleibt jeder Pfad dort.
 */
export function wwwTarget(domain: string, host: string | undefined, url: string): string | null {
  const own = plainName(domain);
  if (!own || !host || plainName(host) !== `${WWW}${own}`) return null;
  return `https://${own}${pathOf(url)}`;
}

/** Leitet jede Anfrage an `www.<Domain>` auf die Domain selbst um, bevor irgendetwas anderes sie sieht. */
export function registerWwwRedirect(app: Api, domain: string): void {
  app.addHook('onRequest', async (request, reply) => {
    const target = wwwTarget(domain, request.hostname, request.url);
    if (target) return reply.redirect(target, HTTP_MOVED_PERMANENTLY);
    return undefined;
  });
}
