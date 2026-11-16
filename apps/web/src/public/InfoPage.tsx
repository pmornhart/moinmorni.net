import { ArrowLeft, Hourglass } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { NETWORK_TITLE } from '@morninet/shared';
import { Link } from 'react-router';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { GROUP_IMAGE, type Scene } from './art';
import { GameButton, Panel } from './kit';
import { PageHero } from './page-hero';
import { WRAP } from './parts';

type InfoKind = 'imprint' | 'privacy' | 'notFound';

const SCENE_OF: Readonly<Record<InfoKind, Scene>> = {
  imprint: 'dorfplatz',
  privacy: 'dorfplatz',
  notFound: 'karte',
};

/** A simple page whose content follows later (imprint, privacy) – or the "not found" page. */
export function InfoPage({
  page,
  follows = true,
}: {
  readonly page: InfoKind;
  readonly follows?: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const lost = page === 'notFound';
  return (
    <>
      <PageHero eyebrow={NETWORK_TITLE} title={t(`pages.${page}.title`)} scene={SCENE_OF[page]} />
      <div className={cn(WRAP, 'grid max-w-[880px] gap-6 py-14 sm:py-16')}>
        <Panel className="grid gap-4 p-6 sm:p-8">
          {follows ? (
            <span className="inline-flex items-center gap-2 font-pixel text-[14px] font-semibold uppercase tracking-[0.12em] text-gold">
              <Hourglass className="size-4" aria-hidden />
              {t('pages.follows')}
            </span>
          ) : null}
          <p className="text-[1.15rem] leading-relaxed text-pretty">{t(`pages.${page}.text`)}</p>
          {lost ? (
            <img
              src={GROUP_IMAGE}
              alt={t('pages.notFound.figures')}
              loading="lazy"
              className="mx-auto mt-2 w-full max-w-[640px] drop-shadow-[0_10px_12px_rgba(0,0,0,0.3)]"
            />
          ) : null}
        </Panel>
        <div>
          <GameButton asChild tone={lost ? 'gold' : 'stone'}>
            <Link to="/">
              <ArrowLeft />
              {t('pages.back')}
            </Link>
          </GameButton>
        </div>
      </div>
    </>
  );
}
