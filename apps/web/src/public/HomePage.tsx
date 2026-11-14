import {
  MessagesSquare,
  Monitor,
  Newspaper,
  Package,
  Smartphone,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModeStatus, NetworkStatus } from '@moinmorni/shared';
import { Lozenge, Ridge } from '~/components/brand';
import { CopyButton } from '~/components/controls';
import { ModeGlyph } from '~/components/mode-visuals';
import { Card, Pill, SectionTitle, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { MODE_STATE_TONE, useNetworkStatus } from '~/lib/status';
import { usePick } from '~/lib/text';

/** Shown while the status loads or when it cannot be fetched: the real address and port of moinmorni.net. */
const FALLBACK_ADDRESS = 'moinmorni.net';
const FALLBACK_BEDROCK_PORT = 19132;

function LiveCount({
  status,
  loading,
  failed,
}: {
  readonly status?: NetworkStatus;
  readonly loading: boolean;
  readonly failed: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const online = status?.online === true;
  const label = ((): string => {
    if (loading) return t('home.statusLoading');
    if (failed || !status) return t('home.statusError');
    return online ? t('home.online', { count: status.players }) : t('home.offline');
  })();
  return (
    <div
      className="inline-flex items-center gap-2.5 rounded-full border border-band-line bg-white/[0.05] py-1.5 pl-3 pr-4 text-sm font-semibold"
      role="status"
      aria-live="polite"
      title={t('home.updated')}
    >
      <span
        className={cn('size-2.5 rounded-full', online ? 'mm-pulse bg-emerald-400' : 'bg-band-muted/50')}
        aria-hidden
      />
      <span className="tabular">{label}</span>
    </div>
  );
}

function AddressCard({
  icon: Icon,
  title,
  address,
  port,
  hint,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly address: string;
  readonly port?: number;
  readonly hint: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid gap-3 rounded-[18px] border border-band-line bg-white/[0.045] p-4 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] backdrop-blur-sm sm:p-5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-gold">
        <Icon className="size-4" aria-hidden />
        {title}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="grid min-w-0 gap-1">
          <span className="sr-only">{t('home.address')}</span>
          <span className="font-mono text-[1.35rem] font-medium leading-tight tracking-[-0.01em] text-band-foreground sm:text-[1.6rem] [overflow-wrap:anywhere]">
            {address}
          </span>
          {port ? (
            <span className="text-sm text-band-muted">
              {t('home.port')}{' '}
              <span className="rounded-[7px] bg-white/[0.08] px-1.5 py-0.5 font-mono font-medium text-band-foreground">
                {port}
              </span>
            </span>
          ) : null}
        </div>
        <CopyButton value={address} />
      </div>
      <p className="text-[13px] leading-snug text-band-muted">{hint}</p>
    </div>
  );
}

function Hero(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const data = status.data;
  return (
    <section className="band relative overflow-hidden">
      <div className="relative z-10 mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-32 pt-12 sm:px-6 sm:pb-44 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div className="mm-rise grid content-start justify-items-start gap-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{t('home.eyebrow')}</p>
          <h1 className="font-display text-[clamp(3.1rem,10vw,6.4rem)] font-semibold leading-[0.95] tracking-[-0.025em] text-band-foreground">
            MoinMorni
          </h1>
          <p className="max-w-[34ch] text-lg leading-relaxed text-band-muted sm:text-xl">{t('home.pitch')}</p>
          <LiveCount status={data} loading={status.isPending} failed={status.isError} />
        </div>
        <div className="mm-rise grid gap-3 [animation-delay:120ms]">
          <AddressCard
            icon={Monitor}
            title={t('home.java.title')}
            address={data?.javaAddress ?? FALLBACK_ADDRESS}
            hint={t('home.java.hint')}
          />
          <AddressCard
            icon={Smartphone}
            title={t('home.bedrock.title')}
            address={data?.bedrockAddress ?? FALLBACK_ADDRESS}
            port={data?.bedrockPort ?? FALLBACK_BEDROCK_PORT}
            hint={t('home.bedrock.hint')}
          />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-1.5 h-28 text-[#1c4a37] sm:h-44 dark:text-[#12301f]">
        <Ridge />
      </div>
      <Lozenge className="absolute inset-x-0 bottom-0" />
    </section>
  );
}

function ModeCard({ mode, index }: { readonly mode: ModeStatus; readonly index: number }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const open = mode.state === 'on' || mode.state === 'maintenance';
  const footer = ((): ReactNode => {
    if (mode.state === 'soon') return t('mode.soonText');
    if (mode.state === 'off') return t('mode.closed');
    if (mode.state === 'maintenance') return t('mode.maintenanceText');
    return mode.awake ? null : t('mode.asleep');
  })();
  return (
    <Card
      className={cn(
        'group grid content-start gap-4 p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-float',
        !open && 'bg-card/70',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <ModeGlyph id={mode.id} position={index} />
        <div className="flex flex-wrap justify-end gap-1.5">
          {mode.access === 'whitelist' ? <Pill tone="gold">{t('mode.whitelist')}</Pill> : null}
          <Pill tone={MODE_STATE_TONE[mode.state]} dot>
            {t(`mode.state.${mode.state}`)}
          </Pill>
        </div>
      </div>
      <div className="grid gap-1.5">
        <h3 className="font-display text-[1.4rem] font-semibold leading-tight">{pick(mode.name)}</h3>
        <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
          {pick(mode.description)}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        {open ? (
          <span className="tabular font-semibold">
            {t('mode.players', { players: mode.players, max: mode.maxPlayers })}
          </span>
        ) : null}
        {footer ? <span className="text-muted-foreground">{footer}</span> : null}
      </div>
    </Card>
  );
}

function Modes(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const modes = status.data?.modes ?? [];
  return (
    <section id="modi" className="mx-auto grid max-w-[1200px] scroll-mt-20 gap-8 px-4 py-16 sm:px-6 sm:py-24">
      <SectionTitle
        eyebrow={t('home.modes.eyebrow')}
        title={t('home.modes.title')}
        text={t('home.modes.text')}
      />
      {status.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {['a', 'b', 'c'].map((k) => (
            <Skeleton key={k} className="h-56 rounded-[16px]" />
          ))}
        </div>
      ) : null}
      {status.isSuccess && modes.length === 0 ? (
        <p className="text-muted-foreground">{t('home.modes.empty')}</p>
      ) : null}
      {modes.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((mode, index) => (
            <ModeCard key={mode.id} mode={mode} index={index} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

const SOON: readonly { readonly key: string; readonly icon: LucideIcon }[] = [
  { key: 'news', icon: Newspaper },
  { key: 'discord', icon: MessagesSquare },
  { key: 'modpack', icon: Package },
  { key: 'leaderboards', icon: Trophy },
];

function ComingSoon(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <section className="mx-auto grid max-w-[1200px] gap-8 px-4 pb-20 sm:px-6 sm:pb-28">
      <div className="flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <Lozenge className="h-1.5 w-16 rounded-full shadow-[0_0_0_1px_rgba(79,143,214,0.35)]" />
        <span className="h-px flex-1 bg-border" />
      </div>
      <SectionTitle
        eyebrow={t('home.soon.eyebrow')}
        title={t('home.soon.title')}
        text={t('home.soon.text')}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SOON.map(({ key, icon: Icon }) => (
          <div
            key={key}
            className="grid content-start gap-3 rounded-[16px] border border-dashed border-input bg-card/40 p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="grid size-10 place-items-center rounded-[12px] bg-muted text-muted-foreground"
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              <Pill tone="gold">{t('home.soon.badge')}</Pill>
            </div>
            <h3 className="font-display text-lg font-semibold">{t(`home.soon.${key}.title`)}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{t(`home.soon.${key}.text`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomePage(): ReactElement {
  return (
    <>
      <Hero />
      <Modes />
      <ComingSoon />
    </>
  );
}
