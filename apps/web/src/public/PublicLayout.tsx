import { Dialog as DialogPrimitive } from 'radix-ui';
import { Menu, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { Lozenge, Wordmark } from '~/components/brand';
import { LanguageSwitch, ThemeToggle } from '~/components/controls';
import { Button } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';

interface NavItem {
  readonly to: string;
  readonly key: string;
  /** Only active on exactly this path (the start page). */
  readonly end?: boolean;
}

const NAV: readonly NavItem[] = [
  { to: '/', key: 'nav.start', end: true },
  { to: '/#modi', key: 'nav.modes' },
  { to: '/regeln', key: 'nav.rules' },
  { to: '/team', key: 'nav.team' },
];

const LINK =
  'rounded-full px-3.5 py-2 text-sm font-semibold text-band-muted transition-colors hover:bg-white/[0.07] hover:text-band-foreground';

function NavLinks({
  onNavigate,
  stacked = false,
}: {
  readonly onNavigate?: () => void;
  readonly stacked?: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <>
      {NAV.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              LINK,
              stacked && 'rounded-[12px] px-4 py-3 text-base',
              isActive && item.end && 'text-band-foreground',
            )
          }
        >
          {t(item.key)}
        </NavLink>
      ))}
    </>
  );
}

function MobileMenu(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="bandGhost" size="icon" aria-label={t('nav.menu')} className="md:hidden">
          <Menu />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="band fixed inset-x-0 top-0 z-50 grid gap-4 rounded-b-[24px] px-4 pb-6 pt-4 shadow-float data-[state=open]:animate-in data-[state=open]:slide-in-from-top-4">
          <DialogPrimitive.Title className="sr-only">{t('nav.main')}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t('brand.tagline')}</DialogPrimitive.Description>
          <div className="flex items-center justify-between">
            <Wordmark className="text-band-foreground" crestClassName="size-8" />
            <DialogPrimitive.Close asChild>
              <Button variant="bandGhost" size="icon" aria-label={t('nav.close')}>
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <nav className="grid gap-1" aria-label={t('nav.main')}>
            <NavLinks stacked onNavigate={() => setOpen(false)} />
          </nav>
          <Button asChild variant="gold" size="lg">
            <a href="/panel">{t('nav.panel')}</a>
          </Button>
          <div className="flex items-center justify-between border-t border-band-line pt-4">
            <LanguageSwitch />
            <ThemeToggle variant="bandGhost" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Header(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <header className="sticky top-0 z-30 border-b border-band-line bg-band text-band-foreground">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="rounded-[10px] text-band-foreground" aria-label="MoinMorni">
          <Wordmark crestClassName="size-8" />
        </Link>
        <nav className="ml-auto hidden items-center gap-0.5 md:flex" aria-label={t('nav.main')}>
          <NavLinks />
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:ml-2">
          <ThemeToggle variant="bandGhost" className="hidden md:inline-flex" />
          <Button asChild variant="gold" size="sm" className="hidden px-4 md:inline-flex">
            <a href="/panel">{t('nav.panel')}</a>
          </Button>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

const FOOTER_LINKS: readonly { readonly to: string; readonly key: string }[] = [
  { to: '/regeln', key: 'pages.rules.title' },
  { to: '/team', key: 'pages.team.title' },
  { to: '/impressum', key: 'pages.imprint.title' },
  { to: '/datenschutz', key: 'pages.privacy.title' },
];

function Footer(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const year = new Date().getFullYear();
  return (
    <footer className="band relative mt-auto">
      <Lozenge className="absolute inset-x-0 top-0" />
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 pb-10 pt-14 sm:px-6 md:grid-cols-[1.4fr_1fr_auto]">
        <div className="grid content-start gap-3">
          <Wordmark crestClassName="size-8" />
          <p className="max-w-[46ch] text-sm leading-relaxed text-band-muted">{t('footer.about')}</p>
        </div>
        <nav className="grid content-start gap-2" aria-label={t('footer.links')}>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{t('footer.links')}</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-1">
            {FOOTER_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-band-muted transition-colors hover:text-band-foreground">
                  {t(link.key)}
                </Link>
              </li>
            ))}
            <li>
              <a href="/panel" className="text-band-muted transition-colors hover:text-band-foreground">
                {t('nav.panel')}
              </a>
            </li>
          </ul>
        </nav>
        <div className="grid content-start gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{t('language.label')}</p>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle variant="bandGhost" />
          </div>
        </div>
      </div>
      <div className="border-t border-band-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-1 px-4 py-5 text-xs text-band-muted/80 sm:flex-row sm:justify-between sm:px-6">
          <span>© {year} MoinMorni</span>
          <span>{t('footer.disclaimer')}</span>
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
      <Header />
      <main id="inhalt" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
