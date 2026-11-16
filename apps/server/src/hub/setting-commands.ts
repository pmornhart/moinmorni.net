import { SETTING_AREAS, onStep, type GameRight, type SettingArea, type SettingDef } from '@moinmorni/shared';
import type { Command, Actor } from './commands.js';
import type { HubContext } from './context.js';
import { mm, text, type Lang } from './texts.js';

/**
 * Jede Einstellung, die im Panel steht und einen Befehl hat, geht auch im Spiel: `/chatconfig langsam 5`,
 * `/wartung an`, `/lobby saison wiesn`. Die Befehle entstehen aus dem Katalog (packages/shared/src/settings.ts) –
 * dieselbe Prüfung wie im Panel, dieselben Rechte (wer den Bereich im Panel sieht, darf ihn auch im Spiel ändern).
 */

const ON = new Set(['an', 'on', 'ja', 'yes', 'true', '1']);
const OFF = new Set(['aus', 'off', 'nein', 'no', 'false', '0']);
const ADD = new Set(['hinzu', 'add', 'plus']);
const REMOVE = new Set(['weg', 'remove', 'entfernen', 'minus']);
const LIST_SEPARATOR = ', ';
const LOCALES: Readonly<Record<Lang, string>> = { de: 'de-DE', en: 'en-GB' };
// Platzhalter mit Auswahl im Befehl: "<keine|wiesn|winter>" → ["keine", "wiesn", "winter"].
// https://regex101.com/?flavor=javascript&regex=%5E%3C(.%2B%5C%7C.%2B)%3E%24&testString=%3Ckeine%7Cwiesn%7Cwinter%3E
const CHOICES = /^<(.+\|.+)>$/;

interface Pattern {
  readonly root: string;
  /** Feste Wörter nach dem Befehl, z. B. ["motd", "1"]. */
  readonly words: readonly string[];
  readonly area: SettingArea;
  readonly def: SettingDef;
  readonly usage: string;
  /** Wörter im Befehl für eine Auswahl (gleiche Reihenfolge wie die Optionen). */
  readonly choices: readonly string[];
}

/** Listen: „hinzu|weg <wort>“ – zwei Teile am Ende statt einem („an|aus“, „<zahl>“). */
const LIST_VALUE_PARTS = 2;
/** Wie viele Teile am Ende den Wert beschreiben: „an|aus“, „<zahl>“ oder „hinzu|weg <wort>“. */
const valueParts = (def: SettingDef): number => (def.type === 'list' ? LIST_VALUE_PARTS : 1);

function patternsOf(area: SettingArea): Pattern[] {
  return area.sections
    .flatMap((s) => s.settings)
    .filter((def): def is SettingDef & { command: string } => Boolean(def.command))
    .map((def) => {
      const [root = '', ...rest] = def.command.slice(1).split(' ');
      const words = rest.slice(0, rest.length - valueParts(def));
      const last = rest[rest.length - 1] ?? '';
      const choices = CHOICES.exec(last)?.[1]?.split('|') ?? [];
      return { root, words, area, def, usage: def.command, choices };
    });
}

const ALL_PATTERNS: readonly Pattern[] = SETTING_AREAS.flatMap(patternsOf);

export const SETTING_ROOTS: readonly string[] = [...new Set(ALL_PATTERNS.map((p) => p.root))];

function shown(lang: Lang, def: SettingDef, value: unknown): string {
  if (def.type === 'boolean') return text(lang, value === true ? 'set.on' : 'set.off');
  if (def.type === 'select') {
    const option = def.options.find((o) => o.value === value);
    return mm(option ? option.label[lang] : String(value));
  }
  if (def.type === 'list') {
    const list = Array.isArray(value) ? value.map(String) : [];
    return list.length ? mm(list.join(LIST_SEPARATOR)) : text(lang, 'set.empty');
  }
  if (def.type === 'number') {
    // Kommazahlen wie man sie schreibt: „3,5“ auf Deutsch, „3.5“ auf Englisch.
    const n = def.step && typeof value === 'number' ? value.toLocaleString(LOCALES[lang]) : String(value);
    return def.unit ? `${n} ${def.unit[lang]}` : n;
  }
  const plain = String(value ?? '');
  return plain ? mm(plain) : text(lang, 'set.empty');
}

/** Neuer Wert aus den Wörtern des Spielers; undefined = passt nicht. */
function parseValue(p: Pattern, args: readonly string[], current: unknown): unknown {
  const def = p.def;
  const first = args[0]?.toLowerCase() ?? '';
  if (def.type === 'boolean') {
    if (ON.has(first)) return true;
    return OFF.has(first) ? false : undefined;
  }
  if (def.type === 'number') {
    // „3,5“ und „3.5“ gehen beide.
    const n = Number(first.replace(',', '.'));
    return first && onStep(n, def.step) && n >= def.min && n <= def.max ? n : undefined;
  }
  if (def.type === 'text') {
    const value = args.join(' ').trim();
    return value.length <= def.maxLength ? value : undefined;
  }
  if (def.type === 'select') {
    const index = p.choices.findIndex((c) => c.toLowerCase() === first);
    const option =
      def.options[index] ??
      def.options.find(
        (o) => o.value === first || o.label.de.toLowerCase() === first || o.label.en.toLowerCase() === first,
      );
    return option?.value;
  }
  const item = args.slice(1).join(' ').trim();
  const list = Array.isArray(current) ? current.map(String) : [];
  if (!item || item.length > def.maxLength) return undefined;
  if (ADD.has(first)) return list.includes(item) || list.length >= def.maxItems ? undefined : [...list, item];
  return REMOVE.has(first) && list.includes(item) ? list.filter((x) => x !== item) : undefined;
}

/** Darf diese Person den Bereich ändern? Wie im Panel – plus das Spiel-Recht „admin“ für alles. */
const mayChange = (actor: Actor, area: SettingArea): boolean =>
  actor.role.panel.includes(area.panel) || actor.role.game.includes('admin' satisfies GameRight);

export function createSettingCommands(ctx: HubContext): Command[] {
  const valueOf = (p: Pattern): unknown => ctx.stores.settings(p.area.id)[p.def.key];
  const say = (actor: Actor, line: string): void => ctx.msg(actor.uuid, line);

  const overview = (actor: Actor, patterns: readonly Pattern[]): void => {
    const area = patterns[0]?.area;
    if (!area) return;
    say(actor, text(actor.lang, 'set.head', { area: mm(area.title[actor.lang]) }));
    patterns.forEach((p) =>
      say(
        actor,
        text(actor.lang, 'set.line', {
          usage: mm(p.usage),
          label: mm(p.def.label[actor.lang]),
          value: shown(actor.lang, p.def, valueOf(p)),
        }),
      ),
    );
  };

  return SETTING_ROOTS.map((root): Command => {
    const mine = ALL_PATTERNS.filter((p) => p.root === root);
    const match = (args: readonly string[]): Pattern | undefined =>
      [...mine]
        .sort((a, b) => b.words.length - a.words.length)
        .find((p) => p.words.every((w, i) => args[i]?.toLowerCase() === w));
    return {
      name: root,
      aliases: [],
      usage: { de: mine.map((p) => p.usage).join(' · '), en: mine.map((p) => p.usage).join(' · ') },
      run: (actor, args) => {
        const allowed = mine.filter((p) => mayChange(actor, p.area));
        if (!allowed.length) {
          say(actor, text(actor.lang, 'cmd.no_right'));
          return;
        }
        const p = match(args);
        if (!p || !mayChange(actor, p.area)) {
          overview(actor, allowed);
          return;
        }
        const rest = args.slice(p.words.length);
        const label = mm(p.def.label[actor.lang]);
        if (!rest.length) {
          say(
            actor,
            text(actor.lang, 'set.current', {
              label,
              value: shown(actor.lang, p.def, valueOf(p)),
              usage: mm(p.usage),
            }),
          );
          return;
        }
        const value = parseValue(p, rest, valueOf(p));
        if (value === undefined) {
          say(actor, text(actor.lang, 'set.invalid', { label, usage: mm(p.usage) }));
          return;
        }
        ctx.stores.patchSettings(p.area.id, { [p.def.key]: value }, actor.name);
        say(actor, text(actor.lang, 'set.saved', { label, value: shown(actor.lang, p.def, value) }));
      },
      complete: (actor, args) => {
        const allowed = mine.filter((p) => mayChange(actor, p.area));
        const depth = args.length - 1;
        const typed = (args[depth] ?? '').toLowerCase();
        const next = allowed.flatMap((p) => {
          const fixed = p.words.slice(0, depth).every((w, i) => args[i]?.toLowerCase() === w);
          if (!fixed) return [];
          if (depth < p.words.length) return [p.words[depth] ?? ''];
          if (depth > p.words.length) return [];
          if (p.def.type === 'boolean') return ['an', 'aus'];
          if (p.def.type === 'list') return ['hinzu', 'weg'];
          return [...p.choices];
        });
        return [...new Set(next)].filter((w) => w.startsWith(typed));
      },
    };
  });
}

/**
 * Ein Befehl mit gleichem Namen (z. B. /lobby): ohne Wörter das Original, mit Wörtern die Einstellung – außer den
 * Wörtern, die das Original selbst kennt (`own`, z. B. `/lobby ja`).
 */
export function mergeCommands(base: readonly Command[], settings: readonly Command[]): Command[] {
  const merged = base.map((c): Command => {
    const s = settings.find((x) => x.name === c.name);
    if (!s) return c;
    const mine = (args: readonly string[]): boolean =>
      !args.length || (c.own?.includes(args[0]?.toLowerCase() ?? '') ?? false);
    return {
      ...c,
      run: (actor, args) => (mine(args) ? c.run(actor, args) : s.run(actor, args)),
      complete: s.complete,
    };
  });
  return [...merged, ...settings.filter((s) => !base.some((c) => c.name === s.name))];
}
