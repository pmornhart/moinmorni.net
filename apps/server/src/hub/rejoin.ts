import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { networkCommand } from '@moinmorni/shared';
import type { Command } from './commands.js';
import type { HubContext } from './context.js';
import { normalUuid } from './players.js';
import { mm, text, type Lang, type TextKey } from './texts.js';
import type { Body, Connection } from './transport.js';

/**
 * Mitten im Spiel (Modus-Schnittstelle Fassung 2, docs/hub-protokoll.md):
 *
 * - **Nachfrage:** Spielt jemand gerade eine Runde (der Modus meldet `playing`), fragt /lobby – und „Zur Lobby“ im
 *   Modus (`ask-lobby`) – erst nach: Fenster auf dem Spielserver (`lobby-ask`, geht auch auf Bedrock), auf Java dazu
 *   Knöpfe im Chat. Ein zweites /lobby innerhalb weniger Sekunden gilt als „Ja“.
 * - **Zurück ins Spiel:** Ist die Verbindung mitten im Spiel weg, hält der Modus den Platz frei (`hold-slot`). Kommt
 *   der Spieler in der Zeit wieder in die Lobby, bietet sie „Zurück ins Spiel“ an (`rejoin-offer`); ein Klick
 *   (`rejoin`, /rueckkehr) bringt ihn auf genau diesen Server. Läuft die Zeit ab oder nimmt der Modus das Angebot
 *   zurück, verschwindet es (`rejoin-off`).
 *
 * Ein Spielserver spricht nur für eigene Spieler: `playing`, `ask-lobby`, `lobby-answer` und `rejoin` nur für
 * Spieler, die gerade bei ihm sind; `hold-slot` auch für die, die ihn eben erst verlassen haben (die Abmeldung beim
 * Proxy kommt oft vor der Meldung des Modus) – der Platz zeigt immer auf den meldenden Server und nur ein Spielmodus
 * darf Plätze freihalten.
 */

const LOBBY = 'lobby';
const SECOND_MS = 1_000;
/** Ein zweites /lobby innerhalb dieser Zeit gilt als „Ja“. */
export const CONFIRM_MS = 10_000;
/** So lange nach dem Verlassen darf ein Modus den Platz noch freihalten. */
export const JUST_LEFT_MS = 30_000;
/** Wer gerade selbst in die Lobby gegangen ist (Ja gesagt oder vom Modus geschickt), bekommt kein Angebot. */
export const ON_PURPOSE_MS = 15_000;
/** Länger hält kein Modus einen Platz frei. */
export const HOLD_MAX_SECONDS = 3_600;
/**
 * Meldet ein Modus „spielt“ beim Betreten, kommt das oft vor dem Wechsel beim Proxy an: so lange gilt es, wenn der
 * Spieler danach wirklich auf diesem Server ankommt.
 */
export const EARLY_MS = 5_000;
/** „Runde vorbei“ erst nach kurzem Warten sagen – vielleicht wechselt er gerade zurück in die Runde. */
export const TELL_LATER_MS = 1_500;
const SWEEP_MS = 1_000;

/** `/lobby ja` und `/lobby nein` (aus den Knöpfen im Chat, gehen auch getippt). */
const YES: readonly string[] = ['ja', 'j', 'yes', 'y'];
const NO: readonly string[] = ['nein', 'n', 'no', 'weiter', 'stay'];

/** UUID mit oder ohne Bindestriche (36 bzw. 32 Zeichen) – wie in index.ts großzügig begrenzt. */
const UUID_MAX = 40;
const uuidField = z.string().min(1).max(UUID_MAX);
const uuidSchema = z.object({ uuid: uuidField });
const playingSchema = z.object({ uuid: uuidField, playing: z.boolean() });
const holdSchema = z.object({ uuid: uuidField, seconds: z.number().finite() });
const answerSchema = z.object({ uuid: uuidField, yes: z.boolean() });

type Answer = 'yes' | 'no';
/** Warum ein Platz nicht mehr frei ist (`used` = er ist wieder drin). */
type Gone = 'expired' | 'ended' | 'gone';
const GONE_TEXT = {
  expired: 'rejoin.expired',
  ended: 'rejoin.ended',
  gone: 'rejoin.gone',
} as const satisfies Record<Gone, TextKey>;

/** Wo und wann (für Nachfrage, zuletzt verlassenen Server, freiwillig gegangen). */
interface Mark {
  readonly server: string;
  readonly at: number;
}

/** „Spielt“ von einem Server, auf dem der Spieler noch nicht angekommen ist. */
interface Early extends Mark {
  readonly playing: boolean;
}

/** Freigehaltener Platz: Server und Modus, bis wann (ms). */
interface Hold {
  readonly server: string;
  readonly mode: string;
  readonly until: number;
}

export interface Rejoin {
  /** Nachrichten der Spielserver (`playing`, `hold-slot`, `ask-lobby`, `lobby-answer`, `rejoin`). */
  readonly handlers: Readonly<Record<string, (conn: Connection, body: Body) => void>>;
  /** /lobby (fragt mitten im Spiel nach) und /rueckkehr. */
  readonly commands: Command[];
  /** Der Proxy meldet einen Wechsel (`from` = Server davor, null = gerade ins Netzwerk gekommen). */
  readonly moved: (uuid: string, from: string | null, to: string) => void;
  /** Spieler hat das Netzwerk verlassen (`from` = letzter Server). */
  readonly left: (uuid: string, from: string | null) => void;
  /** Der Modus schickt den Spieler selbst in die Lobby (`to-lobby`): kein „Zurück ins Spiel“ dafür. */
  readonly sentAway: (uuid: string, from: string) => void;
  readonly opened: (server: string) => void;
  readonly closed: (server: string) => void;
  /** Angebote in der Lobby neu prüfen: Schalter im Panel (Netzwerk → Mitten im Spiel), Gefängnis. */
  readonly refresh: () => void;
  /** Server, auf denen gerade jemandes Platz frei gehalten wird – sie sollen nicht schlafen gehen. */
  readonly heldServers: () => string[];
  readonly stop: () => void;
}

export interface RejoinOptions {
  readonly ctx: HubContext;
  /** Nachricht an einen Spielserver (fehlt er, geht sie verloren). */
  readonly send: (server: string, body: Body) => void;
  readonly connected: (server: string) => boolean;
  readonly log: FastifyBaseLogger;
  readonly now: () => number;
}

export function createRejoin({ ctx, send, connected, log, now }: RejoinOptions): Rejoin {
  const network = (): Record<string, unknown> => ctx.stores.settings('network');
  const confirmOn = (): boolean => network()['lobbyConfirm'] === true;
  const offerOn = (): boolean => network()['rejoinOffer'] === true;

  /** Wer gerade eine Runde spielt: Spieler → Server. */
  const playing = new Map<string, string>();
  /** Offene Nachfrage: Spieler → wo und wann gefragt. */
  const asked = new Map<string, Mark>();
  /** Zuletzt verlassener Server. */
  const lastLeft = new Map<string, Mark>();
  /** Selbst in die Lobby gegangen. */
  const onPurpose = new Map<string, Mark>();
  /** „Spielt“ kam vor dem Wechsel an. */
  const early = new Map<string, Early>();
  const holds = new Map<string, Hold>();
  const later = new Set<ReturnType<typeof setTimeout>>();

  const modeOfServer = (server: string): { id: string; name: Record<Lang, string> } | undefined =>
    ctx.stores.modes().find((m) => m.server === server);
  const modeName = (id: string, lang: Lang): string =>
    ctx.stores.modes().find((m) => m.id === id)?.name[lang] ?? id;
  const recent = (mark: Mark | undefined, server: string, ms: number): boolean =>
    mark?.server === server && now() - mark.at <= ms;
  const active = (uuid: string): Hold | undefined => {
    const hold = holds.get(uuid);
    return hold && hold.until > now() ? hold : undefined;
  };
  /** Spielserver sprechen nur für Spieler, die gerade bei ihnen sind. */
  const isHere = (conn: Connection, uuid: string): boolean =>
    conn.kind === 'backend' && ctx.presence.get(uuid)?.server === conn.server;
  const answerOf = (word: string | undefined): Answer | undefined => {
    const w = word?.toLowerCase() ?? '';
    if (YES.includes(w)) return 'yes';
    return NO.includes(w) ? 'no' : undefined;
  };

  // ---------- Nachfrage vor /lobby ----------

  const goLobby = (uuid: string, lang: Lang, from: string | null): void => {
    asked.delete(uuid);
    if (from && from !== LOBBY) onPurpose.set(uuid, { server: from, at: now() });
    ctx.msg(uuid, text(lang, ctx.connect(uuid, LOBBY) ? 'lobby.going' : 'lobby.missing'));
  };

  /** /lobby, „Zur Lobby“ im Modus oder eine Antwort auf die Nachfrage. */
  const toLobby = (uuid: string, answer?: Answer): void => {
    const p = ctx.presence.get(uuid);
    if (!p) return;
    const server = p.server;
    if (answer === 'no') {
      asked.delete(uuid);
      if (server) send(server, { t: 'lobby-ask-close', uuid });
      ctx.msg(uuid, text(p.lang, 'lobby.stay'));
      return;
    }
    if (
      answer === 'yes' ||
      !server ||
      server === LOBBY ||
      !confirmOn() ||
      playing.get(uuid) !== server ||
      recent(asked.get(uuid), server, CONFIRM_MS)
    ) {
      goLobby(uuid, p.lang, server);
      return;
    }
    asked.set(uuid, { server, at: now() });
    const mode = modeOfServer(server)?.name[p.lang] ?? server;
    send(server, { t: 'lobby-ask', uuid, mode });
    ctx.msg(uuid, text(p.lang, p.bedrock ? 'lobby.ask_bedrock' : 'lobby.ask', { mode: mm(mode) }));
  };

  // ---------- Zurück ins Spiel ----------

  const withdraw = (uuid: string): void => send(LOBBY, { t: 'rejoin-off', uuid });

  /** In der Lobby anbieten – nur eingeschaltet, solange der Server läuft und nicht aus dem Gefängnis heraus. */
  const offer = (uuid: string): void => {
    const p = ctx.presence.get(uuid);
    const hold = active(uuid);
    if (!p || p.server !== LOBBY || !hold) return;
    if (!offerOn() || !connected(hold.server) || ctx.punish.active(uuid, 'jail')) {
      withdraw(uuid);
      return;
    }
    const name = { de: modeName(hold.mode, 'de'), en: modeName(hold.mode, 'en') };
    send(LOBBY, {
      t: 'rejoin-offer',
      uuid,
      server: hold.server,
      mode: { id: hold.mode, ...name },
      seconds: Math.ceil((hold.until - now()) / SECOND_MS),
      chat: text(p.lang, p.bedrock ? 'rejoin.offer_bedrock' : 'rejoin.offer', { mode: mm(name[p.lang]) }),
    });
  };

  /** Platz nicht mehr frei: Angebot weg; wer in der Lobby ist, erfährt warum. */
  const drop = (uuid: string, why: Gone | 'used'): void => {
    const hold = holds.get(uuid);
    if (!hold) return;
    holds.delete(uuid);
    if (ctx.presence.get(uuid)?.server !== LOBBY) return;
    withdraw(uuid);
    if (why === 'used') return;
    const tell = (): void => {
      const p = ctx.presence.get(uuid);
      if (p?.server === LOBBY && offerOn())
        ctx.msg(uuid, text(p.lang, GONE_TEXT[why], { mode: mm(modeName(hold.mode, p.lang)) }));
    };
    // Nimmt der Modus den Platz zurück, weil der Spieler gerade wieder hineinkommt, sagen wir nichts.
    if (why !== 'ended') {
      tell();
      return;
    }
    const timer = setTimeout(() => {
      later.delete(timer);
      tell();
    }, TELL_LATER_MS);
    timer.unref();
    later.add(timer);
  };

  const hold = (conn: Connection, body: Body): void => {
    const m = holdSchema.parse(body);
    const uuid = normalUuid(m.uuid);
    const mode = modeOfServer(conn.server);
    if (conn.kind !== 'backend' || conn.server === LOBBY || !mode) {
      log.warn({ server: conn.server }, 'Hub: Platz freihalten geht nur auf dem Server eines Spielmodus');
      return;
    }
    const seconds = Math.min(HOLD_MAX_SECONDS, Math.max(0, Math.floor(m.seconds)));
    if (seconds === 0) {
      if (holds.get(uuid)?.server === conn.server) drop(uuid, 'ended');
      return;
    }
    const mine =
      ctx.presence.get(uuid)?.server === conn.server || recent(lastLeft.get(uuid), conn.server, JUST_LEFT_MS);
    if (!mine) {
      log.warn({ server: conn.server }, 'Hub: Platz freihalten für einen fremden Spieler abgelehnt');
      return;
    }
    // Selbst gegangen (Ja gesagt, vom Modus geschickt): dafür kein „Zurück ins Spiel“.
    if (recent(onPurpose.get(uuid), conn.server, ON_PURPOSE_MS)) return;
    holds.set(uuid, { server: conn.server, mode: mode.id, until: now() + seconds * SECOND_MS });
    offer(uuid);
  };

  const rejoin = (uuid: string): void => {
    const p = ctx.presence.get(uuid);
    if (!p) return;
    const hold = active(uuid);
    if (!hold || !offerOn()) {
      ctx.msg(uuid, text(p.lang, 'rejoin.none'));
      return;
    }
    const mode = mm(modeName(hold.mode, p.lang));
    if (p.server === hold.server) {
      ctx.msg(uuid, text(p.lang, 'mode.already', { mode }));
      return;
    }
    if (!connected(hold.server)) {
      drop(uuid, 'gone');
      if (p.server !== LOBBY) ctx.msg(uuid, text(p.lang, 'rejoin.gone', { mode }));
      return;
    }
    // Wie über eine Figur: Gefängnis, Wartung, Einladung prüfen – dann genau auf diesen Server.
    if (ctx.goTo(uuid, hold.server)) ctx.msg(uuid, text(p.lang, 'rejoin.going', { mode }));
  };

  /** Abgelaufene Plätze weg (Angebot zurück), alte Merker vergessen. */
  const sweep = (): void => {
    const t = now();
    [...holds].filter(([, h]) => h.until <= t).forEach(([uuid]) => drop(uuid, 'expired'));
    const forget = (map: Map<string, Mark>, ms: number): void =>
      [...map].filter(([, mark]) => t - mark.at > ms).forEach(([uuid]) => map.delete(uuid));
    forget(asked, CONFIRM_MS);
    forget(lastLeft, JUST_LEFT_MS);
    forget(onPurpose, ON_PURPOSE_MS);
    forget(early, EARLY_MS);
  };
  const timer = setInterval(sweep, SWEEP_MS);
  timer.unref();

  const handlers: Rejoin['handlers'] = {
    playing: (conn, body) => {
      const m = playingSchema.parse(body);
      const uuid = normalUuid(m.uuid);
      if (conn.kind !== 'backend') return;
      // Noch nicht angekommen (Wechsel beim Proxy kommt gleich): gilt nur, wenn er wirklich hierher kommt.
      if (!isHere(conn, uuid)) early.set(uuid, { server: conn.server, at: now(), playing: m.playing });
      else if (m.playing) playing.set(uuid, conn.server);
      else if (playing.get(uuid) === conn.server) playing.delete(uuid);
    },
    'hold-slot': hold,
    'ask-lobby': (conn, body) => {
      const uuid = normalUuid(uuidSchema.parse(body).uuid);
      if (isHere(conn, uuid)) toLobby(uuid);
    },
    'lobby-answer': (conn, body) => {
      const m = answerSchema.parse(body);
      const uuid = normalUuid(m.uuid);
      if (isHere(conn, uuid)) toLobby(uuid, m.yes ? 'yes' : 'no');
    },
    rejoin: (conn, body) => {
      const uuid = normalUuid(uuidSchema.parse(body).uuid);
      if (isHere(conn, uuid)) rejoin(uuid);
    },
  };

  const commands: Command[] = [
    {
      ...networkCommand('lobby'),
      own: [...YES, ...NO],
      run: (actor, args) => toLobby(actor.uuid, answerOf(args[0])),
    },
    {
      ...networkCommand('rueckkehr'),
      run: (actor) => rejoin(actor.uuid),
    },
  ];

  return {
    handlers,
    commands,
    moved: (raw, from, to) => {
      const uuid = normalUuid(raw);
      if (from !== to) {
        playing.delete(uuid);
        asked.delete(uuid);
        if (from) lastLeft.set(uuid, { server: from, at: now() });
      }
      // Wieder dort, wo er selbst gegangen ist: eine neue Runde – bricht die ab, gilt das Freihalten wieder.
      if (onPurpose.get(uuid)?.server === to) onPurpose.delete(uuid);
      const before = early.get(uuid);
      early.delete(uuid);
      if (before?.playing && recent(before, to, EARLY_MS)) playing.set(uuid, to);
      // Wieder drin: erledigt. In der Lobby angekommen: anbieten.
      if (holds.get(uuid)?.server === to) drop(uuid, 'used');
      else if (to === LOBBY) offer(uuid);
    },
    left: (raw, from) => {
      const uuid = normalUuid(raw);
      playing.delete(uuid);
      asked.delete(uuid);
      early.delete(uuid);
      if (from) lastLeft.set(uuid, { server: from, at: now() });
    },
    sentAway: (raw, from) => onPurpose.set(normalUuid(raw), { server: from, at: now() }),
    opened: (server) => {
      if (server === LOBBY) ctx.presence.on(LOBBY).forEach((p) => offer(p.uuid));
    },
    closed: (server) => {
      // Server weg (schläft, neu gestartet, abgestürzt): seine Runden gibt es nicht mehr.
      [...holds].filter(([, h]) => h.server === server).forEach(([uuid]) => drop(uuid, 'gone'));
      [...playing].filter(([, s]) => s === server).forEach(([uuid]) => playing.delete(uuid));
    },
    refresh: () =>
      ctx.presence
        .on(LOBBY)
        .filter((p) => holds.has(p.uuid))
        .forEach((p) => offer(p.uuid)),
    heldServers: () => [...new Set([...holds.values()].filter((h) => h.until > now()).map((h) => h.server))],
    stop: () => {
      clearInterval(timer);
      later.forEach((t) => clearTimeout(t));
      later.clear();
    },
  };
}
