import { ArrowLeft, Newspaper, Pin } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button, Card, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { isNotFound, NEWS_ALL, NEWS_CATEGORIES, useNews, useNewsItem, type NewsCategory } from '~/lib/site';
import { usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { NewsCard } from './cards';
import {
  CATEGORY_ICON,
  CategoryBadge,
  EmptyState,
  NewsCover,
  PageBand,
  Paragraphs,
  usePageTitle,
  WRAP,
} from './parts';

const FILTER_PARAM = 'kategorie';
const MORE_NEWS = 3;
const SKELETONS = ['a', 'b', 'c'];

function isCategory(value: string | null): value is NewsCategory {
  return NEWS_CATEGORIES.includes(value as NewsCategory);
}

/** All news, newest (and pinned) first, with a filter by category. */
export function NewsListPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [params, setParams] = useSearchParams();
  const raw = params.get(FILTER_PARAM);
  const filter = isCategory(raw) ? raw : null;
  const news = useNews(NEWS_ALL);
  const all = news.data ?? [];
  const list = filter ? all.filter((n) => n.category === filter) : all;
  const choose = (category: NewsCategory | null): void =>
    setParams(category ? { [FILTER_PARAM]: category } : {}, { replace: true, preventScrollReset: true });
  const chip = (active: boolean): string =>
    cn(
      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
      active
        ? 'border-band-foreground bg-band-foreground text-band'
        : 'border-band-line bg-white/[0.05] text-band-muted hover:text-band-foreground',
    );
  return (
    <>
      <PageBand
        eyebrow={t('site.news.eyebrow')}
        title={t('site.news.title')}
        text={t('site.news.text')}
        icon={Newspaper}
      >
        <div className="flex flex-wrap gap-2 pt-3" role="group" aria-label={t('site.news.filter')}>
          <button type="button" className={chip(!filter)} aria-pressed={!filter} onClick={() => choose(null)}>
            {t('site.news.allCategories')}
            <span className="tabular opacity-70">{all.length}</span>
          </button>
          {NEWS_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <button
                key={c}
                type="button"
                className={chip(filter === c)}
                aria-pressed={filter === c}
                onClick={() => choose(filter === c ? null : c)}
              >
                <Icon className="size-3.5" aria-hidden />
                {t(`site.news.categoryPlural.${c}`)}
                <span className="tabular opacity-70">{all.filter((n) => n.category === c).length}</span>
              </button>
            );
          })}
        </div>
      </PageBand>
      <div className={cn(WRAP, 'grid gap-6 py-12 sm:py-16')}>
        {news.isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SKELETONS.map((k) => (
              <Skeleton key={k} className="h-80 rounded-[16px]" />
            ))}
          </div>
        ) : null}
        {news.isError ? <Card className="p-6 text-muted-foreground">{t('site.loadError')}</Card> : null}
        {news.isSuccess && !list.length ? (
          <EmptyState
            icon={Newspaper}
            title={filter ? t('site.news.emptyFilter') : t('site.news.emptyTitle')}
            text={t('site.news.empty')}
          >
            {filter ? (
              <Button variant="secondary" onClick={() => choose(null)}>
                {t('site.news.showAll')}
              </Button>
            ) : null}
          </EmptyState>
        ) : null}
        {list.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((item) => (
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
    <Button asChild variant="secondary" className="justify-self-start">
      <Link to="/news">
        <ArrowLeft />
        {t('site.news.back')}
      </Link>
    </Button>
  );
}

/** One news post: picture, text as paragraphs (plain text only), more news below. */
export function NewsArticlePage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { slug = '' } = useParams();
  const pick = usePick();
  const time = useTimeText();
  const item = useNewsItem(slug);
  const more = useNews(MORE_NEWS + 1);
  const others = (more.data ?? []).filter((n) => n.slug !== slug).slice(0, MORE_NEWS);
  usePageTitle(item.isError ? t('site.news.missingTitle') : undefined);

  if (item.isPending) {
    return (
      <div className={cn(WRAP, 'grid max-w-[860px] gap-5 py-14')}>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="aspect-[21/9] rounded-[18px]" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (item.isError || !item.data) {
    return (
      <div className={cn(WRAP, 'grid max-w-[860px] gap-6 py-16')}>
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
      <PageBand eyebrow={t('site.news.eyebrow')} title={pick(news.title)}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2 text-sm text-band-muted">
          <CategoryBadge category={news.category} onCover />
          {news.pinned ? (
            <span className="inline-flex items-center gap-1 font-semibold text-gold">
              <Pin className="size-3.5" aria-hidden />
              {t('site.news.pinned')}
            </span>
          ) : null}
          <time dateTime={news.publishedAt}>{time.day(news.publishedAt)}</time>
          <span aria-hidden>·</span>
          <span>{t('site.news.by', { name: news.author })}</span>
        </div>
      </PageBand>
      <article className={cn(WRAP, 'grid max-w-[860px] gap-8 py-12 sm:py-14')}>
        <NewsCover category={news.category} big className="aspect-[16/6] rounded-[20px] shadow-card" />
        <Paragraphs
          text={pick(news.body)}
          className="text-[1.08rem] leading-[1.75] text-pretty [overflow-wrap:anywhere] sm:text-[1.15rem]"
        />
        <div className="border-t border-border pt-6">
          <BackToNews />
        </div>
      </article>
      {others.length ? (
        <section className="border-t border-border bg-secondary/60 dark:bg-white/[0.015]">
          <div className={cn(WRAP, 'grid gap-6 py-12 sm:py-14')}>
            <h2 className="font-display text-2xl font-semibold">{t('site.news.more')}</h2>
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
