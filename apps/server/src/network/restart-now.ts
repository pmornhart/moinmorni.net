import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { Mode } from '@moinmorni/shared';
import { mm, text, type Lang, type TextKey } from '../hub/texts.js';
import type { MotorClient } from '../motor/client.js';
import { BUILD_MEMBER, LOBBY_MEMBER, PROXY_MEMBER, WARTUNG_MEMBER } from './provision.js';
import type { RestartQueue } from './restart.js';

/**
 * „Gleich neu starten“ statt „sobald niemand drauf ist“ (network/restart.ts): nach einem Update von MoinMorni – beim
 * ersten Start mit der neuen Fassung – und, wenn im Panel so eingestellt, für eine neue Fassung eines Spielmodus.
 *
 * Freundlich für die Spieler: erst ein Countdown – oben als Leiste (versteht das Netzwerk-Plugin ab dieser Fassung) und
 * immer im Chat (das kann jedes) –, wer in einem Spielmodus ist, kommt kurz vor dem Neustart in die Lobby. Nacheinander
 * statt alle auf einmal, damit Speicher und Prozessor reichen, und immer so, dass ein Ort zum Warten bleibt
 * (Philip: „es muss immer der Wartungsserver gehen – erst werden alle anderen geupdatet und dann der Wartungsserver“):
 * 1. die Spielmodi und der Bau-Server, jeder wartet, bis der vorige wieder läuft;
 * 2. die Lobby – ihre Spieler warten so lange in der Wartungs-Lobby und kommen von selbst zurück;
 * 3. erst wenn die Lobby wieder läuft und die Wartenden zurück sind: die Wartungs-Lobby (wer dort ist, kommt vorher in
 *    die Lobby) – Lobby und Wartungs-Lobby sind nie gleichzeitig weg;
 * 4. ganz zuletzt und nur, wenn er wirklich muss (neuer Velocity-Teil des Netzwerk-Plugins, neuer Schlüssel, neues
 *    Bild …), der Proxy: Countdown für alle, freundlicher Abschied, in etwa einer Minute wieder rein.
 * Was nach einem Update sonst noch auf einen Neustart wartet (z. B. neue Einstellungen eines Modus), kommt gleich mit.
 */

export interface Target {
  readonly serverId: string;
  readonly member: string;
  /**
   * Zurücksetzen (panel/reset-routes.ts): statt eines Neustarts stoppen, dies tun (Welt bzw. Spielstand löschen),
   * dann starten. Damit darf auch die Wartungs-Lobby von Hand mit.
   */
  readonly whileStopped?: () => Promise<void>;
}

/**
 * Update von MoinMorni, nur eine neue Fassung eines Spielmodus – oder das Team startet im Panel von Hand neu
 * („Server neu starten“, panel/restart-routes.ts). Von Hand startet die Wartungs-Lobby nie mit: Sie ist das Ziel, in
 * dem die Spieler der Lobby so lange warten.
 */
export type RestartWhy = 'update' | 'release' | 'manual';

/** Wie weit ein Server in der laufenden (oder letzten) Runde ist – fürs Panel. */
export type RestartStep = 'waiting' | 'countdown' | 'restarting' | 'done' | 'failed' | 'skipped';

export interface RestartProgress {
  /** Läuft gerade eine Runde? */
  readonly running: boolean;
  /** Server der laufenden bzw. letzten Runde in der Reihenfolge, in der sie angemeldet wurden. */
  readonly servers: ReadonlyArray<{ readonly member: string; readonly step: RestartStep }>;
}

/** Was der Neustart vom Hub braucht. */
export interface RestartHub {
  readonly playersOn: (member: string) => ReadonlyArray<{ readonly uuid: string; readonly lang: Lang }>;
  readonly everyone: () => ReadonlyArray<{ readonly uuid: string; readonly lang: Lang }>;
  readonly tell: (uuid: string, text: string) => void;
  readonly countdown: (uuid: string, text: string, seconds: number) => void;
  readonly connect: (uuid: string, server: string) => boolean;
  readonly kick: (uuid: string, text: string) => void;
  /**
   * Hängt dieser Server (bzw. der Proxy, `proxy`) gerade am Hub? Gleich nach einem Neustart von MoinMorni noch nicht –
   * dann weiß der Hub auch nicht, wer wo spielt.
   */
  readonly connected: (member: string) => boolean;
  /** Wartungs-Lobby: ist sie da, Spieler dort warten lassen (zurück von selbst), hält die Wartung jemanden fest? */
  readonly wartung: {
    readonly open: () => boolean;
    readonly park: (uuid: string) => boolean;
    readonly parked: (uuid: string) => boolean;
    /** Wie viele warten dort und kommen gleich von selbst in die Lobby zurück? */
    readonly returning: () => number;
  };
}

export interface RestartNowOptions {
  readonly motor: Pick<MotorClient, 'request'>;
  readonly hub: RestartHub;
  readonly queue: Pick<RestartQueue, 'entries' | 'remove'>;
  readonly modes: () => readonly Mode[];
  /** Countdown in Sekunden (Panel → Einstellungen → Updates). */
  readonly countdown: () => number;
  readonly log: FastifyBaseLogger;
  /** Tests: warten, ohne zu warten. */
  readonly pause?: (ms: number) => Promise<void>;
}

export interface RestartNow {
  /** Diese Server mit Countdown neu starten (nur laufende). Läuft gerade eine Runde, kommen sie gleich danach dran. */
  readonly run: (servers: readonly Target[], why: RestartWhy) => Promise<void>;
  readonly busy: () => boolean;
  /** Stand der laufenden bzw. letzten Runde (fürs Panel). */
  readonly progress: () => RestartProgress;
}

const SECOND_MS = 1000;
/** So viele Sekunden vor dem Neustart kommt noch einmal ein Hinweis im Chat. */
const REMINDER_SECONDS = 10;
/** Nach dem Umzug in die Lobby kurz warten, bis alle dort angekommen sind. */
const MOVE_SETTLE_MS = 3000;
const POLL_MS = 3000;
/** Länger als drei Minuten wartet MoinMorni nicht auf einen Server – dann ist der nächste dran. */
const SETTLE_MAX_MS = 180_000;
/** So viele Spielmodi starten zugleich neu (Speicher: ein Neustart gibt erst frei, dann nimmt er). */
const PARALLEL_MODES = 3;
/**
 * So lange wartet der Neustart höchstens darauf, dass Proxy und Server nach dem Start von MoinMorni wieder am Hub hängen.
 * Nach einem Update startet MoinMorni selbst neu; die Spielserver melden sich erst nach Sekunden bis einer Minute – ohne
 * Warten fand der Countdown niemanden, und Spieler in den Modi kamen ohne Vorwarnung in die Lobby (Gesamtprobe 17.11.).
 */
const HUB_WAIT_MAX_MS = 120_000;
/**
 * So lange wartet die Wartungs-Lobby nach dem Neustart der Lobby höchstens darauf, dass die Lobby wieder am Hub hängt und
 * ihre Spieler zurück sind (der Hub holt sie nach einem Countdown von 10 s) – danach startet sie trotzdem; wer noch
 * dort ist, kommt vorher in die Lobby.
 */
const BACK_WAIT_MAX_MS = 120_000;
const RUNNING = 'running';
const CRASHED = 'crashed';
const STOPPING: readonly string[] = ['stopping', 'starting', 'installing'];

/** Wie die Server für Spieler heißen, wenn sie kein Spielmodus sind. */
const FIXED_NAMES: Readonly<Record<string, TextKey>> = {
  [LOBBY_MEMBER]: 'restart.name.lobby',
  [BUILD_MEMBER]: 'restart.name.bau',
  [PROXY_MEMBER]: 'restart.name.proxy',
  [WARTUNG_MEMBER]: 'restart.name.wartung',
};
/** Starten nicht mit den Spielmodi, sondern danach: Lobby, dann Wartungs-Lobby, zuletzt der Proxy. */
const NOT_FIRST: readonly string[] = [LOBBY_MEMBER, PROXY_MEMBER, WARTUNG_MEMBER];
const CHAT_KEY: Readonly<Record<RestartWhy, TextKey>> = {
  update: 'restart.update',
  release: 'restart.release',
  manual: 'restart.manual',
};
const BAR_KEY: Readonly<Record<RestartWhy, TextKey>> = {
  update: 'restart.bar.update',
  release: 'restart.bar.release',
  manual: 'restart.bar.manual',
};
/** Lobby und Proxy starten nur nach einem Update oder von Hand neu – mit eigenen Texten. */
type LastWhy = 'update' | 'manual';
const LAST_KEYS: Readonly<
  Record<
    LastWhy,
    {
      readonly lobby: TextKey;
      readonly park: TextKey;
      readonly network: TextKey;
      readonly kickLobby: TextKey;
      readonly kickNetwork: TextKey;
    }
  >
> = {
  update: {
    lobby: 'restart.lobby',
    park: 'restart.lobby.wartung',
    network: 'restart.network',
    kickLobby: 'restart.kick.lobby',
    kickNetwork: 'restart.kick.network',
  },
  manual: {
    lobby: 'restart.manual.lobby',
    park: 'restart.manual.lobby.wartung',
    network: 'restart.manual.network',
    kickLobby: 'restart.manual.kick.lobby',
    kickNetwork: 'restart.manual.kick.network',
  },
};
/** Nur wenn alles von Hand kam, sprechen die Texte vom Team – sonst vom Update. */
const lastWhy = (items: ReadonlyArray<Item | undefined>): LastWhy =>
  items.every((i) => i === undefined || i.why === 'manual') ? 'manual' : 'update';
const FINISHED: readonly RestartStep[] = ['done', 'failed', 'skipped'];

interface Item {
  readonly target: Target;
  readonly why: RestartWhy;
}

/** Wer den Countdown sieht – und für welchen Server. */
interface Listener {
  readonly uuid: string;
  readonly lang: Lang;
  readonly member: string;
  readonly why: RestartWhy;
}

const liveSchema = z.object({
  live: z.object({ state: z.string(), startedAt: z.string().nullable() }).partial().optional(),
});

/**
 * Was nach einem Lauf der Einrichtung neu starten muss – gleich (mit Countdown) oder sobald niemand drauf ist:
 * Nach einem Update (erster Start mit der neuen Fassung) alles gleich, wenn das Panel es so will. Sonst nur neue
 * Fassungen von Spielmodi gleich (Schalter „gleich einspielen“), alles andere wie bisher.
 */
export function planRestarts(input: {
  readonly fresh: boolean;
  readonly afterUpdate: boolean;
  readonly modesNow: boolean;
  readonly restart: readonly Target[];
  readonly modesInstalled: readonly string[];
}): { readonly now: Target[]; readonly why: RestartWhy; readonly later: Target[] } {
  if (input.fresh && input.afterUpdate) return { now: [...input.restart], why: 'update', later: [] };
  const release = (t: Target): boolean => input.modesNow && input.modesInstalled.includes(t.member);
  return {
    now: input.restart.filter(release),
    why: 'release',
    later: input.restart.filter((t) => !release(t)),
  };
}

const startedSchema = z.object({ version: z.string() });
const updateStatusSchema = z.object({ to: z.string().nullable().optional() });

/**
 * Läuft diese Fassung zum ersten Mal – also gleich nach einem Update? MoinMorni merkt sich die Fassung in
 * `<Daten>/update/started.json`. Fehlt die Datei (erster Start mit dieser Funktion), zählt, ob update.sh gerade auf diese
 * Fassung aktualisiert (status.json „to“) – eine frische Installation startet nichts neu. Ein Rückweg auf die alte
 * Fassung zählt auch: Ihre Server brauchen das passende Plugin wieder.
 */
export function firstStartAfterUpdate(dataDir: string, version: string): boolean {
  const dir = path.join(dataDir, 'update');
  const read = <T>(name: string, schema: z.ZodType<T>): T | null => {
    try {
      return schema.parse(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
    } catch {
      return null;
    }
  };
  const before = read('started.json', startedSchema)?.version ?? null;
  const fresh =
    before === null ? read('status.json', updateStatusSchema)?.to === version : before !== version;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `started.json.${process.pid}.tmp`);
    fs.writeFileSync(tmp, `${JSON.stringify({ version })}\n`);
    fs.renameSync(tmp, path.join(dir, 'started.json'));
  } catch {
    // Nicht schreibbar: dann gilt der nächste Start eben auch als „nach dem Update“.
  }
  return fresh;
}

export function createRestartNow(options: RestartNowOptions): RestartNow {
  const { motor, hub, queue, log } = options;
  const pause =
    options.pause ?? ((ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)));
  const pending = new Map<string, Item>();
  const state: { running: Promise<void> | null } = { running: null };
  /** Stand je Server (Name im Netzwerk) – in der Reihenfolge der Anmeldung. */
  const steps = new Map<string, RestartStep>();
  const step = (items: ReadonlyArray<Item | undefined>, now: RestartStep): void =>
    items.forEach((i) => {
      if (i) steps.set(i.target.member, now);
    });

  const nameOf = (member: string, lang: Lang): string => {
    const fixed = FIXED_NAMES[member];
    if (fixed) return text(lang, fixed);
    const mode = options.modes().find((m) => m.server === member);
    return mm(mode ? mode.name[lang] : member);
  };
  const seconds = (): number => Math.max(1, Math.round(options.countdown()));

  const liveOf = async (serverId: string): Promise<{ state: string | null; startedAt: string | null }> => {
    try {
      const detail = liveSchema.safeParse(await motor.request<unknown>('GET', `/api/servers/${serverId}`));
      const live = detail.success ? detail.data.live : undefined;
      return { state: live?.state ?? null, startedAt: live?.startedAt ?? null };
    } catch {
      return { state: null, startedAt: null };
    }
  };
  const stateOf = async (serverId: string): Promise<string | null> => (await liveOf(serverId)).state;
  /**
   * Nach dem Auftrag: erst weg (stoppt, startet), dann wieder da – oder nach drei Minuten weiter zum nächsten.
   * true = läuft wieder.
   */
  const settle = async (
    serverId: string,
    wentDown: boolean,
    waited: number,
    startedBefore: string | null = null,
  ): Promise<boolean> => {
    if (waited >= SETTLE_MAX_MS) return false;
    await pause(POLL_MS);
    const live = await liveOf(serverId);
    const now = live.state;
    // Ein schneller Neustart zwischen zwei Nachfragen: dann verrät ihn die neue Startzeit.
    const restarted = startedBefore !== null && live.startedAt !== null && live.startedAt !== startedBefore;
    const down = wentDown || restarted || (now !== null && now !== RUNNING);
    if (down && (now === RUNNING || now === CRASHED)) return now === RUNNING;
    return settle(serverId, down, waited + POLL_MS, startedBefore);
  };
  /** Neu starten und warten, bis er wieder läuft; der Stand fürs Panel kommt mit. */
  const restartAndSettle = async (item: Item): Promise<void> => {
    step([item], 'restarting');
    const before = (await liveOf(item.target.serverId)).startedAt;
    const ok = (await restartOnly(item.target)) && (await settle(item.target.serverId, false, 0, before));
    step([item], ok ? 'done' : 'failed');
  };
  /** Warten, bis der Server wirklich aus ist (höchstens drei Minuten). */
  const stopped = async (serverId: string, waited: number): Promise<boolean> => {
    const now = (await liveOf(serverId)).state;
    if (now !== null && now !== RUNNING && !STOPPING.includes(now)) return true;
    if (waited >= SETTLE_MAX_MS) return false;
    await pause(POLL_MS);
    return stopped(serverId, waited + POLL_MS);
  };
  const restartOnly = async (target: Target): Promise<boolean> => {
    try {
      queue.remove(target.serverId);
      if (target.whileStopped) {
        await motor.request('POST', `/api/servers/${target.serverId}/actions/stop`);
        if (!(await stopped(target.serverId, 0))) throw new Error('server_did_not_stop');
        await target.whileStopped();
        await motor.request('POST', `/api/servers/${target.serverId}/actions/start`);
        return true;
      }
      await motor.request('POST', `/api/servers/${target.serverId}/actions/restart`);
      log.info(
        { server: target.member },
        'Netzwerk: Server startet gleich neu, damit Neues gilt (mit Countdown)',
      );
      return true;
    } catch (err) {
      log.warn(
        { err, server: target.member },
        'Netzwerk: Neustart klappte nicht – er kommt, sobald niemand drauf ist',
      );
      return false;
    }
  };

  /** Countdown im Chat und als Leiste; ein Hinweis zehn Sekunden vorher. Ohne Zuhörer: gleich weiter. */
  const countdown = async (
    listeners: readonly Listener[],
    chatKey: (listener: Listener) => TextKey,
  ): Promise<void> => {
    if (!listeners.length) return;
    const s = seconds();
    listeners.forEach((p) => {
      const server = nameOf(p.member, p.lang);
      hub.tell(p.uuid, text(p.lang, chatKey(p), { server, seconds: s }));
      hub.countdown(p.uuid, text(p.lang, BAR_KEY[p.why], { server }), s);
    });
    const early = Math.max(0, s - REMINDER_SECONDS);
    if (early > 0) {
      await pause(early * SECOND_MS);
      listeners.forEach((p) => hub.tell(p.uuid, text(p.lang, 'restart.soon', { seconds: REMINDER_SECONDS })));
    }
    await pause((s - early) * SECOND_MS);
  };

  /** Spielmodi und Bau-Server: Countdown, Spieler in die Lobby, dann einer nach dem anderen. */
  const restartModes = async (items: readonly Item[]): Promise<void> => {
    const listeners = items.flatMap((i) =>
      hub.playersOn(i.target.member).map((p) => ({ ...p, member: i.target.member, why: i.why })),
    );
    step(items, 'countdown');
    await countdown(listeners, (p) => CHAT_KEY[p.why]);
    step(items, 'waiting');
    /** Alle von diesem Server in die Lobby (mit Hinweis); true, wenn jemand umziehen musste. */
    const moveOut = (target: Target): boolean =>
      hub.playersOn(target.member).filter((p) => {
        if (!hub.connect(p.uuid, LOBBY_MEMBER)) return false;
        hub.tell(p.uuid, text(p.lang, 'restart.moved', { server: nameOf(target.member, p.lang) }));
        return true;
      }).length > 0;
    const moved = items.map((i) => moveOut(i.target)).some(Boolean);
    if (moved) await pause(MOVE_SETTLE_MS);
    // Immer ein paar zugleich (PARALLEL_MODES) – einer nach dem anderen dauerte bei 15 Servern eine Viertelstunde, und
    // im Panel stand lange nur „wartet“ (Philip: „dann passiert nichts“).
    const batches = Array.from({ length: Math.ceil(items.length / PARALLEL_MODES) }, (_, n) =>
      items.slice(n * PARALLEL_MODES, (n + 1) * PARALLEL_MODES),
    );
    await batches.reduce(async (prev, batch) => {
      await prev;
      // Wer während des Wartens auf die vorigen Server doch wieder hineinging, kommt vorher noch einmal in die Lobby.
      if (batch.map((i) => moveOut(i.target)).some(Boolean)) await pause(MOVE_SETTLE_MS);
      const started = await batch.reduce<Promise<Array<{ item: Item; before: string | null; ok: boolean }>>>(
        async (acc, item) => {
          const done = await acc;
          step([item], 'restarting');
          const before = (await liveOf(item.target.serverId)).startedAt;
          return [...done, { item, before, ok: await restartOnly(item.target) }];
        },
        Promise.resolve([]),
      );
      await Promise.all(
        started.map(async ({ item, before, ok }) => {
          const fine = ok && (await settle(item.target.serverId, false, 0, before));
          step([item], fine ? 'done' : 'failed');
        }),
      );
    }, Promise.resolve());
  };

  /**
   * Die Wartungs-Lobby nach der Lobby (die dann schon wieder läuft): Wer darf, kommt vorher in die Lobby; wen die
   * Wartung festhält, der muss kurz raus (in etwa einer Minute wieder rein).
   */
  const restartWartung = async (item: Item): Promise<void> => {
    const member = item.target.member;
    const here = hub.playersOn(member).map((p) => ({ ...p, member, why: item.why }));
    step([item], 'countdown');
    await countdown(here, (p) => (hub.wartung.parked(p.uuid) ? 'restart.wartung.held' : CHAT_KEY[p.why]));
    const left = hub.playersOn(member);
    left.forEach((p) => {
      if (hub.wartung.parked(p.uuid) || !hub.connect(p.uuid, LOBBY_MEMBER))
        hub.kick(p.uuid, text(p.lang, 'restart.kick.wartung'));
    });
    if (left.length) await pause(MOVE_SETTLE_MS);
    await restartAndSettle(item);
  };

  /** Die Lobby – ihre Spieler warten so lange in der Wartungs-Lobby (geht das nicht: kurz raus, mit Nachricht). */
  const restartLobby = async (lobby: Item): Promise<void> => {
    const keys = LAST_KEYS[lastWhy([lobby])];
    step([lobby], 'countdown');
    const park = hub.wartung.open();
    const here = hub.playersOn(LOBBY_MEMBER).map((p) => ({ ...p, member: LOBBY_MEMBER, why: lobby.why }));
    await countdown(here, () => (park ? keys.park : keys.lobby));
    const parked = hub.playersOn(LOBBY_MEMBER).filter((p) => {
      if (park && hub.wartung.park(p.uuid)) return true;
      hub.kick(p.uuid, text(p.lang, keys.kickLobby));
      return false;
    });
    // Erst in der Wartungs-Lobby ankommen lassen, dann die Lobby neu starten.
    if (parked.length) await pause(MOVE_SETTLE_MS);
    await restartAndSettle(lobby);
  };

  /** Nach der Lobby: warten, bis sie am Hub hängt und die Wartenden zurück sind (höchstens zwei Minuten). */
  const untilBack = async (waited: number): Promise<void> => {
    if (hub.connected(LOBBY_MEMBER) && hub.wartung.returning() === 0) return;
    if (waited >= BACK_WAIT_MAX_MS) {
      log.info(
        { returning: hub.wartung.returning() },
        'Netzwerk: Lobby bzw. Spieler noch nicht zurück – Wartungs-Lobby startet trotzdem (wer dort ist, kommt vorher in die Lobby)',
      );
      return;
    }
    await pause(POLL_MS);
    return untilBack(waited + POLL_MS);
  };

  /**
   * Ganz zuletzt der Proxy – nur, wenn er wirklich neu starten muss (das entscheidet, wer ihn anmeldet): Countdown für
   * alle, dann ein freundlicher Abschied („in etwa einer Minute wieder rein“), damit niemand ohne Nachricht getrennt
   * wird.
   */
  const restartProxy = async (proxy: Item): Promise<void> => {
    const keys = LAST_KEYS[lastWhy([proxy])];
    step([proxy], 'countdown');
    const all = hub.everyone().map((p) => ({ ...p, member: PROXY_MEMBER, why: proxy.why }));
    await countdown(all, () => keys.network);
    hub.everyone().forEach((p) => hub.kick(p.uuid, text(p.lang, keys.kickNetwork)));
    if (all.length) await pause(MOVE_SETTLE_MS);
    await restartAndSettle(proxy);
  };

  /** Warten, bis Proxy und diese Server am Hub hängen (höchstens zwei Minuten); danach kurz, bis alle gemeldet sind. */
  const untilConnected = async (members: readonly string[], waited: number): Promise<void> => {
    const missing = [PROXY_MEMBER, ...members].filter((m) => !hub.connected(m));
    if (!missing.length) {
      if (waited > 0) await pause(POLL_MS);
      return;
    }
    if (waited >= HUB_WAIT_MAX_MS) {
      log.info({ missing }, 'Netzwerk: Server noch nicht am Hub – Neustart nach dem Update trotzdem');
      return;
    }
    await pause(POLL_MS);
    return untilConnected(members, waited + POLL_MS);
  };

  const round = async (items: readonly Item[]): Promise<void> => {
    const all = new Map(items.map((i) => [i.target.serverId, i]));
    // Nach einem Update kommt mit, was sonst auf „sobald niemand drauf ist“ wartet (z. B. neue Einstellungen).
    if (items.some((i) => i.why === 'update'))
      queue.entries().forEach((e) => {
        if (!all.has(e.serverId)) all.set(e.serverId, { target: e, why: 'update' });
      });
    // Wer nicht läuft (schläft, gestoppt), holt sich das Neue beim nächsten Start von selbst.
    const states = await Promise.all(
      [...all.values()].map(async (i) => ({ i, now: await stateOf(i.target.serverId) })),
    );
    const running = states.filter((x) => x.now === RUNNING).map((x) => x.i);
    step(
      states.filter((x) => x.now !== RUNNING).map((x) => x.i),
      'skipped',
    );
    // Nur nach einem Neustart von MoinMorni (Update) hängen die Server womöglich noch nicht am Hub – von Hand im
    // Panel ist alles längst verbunden; wer dann nicht am Hub hängt, hat auch niemanden zum Warnen.
    if (running.some((i) => i.why !== 'manual'))
      await untilConnected(
        running.map((i) => i.target.member),
        0,
      );
    const modes = running.filter((i) => !NOT_FIRST.includes(i.target.member));
    if (modes.length) await restartModes(modes);
    const lobby = running.find((i) => i.target.member === LOBBY_MEMBER);
    const proxy = running.find((i) => i.target.member === PROXY_MEMBER);
    const wartung = running.find((i) => i.target.member === WARTUNG_MEMBER);
    // Die Lobby, solange die Wartungs-Lobby ihre Spieler aufnimmt …
    if (lobby) await restartLobby(lobby);
    // … die Wartungs-Lobby erst, wenn die Lobby wieder läuft und alle zurück sind – nie beide zugleich weg …
    if (wartung) {
      if (lobby) await untilBack(0);
      await restartWartung(wartung);
    }
    // … und ganz zuletzt der Proxy.
    if (proxy) await restartProxy(proxy);
  };

  const drain = async (): Promise<void> => {
    if (!pending.size) return;
    const items = [...pending.values()];
    pending.clear();
    try {
      await round(items);
    } catch (err) {
      log.warn(
        { err },
        'Netzwerk: Neustart nach dem Update ging nicht ganz durch – der Rest kommt, sobald niemand drauf ist',
      );
    }
    return drain();
  };

  return {
    run: async (servers, why) => {
      // Eine neue Runde: der Stand der letzten, fertigen Runde geht weg.
      if (!state.running)
        [...steps].filter(([, now]) => FINISHED.includes(now)).forEach(([member]) => steps.delete(member));
      // Von Hand nie die Wartungs-Lobby – sie nimmt die Spieler der Lobby auf (das Panel lehnt sie schon ab).
      const wanted =
        why === 'manual' ? servers.filter((t) => t.member !== WARTUNG_MEMBER || t.whileStopped) : servers;
      wanted.forEach((t) => steps.set(t.member, 'waiting'));
      wanted.forEach((t) => {
        const before = pending.get(t.serverId);
        // Ein Zurücksetzen bleibt dabei, auch wenn derselbe Server danach noch einmal angemeldet wird.
        const target = !t.whileStopped && before?.target.whileStopped ? before.target : t;
        pending.set(t.serverId, { target, why: before?.why === 'update' ? 'update' : why });
      });
      if (!state.running) {
        state.running = (async () => {
          try {
            await drain();
          } finally {
            state.running = null;
          }
        })();
      }
      return state.running;
    },
    busy: () => state.running !== null,
    progress: () => ({
      running: state.running !== null,
      servers: [...steps].map(([member, now]) => ({ member, step: now })),
    }),
  };
}
