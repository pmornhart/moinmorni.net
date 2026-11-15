import {
  ArrowLeft,
  Check,
  ClipboardList,
  Copy,
  Gamepad2,
  LogIn,
  MessagesSquare,
  Moon,
  Terminal,
  Users,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { ModeStatus } from '@moinmorni/shared';
import { useCopy } from '~/components/controls';
import { ModeGlyph } from '~/components/mode-visuals';
import { Button, Card, Kbd, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { findMode, useSite } from '~/lib/site';
import { modeJoinable, modeLook, useNetworkStatus } from '~/lib/status';
import { usePick } from '~/lib/text';
import { ModeTile } from './cards';
import { EmptyState, EXTERNAL, ModeStateBadge, PageBand, WRAP } from './parts';
import { FALLBACK_ADDRESS } from './PublicLayout';

const SKELETONS = ['a', 'b', 'c', 'd', 'e', 'f'];
const APPLY_MODE = 'mornicraft';
const APPLY_PAGE = '/mornicraft/bewerben';

/** All game modes as tiles. */
export function ModesListPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const modes = status.data?.modes ?? [];
  return (
    <>
      <PageBand
        eyebrow={t('site.modes.eyebrow')}
        title={t('site.modes.pageTitle')}
        text={t('site.modes.text')}
        icon={Gamepad2}
      />
      <div className={cn(WRAP, 'grid gap-6 py-12 sm:py-16')}>
        {status.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SKELETONS.map((k) => (
              <Skeleton key={k} className="h-60 rounded-[16px]" />
            ))}
          </div>
        ) : null}
        {status.isError ? <Card className="p-6 text-muted-foreground">{t('site.loadError')}</Card> : null}
        {status.isSuccess && !modes.length ? (
          <EmptyState icon={Gamepad2} title={t('site.modes.emptyTitle')} text={t('site.modes.empty')} />
        ) : null}
        {modes.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modes.map((mode, index) => (
              <ModeTile key={mode.id} mode={mode} index={index} full />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

function Step({
  n,
  title,
  children,
}: {
  readonly n: number;
  readonly title: string;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1">
      <span
        className="row-span-2 grid size-8 place-items-center rounded-full bg-gold-soft font-display text-base font-semibold text-gold"
        aria-hidden
      >
        {n}
      </span>
      <span className="pt-1 font-semibold leading-snug">{title}</span>
      {children ? <div className="text-[15px] leading-relaxed text-muted-foreground">{children}</div> : null}
    </li>
  );
}

function CopyChip({ value }: { readonly value: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { copied, copy } = useCopy(value);
  return (
    <button
      type="button"
      onClick={copy}
      title={t('copy.action')}
      className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-muted/70 px-3 py-1.5 font-mono text-sm font-medium text-foreground transition-colors hover:border-primary/40"
      aria-live="polite"
    >
      {value}
      {copied ? (
        <Check className="size-3.5 text-primary" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      <span className="sr-only">{copied ? t('copy.done') : t('copy.action')}</span>
    </button>
  );
}

function HowToGetThere({ mode }: { readonly mode: ModeStatus }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const status = useNetworkStatus();
  const site = useSite();
  const address = status.data?.javaAddress ?? FALLBACK_ADDRESS;
  const invite = site.data?.discordInvite;
  const command = `/server ${mode.server ?? mode.id}`;
  const look = modeLook(mode);
  // Applications (website and Discord) exist for MorniCraft.
  const applies = mode.id === APPLY_MODE;
  return (
    <Card className="grid content-start gap-5 border-gold/30 p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-[13px] bg-gold-soft text-gold" aria-hidden>
          <LogIn className="size-5" />
        </span>
        <h2 className="font-display text-[1.45rem] font-semibold">{t('site.mode.howTitle')}</h2>
      </div>
      {modeJoinable(mode) ? null : (
        <p className="rounded-[12px] bg-muted/70 px-4 py-3 text-sm font-semibold text-muted-foreground">
          {t(`site.mode.notNow.${mode.state}`)}
        </p>
      )}
      <ol className="grid gap-4">
        <Step n={1} title={t('site.mode.step1')}>
          <CopyChip value={address} />
        </Step>
        <Step n={2} title={t('site.mode.step2', { name: pick(mode.name) })}>
          {t('site.mode.step2Text')}
        </Step>
        <Step n={3} title={t('site.mode.step3')}>
          <CopyChip value={command} />
        </Step>
      </ol>
      {look === 'asleep' ? (
        <p className="flex items-start gap-2.5 rounded-[12px] bg-blue-soft px-4 py-3 text-sm text-blue">
          <Moon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('site.mode.asleepText')}
        </p>
      ) : null}
      {mode.access === 'whitelist' ? (
        <div className="grid gap-3 rounded-[12px] bg-gold-soft px-4 py-3 text-sm text-gold-strong dark:text-gold">
          <p>{t(applies ? 'site.mode.whitelistApply' : 'site.mode.whitelistText')}</p>
          <div className="flex flex-wrap gap-2">
            {applies ? (
              <Button asChild size="sm">
                <Link to={APPLY_PAGE}>
                  <ClipboardList />
                  {t('site.mode.apply')}
                </Link>
              </Button>
            ) : null}
            {invite ? (
              <Button asChild variant="secondary" size="sm">
                <a href={invite} {...EXTERNAL}>
                  <MessagesSquare />
                  Discord
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/** One game mode: state, players, description and how to get there. */
export function ModePage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { id = '' } = useParams();
  const pick = usePick();
  const status = useNetworkStatus();
  const modes = status.data?.modes ?? [];
  const mode = findMode(modes, id);
  const index = modes.findIndex((m) => m.id === id);

  if (status.isPending) {
    return (
      <div className={cn(WRAP, 'grid gap-5 py-14')}>
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 rounded-[16px]" />
      </div>
    );
  }
  if (!mode) {
    return (
      <div className={cn(WRAP, 'grid max-w-[860px] gap-6 py-16')}>
        <EmptyState
          icon={Gamepad2}
          title={t('site.mode.missingTitle')}
          text={status.isError ? t('site.loadError') : t('site.mode.missingText')}
        >
          <Button asChild variant="secondary">
            <Link to="/spielmodi">
              <ArrowLeft />
              {t('site.mode.back')}
            </Link>
          </Button>
        </EmptyState>
      </div>
    );
  }
  const others = modes.filter((m) => m.id !== mode.id);
  return (
    <>
      <PageBand eyebrow={t('site.mode.eyebrow')} title={pick(mode.name)}>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <ModeStateBadge mode={mode} />
          {mode.access === 'whitelist' ? <Pill tone="gold">{t('mode.whitelist')}</Pill> : null}
          {modeJoinable(mode) ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-0.5 text-xs font-semibold text-band-foreground">
              <Users className="size-3.5" aria-hidden />
              {t('mode.players', { players: mode.players, max: mode.maxPlayers })}
            </span>
          ) : null}
        </div>
      </PageBand>
      <div className={cn(WRAP, 'grid items-start gap-6 py-12 sm:py-14 lg:grid-cols-[1.3fr_1fr]')}>
        <Card className="grid content-start gap-5 p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <ModeGlyph
              id={mode.id}
              position={Math.max(index, 0)}
              className="size-16 rounded-[18px] [&_svg]:size-8"
            />
            <div className="grid gap-1">
              <h2 className="font-display text-[1.6rem] font-semibold leading-tight">{pick(mode.name)}</h2>
              <p className="text-sm text-muted-foreground">{t(`site.modeLookText.${modeLook(mode)}`)}</p>
            </div>
          </div>
          <p className="text-[1.08rem] leading-relaxed text-pretty">{pick(mode.description)}</p>
          {modeJoinable(mode) ? (
            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-5">
              <div className="grid gap-1 rounded-[12px] bg-muted/60 p-4">
                <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {t('site.mode.playersNow')}
                </dt>
                <dd className="tabular font-display text-3xl font-semibold">{mode.players}</dd>
              </div>
              <div className="grid gap-1 rounded-[12px] bg-muted/60 p-4">
                <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {t('site.mode.playersMax')}
                </dt>
                <dd className="tabular font-display text-3xl font-semibold">{mode.maxPlayers}</dd>
              </div>
            </dl>
          ) : null}
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Terminal className="size-4" aria-hidden />
            {t('site.mode.lobbyBack')} <Kbd>/lobby</Kbd>
          </p>
        </Card>
        <HowToGetThere mode={mode} />
      </div>
      {others.length ? (
        <section className="border-t border-border bg-secondary/60 dark:bg-white/[0.015]">
          <div className={cn(WRAP, 'grid gap-5 py-12')}>
            <h2 className="font-display text-2xl font-semibold">{t('site.mode.others')}</h2>
            <div className="flex flex-wrap gap-2">
              {others.map((m) => (
                <Link
                  key={m.id}
                  to={`/spielmodi/${m.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold shadow-card transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {pick(m.name)}
                  <ModeStateBadge mode={m} className="px-2" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
