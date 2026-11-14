/**
 * Der Motor: MorniHosting im Motor-Modus (MH_HEADLESS), nur im internen Netz erreichbar. MoinMorni spricht ihn
 * mit einem Dienst-Schlüssel an (`service-token moinmorni`) – für alles, was MoinMorni selbst tut (Server
 * anlegen, starten, Netzwerk verdrahten). Team-Mitglieder melden sich beim Motor an (Passkeys, 2FA); deren
 * Sitzung prüft MoinMorni über `/api/auth/me` mit ihrem eigenen Cookie.
 */

const HTTP_UNAUTHORIZED = 401;
const HTTP_NO_CONTENT = 204;
const TIMEOUT_MS = 15_000;

export class MotorError extends Error {
  override readonly name = 'MotorError';
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Motor: ${status} ${code}`);
  }
}

/** Was `/api/auth/me` des Motors über eine angemeldete Person sagt (Ausschnitt). */
export interface MotorMe {
  readonly user: {
    readonly id: number;
    readonly username: string;
    readonly isAdmin: boolean;
    readonly minecraftName?: string | null;
    readonly minecraftUuid?: string | null;
    /** Mit Startpasswort angemeldet: muss erst ein eigenes setzen. */
    readonly mustChangePassword?: boolean;
  };
  readonly csrfToken: string;
}

export interface MotorServer {
  readonly id: string;
  readonly name: string;
  readonly software: string;
  readonly version: string;
  readonly port: number;
  readonly address: string;
  readonly live: { readonly state: string; readonly playersOnline: number; readonly playersMax: number };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface MotorClient {
  readonly request: <T>(method: string, path: string, body?: unknown) => Promise<T>;
  /** Wer gehört zu diesem Cookie? null = nicht angemeldet. */
  readonly me: (cookie: string) => Promise<MotorMe | null>;
  readonly servers: () => Promise<MotorServer[]>;
  /** Datei in den Ordner eines Servers hochladen (z. B. das Netzwerk-Plugin nach plugins/). */
  readonly upload: (serverId: string, dir: string, filename: string, bytes: Uint8Array) => Promise<void>;
  /** Datei aus dem Ordner eines Servers holen (z. B. eine WorldEdit-Schematic). */
  readonly download: (serverId: string, path: string) => Promise<Uint8Array>;
  readonly baseUrl: string;
}

async function errorOf(res: Response): Promise<MotorError> {
  const text = await res.text();
  const code = ((): string | null => {
    try {
      const body = JSON.parse(text) as { error?: unknown };
      return typeof body.error === 'string' ? body.error : null;
    } catch {
      return null;
    }
  })();
  return new MotorError(res.status, code ?? `http_${res.status}`);
}

export function createMotorClient(baseUrl: string, token: string, fetchImpl: FetchLike = fetch): MotorClient {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw await errorOf(res);
    if (res.status === HTTP_NO_CONTENT) return undefined as T;
    return (await res.json()) as T;
  };
  const upload = async (
    serverId: string,
    dir: string,
    filename: string,
    bytes: Uint8Array,
  ): Promise<void> => {
    const form = new FormData();
    form.append('file', new Blob([bytes]), filename);
    const res = await fetchImpl(
      `${baseUrl}/api/servers/${encodeURIComponent(serverId)}/files/upload?path=${encodeURIComponent(dir)}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) throw await errorOf(res);
  };

  const download = async (serverId: string, path: string): Promise<Uint8Array> => {
    const res = await fetchImpl(
      `${baseUrl}/api/servers/${encodeURIComponent(serverId)}/files/download?path=${encodeURIComponent(path)}`,
      // identity: Schematics sind selbst gzip – ohne das würde unterwegs entpackt und die Datei kaputt.
      {
        headers: { authorization: `Bearer ${token}`, 'accept-encoding': 'identity' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) throw await errorOf(res);
    return new Uint8Array(await res.arrayBuffer());
  };

  return {
    baseUrl,
    request,
    download,
    me: async (cookie) => {
      if (!cookie) return null;
      const res = await fetchImpl(`${baseUrl}/api/auth/me`, {
        headers: { cookie },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === HTTP_UNAUTHORIZED) return null;
      if (!res.ok) throw await errorOf(res);
      return (await res.json()) as MotorMe;
    },
    servers: () => request<MotorServer[]>('GET', '/api/servers'),
    upload,
  };
}
