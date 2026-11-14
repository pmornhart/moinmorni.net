import { ArrowLeft, Hourglass } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Lozenge } from '~/components/brand';
import { Button, Card } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';

/** A simple page whose content follows later (rules, team, imprint, privacy) – or the "not found" page. */
export function InfoPage({
  page,
  follows = true,
}: {
  readonly page: string;
  readonly follows?: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <>
      <section className="band relative">
        <div className="mx-auto grid max-w-[860px] gap-3 px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-16">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">MoinMorni</p>
          <h1 className="font-display text-[clamp(2.2rem,6vw,3.4rem)] font-semibold leading-[1.05] text-band-foreground">
            {t(`pages.${page}.title`)}
          </h1>
        </div>
        <Lozenge className="absolute inset-x-0 bottom-0" />
      </section>
      <div className="mx-auto grid max-w-[860px] gap-6 px-4 py-12 sm:px-6 sm:py-16">
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
