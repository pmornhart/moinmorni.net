import { WARTUNG_POINTS } from '@moinmorni/builder';
import { alwaysIn, timeOf, WARTUNG_RETURN_SECONDS, WARTUNG_SERVER } from '@moinmorni/shared';
import type { HubContext } from './context.js';
import { mm, text, type Lang } from './texts.js';
import type { Body } from './transport.js';

/**
 * Wartungs-Lobby (`docs/hub-protokoll.md`, `docs/lobby.md`): Wer gerade nicht in die Lobby kann (Neustart, Update,
 * Absturz) oder während der Wartung des Netzwerks nicht hinein darf, wartet auf dem kleinen Server „wartung“. Sie ist
 * immer die zweite Wahl nach der Lobby – nie geht es von dort weiter auf Bau-Server oder Modi. Ist die Lobby wieder
 * da bzw. die Wartung vorbei, holt der Hub alle Wartenden nach einem Countdown zurück (abschaltbar).
 */

const LOBBY = 'lobby';
const SECOND_MS = 1000;
const RETURN_MS = WARTUNG_RETURN_SECONDS * SECOND_MS;
/** So lange gilt ein gerade verschickter Spieler als „unterwegs“ (kein zweites Verbinden). */
const SENT_GRACE_MS = 15_000;
/** Alle so viele Millisekunden nachsehen, ob jemand zurück darf. */
const TICK_MS = 1000;

export interface WartungDeps {
  readonly ctx: HubContext;
  readonly now: () => number;
  /** Hängt dieser Server gerade am Hub (läuft sein Plugin)? */
  readonly connected: (server: string) => boolean;
  /** Nachricht an die Wartungs-Lobby (wenn sie verbunden ist). */
  readonly toWartung: (body: Body) => void;
}

export interface FallbackAnswer {
  /** Server in dieser Reihenfolge versuchen (der Proxy lässt aus, was schon gescheitert ist). */
  readonly order: readonly string[];
  /** Nachricht beim Ankommen in der Wartungs-Lobby. */
  readonly message: string;
  /** Text beim Trennen, wenn keiner geht. */
  readonly bye: string;
}

export interface Wartung {
  /** Darf dieser Spieler wegen der Wartung nur in die Wartungs-Lobby? */
  readonly parked: (uuid: string) => boolean;
  /** Kann gerade jemand in der Wartungs-Lobby warten (Schalter an, Server da)? */
  readonly open: () => boolean;
  /** Hinweis, wenn ein Spieler in der Wartung woandershin will; null = darf. */
  readonly held: (uuid: string, lang: Lang) => string | null;
  /** Anmeldebildschirm bei Wartung (wenn die Wartungs-Lobby aus ist oder fehlt). */
  readonly screen: (lang: Lang) => string;
  /** „Wartung bis ca. 22:30“ für die MOTD (leer = keine Zeit). */
  readonly untilMotd: () => string;
  /** Wohin ein neuer Spieler zuerst kommt. */
  readonly firstServer: (uuid: string) => string;
  /** Wohin nach einem Rauswurf oder einem gescheiterten Verbinden. */
  readonly fallback: (uuid: string, lang: Lang) => FallbackAnswer;
  /** Spieler wartet in der Wartungs-Lobby (geschickt, nicht freiwillig) – kommt automatisch zurück. */
  readonly waiting: (uuid: string) => void;
  readonly onSwitch: (uuid: string, server: string) => void;
  readonly onLeave: (uuid: string) => void;
  /** Nach dem (Wieder-)Verbinden des Proxys: wer in der Wartungs-Lobby ist, wartet. */
  readonly onOnline: () => void;
  /** Ein Server hat sich verbunden oder ist weg (Lobby da? Wartungs-Lobby da?). */
  readonly onServer: (server: string) => void;
  /** Einstellungen des Netzwerks geändert (Wartung an/aus, Text, Zeit, Schalter). */
  readonly onSettings: () => void;
  /** Zustand für das Plugin der Wartungs-Lobby. */
  readonly state: () => Body;
  /** Einmal nachsehen, ob jemand zurück darf (läuft sonst jede Sekunde). */
  readonly tick: () => void;
  readonly start: () => void;
  readonly stop: () => void;
}

interface Settings {
  readonly maintenance: boolean;
  readonly message: string;
  readonly until: string | null;
  readonly lobbyOn: boolean;
  readonly returnAuto: boolean;
}

export function createWartung(deps: WartungDeps): Wartung {
  const { ctx, now } = deps;
  const settings = (): Settings => {
    const s = ctx.stores.settings('network');
    return {
      maintenance: s['maintenance'] === true,
      message: String(s['maintenanceMessage'] ?? ''),
      until: timeOf(String(s['maintenanceUntil'] ?? '')),
      lobbyOn: s['maintenanceLobby'] !== false,
      returnAuto: s['maintenanceReturn'] !== false,
    };
  };
  /** Wer in der Wartungs-Lobby wartet (geschickt – wer freiwillig hingeht, bleibt). */
  const waitingSet = new Set<string>();
  /** Gerade zurückgeschickt: Spieler → Zeitpunkt. */
  const sent = new Map<string, number>();
  /** Schon gesagt „mit /lobby zurück“ (ohne automatisch zurück). */
  const told = new Set<string>();
  const countdown: { at: number | null } = { at: null };
  const timer: { id: ReturnType<typeof setInterval> | null } = { id: null };
  const last = { maintenance: settings().maintenance };

  const lobbyUp = (): boolean => deps.connected(LOBBY);
  const wartungUp = (): boolean => deps.connected(WARTUNG_SERVER);
  const parked = (uuid: string): boolean => settings().maintenance && !alwaysIn(ctx.players.roleOf(uuid));
  const open = (): boolean => settings().lobbyOn && wartungUp();
  const untilText = (lang: Lang): string => {
    const until = settings().until;
    return until ? text(lang, 'wartung.until', { time: until }) : '';
  };
  const langOf = (uuid: string): Lang => ctx.presence.get(uuid)?.lang ?? 'de';

  const state = (): Body => {
    const s = settings();
    return {
      t: 'wartung',
      lobby: lobbyUp(),
      maintenance: s.maintenance,
      message: s.message,
      until: s.until,
      returnAuto: s.returnAuto,
      returnIn: countdown.at === null ? null : Math.max(0, Math.ceil((countdown.at - now()) / SECOND_MS)),
      points: WARTUNG_POINTS,
    };
  };
  const push = (): void => deps.toWartung(state());

  /** Wer in der Wartungs-Lobby wartet und jetzt zurück dürfte. */
  const due = (): string[] =>
    ctx.presence
      .on(WARTUNG_SERVER)
      .map((p) => p.uuid)
      .filter((uuid) => waitingSet.has(uuid) && !parked(uuid))
      .filter((uuid) => now() - (sent.get(uuid) ?? 0) > SENT_GRACE_MS);

  const cancel = (): void => {
    if (countdown.at === null) return;
    countdown.at = null;
    push();
  };

  const tick = (): void => {
    const list = due();
    if (!lobbyUp() || list.length === 0) {
      if (!lobbyUp()) told.clear();
      cancel();
      return;
    }
    if (!settings().returnAuto) {
      cancel();
      list
        .filter((uuid) => !told.has(uuid))
        .forEach((uuid) => {
          told.add(uuid);
          ctx.msg(uuid, text(langOf(uuid), 'wartung.back_manual'));
        });
      return;
    }
    if (countdown.at === null) {
      countdown.at = now() + RETURN_MS;
      push();
      return;
    }
    if (now() < countdown.at) return;
    countdown.at = null;
    list.forEach((uuid) => {
      sent.set(uuid, now());
      ctx.msg(uuid, text(langOf(uuid), 'wartung.back'));
      ctx.connect(uuid, LOBBY);
    });
    push();
  };

  /** Wartung beginnt: wer nicht immer hinein darf, wartet ab jetzt in der Wartungs-Lobby. */
  const parkEveryone = (): void => {
    if (!open()) return;
    ctx.presence
      .all()
      .filter((p) => p.server !== null && p.server !== WARTUNG_SERVER && parked(p.uuid))
      .forEach((p) => {
        waitingSet.add(p.uuid);
        ctx.msg(p.uuid, text(p.lang, 'wartung.moving', { until: untilText(p.lang) }));
        ctx.connect(p.uuid, WARTUNG_SERVER);
      });
  };

  return {
    parked,
    open,
    held: (uuid, lang) => (parked(uuid) ? text(lang, 'wartung.held', { until: untilText(lang) }) : null),
    screen: (lang) =>
      text(lang, 'maintenance.screen', { message: mm(settings().message), until: untilText(lang) }),
    untilMotd: () => {
      const until = settings().until;
      return until ? ` bis ca. ${until}` : '';
    },
    firstServer: (uuid) => {
      if (parked(uuid)) return WARTUNG_SERVER;
      if (lobbyUp() || !open()) return LOBBY;
      return WARTUNG_SERVER;
    },
    fallback: (uuid, lang) => {
      const isParked = parked(uuid);
      const s = settings();
      const order = ((): string[] => {
        if (isParked) return s.lobbyOn ? [WARTUNG_SERVER] : [];
        if (!s.lobbyOn) return [LOBBY];
        return lobbyUp() ? [LOBBY, WARTUNG_SERVER] : [WARTUNG_SERVER, LOBBY];
      })();
      const message = isParked
        ? text(lang, 'wartung.arrive_maintenance', { message: mm(s.message), until: untilText(lang) })
        : text(lang, 'wartung.arrive_lobby');
      const bye = isParked
        ? text(lang, 'maintenance.screen', { message: mm(s.message), until: untilText(lang) })
        : text(lang, 'wartung.bye');
      return { order, message, bye };
    },
    waiting: (uuid) => {
      waitingSet.add(uuid);
      told.delete(uuid);
    },
    onSwitch: (uuid, server) => {
      if (server === WARTUNG_SERVER) return;
      waitingSet.delete(uuid);
      sent.delete(uuid);
      told.delete(uuid);
    },
    onLeave: (uuid) => {
      waitingSet.delete(uuid);
      sent.delete(uuid);
      told.delete(uuid);
    },
    onOnline: () => ctx.presence.on(WARTUNG_SERVER).forEach((p) => waitingSet.add(p.uuid)),
    onServer: (server) => {
      if (server !== LOBBY && server !== WARTUNG_SERVER) return;
      push();
      tick();
    },
    onSettings: () => {
      const maintenance = settings().maintenance;
      if (maintenance && !last.maintenance) parkEveryone();
      last.maintenance = maintenance;
      push();
      tick();
    },
    state,
    tick,
    start: () => {
      timer.id = setInterval(tick, TICK_MS);
      timer.id.unref();
    },
    stop: () => {
      if (timer.id) clearInterval(timer.id);
      timer.id = null;
    },
  };
}
