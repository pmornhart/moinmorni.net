import { areaById, networkCommand, WARTUNG_REASON_MAX } from '@moinmorni/shared';
import type { Actor, Command } from './commands.js';
import type { HubContext } from './context.js';
import { mayChange } from './setting-commands.js';
import {
  parseAnnounce,
  statusLines,
  WARTUNG_OWN_WORDS,
  WARTUNG_TIMES,
  WARTUNG_WORD_ALIASES,
  wt,
  type AnnounceResult,
  type WartungPlan,
} from './wartung-plan.js';

/**
 * `/wartung` (englisch `/maintenance`) mit Unterbefehlen – an, aus, neustart, status, abbrechen – und
 * `/wartung-restart` als Kurzform für `/wartung neustart`. text, bis, lobby und zurueck kommen aus dem
 * Einstellungs-Katalog (gleiche Prüfung wie im Panel); die englischen Wörter dafür (until, return, message) übersetzt
 * dieser Befehl. Recht: wer im Panel die Einstellungen ändern darf – wie bisher bei `/wartung an|aus`.
 */

const ON = new Set(['an', 'on', 'ein']);
const OFF = new Set(['aus', 'off']);
const RESTART = new Set(['neustart', 'restart', 'reboot']);
const STATUS = new Set(['status', 'stand', 'info']);
const CANCEL = new Set(['abbrechen', 'cancel', 'stop', 'absagen']);
const FIRST_WORDS_DE = ['an', 'aus', 'neustart', 'status', 'abbrechen'];
const FIRST_WORDS_EN = ['on', 'off', 'restart', 'status', 'cancel'];
const ANNOUNCE_RESULT: Readonly<
  Record<Exclude<AnnounceResult, 'ok'>, 'cmd.busy' | 'cmd.no_restart' | 'cmd.already_on'>
> = {
  busy: 'cmd.busy',
  no_restart: 'cmd.no_restart',
  already_on: 'cmd.already_on',
};

const OFF_RESULT = { ok: 'cmd.off', restarting: 'cmd.restarting', already_off: 'cmd.already_off' } as const;
/** Zweites Wort (nach an/neustart) ist die Zeit. */
const TIME_POSITION = 2;

export function createWartungCommands(
  ctx: HubContext,
  plan: WartungPlan,
  settings: () => Command | undefined,
): Command[] {
  const area = areaById('network');
  const allowed = (actor: Actor): boolean => (area ? mayChange(actor, area) : false);
  const say = (actor: Actor, line: string): void => ctx.msg(actor.uuid, line);

  const announce = (actor: Actor, kind: 'on' | 'restart', args: readonly string[]): void => {
    const parsed = parseAnnounce(args);
    if (parsed === 'bad_time') {
      say(actor, wt(actor.lang, 'cmd.bad_time'));
      return;
    }
    if (parsed.reason.length > WARTUNG_REASON_MAX) {
      say(actor, wt(actor.lang, 'cmd.too_long', { max: WARTUNG_REASON_MAX }));
      return;
    }
    const result = plan.announce({ kind, ...parsed, by: actor.name });
    if (result !== 'ok') {
      say(actor, wt(actor.lang, ANNOUNCE_RESULT[result]));
      return;
    }
    if (kind === 'on' && parsed.seconds === 0) {
      say(actor, wt(actor.lang, 'cmd.on'));
      return;
    }
    // Sofortiger Neustart: Stand gleich zeigen; angekündigt: Bestätigung mit Zeit.
    statusLines(plan.view(), actor.lang, Date.now()).forEach((line) => say(actor, line));
  };

  const run = (actor: Actor, args: readonly string[]): void => {
    if (!allowed(actor)) {
      say(actor, wt(actor.lang, 'cmd.no_right'));
      return;
    }
    const first = args[0]?.toLowerCase() ?? '';
    const rest = args.slice(1);
    if (ON.has(first)) return announce(actor, 'on', rest);
    if (RESTART.has(first)) return announce(actor, 'restart', rest);
    if (STATUS.has(first)) {
      statusLines(plan.view(), actor.lang, Date.now()).forEach((line) => say(actor, line));
      return;
    }
    if (CANCEL.has(first)) {
      say(actor, wt(actor.lang, plan.cancel(actor.name) ? 'cmd.cancelled' : 'cmd.nothing'));
      return;
    }
    if (OFF.has(first)) {
      const result = plan.off(actor.name);
      say(actor, wt(actor.lang, OFF_RESULT[result]));
      return;
    }
    const alias = WARTUNG_WORD_ALIASES[first];
    if (alias) {
      settings()?.run(actor, [alias, ...rest]);
      return;
    }
    // Ohne Wort oder „hilfe“: Stand und Hilfe.
    statusLines(plan.view(), actor.lang, Date.now()).forEach((line) => say(actor, line));
    say(actor, wt(actor.lang, 'cmd.help'));
  };

  const complete = (actor: Actor, args: readonly string[]): string[] => {
    if (!allowed(actor)) return [];
    const typed = (args[args.length - 1] ?? '').toLowerCase();
    const first = args[0]?.toLowerCase() ?? '';
    const words = ((): readonly string[] => {
      if (args.length <= 1) return actor.lang === 'en' ? FIRST_WORDS_EN : FIRST_WORDS_DE;
      if (args.length === TIME_POSITION && (ON.has(first) || RESTART.has(first))) return WARTUNG_TIMES;
      if (RESTART.has(first)) return ['--proxy'];
      return [];
    })();
    return words.filter((w) => w.startsWith(typed));
  };

  return [
    {
      ...networkCommand('wartung'),
      own: [...WARTUNG_OWN_WORDS, ...Object.keys(WARTUNG_WORD_ALIASES)],
      run,
      complete,
    },
    {
      ...networkCommand('wartung-restart'),
      run: (actor, args) => run(actor, ['neustart', ...args]),
      complete: (actor, args) => complete(actor, ['neustart', ...args]),
    },
  ];
}
