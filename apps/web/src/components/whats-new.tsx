import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ChangelogVersion, PublicChangelog } from '@moinmorni/shared';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { mmApi } from '~/lib/mm-api';
import { longDate } from '~/lib/time';
import { useLanguage } from '~/lib/text';
import { ChangeGroups } from './change-groups';

/**
 * The version at the bottom in the middle of website and panel ("v1.8.8"), like many apps show it. A click opens
 * "Was ist neu": every version with what is new, better, fixed or gone (apps/server/src/system/changelog.ts). A small
 * green dot says that a newer version is ready; in the panel, whoever may manage updates gets a link to them.
 */

/** Players see what they understand; the team (panel) sees every change (apps/server/src/system/changes.ts). */
export type ChangelogAudience = 'players' | 'team';
const CHANGELOG_URL: Readonly<Record<ChangelogAudience, string>> = {
  players: '/api/public/changelog',
  team: '/api/panel/changelog',
};
const MINUTE_MS = 60_000;
/** The installed version only changes with an update – look again every few minutes for "update ready". */
const REFRESH_MINUTES = 5;
const REFRESH_MS = REFRESH_MINUTES * MINUTE_MS;
/** Versions shown at first; "Ältere Versionen" shows this many more each time. */
const PAGE = 8;

export function useChangelog(audience: ChangelogAudience = 'players'): UseQueryResult<PublicChangelog> {
  return useQuery({
    queryKey: ['changelog', audience],
    queryFn: () => mmApi<PublicChangelog>(CHANGELOG_URL[audience]),
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    retry: 1,
  });
}

/** Where the pill sits: the panel (light/dark cards) or the website's dark footer (pixel look). */
export type WhatsNewLook = 'panel' | 'site';

const PILL: Readonly<Record<WhatsNewLook, string>> = {
  panel:
    'h-7 rounded-full border border-border bg-popover/85 px-3 text-[12px] font-semibold text-muted-foreground shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)] backdrop-blur-md hover:border-gold hover:text-foreground',
  site: 'h-8 rounded-[6px] border-2 border-black/30 bg-white/[0.06] px-3 font-pixel text-[16px] tracking-[0.04em] text-band-muted shadow-[inset_0_2px_0_rgba(255,255,255,0.08)] hover:bg-white/[0.12] hover:text-gold-bright',
};

const SHEET: Readonly<Record<WhatsNewLook, string>> = {
  panel: 'rounded-[20px] border border-border',
  site: 'rounded-[10px] border-2 border-black/40',
};

function UpdateDot(): ReactElement {
  return (
    <span className="relative grid size-2 place-items-center" aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-success" />
    </span>
  );
}

function VersionBlock({
  entry,
  installed,
}: {
  readonly entry: ChangelogVersion;
  readonly installed: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  return (
    <article className="grid gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="tabular font-display text-xl font-semibold leading-none">{entry.version}</h3>
        {installed ? (
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-success">
            {t('whatsNew.installed')}
          </span>
        ) : null}
        {entry.date ? (
          <time dateTime={entry.date} className="text-[13px] text-muted-foreground">
            {longDate(entry.date, language)}
          </time>
        ) : null}
      </header>
      {entry.items.length ? (
        <ChangeGroups
          look="compact"
          entries={entry.items.map((item, i) => ({ ...item, key: `${entry.sha}-${i}` }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('whatsNew.quiet')}</p>
      )}
      {entry.more ? (
        <p className="text-[13px] text-muted-foreground">{t('whatsNew.more', { count: entry.more })}</p>
      ) : null}
    </article>
  );
}

function UpdateNote({
  update,
  updatesTo,
  onNavigate,
}: {
  readonly update: PublicChangelog['update'];
  readonly updatesTo?: string;
  readonly onNavigate: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid gap-3 rounded-[12px] border border-success/40 bg-success-soft px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-1.5">
          <UpdateDot />
        </span>
        <p className="min-w-0 text-sm font-semibold text-foreground text-pretty">
          {update.version
            ? t('whatsNew.updateReady', { version: update.version })
            : t('whatsNew.updateReadyPlain')}
          <span className="block text-[13px] font-normal text-muted-foreground">
            {updatesTo ? t('whatsNew.updateTeam') : t('whatsNew.updateSoon')}
          </span>
        </p>
      </div>
      {updatesTo ? (
        <Link
          to={updatesTo}
          onClick={onNavigate}
          className="inline-flex h-8 items-center gap-1.5 justify-self-start rounded-[10px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover max-sm:ml-5"
        >
          {t('whatsNew.toUpdates')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The pill with the installed version and the "Was ist neu" window behind it. `updatesTo`: link to the update
 * settings (panel, only for whoever may manage updates).
 */
export function VersionPill({
  look,
  audience = 'players',
  updatesTo,
  className,
}: {
  readonly look: WhatsNewLook;
  /** `team`: the signed-in panel – every change, also a newer engine (needs a team login). */
  readonly audience?: ChangelogAudience;
  readonly updatesTo?: string;
  readonly className?: string;
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const changelog = useChangelog(audience);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const data = changelog.data;
  if (!data) return null;
  const ready = data.update.available;
  const versions = data.versions.slice(0, shown);
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setShown(PAGE);
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            'tabular inline-flex cursor-pointer items-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
            PILL[look],
            className,
          )}
          aria-label={
            ready
              ? t('whatsNew.pillUpdate', { version: data.version })
              : t('whatsNew.pill', { version: data.version })
          }
          title={t('whatsNew.title')}
        >
          {data.version}
          {ready ? <UpdateDot /> : null}
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[620px] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-popover text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            SHEET[look],
          )}
        >
          <div className="grid gap-4 border-b border-border p-5 sm:p-6">
            <div className="flex items-start gap-3.5 pr-9">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-gold-soft text-gold"
                aria-hidden
              >
                <Sparkles className="size-[22px]" />
              </span>
              <div className="grid min-w-0 gap-1">
                <DialogPrimitive.Title className="font-display text-2xl font-semibold leading-tight">
                  {t('whatsNew.title')}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground text-pretty">
                  {t('whatsNew.text', { version: data.version })}
                </DialogPrimitive.Description>
              </div>
            </div>
            {ready ? (
              <UpdateNote update={data.update} updatesTo={updatesTo} onNavigate={() => setOpen(false)} />
            ) : null}
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 grid size-8 cursor-pointer place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label={t('nav.close')}
              >
                <X className="size-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="grid content-start gap-4 overflow-y-auto overscroll-contain p-5 sm:p-6">
            {versions.length ? (
              versions.map((entry, i) => (
                <VersionBlock
                  key={entry.sha}
                  entry={entry}
                  installed={i === 0 && entry.version === data.version}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('whatsNew.empty')}</p>
            )}
            {data.versions.length > shown ? (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="justify-self-center rounded-[10px] border border-border px-4 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-gold hover:text-foreground"
              >
                {t('whatsNew.older')}
              </button>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
