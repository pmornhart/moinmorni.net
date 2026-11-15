import { Slot } from 'radix-ui';
import {
  ArrowRight,
  Hourglass,
  Lock,
  Moon,
  Ticket,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useId, type ComponentProps, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ModeStatus } from '@moinmorni/shared';
import { textOn } from '~/components/role-visuals';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import type { PublicRole } from '~/lib/site';
import { modeLook, type ModeLook } from '~/lib/status';
import { usePick } from '~/lib/text';

/* The website's game-style building blocks. Colours that a host page might override are utilities. */

const BUTTON_TONES = {
  gold: 'mm-btn',
  emerald: 'mm-btn mm-btn-emerald',
  blue: 'mm-btn mm-btn-blue',
  stone: 'mm-btn mm-btn-stone',
  white: 'mm-btn mm-btn-white',
} as const;

const BUTTON_SIZES = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-13 px-7 text-[17px]',
  xl: 'h-15 px-8 text-[19px] max-sm:h-14 max-sm:px-6 max-sm:text-[17px]',
  icon: 'size-10 px-0 text-[15px]',
} as const;

export type GameTone = keyof typeof BUTTON_TONES;
type GameSize = keyof typeof BUTTON_SIZES;

export type GameButtonProps = ComponentProps<'button'> & {
  readonly tone?: GameTone;
  readonly size?: GameSize;
  readonly asChild?: boolean;
};

/** A chunky game button: bevel underneath, presses in on click. `asChild` turns a link into one. */
export function GameButton({
  tone = 'gold',
  size = 'md',
  asChild = false,
  type,
  className,
  ...props
}: GameButtonProps): ReactElement {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(BUTTON_TONES[tone], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

/** A thick-edged card, like a block in the game. */
const PANEL = 'rounded-[10px] border-2 border-border bg-card text-card-foreground shadow-card';

export function Panel({ className, ...props }: ComponentProps<'div'>): ReactElement {
  return <div className={cn(PANEL, className)} {...props} />;
}

/** Small gold label above a heading, with a pixel square in front. */
export function Eyebrow({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 font-pixel text-[14px] font-semibold uppercase tracking-[0.14em] text-gold',
        className,
      )}
    >
      <span className="size-2 shrink-0 bg-current" aria-hidden />
      {children}
    </p>
  );
}

/** Section heading with an optional "see all" link on the right. */
export function SectionHead({
  eyebrow,
  title,
  text,
  link,
  id,
  className,
  onDark = false,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly text?: string;
  readonly link?: { readonly to: string; readonly label: string };
  readonly id?: string;
  readonly className?: string;
  /** On a dark band in both designs. */
  readonly onDark?: boolean;
}): ReactElement {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-8 gap-y-4', className)}>
      <div className="grid min-w-0 gap-3">
        {eyebrow ? <Eyebrow className={onDark ? 'text-gold-bright' : undefined}>{eyebrow}</Eyebrow> : null}
        <h2
          id={id}
          className={cn(
            'font-pixel text-[clamp(2.1rem,4.6vw,3.3rem)] font-bold leading-[0.98] tracking-[0.005em] text-balance',
            onDark ? 'text-band-foreground' : 'text-foreground',
          )}
        >
          {title}
        </h2>
        {text ? (
          <p
            className={cn(
              'max-w-[62ch] text-[1.05rem] leading-relaxed text-pretty',
              onDark ? 'text-band-muted' : 'text-muted-foreground',
            )}
          >
            {text}
          </p>
        ) : null}
      </div>
      {link ? (
        <GameButton asChild tone="stone" size="sm" className={onDark ? 'mm-on-dark' : undefined}>
          <Link to={link.to}>
            {link.label}
            <ArrowRight />
          </Link>
        </GameButton>
      ) : null}
    </div>
  );
}

const CHIP_TONES = {
  success: 'bg-success-soft text-success',
  blue: 'bg-blue-soft text-blue',
  gold: 'bg-gold-soft text-gold',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive-soft text-destructive',
  neutral: 'bg-neutral-soft text-muted-foreground',
  /** On pictures and coloured cards: dark glass with white text. */
  glass: 'bg-black/55 text-white backdrop-blur-[3px]',
  /** On pictures: bright and loud. */
  brightGold: 'bg-gold-bright text-[#2a1b00]',
  brightGreen: 'bg-[#2fd27a] text-[#03240f]',
} as const;

export type ChipTone = keyof typeof CHIP_TONES;

/** A small pixel tag: state, category, rank. */
export function Chip({
  tone = 'neutral',
  icon: Icon,
  pulse = false,
  className,
  children,
}: {
  readonly tone?: ChipTone;
  readonly icon?: LucideIcon;
  /** A pulsing dot in front (live). */
  readonly pulse?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 py-1 font-pixel text-[12.5px] font-semibold uppercase leading-none tracking-[0.06em]',
        CHIP_TONES[tone],
        className,
      )}
    >
      {pulse ? <span className="mm-pulse size-2 shrink-0 rounded-full bg-current" aria-hidden /> : null}
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

const LOOK_TONE: Readonly<Record<ModeLook, ChipTone>> = {
  open: 'success',
  asleep: 'blue',
  closed: 'neutral',
  maintenance: 'warning',
  soon: 'gold',
};

/** On coloured cards and pictures: open shines green, everything else is dark glass. */
const LOOK_TONE_ON_ART: Readonly<Record<ModeLook, ChipTone>> = {
  open: 'brightGreen',
  asleep: 'glass',
  closed: 'glass',
  maintenance: 'glass',
  soon: 'glass',
};

const LOOK_ICON: Readonly<Record<ModeLook, LucideIcon | undefined>> = {
  open: undefined,
  asleep: Moon,
  closed: Lock,
  maintenance: Wrench,
  soon: Hourglass,
};

/** Offen / Schläft / Geschlossen / Wartung / Bald – `onArt` for coloured cards and pictures. */
export function ModeStateChip({
  mode,
  onArt = false,
  className,
}: {
  readonly mode: ModeStatus;
  readonly onArt?: boolean;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const look = modeLook(mode);
  const tone = (onArt ? LOOK_TONE_ON_ART : LOOK_TONE)[look];
  return (
    <Chip tone={tone} icon={LOOK_ICON[look]} pulse={look === 'open'} className={className}>
      {t(`site.modeState.${look}`)}
    </Chip>
  );
}

/** "Nur auf Einladung" (whitelist); `compact` shows only the ticket on phones. */
export function WhitelistChip({
  onArt = false,
  compact = false,
  className,
}: {
  readonly onArt?: boolean;
  readonly compact?: boolean;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Chip tone={onArt ? 'brightGold' : 'gold'} icon={Ticket} className={className}>
      <span className={compact ? 'max-sm:sr-only' : undefined}>{t('mode.whitelist')}</span>
    </Chip>
  );
}

/** A rank like in the game chat: symbol and name in the rank's colour on a dark tag. */
export function RankTag({
  role,
  size = 'sm',
  className,
}: {
  readonly role: Pick<PublicRole, 'name' | 'symbol' | 'colour'>;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}): ReactElement {
  const pick = usePick();
  const style: CSSProperties = { color: role.colour };
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 justify-self-start whitespace-nowrap rounded-[4px] border border-white/10 bg-[#0d1512] font-pixel font-semibold uppercase leading-none tracking-[0.05em]',
        size === 'sm' ? 'px-1.5 py-1 text-[12px]' : 'px-2.5 py-1.5 text-[14px]',
        className,
      )}
      style={style}
    >
      {role.symbol ? <span aria-hidden>{role.symbol}</span> : null}
      <span className="truncate">{pick(role.name)}</span>
    </span>
  );
}

/** The rank's symbol on a tile in its colour (a dot for ranks without symbol). */
export function RankBlock({
  role,
  className,
}: {
  readonly role: Pick<PublicRole, 'symbol' | 'colour'>;
  readonly className?: string;
}): ReactElement {
  const style: CSSProperties = { backgroundColor: role.colour, color: textOn(role.colour) };
  return (
    <span
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-[6px] border-2 border-black/25 text-xl font-bold shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-3px_0_rgba(0,0,0,0.2)]',
        className,
      )}
      style={style}
      aria-hidden
    >
      {role.symbol || '•'}
    </span>
  );
}

/** A command as typed into the game chat. */
export function Cmd({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <code
      className={cn(
        'inline-flex max-w-full items-center rounded-[4px] border border-black/20 bg-[#101814] px-2 py-0.5 font-pixel text-[0.95em] font-medium leading-normal text-[#e8f3ec] [overflow-wrap:anywhere]',
        className,
      )}
    >
      {children}
    </code>
  );
}

/** One pixel step of the edge (px); columns are two steps wide, the edge is four steps high. */
const EDGE_UNIT = 4;
const EDGE_COLUMN = 8;
const EDGE_HEIGHT = 16;
/** How many steps each column rises – one period of the skyline, repeated across the width. */
const EDGE_PROFILE = '2233443221123321';
const EDGE_PERIOD = EDGE_PROFILE.length * EDGE_COLUMN;
const EDGE_PATH = `M0 ${EDGE_HEIGHT} ${Array.from(EDGE_PROFILE)
  .map((steps, i) => `V${EDGE_HEIGHT - Number(steps) * EDGE_UNIT} H${(i + 1) * EDGE_COLUMN}`)
  .join(' ')} V${EDGE_HEIGHT}Z`;

/**
 * A stepped pixel edge on top of a section, in `currentColor` (the section's own colour): it rises out of the section
 * into the one above. The section needs `position: relative` and must not clip its overflow.
 */
export function PixelEdge({ className }: { readonly className?: string }): ReactElement {
  const id = useId();
  return (
    <svg
      className={cn('pointer-events-none absolute inset-x-0 bottom-full block h-4 w-full', className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <pattern id={id} width={EDGE_PERIOD} height={EDGE_HEIGHT} patternUnits="userSpaceOnUse">
          <path d={EDGE_PATH} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height={EDGE_HEIGHT} fill={`url(#${CSS.escape(id)})`} />
    </svg>
  );
}

/** A green dot that pulses while something is live. */
export function LiveDot({ live, className }: { readonly live: boolean; readonly className?: string }): ReactElement {
  return (
    <span
      className={cn('size-2.5 shrink-0 rounded-full', live ? 'mm-pulse bg-[#3ddc84]' : 'bg-white/35', className)}
      aria-hidden
    />
  );
}

/** A friendly panel for "nothing here (yet)". */
export function EmptyState({
  icon: Icon,
  title,
  text,
  children,
  className,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly text?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <Panel className={cn('grid justify-items-center gap-4 px-6 py-12 text-center', className)}>
      <span
        className="grid size-14 place-items-center rounded-[6px] border-2 border-black/20 bg-gold-bright text-[#2a1b00] shadow-[inset_0_3px_0_rgba(255,255,255,0.4),inset_0_-4px_0_rgba(0,0,0,0.18)]"
        aria-hidden
      >
        <Icon className="size-7" />
      </span>
      <h2 className="font-pixel text-[1.6rem] font-bold leading-tight">{title}</h2>
      {text ? <p className="max-w-[50ch] text-muted-foreground text-pretty">{text}</p> : null}
      {children}
    </Panel>
  );
}

/** "Das lässt sich gerade nicht laden." as a panel. */
export function LoadError({ className }: { readonly className?: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return <Panel className={cn('p-6 text-muted-foreground', className)}>{t('site.loadError')}</Panel>;
}

const SEGMENT_COUNT = 10;
const SEGMENT_KEYS = Array.from({ length: SEGMENT_COUNT }, (_, i) => `s${i}`);

/** A filled bar of ten blocks: how full something is. */
export function Segments({
  share,
  colour,
  className,
}: {
  /** 0 … 1 */
  readonly share: number;
  readonly colour?: string;
  readonly className?: string;
}): ReactElement {
  // Anything above zero shows at least one block, so a single player is visible.
  const filled = share > 0 ? Math.max(1, Math.round(Math.min(share, 1) * SEGMENT_COUNT)) : 0;
  const style = { '--segment': colour } as CSSProperties;
  return (
    <span className={cn('mm-segments', className)} style={style} aria-hidden>
      {SEGMENT_KEYS.map((key, i) => (
        <span key={key} data-on={i < filled} />
      ))}
    </span>
  );
}
