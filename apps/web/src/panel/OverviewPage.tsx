import { ArrowRight, Radio } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ModeGlyph } from '~/components/mode-visuals';
import { Button, Card, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { MODE_STATE_TONE, useNetworkStatus } from '~/lib/status';
import { usePick } from '~/lib/text';
import { areaIcon } from './PanelShell';
import { RestartButton } from './servers/RestartDialog';
import { useCan, usePanel, useSettingsQuery } from './session';

function NetworkCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const canRestart = useCan('servers');
  if (!status.data) return <Skeleton className="h-56 rounded-[16px]" />;
  const { online, players, maxPlayers } = status.data;
  return (
    <Card className="relative grid content-start gap-5 overflow-hidden p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{t('overview.network')}</p>
        <Pill tone={online ? 'success' : 'neutral'} dot>
          {online ? t('overview.online') : t('overview.offline')}
        </Pill>
      </div>
      <div className="grid gap-1">
        <span className="tabular font-display text-[3.6rem] font-semibold leading-none">{players}</span>
        <span className="text-muted-foreground">
          {t('overview.players')} · {t('overview.of', { max: maxPlayers })}
        </span>
      </div>
      {online ? null : (
        <p className="flex items-start gap-2 rounded-[12px] bg-warning-soft px-3.5 py-2.5 text-sm">
          <Radio className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t('overview.proxyOff')}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t('overview.refresh')}</p>
        {canRestart ? <RestartButton /> : null}
      </div>
    </Card>
  );
}

function ModesCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const canEdit = useCan('modes');
  const status = useNetworkStatus();
  if (!status.data) return <Skeleton className="h-56 rounded-[16px]" />;
  const modes = status.data.modes;
  const on = modes.filter((m) => m.state === 'on').length;
  return (
    <Card className="grid content-start gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{t('overview.modes')}</p>
          <p className="font-display text-xl font-semibold">
            {t('overview.modesCount', { on, total: modes.length })}
          </p>
        </div>
        {canEdit ? (
          <Button asChild variant="secondary" size="sm">
            <Link to="/modi">
              {t('overview.allModes')}
              <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </div>
      <ul className="grid gap-1">
        {modes.map((mode, index) => (
          <li key={mode.id} className="flex items-center gap-3 rounded-[12px] px-1 py-1.5">
            <ModeGlyph id={mode.id} position={index} className="size-9 rounded-[11px] [&_svg]:size-[18px]" />
            <span className="min-w-0 flex-1 truncate font-semibold">{pick(mode.name)}</span>
            <span
              className={cn(
                'tabular hidden text-sm text-muted-foreground sm:inline',
                mode.state === 'on' ? '' : 'opacity-0',
              )}
            >
              {t('mode.players', { players: mode.players, max: mode.maxPlayers })}
            </span>
            <Pill tone={MODE_STATE_TONE[mode.state]} dot className="min-w-[5.5rem] justify-center">
              {t(`mode.state.${mode.state}`)}
            </Pill>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Shortcuts(): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const settings = useSettingsQuery();
  const areas = settings.data ?? [];
  if (!areas.length) return null;
  return (
    <section className="grid gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {t('overview.shortcuts')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {areas.map(({ area }) => {
          const Icon = areaIcon(area.icon);
          return (
            <Link
              key={area.id}
              to={`/einstellungen/${area.id}`}
              className="group flex items-start gap-3 rounded-[16px] border border-border bg-card p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-float"
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-accent text-primary"
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="flex items-center gap-1.5 font-semibold">
                  {pick(area.title)}
                  <ArrowRight
                    className="size-4 opacity-0 transition-opacity group-hover:opacity-60"
                    aria-hidden
                  />
                </span>
                <span className="text-sm leading-snug text-muted-foreground">{pick(area.text)}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function OverviewPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const me = usePanel();
  return (
    <>
      <div className="grid gap-1">
        <h1 className="font-display text-[clamp(1.9rem,3.4vw,2.6rem)] font-semibold leading-tight">
          {t('overview.greeting', { name: me.username })}
        </h1>
        <p className="text-muted-foreground">{t('overview.text')}</p>
      </div>
      <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <NetworkCard />
        <ModesCard />
      </div>
      <Shortcuts />
    </>
  );
}
