import { Gavel, LifeBuoy, ScrollText } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, Card, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useSite } from '~/lib/site';
import { useLanguage } from '~/lib/text';
import { EmptyState, PageBand, WRAP } from './parts';

const SKELETONS = ['a', 'b', 'c', 'd'];

/** The rules from the panel (website settings), numbered, in the language of the page. */
export function RulesPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const site = useSite();
  const rules = site.data?.rules[language] ?? [];
  return (
    <>
      <PageBand
        eyebrow={t('site.rules.eyebrow')}
        title={t('site.rules.title')}
        text={t('site.rules.text')}
        icon={ScrollText}
      />
      <div className={cn(WRAP, 'grid max-w-[900px] gap-6 py-12 sm:py-16')}>
        {site.isPending ? (
          <div className="grid gap-3">
            {SKELETONS.map((k) => (
              <Skeleton key={k} className="h-16 rounded-[16px]" />
            ))}
          </div>
        ) : null}
        {site.isError ? <Card className="p-6 text-muted-foreground">{t('site.loadError')}</Card> : null}
        {site.isSuccess && !rules.length ? (
          <EmptyState icon={ScrollText} title={t('site.rules.emptyTitle')} text={t('site.rules.empty')} />
        ) : null}
        {rules.length ? (
          <ol className="grid gap-3">
            {rules.map((rule, i) => (
              <li
                // Rules may repeat word for word; their number is their identity.
                key={`${i + 1}-${rule}`}
                className="flex items-start gap-4 rounded-[16px] border border-border bg-card p-4 shadow-card sm:p-5"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-display text-lg font-semibold text-primary-foreground"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="pt-1.5 text-[1.05rem] leading-relaxed text-pretty [overflow-wrap:anywhere]">
                  <span className="sr-only">{t('site.rules.number', { n: i + 1 })} </span>
                  {rule}
                </p>
              </li>
            ))}
          </ol>
        ) : null}
        <Card className="grid gap-4 border-gold/35 bg-gold-soft/50 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
          <span className="grid size-11 place-items-center rounded-[13px] bg-gold-soft text-gold" aria-hidden>
            <Gavel className="size-5" />
          </span>
          <div className="grid gap-1.5">
            <h2 className="font-display text-xl font-semibold">{t('site.rules.punishTitle')}</h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
              {t('site.rules.punishText')}
            </p>
          </div>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="secondary">
            <Link to="/hilfe#team-hilfe">
              <LifeBuoy />
              {t('site.rules.questions')}
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
