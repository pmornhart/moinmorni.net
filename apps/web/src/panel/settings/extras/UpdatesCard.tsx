import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  CloudOff,
  Cog,
  GitBranch,
  KeyRound,
  Loader2,
  PackageCheck,
  Play,
  RefreshCw,
  RotateCcw,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ChangeGroups } from '~/components/change-groups';
import { FoldCard } from '~/components/fold-card';
import { Button, Kbd, Pill, Skeleton, type PillTone } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { useTimeText } from '~/lib/time';
import { ConfirmDialog } from '../../team/dialogs';
import { UPDATES_KEY, useUpdatesQuery, type UpdateChange, type UpdateRun, type UpdateView } from './model';
import { ExtraCard, Notice, StepList } from './parts';

/** The steps of update.sh in their order (rollback only when something went wrong). */
const STEPS = ['pull', 'build', 'backup', 'restart', 'check'] as const;
const ROLLBACK = 'rollback';
const NOT_FOUND = -1;
// Built version → number and commit: "v0.1.4-0-gabc1234" → "v0.1.4" + "abc1234"; "dev" does not match.
// https://regex101.com/?flavor=javascript&regex=%5E(v%5Cd%2B%5C.%5Cd%2B%5C.%5Cd%2B)-%5Cd%2B-g(%5B0-9a-f%5D%7B7%2C40%7D)%24&testString=v0.1.4-0-gabc1234
const DESCRIBED = /^(v\d+\.\d+\.\d+)-\d+-g([0-9a-f]{7,40})$/;
const SHORT_SHA = 7;
const MOTOR_SETTING = 'setting-motorFollowMain';

type Look = 'updating' | 'failed' | 'available' | 'current' | 'unknown';

const LOOK_TONE: Readonly<Record<Look, PillTone>> = {
  updating: 'blue',
  failed: 'warning',
  available: 'gold',
  current: 'success',
  unknown: 'neutral',
};

function lookOf(view: UpdateView): Look {
  if (view.updating) return 'updating';
  if (view.available) return 'available';
  if (view.checkFailed || view.branchMissing) return 'failed';
  if (view.checkedAt === null) return 'unknown';
  return 'current';
}

/** "v0.1.4" and "abc1234" from a built version; a plain commit or "dev" stays as it is. */
function splitVersion(version: string): { readonly name: string; readonly commit: string | null } {
  const m = DESCRIBED.exec(version);
  if (m) return { name: m[1] ?? version, commit: (m[2] ?? '').slice(0, SHORT_SHA) };
  return { name: version, commit: null };
}

function Fact({
  label,
  children,
  foot,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly foot?: ReactNode;
}): ReactElement {
  return (
    <div className="grid min-w-0 content-start gap-1.5 rounded-[14px] bg-muted/60 p-4">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2 font-semibold [overflow-wrap:anywhere]">
        {children}
      </div>
      {foot ? <div className="text-[13px] leading-snug text-muted-foreground">{foot}</div> : null}
    </div>
  );
}

function VersionText({ version }: { readonly version: string | null }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  if (!version) return <span className="text-muted-foreground">{t('updatesCard.unknown')}</span>;
  const { name, commit } = splitVersion(version);
  return (
    <>
      <span className="font-display text-xl">{name === 'dev' ? t('updatesCard.dev') : name}</span>
      {commit ? <Kbd>{commit}</Kbd> : null}
    </>
  );
}

function Facts({ view }: { readonly view: UpdateView }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { moinmorni, motor } = view;
  const motorFoot = ((): ReactNode => {
    if (!motor.latest) return t('updatesCard.motorUnknown');
    if (motor.behind !== null && motor.behind <= 0) return t('updatesCard.motorCurrent');
    return (
      <>
        {motor.behind === null
          ? t('updatesCard.motorNewer', { latest: motor.latest })
          : t('updatesCard.motorBehind', { count: motor.behind, latest: motor.latest })}{' '}
        <Link
          to={{ hash: MOTOR_SETTING }}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t('updatesCard.motorSetting')}
        </Link>
      </>
    );
  })();
  const newestFoot = (): string => {
    if (moinmorni.behind === null) return t('updatesCard.newer');
    if (moinmorni.behind > 0) return t('updatesCard.behind', { count: moinmorni.behind });
    return moinmorni.latest ? t('updatesCard.isNewest') : t('updatesCard.notChecked');
  };
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Fact
        label={t('updatesCard.running')}
        foot={
          <span className="inline-flex items-center gap-1.5">
            <GitBranch className="size-3.5" aria-hidden />
            {t('updatesCard.branch', { branch: view.branch })}
          </span>
        }
      >
        <VersionText version={view.version} />
      </Fact>
      <Fact label={t('updatesCard.newest')} foot={newestFoot()}>
        {moinmorni.latestVersion ? (
          <span className="font-display text-xl">{moinmorni.latestVersion}</span>
        ) : null}
        {moinmorni.latest ? (
          <Kbd className="text-[13px] text-foreground">{moinmorni.latest}</Kbd>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </Fact>
      <Fact label={t('updatesCard.motor')} foot={motorFoot}>
        <VersionText version={motor.current} />
      </Fact>
    </div>
  );
}

const STEP_ICON: Readonly<Record<'done' | 'now' | 'later', LucideIcon>> = {
  done: CheckCircle2,
  now: Loader2,
  later: CircleDashed,
};

function stepLook(done: boolean, now: boolean): 'done' | 'now' | 'later' {
  if (done) return 'done';
  return now ? 'now' : 'later';
}

/** pull → build → backup → restart → check, the current one turning. */
function StepTrack({ step }: { readonly step: string | null }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const at = STEPS.findIndex((s) => s === step);
  return (
    <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {STEPS.map((s, i) => {
        const done = at !== NOT_FOUND && i < at;
        const now = i === at;
        const Icon = STEP_ICON[stepLook(done, now)];
        return (
          <li
            key={s}
            className={cn(
              'flex flex-col items-center gap-1 rounded-[12px] border px-1 py-2 text-center text-[11px] font-semibold leading-tight sm:flex-row sm:gap-2 sm:px-3 sm:text-left sm:text-[13px]',
              now && 'border-blue/40 bg-blue-soft text-blue',
              done && 'border-success/30 text-success',
              !now && !done && 'border-border text-muted-foreground',
            )}
            aria-current={now ? 'step' : undefined}
          >
            <Icon className={cn('size-4 shrink-0', now && 'animate-spin')} aria-hidden />
            {t(`updatesCard.steps.${s}`)}
          </li>
        );
      })}
    </ol>
  );
}

/** The last lines of update.sh, scrolled to the end. */
function LogBox({ lines }: { readonly lines: readonly string[] }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const box = useRef<HTMLPreElement>(null);
  const text = lines.join('\n');
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  if (!lines.length) return <p className="text-sm text-muted-foreground">{t('updatesCard.logEmpty')}</p>;
  return (
    <pre
      ref={box}
      tabIndex={0}
      aria-label={t('updatesCard.log')}
      className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[12px] bg-console px-4 py-3 font-mono text-[12.5px] leading-relaxed text-console-foreground [overflow-wrap:anywhere]"
    >
      {text}
    </pre>
  );
}

function Running({
  view,
  reconnecting,
}: {
  readonly view: UpdateView;
  readonly reconnecting: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const run = view.run?.state === 'running' ? view.run : null;
  if (!run) {
    return view.stuck ? (
      <Notice tone="warning" icon={AlertTriangle} title={t('updatesCard.stuckTitle')}>
        <p>{t('updatesCard.stuckText')}</p>
        <p>
          <Kbd>systemctl status moinmorni-update.path</Kbd>
        </p>
      </Notice>
    ) : (
      <Notice tone="blue" icon={Loader2} title={t('updatesCard.waitingTitle')}>
        <p>{t('updatesCard.waitingText')}</p>
      </Notice>
    );
  }
  const step = run.step;
  return (
    <div className="grid gap-4 rounded-[16px] border border-blue/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Loader2 className="size-[18px] animate-spin text-blue" aria-hidden />
          {step ? t(`updatesCard.stepNow.${step}`) : t('updatesCard.runningTitle')}
        </p>
        <span className="text-[13px] text-muted-foreground">
          {t('updatesCard.since', { time: time.relative(run.at) })}
        </span>
      </div>
      {run.step === ROLLBACK ? (
        <Notice tone="warning" icon={RotateCcw}>
          <p>{t('updatesCard.rollingBack')}</p>
        </Notice>
      ) : (
        <StepTrack step={run.step} />
      )}
      {reconnecting ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CloudOff className="size-4" aria-hidden />
          {t('updatesCard.reconnecting')}
        </p>
      ) : null}
      <LogBox lines={run.log} />
    </div>
  );
}

type FinishedState = Exclude<UpdateRun['state'], 'running'>;
type FinishedRun = UpdateRun & { readonly state: FinishedState };

function isFinished(run: UpdateRun): run is FinishedRun {
  return run.state !== 'running';
}

const RESULT_LOOK: Readonly<
  Record<FinishedState, { readonly tone: 'success' | 'warning' | 'danger'; readonly icon: LucideIcon }>
> = {
  done: { tone: 'success', icon: PackageCheck },
  rolled_back: { tone: 'warning', icon: RotateCcw },
  failed: { tone: 'danger', icon: XCircle },
};

function LastRun({
  run,
  justFinished,
}: {
  readonly run: FinishedRun;
  readonly justFinished: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const look = RESULT_LOOK[run.state];
  // "v0.1.4" instead of "v0.1.4-0-gabc1234" – the commit is no help here.
  const versions = { from: splitVersion(run.from || '?').name, to: splitVersion(run.to || '?').name };
  return (
    <Notice
      tone={look.tone}
      icon={look.icon}
      title={t(`updatesCard.result.${run.state}.title`, { time: time.relative(run.at) })}
    >
      <p>{t(`updatesCard.result.${run.state}.text`, versions)}</p>
      {justFinished && run.state === 'done' ? (
        <div>
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw />
            {t('updatesCard.reload')}
          </Button>
        </div>
      ) : null}
      {run.state !== 'done' && run.log.length ? (
        <details className="group">
          <summary className="cursor-pointer text-[13px] font-semibold text-foreground underline-offset-2 hover:underline">
            {t('updatesCard.showLog')}
          </summary>
          <div className="pt-2">
            <LogBox lines={run.log} />
          </div>
        </details>
      ) : null}
    </Notice>
  );
}

/** The changes of all new versions together, sorted by Neu / Verbessert / Behoben / Entfernt. */
function ChangeList({ view }: { readonly view: UpdateView }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const changes: readonly UpdateChange[] = view.moinmorni.changes;
  if (!changes.length) return null;
  const entries = changes.flatMap((c) =>
    c.items.map((item, i) => ({ kind: item.kind, text: item.text, key: `${c.sha}-${i}` })),
  );
  const newest = changes.find((c) => c.date)?.date;
  return (
    <FoldCard
      id="extra:updates:changes"
      look="plain"
      as="h3"
      title={t('updatesCard.changesTitle')}
      summary={
        newest
          ? t('updatesCard.changesCountDate', { count: changes.length, date: time.date(newest) })
          : t('updatesCard.changesCount', { count: changes.length })
      }
    >
      <ChangeGroups entries={entries} />
    </FoldCard>
  );
}

/**
 * There is a new version, only its list of changes has not arrived: GitHub slows us down (says until when) or did not
 * answer. Starting the update works anyway – Git already told us there is something new.
 */
function PendingList({ view }: { readonly view: UpdateView }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const ready = view.available && view.canUpdate ? t('updatesCard.pendingCanStart') : null;
  if (!view.limitedUntil) {
    return (
      <Notice tone="neutral" icon={Clock} title={t('updatesCard.pendingTitle')}>
        <p>
          {t('updatesCard.pendingText')} {ready}
        </p>
      </Notice>
    );
  }
  return (
    <Notice
      tone="blue"
      icon={Clock}
      title={t('updatesCard.limitedTitle', { time: time.clock(view.limitedUntil) })}
    >
      <p>
        {t('updatesCard.limitedText')} {ready}
      </p>
      {view.githubKey === 'none' ? <p className="text-[13px]">{t('updatesCard.limitedKeyTip')}</p> : null}
    </Notice>
  );
}

function StatusPill({ view }: { readonly view: UpdateView }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const look = lookOf(view);
  return (
    <Pill tone={LOOK_TONE[look]} dot className="px-3 py-1 text-[13px]">
      {t(`updatesCard.look.${look}`)}
    </Pill>
  );
}

function UpdatesBody({
  view,
  reconnecting,
}: {
  readonly view: UpdateView;
  readonly reconnecting: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  // An update seen running during this visit: afterwards the page offers to load the new version.
  const sawUpdating = useRef(view.updating);
  if (view.updating) sawUpdating.current = true;

  const check = useMutation({
    mutationFn: () => mmApi<UpdateView>('/api/panel/updates/check', { method: 'POST' }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(UPDATES_KEY, fresh);
      if (fresh.checkFailed) toast.error(t('updatesCard.checkFailedToast'));
      else if (fresh.branchMissing)
        toast.error(t('updatesCard.branchMissingToast', { branch: fresh.branch }));
      else toast.success(fresh.available ? t('updatesCard.foundToast') : t('updatesCard.currentToast'));
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const start = useMutation({
    mutationFn: () => mmApi<UpdateView>('/api/panel/updates/start', { method: 'POST' }),
    onSuccess: (fresh) => {
      setConfirm(false);
      queryClient.setQueryData(UPDATES_KEY, fresh);
      toast.success(t('updatesCard.startedToast'));
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const finished = view.run && isFinished(view.run) && !view.updating ? view.run : null;
  const canStart = view.available && !view.updating;

  return (
    <>
      <Facts view={view} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {view.checkedAt
            ? t('updatesCard.checkedAt', { time: time.relative(view.checkedAt) })
            : t('updatesCard.neverChecked')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => check.mutate()}
            disabled={check.isPending || view.updating}
          >
            <RefreshCw className={cn(check.isPending && 'animate-spin')} />
            {check.isPending ? t('updatesCard.checking') : t('updatesCard.check')}
          </Button>
          {canStart ? (
            <Button
              onClick={() => setConfirm(true)}
              disabled={!view.canUpdate}
              title={view.canUpdate ? undefined : t('updatesCard.noAgentTitle')}
            >
              <Play />
              {t('updatesCard.start')}
            </Button>
          ) : null}
        </div>
      </div>

      {view.checkFailed ? (
        <Notice tone="warning" icon={CloudOff} title={t('updatesCard.checkFailedTitle')}>
          <p>{t('updatesCard.checkFailedText')}</p>
        </Notice>
      ) : null}
      {view.branchMissing && !view.checkFailed ? (
        <Notice
          tone="warning"
          icon={GitBranch}
          title={t('updatesCard.branchMissingTitle', { branch: view.branch })}
        >
          <p>{t('updatesCard.branchMissingText')}</p>
        </Notice>
      ) : null}
      {view.changesPending && !view.updating ? <PendingList view={view} /> : null}
      {view.githubKey === 'rejected' ? (
        <Notice tone="warning" icon={KeyRound} title={t('updatesCard.keyRejectedTitle')}>
          <p>{t('updatesCard.keyRejectedText')}</p>
        </Notice>
      ) : null}
      {!view.canUpdate ? (
        <Notice tone="neutral" icon={Cog} title={t('updatesCard.noAgentTitle')}>
          <p>{t('updatesCard.noAgentText')}</p>
          <p>
            <Kbd>sudo moinmorni-update</Kbd>
          </p>
        </Notice>
      ) : null}
      {view.updating ? <Running view={view} reconnecting={reconnecting} /> : null}
      {finished ? <LastRun run={finished} justFinished={sawUpdating.current} /> : null}
      {view.moinmorni.current === null && !view.updating ? (
        <Notice tone="neutral" icon={GitBranch}>
          <p>{t('updatesCard.devBuild')}</p>
        </Notice>
      ) : null}
      {!view.available && !view.updating && view.checkedAt && !view.checkFailed && !view.branchMissing ? (
        <Notice tone="success" icon={CheckCircle2} title={t('updatesCard.allCurrentTitle')}>
          <p>{t('updatesCard.allCurrentText')}</p>
        </Notice>
      ) : null}
      <ChangeList view={view} />

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('updatesCard.confirm.title')}
        text={t('updatesCard.confirm.text')}
        confirm={t('updatesCard.confirm.go')}
        icon={Play}
        busy={start.isPending}
        onConfirm={() => start.mutate()}
      >
        <StepList
          items={[
            t('updatesCard.confirm.step1'),
            t('updatesCard.confirm.step2'),
            t('updatesCard.confirm.step3'),
            t('updatesCard.confirm.step4'),
          ]}
        />
      </ConfirmDialog>
    </>
  );
}

/** Einstellungen → Updates: which version runs, what is new, look for updates, start one and follow it. */
export function UpdatesCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const updates = useUpdatesQuery();
  const view = updates.data;
  return (
    <ExtraCard
      fold="extra:updates"
      icon={RefreshCw}
      title={t('updatesCard.title')}
      text={t('updatesCard.text')}
      aside={view ? <StatusPill view={view} /> : null}
    >
      {updates.isPending ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-24 rounded-[14px]" />
          <Skeleton className="h-24 rounded-[14px]" />
          <Skeleton className="h-24 rounded-[14px]" />
        </div>
      ) : null}
      {updates.isError && !view ? <p className="text-muted-foreground">{errorText(updates.error)}</p> : null}
      {view ? <UpdatesBody view={view} reconnecting={updates.isRefetchError} /> : null}
    </ExtraCard>
  );
}
