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
  Newspaper,
  Play,
  ScrollText,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Crest, Lozenge } from '~/components/brand';
import { LanguageSwitch, ThemeToggle, useCopy } from '~/components/controls';
import { Button } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useSite } from '~/lib/site';
import { useNetworkStatus } from '~/lib/status';
import { EXTERNAL, setSocials, SOCIAL_ICON, WRAP } from './parts';

/** Shown until the status arrives (and when it cannot be fetched): the real address of the network. */
export const FALLBACK_ADDRESS = 'moinmorni.net';
export const FALLBACK_BEDROCK_PORT = 19132;
export const JOIN_LINK = '/hilfe#reinkommen';

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
  { to: '/spielmodi', key: 'nav.modes', icon: Gamepad2 },
  { to: '/statistiken', key: 'nav.stats', icon: BarChart3, also: ['/spieler'] },
  { to: '/team', key: 'nav.team', icon: Users },
  { to: '/regeln', key: 'nav.rules', icon: ScrollText },
  { to: '/hilfe', key: 'nav.help', icon: LifeBuoy },
];

function isCurrent(item: NavItem, path: string): boolean {
  if (item.to === '/') return path === '/';
  return [item.to, ...(item.also ?? [])].some((base) => path === base || path.startsWith(`${base}/`));
}

/** The address and who is online, as a small bar: a click copies the address. */
function ServerChip({ className }: { readonly className?: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const address = status.data?.javaAddress ?? FALLBACK_ADDRESS;
  const { copied, copy } = useCopy(address);
  const online = status.data?.online === true;
  const players = status.data?.players;
  return (
    <button
      type="button"
      onClick={copy}
      title={t('site.server.copyHint')}
      aria-label={t('site.server.copyLabel', { address })}
      className={cn(
        'group inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-band-line bg-white/[0.06] pl-2.5 pr-1 text-[12px] font-semibold text-band-foreground transition-colors hover:bg-white/[0.11] sm:gap-2 sm:pl-3 sm:text-[13px]',
        className,
      )}
    >
      <span className="grid [grid-template-areas:'cell']">
        <span
          className={cn('inline-flex items-center gap-1.5 font-mono [grid-area:cell]', copied && 'invisible')}
        >
          <Copy
            className="hidden size-3.5 text-band-muted group-hover:text-band-foreground sm:block"
            aria-hidden
          />
          {address}
        </span>
        <span
          className={cn(
            'inline-flex items-center justify-center gap-1.5 text-gold [grid-area:cell]',
            !copied && 'invisible',
          )}
          aria-live="polite"
        >
          <Check className="size-3.5" aria-hidden />
          {copied ? t('copy.done') : null}
        </span>
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-2 py-1"
        title={t('site.server.refresh')}
      >
        <span
          className={cn('size-2 rounded-full', online ? 'mm-pulse bg-emerald-400' : 'bg-band-muted/50')}
          aria-hidden
        />
        <span className="tabular">{players ?? '–'}</span>
        <span className="sr-only sm:not-sr-only">{t('site.server.online')}</span>
      </span>
    </button>
  );
}

function Logo({ small = false }: { readonly small?: boolean }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Link
      to="/"
      className="inline-flex shrink-0 items-center gap-2.5 rounded-[12px] text-band-foreground"
      aria-label={t('site.home')}
    >
      <Crest className={small ? 'size-8' : 'size-8 md:size-11'} />
      <span className={cn('grid gap-0.5', !small && 'max-[379px]:sr-only')}>
        <span
          className={cn(
            'font-display font-semibold leading-none tracking-[-0.01em]',
            small ? 'text-[1.3rem]' : 'text-[1.15rem] md:text-[1.7rem]',
          )}
        >
          MoinMorni
        </span>
        {small ? null : (
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.22em] text-gold md:block">
            {t('site.tagline')}
          </span>
        )}
      </span>
    </Link>
  );
}

function DiscordButton({ className }: { readonly className?: string }): ReactElement | null {
  const site = useSite();
  const invite = site.data?.discordInvite;
  if (!invite) return null;
  return (
    <Button asChild variant="band" size="sm" className={className}>
      <a href={invite} {...EXTERNAL}>
        <MessagesSquare />
        Discord
      </a>
    </Button>
  );
}

function PanelLink({ className }: { readonly className?: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <a
      href="/panel"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold text-band-muted transition-colors hover:bg-white/[0.08] hover:text-band-foreground',
        className,
      )}
      title={t('site.panelHint')}
    >
      <LogIn className="size-3.5" aria-hidden />
      {t('nav.panel')}
    </a>
  );
}

function MobileMenu(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="bandGhost" size="icon" aria-label={t('nav.menu')} className="md:hidden">
          <Menu />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="band fixed inset-x-0 top-0 z-50 grid max-h-dvh gap-4 overflow-y-auto rounded-b-[24px] px-4 pb-6 pt-3 shadow-float data-[state=open]:animate-in data-[state=open]:slide-in-from-top-4">
          <DialogPrimitive.Title className="sr-only">{t('nav.main')}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t('brand.tagline')}</DialogPrimitive.Description>
          <div className="flex h-10 items-center justify-between">
            <Logo small />
            <DialogPrimitive.Close asChild>
              <Button variant="bandGhost" size="icon" aria-label={t('nav.close')}>
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <nav className="grid gap-0.5" aria-label={t('nav.main')}>
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
                    'flex items-center gap-3 rounded-[12px] px-3.5 py-3 text-base font-semibold text-band-muted transition-colors hover:bg-white/[0.07] hover:text-band-foreground',
                    current && 'bg-white/[0.09] text-band-foreground',
                  )}
                >
                  <Icon className={cn('size-5', current ? 'text-gold' : 'opacity-80')} aria-hidden />
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
          <div className="grid gap-2">
            <Button asChild variant="gold" size="lg">
              <Link to={JOIN_LINK} onClick={close}>
                <Play />
                {t('site.playNow')}
              </Link>
            </Button>
            <DiscordButton className="h-12 text-base" />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-band-line pt-4">
            <LanguageSwitch />
            <div className="flex items-center gap-1">
              <ThemeToggle variant="bandGhost" />
              <PanelLink />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TopBar(): ReactElement {
  return (
    <header className="band sticky top-0 z-40 border-b border-band-line md:static">
      <div className={cn(WRAP, 'flex h-16 items-center gap-1.5 md:h-[84px] md:gap-3')}>
        <Logo />
        <div className="ml-auto flex items-center gap-1 md:gap-2">
          <ServerChip />
          <DiscordButton className="hidden h-9 rounded-full px-3.5 lg:inline-flex" />
          <LanguageSwitch className="hidden lg:inline-flex" />
          <ThemeToggle variant="bandGhost" className="hidden size-9 md:inline-flex" />
          <PanelLink className="hidden md:inline-flex" />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

function MainNav(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { pathname } = useLocation();
  return (
    <nav
      className="sticky top-0 z-30 hidden border-b border-band-line bg-band-raised/95 text-band-foreground backdrop-blur-md md:block"
      aria-label={t('nav.main')}
    >
      <div className={cn(WRAP, 'flex h-[52px] items-stretch gap-0.5')}>
        {NAV.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            aria-current={isCurrent(item, pathname) ? 'page' : undefined}
            className="mm-nav-link inline-flex items-center px-3 text-[13px] font-extrabold uppercase tracking-[0.08em] text-band-muted transition-colors hover:text-band-foreground aria-[current=page]:text-band-foreground lg:px-3.5"
          >
            {t(item.key)}
          </Link>
        ))}
        <div className="ml-auto flex items-center">
          <Button asChild variant="gold" size="sm" className="rounded-full px-4">
            <Link to={JOIN_LINK}>
              <Play />
              {t('site.playNow')}
            </Link>
          </Button>
        </div>
      </div>
    </nav>
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
      { to: '/', key: 'nav.start' },
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
      { to: '/hilfe#befehle', key: 'site.help.commands.title' },
      { to: '/regeln', key: 'nav.rules' },
    ],
  },
  {
    key: 'site.footer.legal',
    links: [
      { to: '/impressum', key: 'pages.imprint.title' },
      { to: '/datenschutz', key: 'pages.privacy.title' },
      { to: '/panel', key: 'site.footer.panel', page: true },
    ],
  },
];

const FOOTER_LINK = 'text-band-muted transition-colors hover:text-band-foreground';

function Footer(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const socials = setSocials(site.data);
  const invite = site.data?.discordInvite;
  const year = new Date().getFullYear();
  return (
    <footer className="band relative mt-auto">
      <Lozenge className="absolute inset-x-0 top-0" />
      <div className={cn(WRAP, 'grid gap-10 pb-10 pt-14 md:grid-cols-[1.5fr_repeat(3,minmax(0,1fr))]')}>
        <div className="grid content-start gap-4">
          <Logo small />
          <p className="max-w-[42ch] text-sm leading-relaxed text-band-muted">{t('footer.about')}</p>
          {socials.length || invite ? (
            <ul className="flex flex-wrap gap-2" aria-label={t('site.footer.follow')}>
              {invite ? (
                <li>
                  <a
                    href={invite}
                    {...EXTERNAL}
                    aria-label="Discord"
                    title="Discord"
                    className="grid size-10 place-items-center rounded-[12px] border border-band-line bg-white/[0.05] text-band-muted transition-colors hover:bg-white/[0.1] hover:text-band-foreground"
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
                      className="grid size-10 place-items-center rounded-[12px] border border-band-line bg-white/[0.05] text-band-muted transition-colors hover:bg-white/[0.1] hover:text-band-foreground"
                    >
                      <Icon className="size-[18px]" aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-3">
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.key} className="grid content-start gap-3" aria-label={t(column.key)}>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{t(column.key)}</p>
              <ul className="grid gap-2 text-sm">
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
      <div className="border-t border-band-line">
        <div
          className={cn(
            WRAP,
            'flex flex-col gap-4 py-5 text-xs text-band-muted/85 md:flex-row md:items-center md:justify-between',
          )}
        >
          <div className="grid gap-1">
            <span>© {year} MoinMorni</span>
            <span>{t('footer.disclaimer')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle variant="bandGhost" />
          </div>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#inhalt"
        className="sr-only z-50 rounded-[10px] bg-card px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('nav.skip')}
      </a>
      <TopBar />
      <MainNav />
      <main id="inhalt" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
