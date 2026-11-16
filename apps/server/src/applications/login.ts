import crypto from 'node:crypto';

/**
 * Anmeldung für Bewerber auf der Webseite: „Mit Discord anmelden“ (OAuth2, nur „identify“ – Name und ID, sonst nichts)
 * landet in einem signierten Cookie (2 Stunden). Gilt für MorniCraft- und Team-Bewerbungen gleich.
 */

export const LOGIN_COOKIE = 'mm_apply';
export const STATE_COOKIE = 'mm_apply_state';
export const LOGIN_SECONDS = 7200;
export const STATE_SECONDS = 600;
const SECOND_MS = 1000;
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

export interface ApplyLogin {
  readonly id: string;
  readonly name: string;
  readonly exp: number;
}

export interface ApplyLoginKit {
  readonly seal: (login: Omit<ApplyLogin, 'exp'>) => string;
  /** Angemeldete Person aus dem Cookie-Kopf; null = nicht (mehr) angemeldet oder verfälscht. */
  readonly open: (cookieHeader: string | undefined) => ApplyLogin | null;
}

export function cookieOf(header: string | undefined, name: string): string | null {
  const part = (header ?? '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

/** Cookie setzen: HttpOnly, SameSite=Lax, über HTTPS „Secure“ (lokal zum Testen ohne). */
export function cookie(name: string, value: string, seconds: number, host: string): string {
  const secure = LOCAL_HOSTS.has(host.split(':')[0] ?? '') ? '' : '; Secure';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`;
}

export function createApplyLogin(secret: string): ApplyLoginKit {
  const key = crypto.createHash('sha256').update(`mm-apply:${secret}`).digest();
  const sign = (payload: string): string =>
    crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return {
    seal: (login) => {
      const payload = Buffer.from(
        JSON.stringify({ ...login, exp: Date.now() + LOGIN_SECONDS * SECOND_MS }),
      ).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    open: (header) => {
      const [payload, mac] = (cookieOf(header, LOGIN_COOKIE) ?? '').split('.');
      if (!payload || !mac) return null;
      const expected = Buffer.from(sign(payload));
      const given = Buffer.from(mac);
      if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
      const login = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ApplyLogin;
      return login.exp > Date.now() ? login : null;
    },
  };
}
