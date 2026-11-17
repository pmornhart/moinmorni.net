import { ArrowLeft, Hourglass } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { shownModes, useNetworkStatus } from '~/lib/status';
import { GROUP_IMAGE, modeArt, type Scene } from './art';
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
      <PageHero eyebrow="MoinMorni" title={t(`pages.${page}.title`)} scene={SCENE_OF[page]} />
      <div className={cn(WRAP, 'grid max-w-[880px] gap-6 py-14 sm:py-16')}>
        <Panel className="grid gap-4 p-6 sm:p-8">
          {follows ? (
            <span className="inline-flex items-center gap-2 font-pixel text-[14px] font-semibold uppercase tracking-[0.12em] text-gold">
              <Hourglass className="size-4" aria-hidden />
              {t('pages.follows')}
            </span>
          ) : null}
          <p className="text-[1.15rem] leading-relaxed text-pretty">{t(`pages.${page}.text`)}</p>
          {lost ? <LostFigures /> : null}
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

/** The figures of all game modes there are right now (the group picture only shows the first seven). */
function LostFigures(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  // Winter Games and Summer Games share one place: only the one that is on.
  const modes = shownModes(useNetworkStatus().data);
  const figures = modes.map((m) => modeArt(m.id).figure).filter((f): f is string => Boolean(f));
  if (!figures.length) {
    return (
      <img
        src={GROUP_IMAGE}
        alt={t('pages.notFound.figuresSome')}
        loading="lazy"
        className="mx-auto mt-2 w-full max-w-[640px] drop-shadow-[0_10px_12px_rgba(0,0,0,0.3)]"
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={t('pages.notFound.figures', { count: figures.length })}
      className="mx-auto mt-2 flex w-full max-w-[720px] flex-wrap items-end justify-center gap-x-1 gap-y-3"
    >
      {figures.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          className="h-24 w-auto drop-shadow-[0_8px_10px_rgba(0,0,0,0.3)] sm:h-32"
        />
      ))}
    </div>
  );
}
