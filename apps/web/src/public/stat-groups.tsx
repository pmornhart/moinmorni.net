import { DUELS_KITS } from '@moinmorni/shared';
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '~/components/select';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { statPart, useStatText, type StatPart } from './stat-format';

/**
 * Values of one fighting style, game type or course ("wins_sumo", "elo_bruecke", "time_klammflug_ms") are many – Duels
 * alone has five per style and 20 styles. They are shown as a small table (profile) or picked with a choice list
 * (leaderboards) instead of a long row of single values.
 */

/** Columns in this order; kinds that no value has are left out. */
const KIND_ORDER = ['games', 'wins', 'losses', 'draws', 'elo', 'best_ms', 'finishes'];
/** A table needs the room of a whole row from this many columns on. */
export const WIDE_FROM_KINDS = 3;

export interface StatGroups {
  /** Values that belong to the whole mode ("wins", "kills" …), in the order they came. */
  readonly general: readonly string[];
  /** Kinds that the values of single subjects have, in a fixed order. */
  readonly kinds: readonly string[];
  /** Subjects (fighting styles first in menu order, then by name) with key per kind. */
  readonly subjects: ReadonlyArray<{ readonly id: string; readonly keys: Readonly<Record<string, string>> }>;
}

const KIT_ORDER = DUELS_KITS.map((k) => k.id);
const subjectRank = (id: string): number => {
  const i = KIT_ORDER.indexOf(id);
  return i < 0 ? KIT_ORDER.length : i;
};

/** Splits value names; `named` = has its own name (stays general, e.g. "wins_hider" in Versteckerl). */
export function groupStats(keys: readonly string[], named: (key: string) => boolean): StatGroups {
  const parts = keys.map((key) => [key, named(key) ? null : statPart(key)] as const);
  const split = parts.filter((p): p is readonly [string, StatPart] => p[1] !== null);
  const kinds = KIND_ORDER.filter((k) => split.some(([, part]) => part.kind === k));
  const ids = [...new Set(split.map(([, part]) => part.subject))].sort(
    (a, b) => subjectRank(a) - subjectRank(b) || a.localeCompare(b),
  );
  return {
    general: parts.filter(([, part]) => part === null).map(([key]) => key),
    kinds,
    subjects: ids.map((id) => ({
      id,
      keys: Object.fromEntries(
        split.filter(([, part]) => part.subject === id).map(([key, part]) => [part.kind, key]),
      ),
    })),
  };
}

/** Profile: one row per fighting style or course, one column per kind ("Kämpfe", "Siege" …). */
export function SubjectTable({
  mode,
  groups,
  values,
}: {
  readonly mode: string;
  readonly groups: StatGroups;
  readonly values: Readonly<Record<string, number>>;
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const stat = useStatText();
  if (!groups.subjects.length) return null;
  const head =
    t(`site.players.statsIn.${mode}.subjectHead`, { defaultValue: '' }) ||
    t('site.players.stats.subjectHead');
  return (
    <div className="overflow-x-auto border-t-2 border-border">
      <table className="w-full min-w-max border-collapse text-left">
        <thead>
          <tr className="font-pixel text-[12.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <th scope="col" className="sticky left-0 bg-card px-4 py-2.5">
              {head}
            </th>
            {groups.kinds.map((kind) => (
              <th key={kind} scope="col" className="px-3 py-2.5 text-right">
                {stat.label(kind, mode)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-border">
          {groups.subjects.map((s) => (
            <tr key={s.id}>
              {/* Stays in view while the numbers scroll sideways (phone). */}
              <th scope="row" className="sticky left-0 bg-card px-4 py-2 font-bold">
                {stat.subject(s.id, mode)}
              </th>
              {groups.kinds.map((kind) => {
                const key = s.keys[kind];
                const value = key === undefined ? undefined : values[key];
                return (
                  <td key={kind} className="tabular px-3 py-2 text-right font-pixel text-[1.15rem] font-bold">
                    {key && value !== undefined ? (
                      stat.value(key, value)
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Leaderboards: pick a fighting style or course, then what to compare ("Siege", "Beste Wertung" …). */
export function SubjectPicker({
  mode,
  groups,
  chosen,
  onChoose,
}: {
  readonly mode: string;
  readonly groups: StatGroups;
  readonly chosen: string;
  readonly onChoose: (key: string) => void;
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const stat = useStatText();
  const first = groups.subjects[0];
  if (!first) return null;
  const current = groups.subjects.find((s) => Object.values(s.keys).includes(chosen));
  const shown = current ?? first;
  const head =
    t(`site.players.statsIn.${mode}.subjectHead`, { defaultValue: '' }) ||
    t('site.players.stats.subjectHead');
  // Another subject keeps the kind if it has it ("Siege Sumo" → "Siege Brücke").
  const kindNow = Object.entries(shown.keys).find(([, key]) => key === chosen)?.[0];
  const pickSubject = (id: string): void => {
    const next = groups.subjects.find((s) => s.id === id);
    const key = next && ((kindNow && next.keys[kindNow]) ?? Object.values(next.keys)[0]);
    if (key) onChoose(key);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="font-pixel text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
        aria-hidden
      >
        {head}
      </span>
      <Select
        size="sm"
        value={shown.id}
        onChange={(e) => pickSubject(e.target.value)}
        aria-label={head}
        className="min-w-[11rem]"
      >
        {groups.subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {stat.subject(s.id, mode)}
          </option>
        ))}
      </Select>
      {groups.kinds
        .filter((kind) => shown.keys[kind])
        .map((kind) => {
          const key = shown.keys[kind] ?? '';
          const active = key === chosen;
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => onChoose(key)}
              className={cn(
                'rounded-[4px] px-2.5 py-1.5 font-pixel text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {stat.label(kind, mode)}
            </button>
          );
        })}
    </div>
  );
}
