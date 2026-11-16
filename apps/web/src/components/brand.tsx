/* eslint-disable ts-patterns/no-magic-numbers -- drawing coordinates of the crest */
import type { ReactElement } from 'react';
import { cn } from '~/lib/cn';

/** MoinMorni's crest: a forest-green shield with a golden castle (own drawing, also the favicon). */
export function Crest({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-9 shrink-0', className)} aria-hidden>
      <path
        d="M16 1.5 28.5 5.6V15c0 7.6-5.3 12.9-12.5 15.5C8.8 27.9 3.5 22.6 3.5 15V5.6Z"
        fill="#0f2a20"
        stroke="rgba(231,187,77,0.55)"
        strokeWidth="0.6"
      />
      <path d="M16 3.4 26.6 6.9V15c0 6.5-4.4 11.1-10.6 13.4C9.8 26.1 5.4 21.5 5.4 15V6.9Z" fill="#059669" />
      <path
        d="M8 23V11h1.5v1.5h1V11H12v4h1V8h1.5v1.5h.75V8h1.5v1.5h.75V8H19v7h1v-4h1.5v1.5h1V11H24v12Z"
        fill="#e7bb4d"
      />
      <path d="M14.2 23v-3.4a1.8 1.8 0 0 1 3.6 0V23Z" fill="#0f2a20" />
    </svg>
  );
}

/** Crest + "MoinMorni" in the display face; `tag` adds a small gold word (e.g. "Panel"). */
export function Wordmark({
  tag,
  className,
  crestClassName,
}: {
  readonly tag?: string;
  readonly className?: string;
  readonly crestClassName?: string;
}): ReactElement {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Crest className={crestClassName} />
      <span className="font-display text-[1.35rem] font-semibold leading-none tracking-[-0.01em]">
        MoinMorni
      </span>
      {tag ? (
        <span className="rounded-full border border-gold/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
          {tag}
        </span>
      ) : null}
    </span>
  );
}

/** The thin white-blue lozenge stripe. */
export function Lozenge({ className }: { readonly className?: string }): ReactElement {
  return <div className={cn('lozenge h-1.5 w-full opacity-90', className)} aria-hidden />;
}

/**
 * Alpine ridge with a castle on the right, drawn as a silhouette for the bottom of a band. Colours come from
 * currentColor in two opacities.
 */
export function Ridge({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 1440 220"
      preserveAspectRatio="xMaxYMax slice"
      className={cn('pointer-events-none block h-full w-full', className)}
      aria-hidden
    >
      <path
        d="M0 170 L120 110 L190 140 L300 60 L380 120 L470 80 L560 140 L650 95 L760 150 L860 70 L940 120 L1030 90 L1120 140 L1230 100 L1330 150 L1440 110 V220 H0Z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M0 200 L140 160 L260 185 L400 140 L520 180 L640 150 L780 190 L900 160 L1010 180 L1060 172 V150 h10 v-8 h8 v8 h10 v-30 h8 v-10 h6 v10 h8 v-10 h6 v10 h8 v30 h10 v-8 h8 v8 h10 v22 L1240 175 L1340 190 L1440 165 V220 H0Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}
