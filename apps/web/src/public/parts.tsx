import {
  ArrowRight,
  Camera,
  Clapperboard,
  Megaphone,
  Music2,
  PartyPopper,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ModeStatus } from '@moinmorni/shared';
import { Lozenge, Ridge } from '~/components/brand';
import { Card, Pill, type PillTone } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { SOCIALS, type NewsCategory, type SiteInfo, type Social } from '~/lib/site';
import { MODE_LOOK_TONE, modeLook } from '~/lib/status';
import { paragraphs } from '~/lib/text';

/** Width and side gutters of every section on the website. */
export const WRAP = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6';

const SITE_NAME = 'MoinMorni';

/** "News · MoinMorni" in the browser tab; the start page keeps the full title from index.html. */
export function usePageTitle(title?: string): void {
  useEffect(() => {
    const before = document.title;
    if (title) document.title = `${title} · ${SITE_NAME}`;
    return () => {
      document.title = before;
    };
  }, [title]);
}

/** The green band at the top of every sub page: small gold line, big title, short text. */
export function PageBand({
  eyebrow,
  title,
  text,
  icon: Icon,
  children,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly text?: string;
  readonly icon?: LucideIcon;
  readonly children?: ReactNode;
}): ReactElement {
  usePageTitle(title);
  return (
    <section className="band relative overflow-hidden">
      <div className="absolute inset-x-0 bottom-1.5 h-20 text-[#1c4a37] opacity-70 dark:text-[#12301f]">
        <Ridge />
      </div>
      <div className={cn(WRAP, 'relative grid gap-3 pb-14 pt-10 sm:pb-16 sm:pt-14')}>
        <div className="flex items-start gap-4">
          {Icon ? (
            <span
              className="mt-1 hidden size-12 shrink-0 place-items-center rounded-[14px] border border-band-line bg-white/[0.06] text-gold sm:grid"
              aria-hidden
            >
              <Icon className="size-6" />
            </span>
          ) : null}
          <div className="grid min-w-0 gap-2">
            {eyebrow ? (
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
            ) : null}
            <h1 className="font-display text-[clamp(2.1rem,6vw,3.4rem)] font-semibold leading-[1.05] text-balance text-band-foreground [overflow-wrap:anywhere]">
              {title}
            </h1>
            {text ? <p className="max-w-[60ch] text-band-muted text-pretty sm:text-lg">{text}</p> : null}
          </div>
        </div>
        {children}
      </div>
      <Lozenge className="absolute inset-x-0 bottom-0" />
    </section>
  );
}

/** Section heading with an optional "see all" link on the right. */
export function SectionHead({
  eyebrow,
  title,
  text,
  link,
  id,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly text?: string;
  readonly link?: { readonly to: string; readonly label: string };
  readonly id?: string;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="grid min-w-0 gap-2">
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{eyebrow}</p>
        ) : null}
        <h2
          id={id}
          className="font-display text-[clamp(1.7rem,3.4vw,2.4rem)] font-semibold leading-[1.1] text-balance"
        >
          {title}
        </h2>
        {text ? <p className="max-w-[62ch] text-muted-foreground text-pretty">{text}</p> : null}
      </div>
      {link ? (
        <Link
          to={link.to}
          className="group inline-flex items-center gap-1.5 rounded-full px-1 text-sm font-bold text-primary hover:underline"
        >
          {link.label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

export const CATEGORY_ICON: Readonly<Record<NewsCategory, LucideIcon>> = {
  update: Sparkles,
  event: PartyPopper,
  info: Megaphone,
};

const CATEGORY_TONE: Readonly<Record<NewsCategory, PillTone>> = {
  update: 'success',
  event: 'gold',
  info: 'blue',
};

/** "Update" / "Event" / "Info" in the category's own colour. */
export function CategoryBadge({
  category,
  onCover = false,
  className,
}: {
  readonly category: NewsCategory;
  /** On a news picture: white chip that reads on every colour. */
  readonly onCover?: boolean;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const Icon = CATEGORY_ICON[category];
  if (onCover) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-[#10261c] shadow-sm',
          className,
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {t(`site.news.category.${category}`)}
      </span>
    );
  }
  return (
    <Pill tone={CATEGORY_TONE[category]} className={cn('gap-1', className)}>
      <Icon className="size-3" aria-hidden />
      {t(`site.news.category.${category}`)}
    </Pill>
  );
}

/**
 * The picture of a news post: the category's colour with a dotted pattern, the Alpine ridge and the category's
 * symbol – drawn here, never an image from elsewhere.
 */
export function NewsCover({
  category,
  className,
  big = false,
  children,
}: {
  readonly category: NewsCategory;
  readonly className?: string;
  readonly big?: boolean;
  readonly children?: ReactNode;
}): ReactElement {
  const Icon = CATEGORY_ICON[category];
  return (
    <div className={cn('relative isolate overflow-hidden', `mm-cover-${category}`, className)}>
      <div className="mm-cover-dots absolute inset-0" aria-hidden />
      <div className="absolute inset-x-0 bottom-1 h-[42%] text-black/20" aria-hidden>
        <Ridge />
      </div>
      <span
        className={cn(
          'absolute grid place-items-center rounded-full bg-white/15 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.25)_inset] backdrop-blur-[2px]',
          big
            ? 'right-[8%] top-1/2 size-28 -translate-y-1/2 sm:size-32'
            : 'right-4 top-1/2 size-14 -translate-y-1/2',
        )}
        aria-hidden
      >
        <Icon className={big ? 'size-12 sm:size-14' : 'size-6'} strokeWidth={1.6} />
      </span>
      <Lozenge className="absolute inset-x-0 bottom-0 h-1" />
      {children}
    </div>
  );
}

/** Offen / Schläft / Geschlossen / Wartung / Bald. */
export function ModeStateBadge({
  mode,
  className,
}: {
  readonly mode: ModeStatus;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const look = modeLook(mode);
  return (
    <Pill tone={MODE_LOOK_TONE[look]} dot className={className}>
      {t(`site.modeState.${look}`)}
    </Pill>
  );
}

/** Characters of a paragraph in its React key. */
const KEY_CHARS = 16;

/** A plain text as paragraphs – text only, never HTML. */
export function Paragraphs({
  text,
  className,
}: {
  readonly text: string;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn('grid gap-4', className)}>
      {paragraphs(text).map((line, i) => (
        // Paragraphs may repeat word for word; their place is their identity.
        <p key={`${i}-${line.slice(0, KEY_CHARS)}`}>{line}</p>
      ))}
    </div>
  );
}

/** A friendly card for "nothing here (yet)". */
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
    <Card className={cn('grid justify-items-center gap-3 px-6 py-12 text-center', className)}>
      <span className="grid size-12 place-items-center rounded-[14px] bg-gold-soft text-gold" aria-hidden>
        <Icon className="size-6" />
      </span>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {text ? <p className="max-w-[48ch] text-muted-foreground text-pretty">{text}</p> : null}
      {children}
    </Card>
  );
}

/** Own neutral symbols for the social channels – no logos of other brands. */
export const SOCIAL_ICON: Readonly<Record<Social, LucideIcon>> = {
  youtube: Clapperboard,
  tiktok: Music2,
  instagram: Camera,
};

/** The channels that are set, in a fixed order. */
export function setSocials(site: SiteInfo | undefined): readonly (readonly [Social, string])[] {
  return SOCIALS.flatMap((s) => {
    const url = site?.socials[s];
    return url ? [[s, url] as const] : [];
  });
}

/** Opens another site in a new tab without handing it this page. */
export const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;
