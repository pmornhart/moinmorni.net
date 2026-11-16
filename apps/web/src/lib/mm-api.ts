/**
 * morni.net's own API (/api/…). Changing requests carry the CSRF token of the team member's session (the motor's
 * token, which /api/panel/me hands out). The motor's API goes through MorniHosting's `api` with the base
 * "/panel/motor" instead.
 */

export type MmMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class MmApiError extends Error {
  override readonly name = 'MmApiError';
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

const HTTP_NO_CONTENT = 204;
const UNSAFE: readonly MmMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];
const session = { csrf: '' };

export function setPanelCsrf(token: string): void {
  session.csrf = token;
}

export function panelCsrf(): string {
  return session.csrf;
}

export interface MmRequest {
  readonly method?: MmMethod;
  readonly body?: unknown;
  /** Skip the CSRF header (setup before any login). */
  readonly anonymous?: boolean;
}

async function errorOf(response: Response): Promise<MmApiError> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return new MmApiError(response.status, body.error);
  } catch {
    // Not JSON: fall back to the status.
  }
  return new MmApiError(response.status, `http_${response.status}`);
}

export async function mmApi<TResult>(path: string, options: MmRequest = {}): Promise<TResult> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (UNSAFE.includes(method) && !options.anonymous) headers['x-csrf-token'] = session.csrf;
  const response = await (async (): Promise<Response> => {
    try {
      return await fetch(path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'same-origin',
      });
    } catch {
      throw new MmApiError(0, 'network');
    }
  })();
  if (!response.ok) throw await errorOf(response);
  if (response.status === HTTP_NO_CONTENT) return undefined as TResult;
  return (await response.json()) as TResult;
}
