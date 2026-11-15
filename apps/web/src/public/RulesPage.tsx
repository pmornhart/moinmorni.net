import { Gavel, LifeBuoy, ScrollText } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useSite } from '~/lib/site';
import { useLanguage } from '~/lib/text';
import { EmptyState, GameButton, LoadError, Panel } from './kit';
import { PageHero } from './page-hero';
import { WRAP } from './parts';

const SKELETONS = ['a', 'b', 'c', 'd'];

/** The rules from the panel (website settings), numbered like signs, in the language of the page. */
export function RulesPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const site = useSite();
  const rules = site.data?.rules[language] ?? [];
  return (
    <>
      <PageHero
        eyebrow={t('site.rules.eyebrow')}
        title={t('site.rules.title')}
        text={t('site.rules.text')}
        scene="handwerkergasse"
      />
      <div className={cn(WRAP, 'grid max-w-[920px] gap-6 py-14 sm:py-16')}>
        {site.isPending ? (
          <div className="grid gap-3">
            {SKELETONS.map((k) => (
              <Skeleton key={k} className="h-20 rounded-[10px]" />
            ))}
          </div>
        ) : null}
        {site.isError ? <LoadError /> : null}
        {site.isSuccess && !rules.length ? (
          <EmptyState icon={ScrollText} title={t('site.rules.emptyTitle')} text={t('site.rules.empty')} />
        ) : null}
        {rules.length ? (
          <ol className="grid gap-3.5">
            {rules.map((rule, i) => (
              <li
                // Rules may repeat word for word; their number is their identity.
                key={`${i + 1}-${rule}`}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-[10px] border-2 border-border bg-card p-3 pr-5 shadow-card sm:gap-5"
              >
                <span
                  className="grid size-14 place-items-center rounded-[6px] border-2 border-black/30 bg-gold-bright font-pixel text-[1.9rem] font-bold text-[#2a1b00] shadow-[inset_0_4px_0_rgba(255,255,255,0.45),inset_0_-5px_0_rgba(0,0,0,0.16)]"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="text-[1.08rem] leading-relaxed text-pretty [overflow-wrap:anywhere]">
                  <span className="sr-only">{t('site.rules.number', { n: i + 1 })} </span>
                  {rule}
                </p>
              </li>
            ))}
          </ol>
        ) : null}
        <Panel className="grid gap-4 border-destructive/30 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-6">
          <span
            className="grid size-12 place-items-center rounded-[6px] border-2 border-black/20 bg-destructive-soft text-destructive"
            aria-hidden
          >
            <Gavel className="size-6" />
          </span>
          <div className="grid gap-1.5">
            <h2 className="font-pixel text-[1.5rem] font-bold leading-tight">{t('site.rules.punishTitle')}</h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">{t('site.rules.punishText')}</p>
          </div>
        </Panel>
        <div className="flex flex-wrap items-center gap-3">
          <GameButton asChild tone="stone">
            <Link to="/hilfe#team-hilfe">
              <LifeBuoy />
              {t('site.rules.questions')}
            </Link>
          </GameButton>
        </div>
      </div>
    </>
  );
}
