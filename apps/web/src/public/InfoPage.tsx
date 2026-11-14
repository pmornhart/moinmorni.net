import { ArrowLeft, Hourglass } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, Card } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { PageBand, WRAP } from './parts';

/** A simple page whose content follows later (imprint, privacy) – or the "not found" page. */
export function InfoPage({
  page,
  follows = true,
}: {
  readonly page: 'imprint' | 'privacy' | 'notFound';
  readonly follows?: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <>
      <PageBand eyebrow="MoinMorni" title={t(`pages.${page}.title`)} />
      <div className={cn(WRAP, 'grid max-w-[860px] gap-6 py-12 sm:py-16')}>
        <Card className="grid gap-3 p-6 sm:p-8">
          {follows ? (
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-gold">
              <Hourglass className="size-4" aria-hidden />
              {t('pages.follows')}
            </span>
          ) : null}
          <p className="text-lg leading-relaxed text-pretty">{t(`pages.${page}.text`)}</p>
        </Card>
        <div>
          <Button asChild variant="secondary">
            <Link to="/">
              <ArrowLeft />
              {t('pages.back')}
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
