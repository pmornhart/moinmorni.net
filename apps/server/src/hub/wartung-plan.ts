import {
  countdownWords,
  parseCountdown,
  WARTUNG_REASON_MAX,
  WARTUNG_SERVER,
  type WartungPlanKind,
  type WartungPlanView,
} from '@moinmorni/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { HubContext } from './context.js';
import { mm, type Lang } from './texts.js';
import type { Body } from './transport.js';
import type { Wartung } from './wartung.js';

/**
 * Wartung als eine Sache (Philip: „Arbeite den Wartungsmodus neu“, „/wartung-restart 10min Update“):
 * - `/wartung an [zeit] [grund]`: ohne Zeit gleich, mit Zeit angekündigt – großer Titel, Chat und Leiste oben für alle,
 *   die herunterzählt (auch für alle, die während des Countdowns kommen), Erinnerungen, dann Wartung an.
 * - `/wartung neustart [zeit] [grund] [--proxy]` (auch `/wartung-restart`): genauso angekündigt; dann Wartung an, jeder
 *   (auch das Team) wartet in der Wartungs-Lobby, alle Server außer der Wartungs-Lobby starten neu (Spielmodi und
 *   Bau-Server je drei zugleich, dann die Lobby, den Proxy nur mit `--proxy`). Laufen alle wieder, geht die Wartung aus
 *   (wenn sie erst der Neustart eingeschaltet hat) und alle kommen von selbst in die Lobby zurück. Hängt etwas, geht es
 *   nach höchstens 30 Minuten trotzdem weiter – mit Hinweis ans Team (Chat und Discord-Team-Log).
 * Das Panel (Netzwerk → Wartung) benutzt dieselben Wege (`/api/panel/wartung`).
 */

const SECOND_MS = 1000;
const TICK_MS = 1000;
/** Hier kommt eine Erinnerung (Titel; bis 10 s auch im Chat und als neue Leiste). */
const MINUTE_S = 60;
const REMIND_MINUTES: readonly number[] = [60, 30, 15, 10, 5, 2, 1];
const REMIND_SECONDS: readonly number[] = [30, 10, 5, 4, 3, 2, 1];
const REMIND_AT: readonly number[] = [...REMIND_MINUTES.map((m) => m * MINUTE_S), ...REMIND_SECONDS];
/** Ab hier jede Sekunde nur noch der Titel. */
const CHAT_DOWN_TO = 10;
/** So lange darf der Neustart aller Server höchstens dauern. */
const RESTART_MAX_MINUTES = 30;
const RESTART_MAX_MS = RESTART_MAX_MINUTES * MINUTE_S * SECOND_MS;
/** Nach dem Umzug in die Wartungs-Lobby kurz warten, bis alle angekommen sind. */
const SETTLE_MS = 3000;
const BY_SYSTEM = 'MoinMorni';
/** So lange bleibt ein Titel stehen (Sekunden). */
const TITLE_STAY = 4;
const PROXY_FLAGS = new Set(['--proxy', '+proxy', 'mitproxy', 'proxy']);

const P = '<dark_gray>[<gradient:#3ddc84:#1fa463>MoinMorni</gradient>]</dark_gray> ';

/** Texte de/en (MiniMessage); {name} wird ersetzt. Eigene Datei, damit hub/texts.ts klein bleibt. */
const T = {
  'title.on': { de: '<gold><bold>⚒ Wartung</bold></gold>', en: '<gold><bold>⚒ Maintenance</bold></gold>' },
  'title.restart': {
    de: '<gold><bold>⚒ Wartungs-Neustart</bold></gold>',
    en: '<gold><bold>⚒ Maintenance restart</bold></gold>',
  },
  'sub.in': { de: '<yellow>in {time}</yellow>{reason}', en: '<yellow>in {time}</yellow>{reason}' },
  'sub.reason': { de: ' <gray>– <white>{reason}</white>', en: ' <gray>– <white>{reason}</white>' },
  'bar.on': {
    de: '<gold>⚒ Wartung in <yellow>{t}</yellow></gold>{reason}',
    en: '<gold>⚒ Maintenance in <yellow>{t}</yellow></gold>{reason}',
  },
  'bar.restart': {
    de: '<gold>⚒ Wartungs-Neustart in <yellow>{t}</yellow></gold>{reason}',
    en: '<gold>⚒ Maintenance restart in <yellow>{t}</yellow></gold>{reason}',
  },
  'chat.on': {
    de: `${P}<gold>Wartung in {time}</gold>{reason}<gray>. Dann wartest du kurz in der Wartungs-Lobby – das Team sagt Bescheid, wenn es weitergeht.`,
    en: `${P}<gold>Maintenance in {time}</gold>{reason}<gray>. You’ll then wait in the maintenance lobby for a bit – the team will let you know when we’re back.`,
  },
  'chat.restart': {
    de: `${P}<gold>Wartungs-Neustart in {time}</gold>{reason}<gray>. Dann geht es für alle kurz in die Wartungs-Lobby, alle Server starten neu – danach kommst du von selbst zurück in die Lobby.`,
    en: `${P}<gold>Maintenance restart in {time}</gold>{reason}<gray>. Everyone goes to the maintenance lobby for a moment, all servers restart – afterwards you’ll return to the lobby by yourself.`,
  },
  'title.now': {
    de: '<gold><bold>⚒ Wartung beginnt</bold></gold>',
    en: '<gold><bold>⚒ Maintenance starts</bold></gold>',
  },
  'sub.now.restart': {
    de: '<gray>Alle Server starten neu – gleich geht’s weiter',
    en: '<gray>All servers are restarting – back in a moment',
  },
  'chat.now.restart': {
    de: `${P}<gold>Wartungs-Neustart</gold> <gray>– du wartest in der Wartungs-Lobby, bis alle Server wieder laufen. Danach geht’s automatisch zurück.`,
    en: `${P}<gold>Maintenance restart</gold> <gray>– you’ll wait in the maintenance lobby until all servers are back. Then you’ll go back automatically.`,
  },
  'title.cancel': {
    de: '<green><bold>Wartung abgesagt</bold></green>',
    en: '<green><bold>Maintenance called off</bold></green>',
  },
  'bar.cancel': {
    de: '<green>✔ Wartung abgesagt – viel Spaß!</green>',
    en: '<green>✔ Maintenance called off – have fun!</green>',
  },
  'chat.cancel': {
    de: `${P}<green>Die angekündigte Wartung ist abgesagt</green> <gray>– spiel einfach weiter.`,
    en: `${P}<green>The announced maintenance is called off</green> <gray>– just keep playing.`,
  },
  'title.done': { de: '<green><bold>✔ Fertig!</bold></green>', en: '<green><bold>✔ Done!</bold></green>' },
  'chat.done': {
    de: `${P}<green>Alle Server laufen wieder</green> <gray>– danke fürs Warten!`,
    en: `${P}<green>All servers are back</green> <gray>– thanks for waiting!`,
  },
  'chat.done.still': {
    de: `${P}<green>Alle Server laufen wieder</green> <gray>– die Wartung läuft aber noch, bis das Team sie beendet.`,
    en: `${P}<green>All servers are back</green> <gray>– maintenance stays on until the team ends it.`,
  },
  // ---------- Team (Befehl) ----------
  'cmd.no_right': {
    de: `${P}<red>Wartung schaltet nur, wer im Panel die Einstellungen ändern darf.`,
    en: `${P}<red>Only people who may change the settings in the panel can switch maintenance.`,
  },
  'cmd.help': {
    de: `${P}<gold>Wartung</gold> <gray>– so geht’s:\n<yellow>/wartung an [zeit] [grund]</yellow> <gray>– ohne Zeit sofort, mit Zeit (30s, 10m, 1h) angekündigt\n<yellow>/wartung aus</yellow> <gray>– Wartung beenden\n<yellow>/wartung neustart [zeit] [grund] [--proxy]</yellow> <gray>– alle in die Wartungs-Lobby, alle Server neu starten\n<yellow>/wartung status</yellow> <gray>· <yellow>/wartung abbrechen</yellow>\n<yellow>/wartung text <text></yellow> <gray>· <yellow>/wartung bis <uhrzeit|weg></yellow> <gray>· <yellow>/wartung lobby an|aus</yellow> <gray>· <yellow>/wartung zurueck an|aus</yellow>`,
    en: `${P}<gold>Maintenance</gold> <gray>– how it works:\n<yellow>/maintenance on [time] [reason]</yellow> <gray>– without a time right away, with a time (30s, 10m, 1h) announced\n<yellow>/maintenance off</yellow> <gray>– end maintenance\n<yellow>/maintenance restart [time] [reason] [--proxy]</yellow> <gray>– everyone to the maintenance lobby, restart all servers\n<yellow>/maintenance status</yellow> <gray>· <yellow>/maintenance cancel</yellow>\n<yellow>/maintenance text <text></yellow> <gray>· <yellow>/maintenance until <time|weg></yellow> <gray>· <yellow>/maintenance lobby on|off</yellow> <gray>· <yellow>/maintenance return on|off</yellow>`,
  },
  'cmd.on': {
    de: `${P}<green>Wartung ist an.</green> <gray>Spieler ohne „Kommt immer rein“ warten in der Wartungs-Lobby.`,
    en: `${P}<green>Maintenance is on.</green> <gray>Players without “Always gets in” wait in the maintenance lobby.`,
  },
  'cmd.already_on': {
    de: `${P}<gray>Die Wartung ist schon an. Beenden: <yellow>/wartung aus</yellow>`,
    en: `${P}<gray>Maintenance is already on. To end it: <yellow>/maintenance off</yellow>`,
  },
  'cmd.off': {
    de: `${P}<green>Wartung ist aus.</green> <gray>Alle kommen zurück in die Lobby.`,
    en: `${P}<green>Maintenance is off.</green> <gray>Everyone returns to the lobby.`,
  },
  'cmd.already_off': {
    de: `${P}<gray>Die Wartung ist schon aus.`,
    en: `${P}<gray>Maintenance is already off.`,
  },
  'cmd.announced': {
    de: `${P}<green>Angekündigt:</green> <white>{what}</white> <gray>in {time}{reason}. Absagen: <yellow>/wartung abbrechen</yellow>`,
    en: `${P}<green>Announced:</green> <white>{what}</white> <gray>in {time}{reason}. To call it off: <yellow>/maintenance cancel</yellow>`,
  },
  'cmd.busy': {
    de: `${P}<red>Es ist schon etwas angekündigt bzw. ein Neustart läuft.</red> <gray>Erst <yellow>/wartung abbrechen</yellow> – oder <yellow>/wartung status</yellow>.`,
    en: `${P}<red>Something is already announced or a restart is running.</red> <gray>First <yellow>/maintenance cancel</yellow> – or <yellow>/maintenance status</yellow>.`,
  },
  'cmd.restarting': {
    de: `${P}<red>Der Wartungs-Neustart läuft gerade</red> <gray>– danach geht die Wartung von selbst aus.`,
    en: `${P}<red>The maintenance restart is running</red> <gray>– maintenance ends by itself afterwards.`,
  },
  'cmd.cancelled': { de: `${P}<green>Abgesagt.</green>`, en: `${P}<green>Called off.</green>` },
  'cmd.nothing': {
    de: `${P}<gray>Es ist nichts angekündigt.`,
    en: `${P}<gray>Nothing is announced.`,
  },
  'cmd.bad_time': {
    de: `${P}<red>Die Zeit verstehe ich nicht.</red> <gray>Zum Beispiel <yellow>30s</yellow>, <yellow>10m</yellow>, <yellow>1h</yellow> (höchstens 6 Stunden).`,
    en: `${P}<red>I don’t understand that time.</red> <gray>For example <yellow>30s</yellow>, <yellow>10m</yellow>, <yellow>1h</yellow> (at most 6 hours).`,
  },
  'cmd.too_long': {
    de: `${P}<red>Der Grund ist zu lang</red> <gray>(höchstens {max} Zeichen).`,
    en: `${P}<red>The reason is too long</red> <gray>(at most {max} characters).`,
  },
  'cmd.no_restart': {
    de: `${P}<red>Neu starten geht gerade nicht</red> <gray>(MoinMorni erreicht die Server nicht). Wartung an/aus geht trotzdem.`,
    en: `${P}<red>Restarting isn’t possible right now</red> <gray>(MoinMorni can’t reach the servers). Maintenance on/off still works.`,
  },
  'status.off': {
    de: `${P}<gray>Wartung: <white>aus</white>. Nichts angekündigt.`,
    en: `${P}<gray>Maintenance: <white>off</white>. Nothing announced.`,
  },
  'status.on': {
    de: `${P}<gray>Wartung: <gold>an</gold>{reason}.`,
    en: `${P}<gray>Maintenance: <gold>on</gold>{reason}.`,
  },
  'status.announce': {
    de: `${P}<gray>Angekündigt: <white>{what}</white> in <yellow>{time}</yellow>{reason} <dark_gray>(von {by})`,
    en: `${P}<gray>Announced: <white>{what}</white> in <yellow>{time}</yellow>{reason} <dark_gray>(by {by})`,
  },
  'status.restarting': {
    de: `${P}<gray>Wartungs-Neustart läuft: <white>{done} von {total}</white> Servern fertig.`,
    en: `${P}<gray>Maintenance restart running: <white>{done} of {total}</white> servers done.`,
  },
  'what.on': { de: 'Wartung', en: 'Maintenance' },
  'what.restart': { de: 'Wartungs-Neustart', en: 'Maintenance restart' },
  'what.restart.proxy': { de: 'Wartungs-Neustart mit Proxy', en: 'Maintenance restart incl. proxy' },
  'team.timeout': {
    de: `${P}<red>Wartungs-Neustart: nach 30 Minuten liefen noch nicht alle Server wieder</red> <gray>– die Wartung ist trotzdem beendet. Bitte im Panel nachsehen.`,
    en: `${P}<red>Maintenance restart: not all servers were back after 30 minutes</red> <gray>– maintenance has ended anyway. Please check the panel.`,
  },
  'team.done': {
    de: `${P}<green>Wartungs-Neustart fertig</green> <gray>({done} von {total} Servern neu gestartet).`,
    en: `${P}<green>Maintenance restart done</green> <gray>({done} of {total} servers restarted).`,
  },
} as const satisfies Record<string, Record<Lang, string>>;
type Key = keyof typeof T;

// Platzhalter im Text: "{name}" → Wert von name.
// https://regex101.com/?flavor=javascript&regex=%5C%7B(%5Cw%2B)%5C%7D&flags=g&testString=Hallo%20%7Bname%7D
const PLACEHOLDER = /\{(\w+)\}/g;
// MiniMessage-Tags für das Discord-Team-Log entfernen: "<red>Hallo</red>" → "Hallo"; "a < b" bleibt.
// https://regex101.com/?flavor=javascript&regex=%3C%5B%5E%3E%5Cs%5D%5B%5E%3E%5D*%3E&flags=g&testString=%3Cred%3EHallo%3C%2Fred%3E%20a%20%3C%20b
const TAG = /<[^>\s][^>]*>/g;
export const wt = (lang: Lang, key: Key, vars: Readonly<Record<string, string | number>> = {}): string =>
  T[key][lang].replace(PLACEHOLDER, (all, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : all,
  );

/** Neustart aller Server – kommt aus MoinMorni (app.ts, braucht den Motor). */
export interface WartungRestarter {
  /** Alle Server außer der Wartungs-Lobby neu starten (Proxy nur mit `proxy`); fertig, wenn alle durch sind. */
  readonly run: (proxy: boolean) => Promise<void>;
  /** Wie weit die laufende Runde ist. */
  readonly progress: () => { readonly done: number; readonly total: number };
}

export interface WartungPlanDeps {
  readonly ctx: HubContext;
  readonly now: () => number;
  readonly wartung: Wartung;
  /** Großer Titel auf dem Bildschirm (Proxy, `title`). */
  readonly title: (uuid: string, title: string, subtitle: string) => void;
  /** Leiste oben, die herunterzählt (Proxy, `countdown`). */
  readonly countdown: (uuid: string, text: string, seconds: number) => void;
  readonly log: FastifyBaseLogger;
}

export interface AnnounceInput {
  readonly kind: WartungPlanKind;
  /** 0 = sofort. */
  readonly seconds: number;
  readonly reason: string;
  readonly proxy?: boolean;
  readonly by: string;
}

export type AnnounceResult = 'ok' | 'busy' | 'no_restart' | 'already_on';

export interface WartungPlan {
  readonly announce: (input: AnnounceInput) => AnnounceResult;
  /** Angekündigtes absagen; false = nichts angekündigt (ein laufender Neustart lässt sich nicht absagen). */
  readonly cancel: (by: string) => boolean;
  /** Wartung beenden (sagt auch Angekündigtes ab); 'restarting' = geht nicht, Neustart läuft. */
  readonly off: (by: string) => 'ok' | 'already_off' | 'restarting';
  readonly view: () => WartungPlanView;
  /** Spieler ist gerade ins Netzwerk gekommen: Countdown zeigen, wenn einer läuft. */
  readonly onJoin: (uuid: string) => void;
  readonly attach: (deps: { restarter?: WartungRestarter; teamLog?: (line: string) => void }) => void;
  /** Einmal weiterzählen (läuft sonst jede Sekunde). */
  readonly tick: () => void;
  /** Bis der Neustart durch ist (Tests). */
  readonly settled: () => Promise<void>;
  readonly start: () => void;
  readonly stop: () => void;
}

interface Plan {
  readonly kind: WartungPlanKind;
  readonly reason: string;
  readonly proxy: boolean;
  readonly by: string;
  readonly seconds: number;
  readonly endsAt: number;
  readonly phase: 'announce' | 'restarting';
  /** Zuletzt erinnert bei so vielen Sekunden. */
  readonly lastLeft: number;
}

export function createWartungPlan(deps: WartungPlanDeps): WartungPlan {
  const { ctx, now, wartung, log } = deps;
  const state: {
    plan: Plan | null;
    restarter: WartungRestarter | null;
    teamLog: ((line: string) => void) | null;
    running: Promise<void>;
    timer: ReturnType<typeof setInterval> | null;
  } = { plan: null, restarter: null, teamLog: null, running: Promise.resolve(), timer: null };

  const maintenance = (): boolean => ctx.stores.settings('network')['maintenance'] === true;
  const left = (p: Plan): number => Math.max(0, Math.ceil((p.endsAt - now()) / SECOND_MS));
  const reasonOf = (p: Plan, lang: Lang): string =>
    p.reason ? wt(lang, 'sub.reason', { reason: mm(p.reason) }) : '';
  const everyone = (): ReadonlyArray<{ uuid: string; lang: Lang }> => ctx.presence.all();

  const showTitle = (p: Plan, to: { uuid: string; lang: Lang }, secs: number): void =>
    deps.title(
      to.uuid,
      wt(to.lang, p.kind === 'restart' ? 'title.restart' : 'title.on'),
      wt(to.lang, 'sub.in', { time: countdownWords(secs, to.lang), reason: reasonOf(p, to.lang) }),
    );
  const showBar = (p: Plan, to: { uuid: string; lang: Lang }, secs: number): void =>
    deps.countdown(
      to.uuid,
      wt(to.lang, p.kind === 'restart' ? 'bar.restart' : 'bar.on', { reason: reasonOf(p, to.lang) }),
      secs,
    );
  const showChat = (p: Plan, to: { uuid: string; lang: Lang }, secs: number): void =>
    ctx.msg(
      to.uuid,
      wt(to.lang, p.kind === 'restart' ? 'chat.restart' : 'chat.on', {
        time: countdownWords(secs, to.lang),
        reason: reasonOf(p, to.lang),
      }),
    );
  const tellTeam = (key: Key, vars: Readonly<Record<string, string | number>> = {}): void => {
    ctx.team('maintenance-join', (lang) => wt(lang, key, vars));
    state.teamLog?.(wt('de', key, vars).replace(TAG, ''));
  };

  const switchOn = (reason: string, by: string): void => {
    const patch: Record<string, unknown> = { maintenance: true };
    if (reason) patch['maintenanceMessage'] = reason;
    ctx.stores.patchSettings('network', patch, by);
  };

  const progress = (): { done: number; total: number } =>
    state.restarter ? { ...state.restarter.progress() } : { done: 0, total: 0 };

  /** Countdown vorbei: Wartung an – beim Neustart alle in die Wartungs-Lobby und alles neu starten. */
  const fire = (p: Plan): void => {
    if (p.kind === 'on') {
      state.plan = null;
      switchOn(p.reason, p.by);
      log.info({ by: p.by }, 'Wartung: angekündigte Wartung beginnt');
      return;
    }
    const restarter = state.restarter;
    const wasOn = maintenance();
    state.plan = { ...p, phase: 'restarting' };
    switchOn(p.reason, p.by);
    wartung.hold(true);
    // Jeder in die Wartungs-Lobby – auch das Team: alle Server außer ihr starten gleich neu.
    everyone().forEach((pl) => {
      deps.title(pl.uuid, wt(pl.lang, 'title.now'), wt(pl.lang, 'sub.now.restart'));
      ctx.msg(pl.uuid, wt(pl.lang, 'chat.now.restart'));
      const where = ctx.presence.get(pl.uuid)?.server;
      if (where !== WARTUNG_SERVER) wartung.park(pl.uuid);
    });
    log.info({ by: p.by, proxy: p.proxy }, 'Wartung: Wartungs-Neustart beginnt');
    const finish = (timedOut: boolean): void => {
      const { done, total } = progress();
      state.plan = null;
      wartung.hold(false);
      // Nur ausschalten, was der Neustart selbst eingeschaltet hat – danach kommen alle von selbst zurück.
      if (!wasOn) ctx.stores.patchSettings('network', { maintenance: false }, BY_SYSTEM);
      everyone().forEach((pl) => {
        deps.title(pl.uuid, wt(pl.lang, 'title.done'), '');
        ctx.msg(pl.uuid, wt(pl.lang, wasOn ? 'chat.done.still' : 'chat.done'));
      });
      tellTeam(timedOut ? 'team.timeout' : 'team.done', { done, total });
      log.info({ timedOut, done, total }, 'Wartung: Wartungs-Neustart vorbei');
    };
    state.running = (async (): Promise<void> => {
      // Kurz warten, bis alle in der Wartungs-Lobby angekommen sind.
      await new Promise((r) => setTimeout(r, restarter ? SETTLE_MS : 0));
      if (!restarter) {
        finish(false);
        return;
      }
      const timeout = new Promise<'timeout'>((resolve) => {
        const t = setTimeout(() => resolve('timeout'), RESTART_MAX_MS);
        t.unref();
      });
      try {
        const how = await Promise.race([restarter.run(p.proxy).then(() => 'ok' as const), timeout]);
        finish(how === 'timeout');
      } catch (err) {
        log.warn({ err }, 'Wartung: Wartungs-Neustart ging nicht ganz durch');
        finish(true);
      }
    })();
  };

  const tick = (): void => {
    const p = state.plan;
    if (!p) return;
    if (p.phase === 'restarting') {
      wartung.restartProgress(progress());
      return;
    }
    const secs = left(p);
    if (secs <= 0) {
      fire(p);
      return;
    }
    const due = REMIND_AT.find((r) => secs <= r && p.lastLeft > r);
    if (due === undefined) return;
    state.plan = { ...p, lastLeft: secs };
    everyone().forEach((pl) => {
      showTitle(p, pl, secs);
      if (secs >= CHAT_DOWN_TO) {
        showChat(p, pl, secs);
        // Neu schicken: ältere Plugins zählen höchstens zehn Minuten.
        showBar(p, pl, secs);
      }
    });
  };

  const announce = (input: AnnounceInput): AnnounceResult => {
    if (state.plan) return 'busy';
    if (input.kind === 'restart' && !state.restarter) return 'no_restart';
    const reason = input.reason.trim().slice(0, WARTUNG_REASON_MAX);
    if (input.kind === 'on' && input.seconds === 0) {
      if (maintenance()) return 'already_on';
      switchOn(reason, input.by);
      return 'ok';
    }
    const p: Plan = {
      kind: input.kind,
      reason,
      proxy: input.proxy === true,
      by: input.by,
      seconds: input.seconds,
      endsAt: now() + input.seconds * SECOND_MS,
      phase: 'announce',
      lastLeft: input.seconds,
    };
    state.plan = p;
    log.info({ kind: p.kind, seconds: p.seconds, by: p.by }, 'Wartung: angekündigt');
    if (input.seconds === 0) {
      fire(p);
      return 'ok';
    }
    everyone().forEach((pl) => {
      showTitle(p, pl, input.seconds);
      showChat(p, pl, input.seconds);
      showBar(p, pl, input.seconds);
    });
    return 'ok';
  };

  const cancel = (by: string): boolean => {
    const p = state.plan;
    if (!p || p.phase !== 'announce') return false;
    state.plan = null;
    log.info({ by }, 'Wartung: Ankündigung abgesagt');
    everyone().forEach((pl) => {
      deps.title(pl.uuid, wt(pl.lang, 'title.cancel'), '');
      ctx.msg(pl.uuid, wt(pl.lang, 'chat.cancel'));
      // Eine Sekunde „abgesagt“ – dann ist die Leiste weg (geht auch mit älteren Plugins).
      deps.countdown(pl.uuid, wt(pl.lang, 'bar.cancel'), 1);
    });
    return true;
  };

  return {
    announce,
    cancel,
    off: (by) => {
      if (state.plan?.phase === 'restarting') return 'restarting';
      const announced = state.plan !== null;
      if (announced) cancel(by);
      if (!maintenance()) return announced ? 'ok' : 'already_off';
      ctx.stores.patchSettings('network', { maintenance: false }, by);
      return 'ok';
    },
    view: () => {
      const p = state.plan;
      return {
        maintenance: maintenance(),
        canRestart: state.restarter !== null,
        plan: p
          ? {
              kind: p.kind,
              phase: p.phase,
              reason: p.reason,
              at: p.phase === 'announce' ? new Date(p.endsAt).toISOString() : null,
              seconds: p.seconds,
              proxy: p.proxy,
              by: p.by,
              progress: p.phase === 'restarting' ? progress() : null,
            }
          : null,
      };
    },
    onJoin: (uuid) => {
      const p = state.plan;
      const pl = ctx.presence.get(uuid);
      if (!p || !pl || p.phase !== 'announce') return;
      const secs = left(p);
      if (secs <= 0) return;
      showTitle(p, pl, secs);
      showChat(p, pl, secs);
      showBar(p, pl, secs);
    },
    attach: (d) => {
      if (d.restarter) state.restarter = d.restarter;
      if (d.teamLog) state.teamLog = d.teamLog;
    },
    tick,
    settled: () => state.running,
    start: () => {
      state.timer = setInterval(tick, TICK_MS);
      state.timer.unref();
    },
    stop: () => {
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
    },
  };
}

// ---------- Befehl /wartung ----------

const ON_WORDS = new Set(['an', 'on', 'ein']);
const OFF_WORDS = new Set(['aus', 'off']);
const RESTART_WORDS = new Set(['neustart', 'restart', 'reboot']);
const STATUS_WORDS = new Set(['status', 'stand', 'info']);
const CANCEL_WORDS = new Set(['abbrechen', 'cancel', 'stop', 'absagen']);
/** Erste Wörter, die /wartung selbst behandelt – alles andere (text, bis, lobby, zurueck) geht an den Katalog. */
export const WARTUNG_OWN_WORDS: readonly string[] = [
  ...ON_WORDS,
  ...OFF_WORDS,
  ...RESTART_WORDS,
  ...STATUS_WORDS,
  ...CANCEL_WORDS,
  'hilfe',
  'help',
];
/** Englische Wörter für die Einstellungen aus dem Katalog: `/maintenance until 22:30` = `/wartung bis 22:30`. */
export const WARTUNG_WORD_ALIASES: Readonly<Record<string, string>> = {
  until: 'bis',
  return: 'zurueck',
  message: 'text',
};
export const WARTUNG_TIMES: readonly string[] = ['30s', '1m', '5m', '10m', '30m', '1h'];

// Fängt mit einer Ziffer an: "10x" passt, "Update" nicht.
// https://regex101.com/?flavor=javascript&regex=%5E%5Cd&testString=10x
const DIGIT_FIRST = /^\d/;

/** Zeit, Grund und `--proxy` aus den Wörtern: „10m Großes Update --proxy“. */
export function parseAnnounce(
  args: readonly string[],
): { readonly seconds: number; readonly reason: string; readonly proxy: boolean } | 'bad_time' {
  const proxy =
    args.some((a) => PROXY_FLAGS.has(a.toLowerCase()) && a.startsWith('-')) ||
    args.some((a) => a === '--proxy');
  const words = args.filter(
    (a) => !(a.startsWith('-') && PROXY_FLAGS.has(a.toLowerCase())) && a !== '+proxy',
  );
  const first = words[0];
  const seconds = parseCountdown(first);
  // Fängt mit einer Ziffer an, ist aber keine Zeit (z. B. „10x“) – lieber nachfragen als falsch ankündigen.
  if (seconds === null && first !== undefined && DIGIT_FIRST.test(first)) return 'bad_time';
  return {
    seconds: seconds ?? 0,
    reason: (seconds === null ? words : words.slice(1)).join(' ').trim(),
    proxy,
  };
}

export interface WartungStatusLines {
  readonly lines: (lang: Lang) => string[];
}

/** Was angekündigt ist, als Text-Schlüssel. */
function whatOf(p: { readonly kind: WartungPlanKind; readonly proxy: boolean }): Key {
  if (p.kind === 'on') return 'what.on';
  return p.proxy ? 'what.restart.proxy' : 'what.restart';
}

/** Stand als Chat-Zeilen (für /wartung status). */
export function statusLines(view: WartungPlanView, lang: Lang, now: number): string[] {
  const reason = (r: string): string => (r ? wt(lang, 'sub.reason', { reason: mm(r) }) : '');
  const p = view.plan;
  const lines: string[] = [];
  if (view.maintenance) lines.push(wt(lang, 'status.on', { reason: '' }));
  else if (!p) lines.push(wt(lang, 'status.off'));
  if (p?.phase === 'announce' && p.at) {
    const secs = Math.max(0, Math.ceil((Date.parse(p.at) - now) / SECOND_MS));
    const what = wt(lang, whatOf(p));
    lines.push(
      wt(lang, 'status.announce', {
        what,
        time: countdownWords(secs, lang),
        reason: reason(p.reason),
        by: mm(p.by),
      }),
    );
  }
  if (p?.phase === 'restarting')
    lines.push(wt(lang, 'status.restarting', { done: p.progress?.done ?? 0, total: p.progress?.total ?? 0 }));
  return lines;
}

export type { Body };
