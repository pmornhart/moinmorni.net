import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { FoldCard } from '~/components/fold-card';
import { Card } from '~/components/ui';
import { cn } from '~/lib/cn';

/** A card above the settings of an area: head with symbol, title and short text, then the content. */
export function ExtraCard({
  icon: Icon,
  title,
  text,
  aside,
  children,
  className,
  id,
  fold,
  foldOpen = true,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly text?: ReactNode;
  /** Shown at the right of the head (wraps below on phones), e.g. a status or a count. */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
  /** Makes the card fold open and closed (remembered under this key); `aside` is then the summary when closed. */
  readonly fold?: string;
  readonly foldOpen?: boolean;
}): ReactElement {
  if (fold) {
    return (
      <FoldCard
        id={fold}
        anchor={id}
        icon={Icon}
        title={title}
        summary={aside}
        defaultOpen={foldOpen}
        className={className}
        bodyClassName="grid min-w-0 gap-5"
      >
        {text || aside ? (
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            {text ? (
              <p className="max-w-[72ch] text-sm leading-relaxed text-muted-foreground text-pretty">{text}</p>
            ) : null}
            {aside ? <div className="flex min-w-0 flex-wrap items-center gap-2">{aside}</div> : null}
          </div>
        ) : null}
        {children}
      </FoldCard>
    );
  }
  return (
    <Card id={id} className={cn('grid min-w-0 gap-5 p-5 sm:p-7', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-gold-soft text-gold"
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
          <div className="grid min-w-0 gap-1">
            <h2 className="font-display text-xl font-semibold leading-tight">{title}</h2>
            {text ? (
              <p className="max-w-[72ch] text-sm leading-relaxed text-muted-foreground text-pretty">{text}</p>
            ) : null}
          </div>
        </div>
        {aside ? <div className="flex min-w-0 flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </Card>
  );
}

const NOTICE_TONES = {
  success: 'border-success/25 bg-success-soft text-success',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  danger: 'border-destructive/25 bg-destructive-soft text-destructive',
  blue: 'border-blue/25 bg-blue-soft text-blue',
  neutral: 'border-border bg-muted/60 text-foreground',
} as const;

export type NoticeTone = keyof typeof NOTICE_TONES;

/** A coloured box with a symbol: title in bold, text below in the normal colour. */
export function Notice({
  tone,
  icon: Icon,
  title,
  children,
  className,
}: {
  readonly tone: NoticeTone;
  readonly icon: LucideIcon;
  readonly title?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex min-w-0 items-start gap-3 rounded-[14px] border px-4 py-3.5',
        NOTICE_TONES[tone],
        className,
      )}
    >
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1 text-sm leading-relaxed">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="grid gap-2 text-foreground/85 text-pretty">{children}</div> : null}
      </div>
    </div>
  );
}

/** A filter chip (Offen / Angenommen / …) with an optional count. */
export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: string;
  readonly count?: number;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-secondary text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {count ? (
        <span
          className={cn(
            'tabular rounded-full px-1.5 text-[11px] leading-[18px]',
            active ? 'bg-white/20' : 'bg-gold text-[#1f1503]',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Numbered steps (how to save a build, what happens after an update …). */
export function StepList({ items }: { readonly items: readonly ReactNode[] }): ReactElement {
  return (
    <ol className="grid gap-2.5">
      {items.map((item, i) => (
        // Fixed steps in a fixed order.
        <li key={`step-${i + 1}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm">
          <span
            className="grid size-6 place-items-center rounded-full bg-gold-soft text-xs font-bold text-gold"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="pt-0.5 leading-relaxed text-pretty [overflow-wrap:anywhere]">{item}</span>
        </li>
      ))}
    </ol>
  );
}
