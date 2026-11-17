import { ArrowLeft } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Crest, Lozenge, Ridge, Wordmark } from '~/components/brand';
import { LanguageSwitch, ThemeToggle } from '~/components/controls';
import { VersionPill } from '~/components/whats-new';
import { MM_NAMESPACE } from '~/i18n';

/**
 * Frame for everything before the panel itself (sign in, setup, "not in the team"): the forest band with the
 * crest on the left (on phones a strip on top), the form on the right.
 */
export function AuthFrame({ children }: { readonly children: ReactNode }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]">
      <aside className="band relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Wordmark tag={t('brand.panelTag')} />
        <div className="relative z-10 grid max-w-[30rem] gap-5">
          <Crest className="size-16" />
          <p className="font-display text-[3.2rem] font-semibold leading-[1.02] tracking-[-0.02em] text-band-foreground">
            {t('login.title')}
          </p>
          <p className="text-lg leading-relaxed text-band-muted">{t('brand.tagline')}</p>
        </div>
        <div className="h-24" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-44 text-[#1c4a37] dark:text-[#12301f]">
          <Ridge />
        </div>
        <Lozenge className="absolute inset-y-0 right-0 h-full w-1.5" />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="band relative flex items-center justify-between px-4 py-4 lg:hidden">
          <Wordmark tag={t('brand.panelTag')} crestClassName="size-8" />
          <Lozenge className="absolute inset-x-0 bottom-0" />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="mm-rise w-full max-w-[420px]">{children}</div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-4 sm:px-8">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('login.home')}
          </a>
          {/* The installed version, like on every panel page and the website (before signing in: the players' list). */}
          <VersionPill look="panel" />
          <div className="flex items-center gap-1.5">
            <LanguageSwitch tone="plain" />
            <ThemeToggle />
          </div>
        </footer>
      </div>
    </div>
  );
}

/** The error box under a form. */
export function FormError({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p
      role="alert"
      className="rounded-[12px] border border-destructive/20 bg-destructive-soft px-3.5 py-2.5 text-sm text-foreground"
    >
      {children}
    </p>
  );
}
