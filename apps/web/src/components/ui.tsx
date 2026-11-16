import { Slot, Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { cn } from '~/lib/cn';

/* Small building blocks in MoinMorni's look (Smaragd family with gold). */

const BUTTON_BASE =
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

const BUTTON_VARIANTS = {
  primary:
    'bg-primary text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.18)_inset] hover:bg-primary-hover',
  gold: 'bg-gold text-[#1f1503] hover:brightness-105 shadow-[0_1px_0_rgba(255,255,255,0.35)_inset]',
  secondary: 'border border-input bg-secondary text-secondary-foreground hover:bg-muted',
  outline: 'border border-input bg-transparent hover:bg-secondary',
  ghost: 'text-foreground hover:bg-secondary',
  danger: 'border border-input bg-secondary text-destructive hover:bg-destructive-soft',
  band: 'border border-band-line bg-white/[0.06] text-band-foreground hover:bg-white/[0.12]',
  bandGhost: 'text-band-muted hover:bg-white/[0.08] hover:text-band-foreground',
} as const;

const BUTTON_SIZES = {
  md: 'h-10 px-4',
  sm: 'h-8 rounded-[10px] px-3 text-[13px] gap-1.5',
  lg: 'h-12 px-6 text-base',
  icon: 'size-10',
  iconSm: 'size-8 rounded-[10px]',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

export type ButtonProps = ComponentProps<'button'> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly asChild?: boolean;
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  asChild = false,
  type,
  ...props
}: ButtonProps): ReactElement {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>): ReactElement {
  return (
    <div
      className={cn(
        'rounded-[16px] border border-border bg-card text-card-foreground shadow-card',
        className,
      )}
      {...props}
    />
  );
}

const PILL_TONES = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive-soft text-destructive',
  gold: 'bg-gold-soft text-gold',
  blue: 'bg-blue-soft text-blue',
  neutral: 'bg-neutral-soft text-muted-foreground',
} as const;

export type PillTone = keyof typeof PILL_TONES;

export function Pill({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  readonly tone?: PillTone;
  readonly dot?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        PILL_TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

const FIELD_BASE =
  'w-full min-w-0 rounded-[12px] border border-input bg-background/60 px-3.5 text-[15px] text-foreground transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.03]';

export function Input({ className, ...props }: ComponentProps<'input'>): ReactElement {
  return <input className={cn(FIELD_BASE, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>): ReactElement {
  return (
    <textarea className={cn(FIELD_BASE, 'min-h-24 resize-y py-2.5 leading-relaxed', className)} {...props} />
  );
}

export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>): ReactElement {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(FIELD_BASE, 'h-11 cursor-pointer appearance-none pr-10')} {...props}>
        {children}
      </select>
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      >
        <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>): ReactElement {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform data-[state=checked]:translate-x-[23px] data-[state=unchecked]:translate-x-[3px]" />
    </SwitchPrimitive.Root>
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>): ReactElement {
  return <label className={cn('text-sm font-semibold text-foreground', className)} {...props} />;
}

export function Skeleton({ className }: { readonly className?: string }): ReactElement {
  return <div className={cn('animate-pulse rounded-[12px] bg-muted', className)} aria-hidden />;
}

/** A small mono badge, e.g. the in-game command of a setting. */
export function Kbd({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <code
      className={cn(
        'inline-flex max-w-full items-center rounded-[8px] border border-border bg-muted/70 px-2 py-0.5 font-mono text-[12px] leading-5 text-muted-foreground [overflow-wrap:anywhere]',
        className,
      )}
    >
      {children}
    </code>
  );
}

/** Heading in the display face with an optional small gold line above it. */
export function SectionTitle({
  eyebrow,
  title,
  text,
  className,
  as: Tag = 'h2',
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly text?: string;
  readonly className?: string;
  readonly as?: 'h1' | 'h2' | 'h3';
}): ReactElement {
  return (
    <div className={cn('grid gap-2', className)}>
      {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{eyebrow}</p> : null}
      <Tag className="font-display text-[clamp(1.6rem,3.2vw,2.3rem)] font-semibold leading-[1.1] text-balance">
        {title}
      </Tag>
      {text ? <p className="max-w-[62ch] text-muted-foreground text-pretty">{text}</p> : null}
    </div>
  );
}
