import httpProxy from '@fastify/http-proxy';
import type { FastifyInstance } from 'fastify';
import { notFound } from '../lib/errors.js';

/**
 * moinmorni.net/panel/motor/api/* → Motor /api/*: Login (Passkeys, 2FA), die eingebetteten Server-Seiten und die
 * Live-Verbindung des Motors. Nur freigegebene Pfade gehen durch – Registrieren, Einrichten, Schlüssel,
 * Hoster-Funktionen (Bestellungen, Zahlungen, Freigaben) und Umzug gibt es über MoinMorni nicht. Bilder von Mojang
 * (Spielbilder, Item-Texturen aus dem Wiki) bleiben draußen – der Motor zeigt dann seine eigenen Zeichnungen.
 */

export const MOTOR_PREFIX = '/panel/motor';

const ALLOW: readonly string[] = [
  '/api/auth/',
  '/api/account/',
  '/api/servers',
  '/api/networks',
  '/api/ws',
  '/api/heads/',
  '/api/versions',
  '/api/content/',
  '/api/host',
  '/api/settings',
  '/api/netbird',
  '/api/dns',
  '/api/https',
  '/api/ddos',
  '/api/mail',
  '/api/stalwart',
  '/api/system/',
  '/api/audit',
  '/api/preload',
  '/api/webhooks',
];
const DENY: readonly string[] = [
  '/api/auth/register',
  '/api/auth/confirm',
  '/api/setup',
  '/api/signup',
  '/api/tokens',
];

/** Darf dieser Pfad (ohne /panel/motor davor, ohne ?…) an den Motor? */
export function motorPathAllowed(path: string): boolean {
  // Kodierte Zeichen (%72egister = register) dekodiert der Motor erst hinter dieser Prüfung – die Oberfläche braucht
  // sie im Pfad nie, also gar nicht erst durchlassen. Doppelte Schrägstriche ebenso nicht.
  if (path.includes('..') || path.includes('%') || path.includes('//')) return false;
  // „/api/auth/./register“ hieße beim Motor „/api/auth/register“, ein „\“ wird dort zu „/“ – beides schon hier ab.
  if (path.includes('\\') || path.split('/').includes('.')) return false;
  if (DENY.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  return ALLOW.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}

/**
 * Startet jemand im Panel einen Server, der nicht mehr in den Arbeitsspeicher passt, schickt das Netzwerk vorher leere
 * Modi schlafen (statt dass der Motor „nicht genug Arbeitsspeicher“ meldet). Passt: "/api/servers/ab12/actions/start",
 * "/api/servers/ab12/actions/restart"; passt nicht: "/api/servers/ab12/actions/stop", "/api/servers".
 * https://regex101.com/?flavor=javascript&regex=%5E%5C%2Fapi%5C%2Fservers%5C%2F(%5B%5E%2F%5D%2B)%5C%2Factions%5C%2F(start%7Crestart)%24&testString=%2Fapi%2Fservers%2Fab12%2Factions%2Fstart
 */
const START_ACTION = /^\/api\/servers\/([^/]+)\/actions\/(start|restart)$/;

export interface MotorProxyHooks {
  /** Vor dem Start eines Servers (Motor-ID): Platz im Arbeitsspeicher schaffen. Fehler halten den Start nicht auf. */
  readonly beforeStart?: (serverId: string) => Promise<unknown>;
}

export async function registerMotorProxy(
  app: FastifyInstance,
  motorUrl: string,
  hooks: MotorProxyHooks = {},
): Promise<void> {
  await app.register(httpProxy, {
    upstream: motorUrl,
    prefix: MOTOR_PREFIX,
    rewritePrefix: '',
    websocket: true,
    // Der Motor prüft, ob eine Anfrage von seiner eigenen Seite kommt (Origin = Host) – er soll also den Namen sehen,
    // den der Browser aufgerufen hat (moinmorni.net), nicht „motor:8080“. Wie „Pass Host Header“ bei NetBird.
    replyOptions: {
      rewriteRequestHeaders: (request, headers) => ({
        ...headers,
        host: request.headers.host ?? headers.host,
        // Der Motor zählt Anmeldeversuche und Anfragen pro Besucher – er glaubt diese Adresse nur MoinMorni.
        'x-forwarded-for': request.ip,
      }),
    },
    // Die Live-Verbindung braucht das nicht: Ohne passende Herkunft beweist sie sich mit dem CSRF-Token in der
    // ersten Nachricht (macht die eingebettete Oberfläche von selbst).
    preHandler: async (request) => {
      const path = (request.url.slice(MOTOR_PREFIX.length).split('?')[0] ?? '').toLowerCase();
      if (!motorPathAllowed(path)) throw notFound();
      const start = request.method === 'POST' ? START_ACTION.exec(path) : null;
      const serverId = start?.[1];
      if (serverId && hooks.beforeStart) {
        // Ob die Person den Server starten darf, prüft danach der Motor wie immer – hier schlafen nur leere Modi.
        await hooks
          .beforeStart(serverId)
          .catch((err: unknown) =>
            request.log.warn({ err, serverId }, 'Platz für den Start ließ sich nicht schaffen'),
          );
      }
    },
  });
}
