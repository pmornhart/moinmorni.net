import { ArrowLeft, Newspaper } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { isNotFound, NEWS_ALL, NEWS_CATEGORIES, useNews, useNewsItem, type NewsCategory } from '~/lib/site';
import { usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { CATEGORY_ICON, CategoryChip, FeaturedNews, NewsCard, NewsImage } from './cards';
import { EmptyState, GameButton, LoadError, PixelEdge } from './kit';
import { PageHero } from './page-hero';
import { Paragraphs, usePageTitle, WRAP } from './parts';

const FILTER_PARAM = 'kategorie';
const MORE_NEWS = 3;
const SKELETONS = ['a', 'b', 'c'];

function isCategory(value: string | null): value is NewsCategory {
  return NEWS_CATEGORIES.some((c) => c === value);
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-[6px] border-2 px-3.5 py-2 font-pixel text-[15px] font-semibold uppercase tracking-[0.04em] transition-colors',
        active
          ? 'border-black/40 bg-gold-bright text-[#2a1b00] shadow-[inset_0_2px_0_rgba(255,255,255,0.4),0_3px_0_#a87708]'
          : 'border-white/20 bg-black/40 text-white/85 backdrop-blur-sm hover:border-white/40 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

/** All news, newest (and pinned) first, with a filter by kind. */
export function NewsListPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [params, setParams] = useSearchParams();
  const raw = params.get(FILTER_PARAM);
  const filter = isCategory(raw) ? raw : null;
  const news = useNews(NEWS_ALL);
  const all = news.data ?? [];
  const list = filter ? all.filter((n) => n.category === filter) : all;
  const [first, ...rest] = list;
  const choose = (category: NewsCategory | null): void =>
    setParams(category ? { [FILTER_PARAM]: category } : {}, { replace: true, preventScrollReset: true });
  return (
    <>
      <PageHero
        eyebrow={t('site.news.eyebrow')}
        title={t('site.news.title')}
        text={t('site.news.text')}
        scene="dorfplatz"
      >
        <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label={t('site.news.filter')}>
          <FilterButton active={!filter} onClick={() => choose(null)}>
            {t('site.news.allCategories')}
            <span className="tabular opacity-70">{all.length}</span>
          </FilterButton>
          {NEWS_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <FilterButton key={c} active={filter === c} onClick={() => choose(filter === c ? null : c)}>
                <Icon className="size-4" aria-hidden />
                {t(`site.news.categoryPlural.${c}`)}
                <span className="tabular opacity-70">{all.filter((n) => n.category === c).length}</span>
              </FilterButton>
            );
          })}
        </div>
      </PageHero>
      <div className={cn(WRAP, 'grid gap-8 py-14 sm:py-16')}>
        {news.isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SKELETONS.map((k) => (
              <Skeleton key={k} className="h-80 rounded-[10px]" />
            ))}
          </div>
        ) : null}
        {news.isError ? <LoadError /> : null}
        {news.isSuccess && !list.length ? (
          <EmptyState
            icon={Newspaper}
            title={filter ? t('site.news.emptyFilter') : t('site.news.emptyTitle')}
            text={t('site.news.empty')}
          >
            {filter ? (
              <GameButton tone="stone" onClick={() => choose(null)}>
                {t('site.news.showAll')}
              </GameButton>
            ) : null}
          </EmptyState>
        ) : null}
        {first ? <FeaturedNews item={first} wide /> : null}
        {rest.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((item) => (
              <NewsCard key={item.slug} item={item} />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

function BackToNews(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <GameButton asChild tone="stone" className="justify-self-start">
      <Link to="/news">
        <ArrowLeft />
        {t('site.news.back')}
      </Link>
    </GameButton>
  );
}

/** One news post: its picture big on top, the text as paragraphs (plain text only), more news below. */
export function NewsArticlePage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { slug = '' } = useParams();
  const pick = usePick();
  const time = useTimeText();
  const item = useNewsItem(slug);
  const more = useNews(MORE_NEWS + 1);
  const others = (more.data ?? []).filter((n) => n.slug !== slug).slice(0, MORE_NEWS);
  const missing = item.isError ? t('site.news.missingTitle') : undefined;
  usePageTitle(item.data ? pick(item.data.title) : missing);

  if (item.isPending) {
    return (
      <div className={cn(WRAP, 'grid max-w-[880px] gap-5 pb-14 pt-[calc(var(--header-h)+40px)]')}>
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="aspect-[21/9] rounded-[10px]" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (item.isError || !item.data) {
    return (
      <div className={cn(WRAP, 'grid max-w-[880px] gap-6 pb-16 pt-[calc(var(--header-h)+40px)]')}>
        <EmptyState
          icon={Newspaper}
          title={t('site.news.missingTitle')}
          text={isNotFound(item.error) ? t('site.news.missingText') : t('site.loadError')}
        >
          <BackToNews />
        </EmptyState>
      </div>
    );
  }
  const news = item.data;
  return (
    <>
      <section className="mm-on-dark relative isolate overflow-hidden bg-band text-white">
        <NewsImage item={news} eager className="mm-settle absolute inset-0 -z-20" />
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/50 to-black/70"
          aria-hidden
        />
        <div
          className={cn(
            WRAP,
            'grid min-h-[440px] max-w-[980px] content-end gap-5 pb-16 pt-[calc(var(--header-h)+48px)] sm:min-h-[520px]',
          )}
        >
          <div className="mm-rise grid justify-items-start gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryChip category={news.category} />
              {news.pinned ? (
                <span className="rounded-[4px] bg-black/55 px-2 py-1 font-pixel text-[12.5px] font-semibold uppercase tracking-[0.06em] text-white">
                  {t('site.news.pinned')}
                </span>
              ) : null}
            </div>
            <h1 className="font-pixel text-[clamp(2.3rem,6.4vw,4.2rem)] font-bold leading-[0.98] text-white text-balance [overflow-wrap:anywhere] [text-shadow:0_4px_0_rgba(0,0,0,0.45)]">
              {pick(news.title)}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-white/85">
              <time dateTime={news.publishedAt}>{time.day(news.publishedAt)}</time>
              <span aria-hidden>·</span>
              <span>{t('site.news.by', { name: news.author })}</span>
            </p>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0">
          <PixelEdge className="text-background" />
        </div>
      </section>
      <article className={cn(WRAP, 'grid max-w-[820px] gap-8 py-12 sm:py-14')}>
        <Paragraphs
          text={pick(news.body)}
          className="text-[1.1rem] leading-[1.8] text-pretty [overflow-wrap:anywhere] first:[&>p:first-child]:text-[1.22rem] first:[&>p:first-child]:font-medium sm:text-[1.15rem]"
        />
        <div className="border-t-2 border-border pt-6">
          <BackToNews />
        </div>
      </article>
      {others.length ? (
        <section className="relative bg-background-alt">
          <PixelEdge className="text-background-alt" />
          <div className={cn(WRAP, 'grid gap-6 py-14')}>
            <h2 className="font-pixel text-[2rem] font-bold">{t('site.news.more')}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((n) => (
                <NewsCard key={n.slug} item={n} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
