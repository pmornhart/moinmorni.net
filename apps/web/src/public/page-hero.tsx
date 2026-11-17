import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cn } from '~/lib/cn';
import { modeArt, sceneImage, type Scene } from './art';
import { Eyebrow, PixelEdge } from './kit';
import { useDayTime, useHeroUnderHeader, usePageTitle, WRAP } from './parts';

/**
 * The top of every sub page: one of our village renders behind a dark veil, a pixel title, and optionally a mode's
 * figure standing on the stepped edge to the page below.
 */
export function PageHero({
  eyebrow,
  title,
  text,
  scene,
  figure,
  tint,
  children,
  aside,
  titleClassName,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly text?: string;
  readonly scene: Scene;
  /** Id of a game mode whose figure stands on the right. */
  readonly figure?: string;
  /** A colour that washes over the picture from the left (a mode's colour). */
  readonly tint?: string;
  /** Below the text (filters, search, chips). */
  readonly children?: ReactNode;
  /** On the right instead of a figure (wide screens). */
  readonly aside?: ReactNode;
  readonly titleClassName?: string;
}): ReactElement {
  usePageTitle(title);
  useHeroUnderHeader();
  const time = useDayTime();
  const figureSrc = figure ? modeArt(figure).figure : null;
  const tintStyle: CSSProperties | undefined = tint
    ? { backgroundImage: `linear-gradient(90deg, ${tint} 0%, transparent 70%)` }
    : undefined;
  const side = Boolean(figureSrc ?? aside);
  return (
    <section className="mm-on-dark relative isolate overflow-hidden bg-band text-white">
      <img
        src={sceneImage(scene, time)}
        alt=""
        fetchPriority="high"
        className="mm-settle absolute inset-0 -z-30 size-full object-cover"
      />
      <div className="mm-page-shade absolute inset-0 -z-20" aria-hidden />
      {tintStyle ? (
        <div
          className="absolute inset-0 -z-10 opacity-45 mix-blend-soft-light"
          style={tintStyle}
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          WRAP,
          'relative grid min-h-[340px] items-end gap-8 pb-14 pt-[calc(var(--header-h)+36px)] sm:min-h-[400px] sm:pb-16 lg:pt-[calc(var(--header-h)+48px)]',
          side && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]',
        )}
      >
        <div className="mm-rise grid content-end justify-items-start gap-4">
          {eyebrow ? (
            <Eyebrow className="text-gold-bright [text-shadow:0_2px_0_rgba(0,0,0,0.6)]">{eyebrow}</Eyebrow>
          ) : null}
          <h1
            className={cn(
              'font-pixel text-[clamp(2.5rem,7.4vw,4.6rem)] font-bold leading-[0.95] tracking-[0.005em] text-white text-balance [overflow-wrap:anywhere] [text-shadow:0_4px_0_rgba(0,0,0,0.45)]',
              titleClassName,
            )}
          >
            {title}
          </h1>
          {text ? (
            <p className="max-w-[60ch] text-[1.05rem] leading-relaxed text-white/85 text-pretty [text-shadow:0_2px_12px_rgba(0,0,0,0.6)] sm:text-[1.15rem]">
              {text}
            </p>
          ) : null}
          {children}
        </div>
        {figureSrc ? (
          <div className="relative hidden h-full min-h-[300px] lg:block" aria-hidden>
            <img
              src={figureSrc}
              alt=""
              className="mm-bob absolute -bottom-16 left-1/2 h-[380px] max-w-none -translate-x-1/2 drop-shadow-[0_16px_20px_rgba(0,0,0,0.55)]"
            />
          </div>
        ) : null}
        {!figureSrc && aside ? <div className="hidden lg:block">{aside}</div> : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-0">
        <PixelEdge className="text-background" />
      </div>
    </section>
  );
}
