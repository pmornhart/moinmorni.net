import { ArrowRight, Pin } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ModeStatus } from '@moinmorni/shared';
import { ModeGlyph } from '~/components/mode-visuals';
import { Card, Pill } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import type { NewsItem } from '~/lib/site';
import { modeJoinable } from '~/lib/status';
import { paragraphs, usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { CategoryBadge, ModeStateBadge, NewsCover } from './parts';

const PERCENT = 100;

/** The first paragraph of a news post (the cards cut it after a few lines). */
function teaser(body: string): string {
  return paragraphs(body)[0] ?? '';
}

function Meta({ item }: { readonly item: NewsItem }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
      <time dateTime={item.publishedAt}>{time.day(item.publishedAt)}</time>
      <span aria-hidden>·</span>
      <span>{t('site.news.by', { name: item.author })}</span>
    </p>
  );
}

function PinnedPill(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
      <Pin className="size-3" aria-hidden />
      {t('site.news.pinned')}
    </span>
  );
}

/** The big news post at the top of the start page. */
export function FeaturedNews({ item }: { readonly item: NewsItem }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  return (
    <Link
      to={`/news/${item.slug}`}
      className="group grid overflow-hidden rounded-[18px] border border-border bg-card shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-float"
    >
      <NewsCover category={item.category} big className="aspect-[16/8] sm:aspect-[16/7]">
        <div className="absolute left-4 top-4 flex flex-wrap gap-2 sm:left-5 sm:top-5">
          <CategoryBadge category={item.category} onCover />
          {item.pinned ? <PinnedPill /> : null}
        </div>
      </NewsCover>
      <div className="grid gap-3 p-5 sm:p-7">
        <Meta item={item} />
        <h3 className="font-display text-[clamp(1.5rem,3vw,2.1rem)] font-semibold leading-[1.12] text-balance group-hover:text-primary">
          {pick(item.title)}
        </h3>
        <p className="line-clamp-3 text-[15.5px] leading-relaxed text-muted-foreground text-pretty">
          {teaser(pick(item.body))}
        </p>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
          {t('site.news.readMore')}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

/** A news post as a small row: picture on the left, title and date on the right. */
export function CompactNews({ item }: { readonly item: NewsItem }): ReactElement {
  const pick = usePick();
  const time = useTimeText();
  return (
    <Link
      to={`/news/${item.slug}`}
      className="group flex items-stretch gap-4 overflow-hidden rounded-[16px] border border-border bg-card p-3 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-float"
    >
      <NewsCover category={item.category} className="w-24 shrink-0 rounded-[12px] sm:w-32" />
      <div className="grid min-w-0 content-center gap-1.5 py-1 pr-1">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={item.category} />
          <time dateTime={item.publishedAt} className="text-xs text-muted-foreground">
            {time.day(item.publishedAt)}
          </time>
        </div>
        <h3 className="line-clamp-2 font-display text-[1.12rem] font-semibold leading-snug group-hover:text-primary">
          {pick(item.title)}
        </h3>
        <p className="line-clamp-1 text-sm text-muted-foreground">{teaser(pick(item.body))}</p>
      </div>
    </Link>
  );
}

/** A news post as a card with picture on top (news list, more news under an article). */
export function NewsCard({ item }: { readonly item: NewsItem }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  return (
    <Link
      to={`/news/${item.slug}`}
      className="group grid content-start overflow-hidden rounded-[16px] border border-border bg-card shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-float"
    >
      <NewsCover category={item.category} className="aspect-[16/8]">
        <div className="absolute left-3.5 top-3.5 flex flex-wrap gap-2">
          <CategoryBadge category={item.category} onCover />
          {item.pinned ? <PinnedPill /> : null}
        </div>
      </NewsCover>
      <div className="grid gap-2 p-5">
        <Meta item={item} />
        <h3 className="font-display text-[1.3rem] font-semibold leading-snug text-balance group-hover:text-primary">
          {pick(item.title)}
        </h3>
        <p className="line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">
          {teaser(pick(item.body))}
        </p>
        <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
          {t('site.news.readMore')}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

/** How full a mode is, as a thin bar. */
function Fill({ mode }: { readonly mode: ModeStatus }): ReactElement {
  const share = mode.maxPlayers ? Math.min(PERCENT, (mode.players / mode.maxPlayers) * PERCENT) : 0;
  const style: CSSProperties = { width: `${share}%` };
  return (
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={style} />
    </span>
  );
}

/** A game mode as a tile: symbol, state, name, short text, players – links to the mode's page. */
export function ModeTile({
  mode,
  index,
  full = false,
}: {
  readonly mode: ModeStatus;
  readonly index: number;
  /** Whole description instead of two lines. */
  readonly full?: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const joinable = modeJoinable(mode);
  return (
    <Link to={`/spielmodi/${mode.id}`} className="group grid">
      <Card
        className={cn(
          'grid content-start gap-4 p-5 transition-[transform,box-shadow,border-color] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-float',
          !joinable && 'bg-card/75',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <ModeGlyph id={mode.id} position={index} className="size-12 rounded-[14px]" />
          <div className="flex flex-wrap justify-end gap-1.5">
            {mode.access === 'whitelist' ? <Pill tone="gold">{t('mode.whitelist')}</Pill> : null}
            <ModeStateBadge mode={mode} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <h3 className="font-display text-[1.4rem] font-semibold leading-tight group-hover:text-primary">
            {pick(mode.name)}
          </h3>
          <p
            className={cn(
              'text-[15px] leading-relaxed text-muted-foreground text-pretty',
              !full && 'line-clamp-2',
            )}
          >
            {pick(mode.description)}
          </p>
        </div>
        <div className="mt-auto grid gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            {joinable ? (
              <span className="tabular font-semibold">
                {t('mode.players', { players: mode.players, max: mode.maxPlayers })}
              </span>
            ) : (
              <span className="text-muted-foreground">{t(`site.modeHint.${mode.state}`)}</span>
            )}
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden
            />
          </div>
          {joinable ? <Fill mode={mode} /> : null}
        </div>
      </Card>
    </Link>
  );
}
