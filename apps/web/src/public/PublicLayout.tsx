import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  BarChart3,
  Check,
  Copy,
  Gamepad2,
  House,
  LifeBuoy,
  LogIn,
  Menu,
  MessagesSquare,
  Moon,
  Newspaper,
  Play,
  ScrollText,
  Sun,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Crest } from '~/components/brand';
import { useCopy } from '~/components/controls';
import { chooseLanguage, MM_NAMESPACE, SUPPORTED_LANGUAGES } from '~/i18n';
import { cn } from '~/lib/cn';
import { useSite } from '~/lib/site';
import { useNetworkStatus } from '~/lib/status';
import { useLanguage } from '~/lib/text';
import { useTheme } from '~/lib/theme';
import { GameButton, LiveDot } from './kit';
import {
  APPLY_PAGE,
  EXTERNAL,
  FALLBACK_ADDRESS,
  JOIN_LINK,
  PANEL_PAGE,
  setSocials,
  SOCIAL_ICON,
  useOnlineText,
  useScrolled,
  WRAP,
} from './parts';
import { IS_DEMO } from './site-mode';

/** After this many pixels the see-through header turns solid. */
const SOLID_AFTER = 24;

interface NavItem {
  readonly to: string;
  readonly key: string;
  readonly icon: LucideIcon;
  /** Further paths that belong to this entry (a player's profile belongs to the statistics). */
  readonly also?: readonly string[];
}

const NAV: readonly NavItem[] = [
  { to: '/', key: 'nav.start', icon: House },
  { to: '/news', key: 'nav.news', icon: Newspaper },
  { to: '/spielmodi', key: 'nav.modes', icon: Gamepad2, also: ['/mornicraft'] },
  { to: '/statistiken', key: 'nav.stats', icon: BarChart3, also: ['/spieler'] },
  { to: '/team', key: 'nav.team', icon: Users },
  { to: '/regeln', key: 'nav.rules', icon: ScrollText },
  { to: '/hilfe', key: 'nav.help', icon: LifeBuoy },
];

const HOME = '/';

function isCurrent(item: NavItem, path: string): boolean {
  if (item.to === HOME) return path === HOME;
  return [item.to, ...(item.also ?? [])].some((base) => path === base || path.startsWith(`${base}/`));
}

/** The address as a small button: a click copies it. */
function AddressChip({ className }: { readonly className?: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const address = status.data?.javaAddress ?? FALLBACK_ADDRESS;
  const { copied, copy } = useCopy(address);
  return (
    <button
      type="button"
      onClick={copy}
      title={t('site.server.copyHint')}
      aria-label={t('site.server.copyLabel', { address })}
      className={cn(
        'group inline-flex h-8 cursor-pointer items-center gap-2 rounded-[4px] border border-white/15 bg-black/30 px-2.5 font-pixel text-[13px] font-semibold text-band-foreground transition-colors hover:border-gold-bright/60 hover:bg-black/45',
        className,
      )}
    >
      <span className="inline-grid [grid-template-areas:'cell']">
        <span className={cn('inline-flex items-center gap-1.5 [grid-area:cell]', copied && 'invisible')}>
          <Copy className="size-3.5 text-band-muted group-hover:text-gold-bright" aria-hidden />
          {address}
        </span>
        <span
          className={cn(
            'inline-flex items-center justify-center gap-1.5 text-gold-bright [grid-area:cell]',
            !copied && 'invisible',
          )}
          aria-live="polite"
        >
          <Check className="size-3.5" aria-hidden />
          {copied ? t('copy.done') : null}
        </span>
      </span>
    </button>
  );
}

/** "● 87 Spieler online"; `announce` reads changes aloud (only once per page, in the hero). */
export function OnlineLine({
  className,
  announce = false,
}: {
  readonly className?: string;
  readonly announce?: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const online = useOnlineText();
  return (
    <span
      className={cn('inline-flex items-center gap-2 font-semibold text-band-foreground', className)}
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
      title={t('site.server.refresh')}
    >
      <LiveDot live={online.live} />
      <span className="tabular">{online.text}</span>
    </span>
  );
}

/** DE | EN as a two-part pixel switch. */
function LanguageToggle({ className }: { readonly className?: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cn('inline-flex rounded-[4px] border border-white/15 bg-black/30 p-0.5', className)}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={language === lang}
          title={t(`language.${lang}`)}
          onClick={() => chooseLanguage(lang)}
          className={cn(
            'cursor-pointer rounded-[3px] px-2.5 py-1 font-pixel text-[12px] font-bold uppercase tracking-[0.08em] transition-colors',
            language === lang
              ? 'bg-gold-bright text-[#2a1b00]'
              : 'text-band-muted hover:text-band-foreground',
          )}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}

function ThemeButton({ className }: { readonly className?: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { resolved, toggle } = useTheme();
  const label = resolved === 'dark' ? t('theme.toLight') : t('theme.toDark');
  const Icon = resolved === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 cursor-pointer place-items-center rounded-[4px] border border-white/15 bg-black/30 text-band-muted transition-colors hover:text-gold-bright',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function PanelLink({ className }: { readonly className?: string }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  // The demo has no panel behind it.
  if (IS_DEMO) return null;
  return (
    <a
      href={PANEL_PAGE}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2 font-pixel text-[13px] font-semibold text-band-muted transition-colors hover:text-band-foreground',
        className,
      )}
      title={t('site.panelHint')}
    >
      <LogIn className="size-3.5" aria-hidden />
      {t('nav.panel')}
    </a>
  );
}

function DiscordLink({ className }: { readonly className?: string }): ReactElement | null {
  const invite = useSite().data?.discordInvite;
  if (!invite) return null;
  return (
    <a
      href={invite}
      {...EXTERNAL}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2 font-pixel text-[13px] font-semibold text-band-muted transition-colors hover:text-band-foreground',
        className,
      )}
    >
      <MessagesSquare className="size-3.5" aria-hidden />
      Discord
    </a>
  );
}

/** Crest + "MoinMorni" as a small game title. */
function Logo({ className }: { readonly className?: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Link
      to={HOME}
      className={cn('inline-flex shrink-0 items-center gap-2.5 rounded-[6px]', className)}
      aria-label={t('site.home')}
    >
      <Crest className="size-9 drop-shadow-[0_3px_0_rgba(0,0,0,0.35)] lg:size-10" />
      <span className="mm-wordmark mm-wordmark-small font-pixel text-[1.55rem] font-bold leading-none tracking-[0.01em] lg:text-[1.75rem]">
        MoinMorni
      </span>
    </Link>
  );
}

function MainNav(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { pathname } = useLocation();
  return (
    <nav className="ml-4 hidden self-stretch lg:flex xl:ml-8" aria-label={t('nav.main')}>
      {NAV.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          aria-current={isCurrent(item, pathname) ? 'page' : undefined}
          className="mm-nav-link inline-flex items-center px-3 font-pixel text-[15px] font-semibold uppercase tracking-[0.06em] text-band-muted transition-colors hover:text-band-foreground aria-[current=page]:text-band-foreground xl:px-3.5"
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}

function MobileMenu(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { pathname } = useLocation();
  const site = useSite();
  const invite = site.data?.discordInvite;
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <GameButton tone="stone" size="icon" aria-label={t('nav.menu')} className="mm-on-dark lg:hidden">
          <Menu />
        </GameButton>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="mm-on-dark fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col overflow-y-auto bg-band text-band-foreground shadow-[-6px_0_0_rgba(0,0,0,0.3)] data-[state=open]:animate-in data-[state=open]:slide-in-from-right-8">
          <div className="mm-noise pointer-events-none absolute inset-0 opacity-60" aria-hidden />
          <DialogPrimitive.Title className="sr-only">{t('nav.main')}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t('brand.tagline')}</DialogPrimitive.Description>
          <div className="relative flex h-16 shrink-0 items-center justify-between border-b-2 border-black/30 px-4">
            <Logo />
            <DialogPrimitive.Close asChild>
              <GameButton tone="stone" size="icon" aria-label={t('nav.close')}>
                <X />
              </GameButton>
            </DialogPrimitive.Close>
          </div>
          <div className="relative grid gap-5 px-4 pb-8 pt-5">
            <div className="grid gap-2 rounded-[8px] border-2 border-black/30 bg-black/25 p-3">
              <OnlineLine className="text-[14px]" />
              <AddressChip className="h-10 justify-center text-[15px]" />
            </div>
            <nav className="grid gap-1" aria-label={t('nav.main')}>
              {NAV.map((item) => {
                const current = isCurrent(item, pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    onClick={close}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-[6px] border-2 border-transparent px-3 py-2.5 font-pixel text-[19px] font-semibold uppercase tracking-[0.04em] text-band-muted transition-colors hover:bg-white/[0.06] hover:text-band-foreground',
                      current && 'border-gold-bright/50 bg-white/[0.07] text-band-foreground',
                    )}
                  >
                    <Icon className={cn('size-5', current ? 'text-gold-bright' : 'opacity-75')} aria-hidden />
                    {t(item.key)}
                  </Link>
                );
              })}
            </nav>
            <div className="grid gap-3">
              <GameButton asChild size="lg">
                <Link to={JOIN_LINK} onClick={close}>
                  <Play />
                  {t('site.playNow')}
                </Link>
              </GameButton>
              {invite ? (
                <GameButton asChild tone="blue" size="lg">
                  <a href={invite} {...EXTERNAL}>
                    <MessagesSquare />
                    Discord
                  </a>
                </GameButton>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-black/30 pt-4">
              <LanguageToggle />
              <div className="flex items-center gap-1">
                <ThemeButton />
                <PanelLink />
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Header(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const scrolled = useScrolled(SOLID_AFTER);
  return (
    <header
      className={cn(
        'mm-on-dark fixed inset-x-0 top-0 z-40 text-band-foreground transition-[background-color,box-shadow] duration-300',
        scrolled
          ? 'bg-band/95 shadow-[0_4px_0_rgba(0,0,0,0.28)] backdrop-blur-md'
          : 'bg-gradient-to-b from-black/60 via-black/25 to-transparent',
      )}
    >
      <div
        className={cn(
          'hidden overflow-hidden border-b border-white/10 transition-[height,opacity] duration-300 lg:block',
          scrolled ? 'h-0 opacity-0' : 'h-9 opacity-100',
        )}
        inert={scrolled}
      >
        <div className={cn(WRAP, 'flex h-9 items-center justify-between gap-4 text-[13px]')}>
          <div className="flex items-center gap-3">
            <OnlineLine />
            <span className="text-band-muted/60" aria-hidden>
              ·
            </span>
            <AddressChip className="h-7" />
          </div>
          <div className="flex items-center gap-1.5">
            <DiscordLink />
            <PanelLink />
            <LanguageToggle className="ml-1" />
            <ThemeButton className="size-7" />
          </div>
        </div>
      </div>
      <div className={cn(WRAP, 'flex h-16 items-center gap-2 lg:h-[68px]')}>
        <Logo />
        <MainNav />
        <div className="ml-auto flex items-center gap-2">
          <GameButton asChild size="sm" className="hidden h-10 px-4 text-[14px] lg:inline-flex">
            <Link to={JOIN_LINK}>
              <Play />
              {t('site.playNow')}
            </Link>
          </GameButton>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

interface FooterLink {
  readonly to: string;
  readonly key: string;
  /** Outside the website's router (the panel). */
  readonly page?: boolean;
}

const FOOTER_COLUMNS: readonly { readonly key: string; readonly links: readonly FooterLink[] }[] = [
  {
    key: 'site.footer.network',
    links: [
      { to: HOME, key: 'nav.start' },
      { to: '/news', key: 'nav.news' },
      { to: '/spielmodi', key: 'nav.modes' },
      { to: '/statistiken', key: 'nav.stats' },
      { to: '/team', key: 'nav.team' },
    ],
  },
  {
    key: 'site.footer.help',
    links: [
      { to: JOIN_LINK, key: 'site.help.join.title' },
      { to: '/hilfe#sprachchat', key: 'site.help.voice.title' },
      { to: '/hilfe#discord', key: 'site.help.discord.title' },
      { to: APPLY_PAGE, key: 'site.help.mornicraft.title' },
      { to: '/hilfe#befehle', key: 'site.help.commands.title' },
      { to: '/regeln', key: 'nav.rules' },
    ],
  },
  {
    key: 'site.footer.legal',
    links: [
      { to: '/impressum', key: 'pages.imprint.title' },
      { to: '/datenschutz', key: 'pages.privacy.title' },
      ...(IS_DEMO ? [] : [{ to: PANEL_PAGE, key: 'site.footer.panel', page: true }]),
    ],
  },
];

const FOOTER_LINK = 'text-band-muted transition-colors hover:text-gold-bright';
const SOCIAL_BUTTON =
  'grid size-10 place-items-center rounded-[6px] border-2 border-black/30 bg-white/[0.06] text-band-muted shadow-[inset_0_2px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-white/[0.12] hover:text-band-foreground';

function Footer(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const socials = setSocials(site.data);
  const invite = site.data?.discordInvite;
  const year = new Date().getFullYear();
  return (
    <footer className="mm-on-dark relative bg-band text-band-foreground">
      <div className="mm-noise pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="mm-rauten relative h-2 opacity-90" aria-hidden />
      <div className={cn(WRAP, 'relative grid gap-12 pb-12 pt-14 lg:grid-cols-[1.25fr_2fr]')}>
        <div className="grid content-start gap-5">
          <Logo />
          <p className="max-w-[44ch] text-[15px] leading-relaxed text-band-muted">{t('footer.about')}</p>
          <div className="grid max-w-[360px] gap-2 rounded-[8px] border-2 border-black/30 bg-black/25 p-3">
            <OnlineLine className="text-[14px]" />
            <AddressChip className="h-9 justify-center text-[14px]" />
          </div>
          {socials.length || invite ? (
            <ul className="flex flex-wrap gap-2" aria-label={t('site.footer.follow')}>
              {invite ? (
                <li>
                  <a
                    href={invite}
                    {...EXTERNAL}
                    aria-label="Discord"
                    title="Discord"
                    className={SOCIAL_BUTTON}
                  >
                    <MessagesSquare className="size-[18px]" aria-hidden />
                  </a>
                </li>
              ) : null}
              {socials.map(([key, url]) => {
                const Icon = SOCIAL_ICON[key];
                return (
                  <li key={key}>
                    <a
                      href={url}
                      {...EXTERNAL}
                      aria-label={t(`site.social.${key}`)}
                      title={t(`site.social.${key}`)}
                      className={SOCIAL_BUTTON}
                    >
                      <Icon className="size-[18px]" aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.key} className="grid content-start gap-3.5" aria-label={t(column.key)}>
              <p className="font-pixel text-[15px] font-bold uppercase tracking-[0.1em] text-gold-bright">
                {t(column.key)}
              </p>
              <ul className="grid gap-2.5 text-[15px]">
                {column.links.map((link) => (
                  <li key={link.to}>
                    {link.page ? (
                      <a href={link.to} className={FOOTER_LINK}>
                        {t(link.key)}
                      </a>
                    ) : (
                      <Link to={link.to} className={FOOTER_LINK}>
                        {t(link.key)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="relative border-t-2 border-black/30">
        <div
          className={cn(
            WRAP,
            'flex flex-col gap-4 py-5 text-[13px] text-band-muted md:flex-row md:items-center md:justify-between',
          )}
        >
          <div className="grid gap-1">
            <span className="font-pixel text-[14px] font-semibold text-band-foreground">
              © {year} MoinMorni
            </span>
            <span>{t('footer.disclaimer')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeButton />
          </div>
        </div>
      </div>
    </footer>
  );
}

const MAIN_ID = 'inhalt';

/** Jumps past the header; moves focus itself, so it also works with the demo's hash addresses. */
function SkipLink(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const skip = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    const main = document.getElementById(MAIN_ID);
    main?.focus();
    main?.scrollIntoView();
  };
  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={skip}
      className="sr-only z-[60] rounded-[6px] bg-gold-bright px-4 py-2 font-pixel font-bold text-[#2a1b00] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      {t('nav.skip')}
    </a>
  );
}

export function PublicLayout(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SkipLink />
      <Header />
      <main id={MAIN_ID} tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
