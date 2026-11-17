import { Camera, Clapperboard, Music2, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { SOCIALS, type SiteInfo, type Social } from '~/lib/site';
import { useNetworkStatus } from '~/lib/status';
import { paragraphs } from '~/lib/text';
import { useTheme } from '~/lib/theme';
import { timeOf, type DayTime } from './art';

/** Width and side gutters of every section on the website. */
export const WRAP = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6';

/** Shown until the status arrives (and when it cannot be fetched): the real address of the network. */
export const FALLBACK_ADDRESS = 'moinmorni.net';
export const FALLBACK_BEDROCK_PORT = 19132;
/** "Jetzt spielen" leads to the help on how to join. */
export const JOIN_LINK = '/hilfe#reinkommen';
export const APPLY_PAGE = '/mornicraft/bewerben';
/** The team's panel lives outside the website's router. */
export const PANEL_PAGE = '/panel';

const SITE_NAME = 'MoinMorni';

/** "News · MoinMorni" in the browser tab; the start page keeps the full title from index.html. */
export function usePageTitle(title?: string): void {
  useEffect(() => {
    const before = document.title;
    if (title) document.title = `${title} · ${SITE_NAME}`;
    return () => {
      document.title = before;
    };
  }, [title]);
}

/** Day pictures in the light design, night pictures in the dark one. */
export function useDayTime(): DayTime {
  return timeOf(useTheme().resolved);
}

/**
 * Pictures behind the see-through header (the hero of a page). A page without one – a "not found" page, a page still
 * loading – starts with a light background: there the white menu would be unreadable, so the header is solid right away.
 */
let heroes = 0;
const heroListeners = new Set<() => void>();
const heroChanged = (): void => heroListeners.forEach((l) => l());
const watchHeroes = (listener: () => void): (() => void) => {
  heroListeners.add(listener);
  return () => heroListeners.delete(listener);
};

/** A hero calls this: while it is on the page, the header may stay see-through at the top. */
export function useHeroUnderHeader(): void {
  // Before the first paint, so the header never flashes solid on a page with a picture.
  useLayoutEffect(() => {
    heroes += 1;
    heroChanged();
    return () => {
      heroes -= 1;
      heroChanged();
    };
  }, []);
}

/** For a hero drawn inline (news article): put this inside it. */
export function HeroUnderHeader(): null {
  useHeroUnderHeader();
  return null;
}

/** Is a hero behind the header right now? */
export function useHeroShown(): boolean {
  return useSyncExternalStore(
    watchHeroes,
    () => heroes > 0,
    () => false,
  );
}

/** True once the page is scrolled further than `threshold` pixels (the header turns solid). */
export function useScrolled(threshold: number): boolean {
  const [scrolled, setScrolled] = useState(() => window.scrollY > threshold);
  useEffect(() => {
    const check = (): void => setScrolled(window.scrollY > threshold);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [threshold]);
  return scrolled;
}

/** "87 Spieler online" from the live status (asked every 15 seconds). */
export function useOnlineText(): { readonly live: boolean; readonly text: string } {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  if (status.isError) return { live: false, text: t('site.hero.statusError') };
  if (!status.data) return { live: false, text: t('site.hero.statusLoading') };
  if (!status.data.online) return { live: false, text: t('site.hero.offline') };
  return { live: true, text: t('site.hero.online', { count: status.data.players }) };
}

/** Characters of a paragraph in its React key. */
const KEY_CHARS = 16;

/** A plain text as paragraphs – text only, never HTML. */
export function Paragraphs({
  text,
  className,
}: {
  readonly text: string;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn('grid gap-4', className)}>
      {paragraphs(text).map((line, i) => (
        // Paragraphs may repeat word for word; their place is their identity.
        <p key={`${i}-${line.slice(0, KEY_CHARS)}`}>{line}</p>
      ))}
    </div>
  );
}

/** The first paragraph of a text (cards cut it after a few lines). */
export function teaser(body: string): string {
  return paragraphs(body)[0] ?? '';
}

/** Own neutral symbols for the social channels – no logos of other brands. */
export const SOCIAL_ICON: Readonly<Record<Social, LucideIcon>> = {
  youtube: Clapperboard,
  tiktok: Music2,
  instagram: Camera,
};

/** The channels that are set, in a fixed order. */
export function setSocials(site: SiteInfo | undefined): readonly (readonly [Social, string])[] {
  return SOCIALS.flatMap((s) => {
    const url = site?.socials[s];
    return url ? [[s, url] as const] : [];
  });
}

/** Opens another site in a new tab without handing it this page. */
export const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;
