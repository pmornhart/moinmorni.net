import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Castle, Hammer, Info, Network, RotateCcw, X, type LucideIcon } from 'lucide-react';
import { useId, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  RestartKind,
  RestartOverview,
  RestartRequestResult,
  RestartServerState,
  RestartStepView,
} from '@moinmorni/shared';
import { ModeGlyph } from '~/components/mode-visuals';
import { Button, Pill, Skeleton, type PillTone } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { usePick } from '~/lib/text';
import { useWartung, WartungForm, WartungRunning } from './WartungCard';

/**
 * Panel → „Server neu starten“: pick servers of the network (all running ones are ticked), confirm, then watch the
 * ordered restart (apps/server/src/panel/restart-routes.ts). The maintenance lobby never appears – it is where the
 * lobby's players wait meanwhile.
 */

const RESTART_KEY = ['panel', 'servers', 'restart'] as const;
/** Ask for the progress this often while the dialog is open (faster while a round runs). */
const FINISHED_STEPS: readonly string[] = ['done', 'failed', 'skipped'];
const POLL_IDLE_MS = 10_000;
const POLL_BUSY_MS = 2_000;

const KIND_ICON: Readonly<Record<Exclude<RestartKind, 'mode'>, LucideIcon>> = {
  proxy: Network,
  lobby: Castle,
  build: Hammer,
};
const STATE_TONE: Readonly<Record<RestartServerState, PillTone>> = {
  running: 'success',
  starting: 'blue',
  sleeping: 'neutral',
  stopped: 'neutral',
};
const STEP_TONE: Readonly<Record<RestartStepView, PillTone>> = {
  waiting: 'neutral',
  countdown: 'gold',
  restarting: 'blue',
  done: 'success',
  failed: 'danger',
  skipped: 'neutral',
};

function useRestartQuery(open: boolean) {
  return useQuery({
    queryKey: RESTART_KEY,
    queryFn: () => mmApi<RestartOverview>('/api/panel/servers/restart'),
    enabled: open,
    refetchInterval: (query) => (query.state.data?.progress.running ? POLL_BUSY_MS : POLL_IDLE_MS),
  });
}

function ServerGlyph({ kind, modeId, index }: { kind: RestartKind; modeId: string | null; index: number }) {
  if (kind === 'mode' && modeId)
    return <ModeGlyph id={modeId} position={index} className="size-9 rounded-[11px] [&_svg]:size-[18px]" />;
  const Icon = kind === 'mode' ? RotateCcw : KIND_ICON[kind];
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-accent text-primary"
      aria-hidden
    >
      <Icon className="size-[18px]" />
    </span>
  );
}

const PERCENT = 100;

/** „5 von 16 fertig“ mit Balken – wie weit die laufende Runde ist. */
function RoundProgress({
  servers,
}: {
  readonly servers: ReadonlyArray<{ readonly step: RestartStepView }>;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const done = servers.filter((x) => FINISHED_STEPS.includes(x.step)).length;
  const total = servers.length;
  return (
    <div className="grid gap-2 rounded-[12px] bg-gold-soft px-3.5 py-2.5 text-sm" role="status">
      <p className="flex items-start gap-2">
        <RotateCcw
          className="mt-0.5 size-4 shrink-0 animate-spin text-gold [animation-duration:2.4s]"
          aria-hidden
        />
        {t('restartDialog.busy', { done, total })}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-background/60">
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-700"
          style={{ width: `${total ? Math.round((done / total) * PERCENT) : 0}%` }}
        />
      </div>
    </div>
  );
}

/** Wartungs-Neustart im selben Fenster: alle in die Wartungs-Lobby, alles neu, mit Zeit und Grund. */
function WartungRestartBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const query = useWartung();
  if (!query.data) return <Skeleton className="h-40 rounded-[16px]" />;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('restartDialog.wartungMode')}</p>
      <WartungRunning view={query.data} />
      {query.data.plan ? null : <WartungForm kind="restart" view={query.data} />}
    </div>
  );
}

/** Oben im Fenster: normaler Neustart oder Wartungs-Neustart. */
function RestartModes({ onDone }: { readonly onDone: () => void }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [mode, setMode] = useState<'normal' | 'wartung'>('normal');
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-secondary p-1" role="tablist">
        {(['normal', 'wartung'] as const).map((m) => (
          <Button
            key={m}
            size="sm"
            role="tab"
            aria-selected={mode === m}
            variant={mode === m ? 'primary' : 'ghost'}
            onClick={() => setMode(m)}
          >
            {t(`restartDialog.mode.${m}`)}
          </Button>
        ))}
      </div>
      {mode === 'normal' ? <RestartBody onDone={onDone} /> : <WartungRestartBody />}
    </div>
  );
}

function RestartBody({ onDone }: { readonly onDone: () => void }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const errorText = useErrorText();
  const client = useQueryClient();
  const query = useRestartQuery(true);
  const baseId = useId();
  /** null = untouched: all running servers are ticked. */
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null);
  const servers = useMemo(() => query.data?.servers ?? [], [query.data]);
  /** Neu startbar: läuft (geordnet mit Countdown) oder ist aus (wird gestartet). Startet gerade / schläft: kommt
   * ohnehin frisch hoch und blockiert die anderen nicht. */
  const running = useMemo(
    () => servers.filter((s) => s.state === 'running' || s.state === 'stopped').map((s) => s.member),
    [servers],
  );
  const picked = chosen ?? new Set(running);
  const allPicked = running.length > 0 && running.every((m) => picked.has(m));
  const progress = query.data?.progress;
  const stepOf = new Map((progress?.servers ?? []).map((s) => [s.member, s.step]));

  const submit = useMutation({
    mutationFn: (list: readonly string[]) =>
      mmApi<RestartRequestResult>('/api/panel/servers/restart', { method: 'POST', body: { servers: list } }),
    onSuccess: (result) => {
      toast.success(
        result.queued
          ? t('restartDialog.queued', { count: result.started.length })
          : t('restartDialog.started', { count: result.started.length }),
      );
      setChosen(new Set());
      void client.invalidateQueries({ queryKey: RESTART_KEY });
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const toggle = (member: string, on: boolean): void => {
    const next = new Set(picked);
    if (on) next.add(member);
    else next.delete(member);
    setChosen(next);
  };

  if (query.isPending) return <Skeleton className="h-64 rounded-[16px]" />;
  if (query.isError) return <p className="text-sm text-muted-foreground">{errorText(query.error)}</p>;

  const list = [...picked].filter((m) => running.includes(m));
  return (
    <div className="grid gap-4">
      {progress?.running ? <RoundProgress servers={progress.servers ?? []} /> : null}
      <label
        htmlFor={`${baseId}-all`}
        className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-border px-3 py-2.5"
      >
        <input
          id={`${baseId}-all`}
          type="checkbox"
          checked={allPicked}
          disabled={!running.length}
          onChange={(e) => setChosen(new Set(e.target.checked ? running : []))}
          className="size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
        />
        <span className="flex-1 font-semibold">{t('restartDialog.all')}</span>
        <span className="tabular text-sm text-muted-foreground">
          {t('restartDialog.chosen', { count: list.length, total: running.length })}
        </span>
      </label>
      <ul className="grid max-h-[46dvh] gap-1 overflow-y-auto pr-1">
        {servers.map((server, index) => {
          const id = `${baseId}-${server.member}`;
          const can = server.state === 'running' || server.state === 'stopped';
          const step = stepOf.get(server.member);
          return (
            <li key={server.member}>
              <label
                htmlFor={id}
                className={cn(
                  'flex items-center gap-3 rounded-[12px] px-2 py-1.5 transition-colors',
                  can ? 'cursor-pointer hover:bg-secondary' : 'opacity-60',
                  step === 'restarting' || step === 'countdown' ? 'bg-gold-soft ring-1 ring-gold/40' : '',
                )}
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={can && picked.has(server.member)}
                  disabled={!can}
                  onChange={(e) => toggle(server.member, e.target.checked)}
                  className="size-4 shrink-0 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed"
                />
                <ServerGlyph kind={server.kind} modeId={server.modeId} index={index} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-semibold">{pick(server.name)}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {server.kind === 'proxy'
                      ? t('restartDialog.proxyHint')
                      : t('restartDialog.players', { count: server.players })}
                  </span>
                </span>
                {step ? (
                  <Pill tone={STEP_TONE[step]} dot className="justify-center">
                    {t(`restartDialog.step.${step}`)}
                  </Pill>
                ) : (
                  <Pill tone={STATE_TONE[server.state]} dot className="min-w-[5.5rem] justify-center">
                    {t(`restartDialog.state.${server.state}`)}
                  </Pill>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="grid gap-2 rounded-[12px] bg-secondary px-3.5 py-3 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>{t('restartDialog.countdown', { seconds: query.data?.countdown ?? 0 })}</span>
        </p>
        <p className="pl-6">{t('restartDialog.order')}</p>
        {list.includes('proxy') ? (
          <p className="pl-6 font-semibold text-warning">{t('restartDialog.proxyWarn')}</p>
        ) : null}
        <p className="pl-6">{t('restartDialog.wartung')}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          {t('restartDialog.close')}
        </Button>
        <Button
          variant="primary"
          disabled={!list.length || submit.isPending}
          onClick={() => submit.mutate(list)}
        >
          <RotateCcw />
          {submit.isPending ? t('restartDialog.sending') : t('restartDialog.confirm', { count: list.length })}
        </Button>
      </div>
    </div>
  );
}

/** The button that opens the dialog; only rendered for people with the panel area „Server“. */
export function RestartButton({
  variant = 'secondary',
  size = 'sm',
  className,
}: {
  readonly variant?: 'secondary' | 'primary' | 'outline';
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant={variant} size={size} className={className} data-tour="restart">
          <RotateCcw />
          {t('restartDialog.button')}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[20px] border border-border bg-popover p-5 text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-6">
          <div className="grid gap-1 pr-10">
            <DialogPrimitive.Title className="font-display text-2xl font-semibold leading-tight">
              {t('restartDialog.title')}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {t('restartDialog.text')}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="iconSm"
              className="absolute right-4 top-4"
              aria-label={t('restartDialog.close')}
            >
              <X />
            </Button>
          </DialogPrimitive.Close>
          {open ? <RestartModes onDone={() => setOpen(false)} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
