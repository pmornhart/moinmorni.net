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
/**
 * Meldet der Proxy, dass die Lobby bei einem Spieler nicht ging, gilt sie so lange als weg – auch wenn ihr Plugin
 * noch am Hub hängt (z. B. Server hängt). Verbindet sie sich neu, gilt sie gleich wieder.
 */
const LOBBY_FAILED_MS = 60_000;
/**
 * Höchstens so lange gilt die Lobby wegen ihres Selbstbaus als „nicht bereit“ – scheitert oder hängt der Bau, kommen
 * die Spieler danach trotzdem hinein (nie für immer ausgesperrt).
 */
export const LOBBY_BUILD_MAX_MS = 15 * 60_000;
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
  readonly fallback: (uuid: string, lang: Lang, tried?: readonly string[]) => FallbackAnswer;
  /** Spieler wartet in der Wartungs-Lobby (geschickt, nicht freiwillig) – kommt automatisch zurück. */
  readonly waiting: (uuid: string) => void;
  /**
   * Die Lobby startet gleich neu (nach einem Update): Spieler in die Wartungs-Lobby, sie warten dort und kommen von
   * selbst zurück, sobald die Lobby wieder am Hub hängt. false = geht nicht (Wartungs-Lobby aus, nicht da, Proxy weg).
   */
  readonly park: (uuid: string) => boolean;
  /**
   * Wie viele in der Wartungs-Lobby warten und von selbst in die Lobby zurückkommen (automatisch zurück an, nicht von
   * der Wartung festgehalten)? Der Neustart nach einem Update startet die Wartungs-Lobby erst, wenn das 0 ist.
   */
  readonly returning: () => number;
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
  /**
   * Wartungs-Neustart (hub/wartung-plan.ts): solange an, wartet jeder in der Wartungs-Lobby – auch das Team –, und
   * niemand kommt zurück, bevor alle Server wieder laufen.
   */
  readonly hold: (on: boolean) => void;
  readonly holding: () => boolean;
  /** Stand des Wartungs-Neustarts für Leiste und Aushang („5 von 16 fertig“); null = keiner läuft. */
  readonly restartProgress: (progress: { readonly done: number; readonly total: number } | null) => void;
  /**
   * Die Lobby baut gerade ihre Welt (Selbstbau, `lobby/world.ts`): solange gilt sie als nicht bereit – Neue und
   * Rausgeworfene warten in der Wartungs-Lobby, wer in der Lobby steht, kommt dorthin; nach dem Bau automatisch zurück.
   */
  readonly building: (on: boolean) => void;
  readonly isBuilding: () => boolean;
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
  const lobbyFailed: { at: number } = { at: 0 };
  const timer: { id: ReturnType<typeof setInterval> | null } = { id: null };
  const last = { maintenance: settings().maintenance };
  const restart: { held: boolean; progress: { readonly done: number; readonly total: number } | null } = {
    held: false,
    progress: null,
  };

  const build: { since: number | null } = { since: null };
  const lobbyBuilding = (): boolean => build.since !== null && now() - build.since < LOBBY_BUILD_MAX_MS;
  const lobbyUp = (): boolean =>
    deps.connected(LOBBY) && now() - lobbyFailed.at > LOBBY_FAILED_MS && !lobbyBuilding();
  const wartungUp = (): boolean => deps.connected(WARTUNG_SERVER);
  const parked = (uuid: string): boolean =>
    restart.held || (settings().maintenance && !alwaysIn(ctx.players.roleOf(uuid)));
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
      building: lobbyBuilding(),
      maintenance: s.maintenance,
      message: s.message,
      until: s.until,
      returnAuto: s.returnAuto,
      returnIn: countdown.at === null ? null : Math.max(0, Math.ceil((countdown.at - now()) / SECOND_MS)),
      points: WARTUNG_POINTS,
      // Wartungs-Neustart: alle warten hier, die Leiste zeigt, wie weit die Server sind (ältere Plugins überhören es).
      hold: restart.held,
      restart: restart.progress,
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
    fallback: (uuid, lang, tried = []) => {
      // Die Lobby ging gerade bei jemandem nicht: nicht gleich wieder dorthin zurückschicken.
      if (tried.includes(LOBBY) && lobbyUp()) {
        lobbyFailed.at = now();
        push();
      }
      const isParked = parked(uuid);
      const s = settings();
      const order = ((): string[] => {
        if (isParked) return s.lobbyOn ? [WARTUNG_SERVER] : [];
        if (!s.lobbyOn) return [LOBBY];
        return lobbyUp() ? [LOBBY, WARTUNG_SERVER] : [WARTUNG_SERVER, LOBBY];
      })();
      const bye = isParked
        ? text(lang, 'maintenance.screen', { message: mm(s.message), until: untilText(lang) })
        : text(lang, 'wartung.bye');
      return { order, bye };
    },
    waiting: (uuid) => {
      waitingSet.add(uuid);
      told.delete(uuid);
    },
    park: (uuid) => {
      if (!open()) return false;
      // Die Lobby hängt noch kurz am Hub – nicht schon vor ihrem Neustart wieder zurückschicken.
      lobbyFailed.at = now();
      waitingSet.add(uuid);
      told.delete(uuid);
      cancel();
      return ctx.connect(uuid, WARTUNG_SERVER);
    },
    returning: () =>
      settings().returnAuto
        ? ctx.presence.on(WARTUNG_SERVER).filter((p) => waitingSet.has(p.uuid) && !parked(p.uuid)).length
        : 0,
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
      if (server === LOBBY && deps.connected(LOBBY)) lobbyFailed.at = 0;
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
    hold: (on) => {
      if (restart.held === on) return;
      restart.held = on;
      if (!on) restart.progress = null;
      push();
      tick();
    },
    holding: () => restart.held,
    building: (on) => {
      if (on === (build.since !== null)) return;
      build.since = on ? now() : null;
      if (on && open())
        ctx.presence.on(LOBBY).forEach((p) => {
          waitingSet.add(p.uuid);
          told.delete(p.uuid);
          ctx.msg(p.uuid, text(p.lang, 'wartung.building'));
          ctx.connect(p.uuid, WARTUNG_SERVER);
        });
      cancel();
      push();
      tick();
    },
    isBuilding: lobbyBuilding,
    restartProgress: (progress) => {
      const same = progress?.done === restart.progress?.done && progress?.total === restart.progress?.total;
      restart.progress = progress;
      if (!same) push();
    },
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
