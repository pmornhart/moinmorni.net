import crypto from 'node:crypto';

/**
 * Sicherheitsregeln für den Browser (Content-Security-Policy): Skripte nur von unserer eigenen Seite – ein Text, der
 * irgendwo als HTML durchrutscht, kann so kein Skript starten, auch kein fremdes nachladen. Erlaubt ist dazu genau das
 * kleine Skript in der index.html (hell/dunkel vor dem ersten Bild), über seine Prüfsumme. Bilder dürfen von überall
 * per https kommen (Logos der Server-Programme, Bilder aus Discord), Verbindungen nur zur eigenen Seite. Andere Seiten
 * dürfen uns nicht in einen Rahmen packen (Schutz vor untergeschobenen Klicks).
 */

// Inline-Skript ohne src in der index.html: "<script>(function(){…})()</script>" → der Text dazwischen;
// "<script type="module" crossorigin src="/assets/x.js"></script>" nicht (Attribute).
// https://regex101.com/?flavor=javascript&regex=%3Cscript%3E(%5B%5Cs%5CS%5D*%3F)%3C%5C%2Fscript%3E&flags=g&testString=%3Cscript%3E(function()%7B%7D)()%3C%2Fscript%3E
const INLINE_SCRIPT = /<script>([\s\S]*?)<\/script>/g;

/** Prüfsummen ('sha256-…') aller Inline-Skripte einer HTML-Seite, so wie der Browser sie rechnet. */
export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(INLINE_SCRIPT)].map(
    (m) =>
      `'sha256-${crypto
        .createHash('sha256')
        .update(m[1] ?? '', 'utf8')
        .digest('base64')}'`,
  );
}

/** Die Regeln für helmet (`contentSecurityPolicy.directives`). `domain` = eigene Domain (Live-Verbindung per wss). */
export function contentSecurityPolicy(
  domain: string,
  scriptHashes: readonly string[],
): Record<string, string[]> {
  const self = "'self'";
  return {
    'default-src': [self],
    'script-src': [self, ...scriptHashes],
    'script-src-attr': ["'none'"],
    // Tailwind-Klassen kommen als Datei; Editor und Konsole der Server-Seiten setzen Stile zur Laufzeit.
    'style-src': [self, "'unsafe-inline'"],
    'img-src': [self, 'data:', 'blob:', 'https:'],
    'font-src': [self, 'data:'],
    'connect-src': [self, ...(domain ? [`wss://${domain}`] : [])],
    'media-src': [self, 'blob:'],
    'worker-src': [self, 'blob:'],
    'object-src': ["'none'"],
    'base-uri': [self],
    'form-action': [self],
    'frame-ancestors': [self],
  };
}
