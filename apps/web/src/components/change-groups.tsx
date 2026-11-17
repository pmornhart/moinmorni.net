import { CHANGE_KINDS, type ChangeKind } from '@moinmorni/shared';
import { History, Minus, Sparkles, TrendingUp, Wrench, type LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';

/**
 * Changes sorted by kind – Neu, Verbessert, Behoben, Entfernt, Weitere – each with its own colour and icon. Used by
 * the update card in the panel (all new versions together) and by "Was ist neu" (one version at a time).
 */

export const KIND_LOOK: Readonly<Record<ChangeKind, { readonly icon: LucideIcon; readonly tone: string }>> = {
  new: { icon: Sparkles, tone: 'bg-success-soft text-success' },
  improved: { icon: TrendingUp, tone: 'bg-gold-soft text-gold' },
  fixed: { icon: Wrench, tone: 'bg-blue-soft text-blue' },
  removed: { icon: Minus, tone: 'bg-neutral-soft text-muted-foreground' },
  other: { icon: History, tone: 'bg-neutral-soft text-muted-foreground' },
};

export interface ChangeEntry {
  readonly kind: ChangeKind;
  readonly text: string;
  /** Unique among the entries (e.g. commit + text). */
  readonly key: string;
}

/** The entries per kind, in the order of CHANGE_KINDS; kinds without entries are left out. */
function groupsOf(entries: readonly ChangeEntry[]): { kind: ChangeKind; entries: ChangeEntry[] }[] {
  return CHANGE_KINDS.map((kind) => ({ kind, entries: entries.filter((e) => e.kind === kind) })).filter(
    (g) => g.entries.length > 0,
  );
}

function KindIcon({ kind, small }: { readonly kind: ChangeKind; readonly small?: boolean }): ReactElement {
  const { icon: Icon, tone } = KIND_LOOK[kind];
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center',
        small ? 'size-6 rounded-[7px]' : 'size-7 rounded-[9px]',
        tone,
      )}
      aria-hidden
    >
      <Icon className={small ? 'size-3.5' : 'size-4'} />
    </span>
  );
}

function Items({ entries }: { readonly entries: readonly ChangeEntry[] }): ReactElement {
  return (
    <ul className="grid gap-1.5 pl-1 text-sm leading-relaxed">
      {entries.map((entry) => (
        <li
          key={entry.key}
          className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 text-pretty [overflow-wrap:anywhere]"
        >
          <span className="mt-[9px] size-1.5 rounded-full bg-current opacity-40" aria-hidden />
          {entry.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * `boxed`: one framed box per kind, two columns from md (update card). `compact`: kinds below each other with a
 * small heading (one version in "Was ist neu").
 */
export function ChangeGroups({
  entries,
  look = 'boxed',
}: {
  readonly entries: readonly ChangeEntry[];
  readonly look?: 'boxed' | 'compact';
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const groups = groupsOf(entries);
  if (look === 'compact')
    return (
      <div className="grid gap-3">
        {groups.map((g) => (
          <section key={g.kind} className="grid gap-1.5" aria-label={t(`changes.kinds.${g.kind}`)}>
            <p className="flex items-center gap-2 text-[13px] font-bold">
              <KindIcon kind={g.kind} small />
              {t(`changes.kinds.${g.kind}`)}
            </p>
            <Items entries={g.entries} />
          </section>
        ))}
      </div>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((g) => (
        <div key={g.kind} className="grid content-start gap-2.5 rounded-[14px] border border-border p-4">
          <p className="flex items-center gap-2 font-semibold">
            <KindIcon kind={g.kind} />
            {t(`changes.kinds.${g.kind}`)}
            <span className="tabular text-sm font-normal text-muted-foreground">{g.entries.length}</span>
          </p>
          <Items entries={g.entries} />
        </div>
      ))}
    </div>
  );
}
