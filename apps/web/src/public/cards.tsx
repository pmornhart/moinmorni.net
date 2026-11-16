import {
  ArrowRight,
  Megaphone,
  Moon,
  PartyPopper,
  Pin,
  Play,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ModeStatus } from '@moinmorni/shared';
import { ModeGlyph } from '~/components/mode-visuals';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import type { NewsCategory, NewsItem } from '~/lib/site';
import { modeJoinable, modeLook, type ModeLook } from '~/lib/status';
import { usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { modeArt, newsScene, sceneImage } from './art';
import { Chip, ModeStateChip, PixelEdge, Segments, WhitelistChip, type ChipTone } from './kit';
import { JOIN_LINK, teaser, useDayTime } from './parts';

/** The colours of a mode as CSS variables for .mm-mode-bg and .mm-mode-card. */
export function modeStyle(id: string): CSSProperties {
  const art = modeArt(id);
  return { '--mode-a': art.a, '--mode-b': art.b } as CSSProperties;
}

/** How a figure looks when its mode is not open: a dark silhouette for "soon", pale for closed. */
const FIGURE_FILTER: Readonly<Record<ModeLook, string>> = {
  open: '',
  asleep: 'saturate-[0.85]',
  pause: 'saturate-[0.75]',
  closed: 'grayscale-[0.7] opacity-80',
  maintenance: 'grayscale-[0.35]',
  soon: 'brightness-0 opacity-75',
};

/** A mode's figure on its colours (or its symbol for modes without a figure yet). */
export function ModeFigure({
  id,
  look,
  className,
  imgClassName,
}: {
  readonly id: string;
  readonly look: ModeLook;
  readonly className?: string;
  readonly imgClassName?: string;
}): ReactElement {
  const art = modeArt(id);
  if (!art.figure) {
    return (
      <div className={cn('absolute inset-0 grid place-items-center', className)} aria-hidden>
        <ModeGlyph
          id={id}
          position={0}
          className="size-24 rounded-[10px] border-2 border-black/25 bg-white/15 text-white [&_svg]:size-12"
        />
      </div>
    );
  }
  return (
    <img
      src={art.figure}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn(
        'mm-figure pointer-events-none absolute bottom-[-3%] left-1/2 h-full max-w-none drop-shadow-[0_8px_10px_rgba(0,0,0,0.35)]',
        FIGURE_FILTER[look],
        imgClassName,
        className,
      )}
    />
  );
}

/** Below the name: how many play right now, or why nobody can. */
function ModeFill({ mode }: { readonly mode: ModeStatus }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const art = modeArt(mode.id);
  const look = modeLook(mode);
  if (!modeJoinable(mode)) {
    return (
      <p className="text-[14px] font-medium text-muted-foreground">{t(`site.modeHint.${mode.state}`)}</p>
    );
  }
  return (
    <div className="grid gap-2">
      <Segments share={mode.maxPlayers ? mode.players / mode.maxPlayers : 0} colour={art.a} />
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[14px]">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          <span className="tabular">
            {t('mode.players', { players: mode.players, max: mode.maxPlayers })}
          </span>
        </span>
        {look === 'asleep' ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-blue">
            <Moon className="size-3.5" aria-hidden />
            {t('site.modes.wakes')}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** A game mode like a character-select card: its figure on its colours, state, name and players. */
export function ModeCard({
  mode,
  full = false,
  headingLevel = 'h3',
}: {
  readonly mode: ModeStatus;
  /** Whole description instead of two lines (and no description on phones in the compact grid). */
  readonly full?: boolean;
  readonly headingLevel?: 'h2' | 'h3';
}): ReactElement {
  const pick = usePick();
  const look = modeLook(mode);
  const Heading = headingLevel;
  return (
    <Link
      to={`/spielmodi/${mode.id}`}
      className="mm-mode-card group relative grid content-start overflow-hidden rounded-[10px] border-2 bg-card text-card-foreground"
      style={modeStyle(mode.id)}
    >
      <div className="mm-mode-bg relative aspect-[10/9] overflow-hidden">
        <div className="mm-noise absolute inset-0 opacity-60 mix-blend-overlay" aria-hidden />
        <ModeFigure id={mode.id} look={look} className="h-[92%]" />
        {look === 'soon' ? (
          <span
            className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 font-pixel text-[3.4rem] font-bold leading-none text-white/85 drop-shadow-[0_4px_0_rgba(0,0,0,0.4)] sm:text-[4.5rem]"
            aria-hidden
          >
            ?
          </span>
        ) : null}
        {look === 'maintenance' ? (
          <span
            className="mm-hazard absolute inset-x-0 bottom-5 h-2.5 opacity-90 sm:bottom-6 sm:h-3"
            aria-hidden
          />
        ) : null}
        <div className="absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-1.5 sm:inset-x-3 sm:top-3 sm:gap-2">
          <ModeStateChip mode={mode} onArt />
          {mode.access === 'whitelist' ? <WhitelistChip onArt compact={!full} /> : null}
        </div>
      </div>
      <div className="relative grid gap-2.5 px-3 pb-3.5 pt-2.5 sm:gap-3 sm:px-4 sm:pb-4 sm:pt-3">
        <PixelEdge className="text-card" />
        <div className="flex items-start justify-between gap-3">
          <Heading className="font-pixel text-[1.35rem] font-bold leading-[1.05] tracking-[0.01em] sm:text-[1.6rem]">
            {pick(mode.name)}
          </Heading>
          <span
            className="mt-0.5 hidden size-8 shrink-0 place-items-center rounded-[4px] border-2 border-black/20 bg-[var(--mode-a)] text-[#10120f] opacity-0 shadow-[inset_0_2px_0_rgba(255,255,255,0.4)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:grid"
            aria-hidden
          >
            <Play className="size-4" />
          </span>
        </div>
        <p
          className={cn(
            'text-[15px] leading-relaxed text-muted-foreground text-pretty',
            !full && 'line-clamp-2 min-h-[3.25em] max-sm:hidden',
          )}
        >
          {pick(mode.description)}
        </p>
        <ModeFill mode={mode} />
      </div>
    </Link>
  );
}

/** The last tile of the modes grid: everyone starts in the village. */
export function JoinCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useDayTime();
  return (
    <Link
      to={JOIN_LINK}
      className="group relative grid min-h-[240px] content-end overflow-hidden rounded-[10px] border-2 border-black/40 bg-band text-band-foreground shadow-[0_6px_0_rgba(0,0,0,0.35)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_10px_0_rgba(0,0,0,0.35),0_0_0_3px_var(--gold-bright)] sm:min-h-[340px]"
    >
      <img
        src={sceneImage('dorfplatz', time)}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10" aria-hidden />
      <div className="relative grid gap-2.5 p-3 sm:gap-3 sm:p-5">
        <Chip tone="brightGold" className="justify-self-start">
          {t('site.modes.joinEyebrow')}
        </Chip>
        <h3 className="font-pixel text-[1.4rem] font-bold leading-[1.05] text-white sm:text-[1.7rem]">
          {t('site.modes.joinTitle')}
        </h3>
        <p className="text-[15px] leading-relaxed text-white/85 max-sm:hidden">{t('site.modes.joinText')}</p>
        <span className="mm-btn mm-btn-emerald h-10 justify-self-start px-3 text-[14px] sm:px-4">
          <Play />
          {t('site.playNow')}
        </span>
      </div>
    </Link>
  );
}

export const CATEGORY_ICON: Readonly<Record<NewsCategory, LucideIcon>> = {
  update: Sparkles,
  event: PartyPopper,
  info: Megaphone,
};

const CATEGORY_TONE: Readonly<Record<NewsCategory, ChipTone>> = {
  update: 'brightGreen',
  event: 'brightGold',
  info: 'glass',
};

/** "Update" / "Event" / "Info" – loud on pictures, quiet elsewhere. */
export function CategoryChip({
  category,
  className,
}: {
  readonly category: NewsCategory;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Chip tone={CATEGORY_TONE[category]} icon={CATEGORY_ICON[category]} className={className}>
      {t(`site.news.category.${category}`)}
    </Chip>
  );
}

function PinnedChip(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Chip tone="glass" icon={Pin}>
      {t('site.news.pinned')}
    </Chip>
  );
}

/** Our render that belongs to a news post (by its kind and address). */
export function NewsImage({
  item,
  className,
  eager = false,
}: {
  readonly item: Pick<NewsItem, 'category' | 'slug'>;
  readonly className?: string;
  readonly eager?: boolean;
}): ReactElement {
  const time = useDayTime();
  return (
    <img
      src={sceneImage(newsScene(item.category, item.slug), time)}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('size-full object-cover', className)}
    />
  );
}

function Meta({ item, className }: { readonly item: NewsItem; readonly className?: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]', className)}>
      <time dateTime={item.publishedAt}>{time.day(item.publishedAt)}</time>
      <span aria-hidden>·</span>
      <span>{t('site.news.by', { name: item.author })}</span>
    </p>
  );
}

const CARD_LINK =
  'group grid content-start overflow-hidden rounded-[10px] border-2 border-border bg-card text-card-foreground shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-gold/60 hover:shadow-float';

function ReadMore(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <span className="inline-flex items-center gap-1.5 font-pixel text-[15px] font-semibold uppercase tracking-[0.05em] text-primary">
      {t('site.news.readMore')}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
    </span>
  );
}

/** The big news post: picture with the title on it, then the first paragraph. `wide` for a full-width row. */
export function FeaturedNews({
  item,
  wide = false,
}: {
  readonly item: NewsItem;
  readonly wide?: boolean;
}): ReactElement {
  const pick = usePick();
  return (
    <Link to={`/news/${item.slug}`} className={CARD_LINK}>
      <div className={cn('relative aspect-[16/9] overflow-hidden', wide && 'lg:aspect-[21/8]')}>
        <NewsImage item={item} className="transition-transform duration-500 group-hover:scale-[1.04]" />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent"
          aria-hidden
        />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <CategoryChip category={item.category} />
          {item.pinned ? <PinnedChip /> : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 grid gap-2 p-5 sm:p-7">
          <Meta item={item} className="text-white/80" />
          <h3 className="font-pixel text-[clamp(1.7rem,3.4vw,2.6rem)] font-bold leading-[1.02] text-white text-balance [text-shadow:0_3px_0_rgba(0,0,0,0.45)]">
            {pick(item.title)}
          </h3>
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:px-7">
        <p className="line-clamp-2 text-[1.02rem] leading-relaxed text-muted-foreground text-pretty">
          {teaser(pick(item.body))}
        </p>
        <ReadMore />
      </div>
    </Link>
  );
}

/** A news post as a card with its picture on top. */
export function NewsCard({ item }: { readonly item: NewsItem }): ReactElement {
  const pick = usePick();
  return (
    <Link to={`/news/${item.slug}`} className={CARD_LINK}>
      <div className="relative aspect-[16/9] overflow-hidden">
        <NewsImage item={item} className="transition-transform duration-500 group-hover:scale-[1.05]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <CategoryChip category={item.category} />
          {item.pinned ? <PinnedChip /> : null}
        </div>
      </div>
      <div className="grid gap-2.5 p-5">
        <Meta item={item} className="text-muted-foreground" />
        <h3 className="font-pixel text-[1.45rem] font-bold leading-[1.08] text-balance group-hover:text-primary">
          {pick(item.title)}
        </h3>
        <p className="line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">
          {teaser(pick(item.body))}
        </p>
        <ReadMore />
      </div>
    </Link>
  );
}

/** A news post as a row: picture left, kind, date and title right. */
export function CompactNews({ item }: { readonly item: NewsItem }): ReactElement {
  const pick = usePick();
  const time = useTimeText();
  return (
    <Link
      to={`/news/${item.slug}`}
      className={cn(
        CARD_LINK,
        'grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] content-stretch items-stretch sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]',
      )}
    >
      <div className="relative min-h-[96px] overflow-hidden border-r-2 border-border">
        <NewsImage
          item={item}
          className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.06]"
        />
      </div>
      <div className="grid content-center gap-1.5 p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip category={item.category} className="px-1.5 py-0.5 text-[11px]" />
          <time dateTime={item.publishedAt} className="text-[13px] text-muted-foreground">
            {time.day(item.publishedAt)}
          </time>
        </div>
        <h3 className="line-clamp-2 font-pixel text-[1.2rem] font-bold leading-[1.1] group-hover:text-primary">
          {pick(item.title)}
        </h3>
      </div>
    </Link>
  );
}
