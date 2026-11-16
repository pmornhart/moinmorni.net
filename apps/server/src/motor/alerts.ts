import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { WebSocket } from 'ws';
import { bt } from '../discord/texts.js';

/**
 * Meldungen des Motors ins Discord-Team-Log. Der Motor (MorniHosting) und sein Wächter merken, wenn etwas nicht stimmt
 * – NetBird getrennt, Hausanschluss nicht mehr versteckt, DNS, Docker, ein Server startet nicht, ein Backup scheitert –
 * und sagen, ob es sich selbst behebt oder was zu tun ist. Discord und Mail hat nur morni.net, also schickt der Motor
 * jede Meldung über seine Live-Verbindung (`/api/ws`, Kanal „alerts“). Die zuletzt gesehene merkt sich morni.net im
 * Datenordner: nach einem Neustart oder einer kurz getrennten Verbindung kommt nach, was dazwischen kam – nichts doppelt.
 */

/** Eine Meldung, wie sie der Motor schickt (`AlertEvent` in MorniHosting). */
export interface MotorAlert {
  readonly id: string;
  readonly at: string;
  readonly key: string;
  readonly kind: string;
  readonly status: 'fixed' | 'fixing' | 'action' | 'ok';
  readonly title: string;
  readonly what: string;
  readonly action: string | null;
  readonly command: string | null;
  readonly source: string;
}

export interface AlertRelayOptions {
  /** Adresse des Motors, z. B. http://motor:8080. */
  readonly motorUrl: string;
  /** Dienst-Schlüssel von morni.net (Admin im Motor, darf also Meldungen hören). */
  readonly token: string;
  readonly dataDir: string;
  /** Einstellung Erreichbarkeit → „Probleme im Discord-Team-Log melden“. */
  readonly enabled: () => boolean;
  /** Eine Zeile in den Team-Log-Kanal. */
  readonly post: (text: string) => Promise<void>;
  readonly log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'debug'>;
  /** Wartezeit vor einem neuen Verbindungsversuch (verdoppelt sich bis zur Obergrenze). */
  readonly retryMs?: number;
}

export interface AlertRelay {
  readonly stop: () => void;
}

const STATE_FILE = 'motor-alerts.json';
const FIRST_RETRY_MS = 5_000;
const MAX_RETRY_MS = 60_000;
/** Jeder weitere Fehlversuch wartet doppelt so lang (bis MAX_RETRY_MS). */
const RETRY_FACTOR = 2;
// Aus der Adresse des Motors die der Live-Verbindung: "http://motor:8080" → "ws://motor:8080", "https://…" → "wss://…".
// https://regex101.com/?flavor=javascript&regex=%5Ehttp&testString=http%3A%2F%2Fmotor%3A8080%0Ahttps%3A%2F%2Fmotor.example
const HTTP_SCHEME = /^http/;
/** Discord nimmt höchstens 2000 Zeichen pro Nachricht. */
const DISCORD_MAX = 1900;
const ICON: Readonly<Record<MotorAlert['status'], string>> = {
  fixed: '🛠️',
  fixing: '🔄',
  action: '🚨',
  ok: '✅',
};
const ANSWER = { fixed: 'alertFixed', fixing: 'alertFixing', action: 'alertAction' } as const;
// Drei Backticks beenden einen Code-Block in Discord: "a ``` b" → "a ''' b".
// https://regex101.com/?flavor=javascript&regex=%60%60%60&flags=g&testString=a%20%60%60%60%20b
const FENCE = /```/g;

/** Die Meldung als Zeilen fürs Team-Log: was los ist, ob es sich selbst behebt, was zu tun ist (mit Befehl). */
export function alertText(alert: MotorAlert): string {
  if (alert.status === 'ok') return `${ICON.ok} **${alert.title}** – ${alert.what}`.slice(0, DISCORD_MAX);
  const lines = [
    `${ICON[alert.status]} **${alert.title}**`,
    alert.what,
    bt('de', 'alertSelf', { answer: bt('de', ANSWER[alert.status]) }),
    alert.action ?? '',
    alert.command ? `\`\`\`\n${alert.command.replace(FENCE, "'''")}\n\`\`\`` : '',
  ];
  return lines.filter(Boolean).join('\n').slice(0, DISCORD_MAX);
}

function readLastId(file: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { lastId?: unknown };
    return typeof parsed.lastId === 'string' ? parsed.lastId : null;
  } catch {
    return null;
  }
}

function writeLastId(file: string, lastId: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ lastId })}\n`);
  fs.renameSync(tmp, file);
}

const isAlert = (value: unknown): value is { type: 'alert'; alert: MotorAlert } =>
  typeof value === 'object' &&
  value !== null &&
  (value as { type?: unknown }).type === 'alert' &&
  typeof (value as { alert?: { id?: unknown } }).alert?.id === 'string';

/** Hört dem Motor zu, bis `stop` kommt; fällt die Verbindung weg, verbindet es sich von selbst wieder. */
export function startAlertRelay(options: AlertRelayOptions): AlertRelay {
  const file = path.join(options.dataDir, STATE_FILE);
  const url = `${options.motorUrl.replace(HTTP_SCHEME, 'ws')}/api/ws`;
  const firstRetry = options.retryMs ?? FIRST_RETRY_MS;
  const run = {
    stopped: false,
    socket: null as WebSocket | null,
    timer: null as NodeJS.Timeout | null,
    retry: firstRetry,
    lastId: readLastId(file),
    // Meldungen der Reihe nach: erst die eine im Team-Log, dann die nächste.
    queue: Promise.resolve(),
  };
  /** Hängt eine Meldung an die Reihe an (erst die eine ins Team-Log, dann die nächste). */
  const enqueue = (alert: MotorAlert): void => {
    const before = run.queue;
    run.queue = (async () => {
      await before;
      await handle(alert);
    })();
  };

  const handle = async (alert: MotorAlert): Promise<void> => {
    if (alert.id === run.lastId) return;
    if (options.enabled()) {
      try {
        await options.post(alertText(alert));
      } catch (err) {
        options.log.warn({ err, key: alert.key }, 'Meldung des Motors nicht ins Team-Log gekommen');
      }
    }
    // Auch ausgeschaltet weiterzählen: Wer es wieder einschaltet, bekommt keine alten Meldungen auf einmal.
    run.lastId = alert.id;
    try {
      writeLastId(file, alert.id);
    } catch (err) {
      options.log.debug({ err }, 'letzte Meldung des Motors nicht gemerkt');
    }
  };

  const connect = (): void => {
    if (run.stopped) return;
    const socket = new WebSocket(url, { headers: { authorization: `Bearer ${options.token}` } });
    run.socket = socket;
    socket.on('open', () => {
      run.retry = firstRetry;
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          channel: 'alerts',
          ...(run.lastId ? { after: run.lastId } : {}),
        }),
      );
    });
    socket.on('message', (raw: Buffer) => {
      const message = ((): unknown => {
        try {
          return JSON.parse(raw.toString('utf8'));
        } catch {
          return null;
        }
      })();
      if (isAlert(message)) enqueue(message.alert);
    });
    socket.on('error', (err) => options.log.debug({ err }, 'Live-Verbindung zum Motor gestört'));
    socket.on('close', () => {
      if (run.stopped) return;
      run.timer = setTimeout(connect, run.retry);
      run.timer.unref();
      run.retry = Math.min(run.retry * RETRY_FACTOR, MAX_RETRY_MS);
    });
  };

  connect();
  return {
    stop: () => {
      run.stopped = true;
      if (run.timer) clearTimeout(run.timer);
      run.socket?.terminate();
    },
  };
}
