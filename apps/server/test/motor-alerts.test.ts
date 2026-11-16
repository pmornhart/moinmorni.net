import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { alertText, startAlertRelay, type AlertRelay, type MotorAlert } from '../src/motor/alerts.js';

const TOKEN = 'mh_test-schluessel';
/** Kurze Wartezeit, damit der Test das Wiederverbinden nicht lange abwarten muss. */
const RETRY_MS = 50;
/** So lange, dass ein paar Versuche oder eine doppelte Zeile sicher angekommen wären. */
const SETTLE_MS = 200;
const WAIT_MS = 5_000;
const STEP_MS = 20;
/** Schließ-Code des nachgebauten Motors bei falschem Schlüssel (wie 401). */
const CLOSE_UNAUTHORIZED = 4401;
/** Discord nimmt höchstens so viele Zeichen pro Nachricht. */
const DISCORD_LIMIT = 2_000;
const LONG_TEXT = 5_000;

const quiet = { info: () => undefined, warn: () => undefined, debug: () => undefined };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const firstLine = (text: string) => text.split('\n')[0];

function alert(id: string, extra: Partial<MotorAlert> = {}): MotorAlert {
  return {
    id,
    at: '2026-11-16T12:00:00.000Z',
    key: 'netbird:exit',
    kind: 'netbird-exit',
    status: 'action',
    title: 'Hausanschluss nicht versteckt',
    what: 'Der Verkehr geht nicht mehr über den Ausgang.',
    action: 'Bitte auf dem NetBird-Server den Agent starten:',
    command: 'netbird up',
    source: 'panel',
    ...extra,
  };
}

/** Wartet, bis die Bedingung stimmt (oder gibt nach WAIT_MS auf). */
async function until(check: () => boolean, end = Date.now() + WAIT_MS): Promise<void> {
  if (check() || Date.now() > end) {
    expect(check()).toBe(true);
    return;
  }
  await pause(STEP_MS);
  await until(check, end);
}

/** Ein nachgebauter Motor: prüft den Schlüssel, merkt sich jedes Abo und schickt Meldungen nach `after` nach. */
function fakeMotor() {
  const sent: MotorAlert[] = [];
  const subscriptions: { after?: string }[] = [];
  const sockets = new Set<WebSocket>();
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/api/ws' });
  const send = (socket: WebSocket, a: MotorAlert) => socket.send(JSON.stringify({ type: 'alert', alert: a }));
  server.on('connection', (socket, request) => {
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
      return;
    }
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw)) as { type: string; channel?: string; after?: string };
      if (message.type !== 'subscribe' || message.channel !== 'alerts') return;
      subscriptions.push(message.after ? { after: message.after } : {});
      const from = message.after ? sent.findIndex((a) => a.id === message.after) + 1 : sent.length;
      sent.slice(from).forEach((a) => send(socket, a));
    });
  });
  return {
    url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    subscriptions,
    /** Neue Meldung: an alle, die gerade zuhören. */
    publish: (a: MotorAlert) => {
      sent.push(a);
      sockets.forEach((s) => send(s, a));
    },
    /** Schickt eine schon bekannte Meldung noch einmal (z. B. nach einem Neustart des Motors). */
    repeat: (a: MotorAlert) => sockets.forEach((s) => send(s, a)),
    listening: () => sockets.size,
    drop: () => sockets.forEach((s) => s.terminate()),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('Meldungen des Motors im Discord-Team-Log', () => {
  let dir: string;
  let motor: ReturnType<typeof fakeMotor>;
  let posted: string[];
  let enabled: boolean;
  let relay: AlertRelay | null;
  const stateFile = () => path.join(dir, 'motor-alerts.json');
  const remembered = () =>
    fs.existsSync(stateFile())
      ? (JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as { lastId: string })
      : null;
  const start = (token = TOKEN) => {
    relay = startAlertRelay({
      motorUrl: motor.url(),
      token,
      dataDir: dir,
      enabled: () => enabled,
      post: async (text) => {
        posted.push(text);
      },
      log: quiet,
      retryMs: RETRY_MS,
    });
    return relay;
  };

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-alerts-'));
    motor = fakeMotor();
    await pause(STEP_MS);
    posted = [];
    enabled = true;
    relay = null;
  });
  afterEach(async () => {
    relay?.stop();
    await motor.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('eine Meldung landet mit Antwort und Befehl im Team-Log, die letzte wird gemerkt', async () => {
    start();
    await until(() => motor.listening() === 1);
    motor.publish(alert('lauf1-1'));
    await until(() => posted.length === 1);
    expect(posted[0]).toContain('🚨 **Hausanschluss nicht versteckt**');
    expect(posted[0]).toContain('**Behebt sich selbst?** ❌ Nein – bitte selbst etwas tun:');
    expect(posted[0]).toContain('```\nnetbird up\n```');
    await until(() => remembered()?.lastId === 'lauf1-1');
  });

  test('nach einem Neustart kommt nur nach, was dazwischen kam – nichts doppelt', async () => {
    start();
    await until(() => motor.listening() === 1);
    motor.publish(alert('lauf1-1'));
    await until(() => posted.length === 1);
    relay?.stop();
    await until(() => motor.listening() === 0);
    motor.publish(alert('lauf1-2', { status: 'fixed', title: 'DNS repariert', action: null, command: null }));
    motor.publish(alert('lauf1-3', { status: 'ok', title: 'DNS geht wieder', what: 'Alles gut.' }));

    start();
    await until(() => posted.some((p) => p.includes('DNS geht wieder')));
    expect(motor.subscriptions.at(-1)).toEqual({ after: 'lauf1-1' });
    expect(posted.map(firstLine)).toEqual([
      '🚨 **Hausanschluss nicht versteckt**',
      '🛠️ **DNS repariert**',
      '✅ **DNS geht wieder** – Alles gut.',
    ]);
    expect(posted.find((p) => p.includes('DNS repariert'))).toContain('✅ Ja – ist schon behoben.');
    // Schickt der Motor die letzte noch einmal, bleibt es bei einer Zeile.
    const before = posted.length;
    motor.repeat(alert('lauf1-3'));
    await pause(SETTLE_MS);
    expect(posted).toHaveLength(before);
  });

  test('bricht die Verbindung ab, verbindet es sich von selbst wieder und holt nach', async () => {
    start();
    await until(() => motor.listening() === 1);
    motor.publish(alert('lauf1-1'));
    await until(() => posted.length === 1);
    motor.drop();
    motor.publish(alert('lauf1-2', { status: 'fixing', title: 'NetBird wird neu verbunden' }));
    await until(() => posted.some((p) => p.includes('NetBird wird neu verbunden')));
    expect(posted.at(-1)).toContain('🔄 Ja – wird gerade repariert.');
    expect(motor.subscriptions).toEqual([{}, { after: 'lauf1-1' }]);
  });

  test('ausgeschaltet: nichts im Team-Log, und beim Einschalten kommen keine alten Meldungen auf einmal', async () => {
    enabled = false;
    start();
    await until(() => motor.listening() === 1);
    motor.publish(alert('lauf1-1'));
    motor.publish(alert('lauf1-2'));
    await until(() => remembered()?.lastId === 'lauf1-2');
    expect(posted).toEqual([]);
    enabled = true;
    motor.publish(alert('lauf1-3', { title: 'Neue Meldung' }));
    await until(() => posted.length === 1);
    expect(firstLine(posted[0] ?? '')).toBe('🚨 **Neue Meldung**');
  });

  test('ohne gültigen Schlüssel hört es nichts', async () => {
    start('falsch');
    await pause(SETTLE_MS);
    motor.publish(alert('lauf1-1'));
    await pause(SETTLE_MS);
    expect(posted).toEqual([]);
    expect(motor.subscriptions).toEqual([]);
  });
});

describe('Text der Meldung', () => {
  test('drei Backticks im Befehl beenden den Code-Block nicht', () => {
    const text = alertText(alert('x', { command: 'echo ```oops```' }));
    // Ab dem ersten Code-Zaun genau ein Block: der Befehl mit ''' statt ```.
    expect(text.slice(text.indexOf('```'))).toBe("```\necho '''oops'''\n```");
  });

  test('ohne Befehl und ohne Schritt nur, was los ist und dass es sich selbst behebt', () => {
    const text = alertText(alert('x', { status: 'fixed', action: null, command: null }));
    expect(text.split('\n')).toEqual([
      '🛠️ **Hausanschluss nicht versteckt**',
      'Der Verkehr geht nicht mehr über den Ausgang.',
      '**Behebt sich selbst?** ✅ Ja – ist schon behoben.',
    ]);
  });

  test('passt in eine Discord-Nachricht', () => {
    expect(alertText(alert('x', { what: 'a'.repeat(LONG_TEXT) })).length).toBeLessThanOrEqual(DISCORD_LIMIT);
  });
});
