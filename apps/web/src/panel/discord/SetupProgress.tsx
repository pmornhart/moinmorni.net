import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Hourglass,
  Info,
  LoaderCircle,
  PartyPopper,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { Notice } from '../settings/extras/parts';
import type { SetupProgress as Progress, StepState } from './model';

/** The setup of the Discord server, step by step: what is done, what runs, where Discord slows the bot down. */

const STEP_ICON: Readonly<Record<StepState, LucideIcon>> = {
  waiting: CircleDashed,
  running: LoaderCircle,
  done: CircleCheck,
  skipped: CircleMinus,
  failed: CircleX,
};
const STEP_TONE: Readonly<Record<StepState, string>> = {
  waiting: 'text-muted-foreground',
  running: 'text-blue animate-spin',
  done: 'text-success',
  skipped: 'text-muted-foreground',
  failed: 'text-destructive',
};
const SECOND_MS = 1000;
const TICK_MS = 250;

/** Seconds until Discord lets the bot go on (counts down while shown). */
function useSecondsLeft(until: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [until]);
  if (!until) return null;
  const left = Math.ceil((Date.parse(until) - now) / SECOND_MS);
  return left > 0 ? left : null;
}

/** Names of missing rights in plain words. */
function useRights(): (names: readonly string[]) => string {
  const { t } = useTranslation(MM_NAMESPACE);
  return (names) => names.map((n) => t(`discordAdmin.perm.${n}`, { defaultValue: n })).join(', ');
}

export function SetupProgressView({ progress }: { readonly progress: Progress }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const rights = useRights();
  const left = useSecondsLeft(progress.running ? progress.waitUntil : null);
  if (!progress.startedAt) return null;
  const report = progress.report;
  return (
    <div className="grid gap-3" aria-live="polite">
      <ol className="grid gap-1.5 rounded-[14px] border border-border bg-muted/40 p-3.5 dark:bg-white/[0.02]">
        {progress.steps.map((s) => {
          const Icon = STEP_ICON[s.state];
          return (
            <li key={s.key} className="flex min-w-0 items-center gap-2.5 text-sm">
              <Icon className={cn('size-[18px] shrink-0', STEP_TONE[s.state])} aria-hidden />
              <span className={cn('min-w-0 flex-1', s.state === 'waiting' && 'text-muted-foreground')}>
                {t(`discordSetup.step.${s.key}`)}
              </span>
              {s.total > 1 && s.state !== 'waiting' ? (
                <span className="tabular text-xs text-muted-foreground">
                  {t('discordSetup.count', { done: Math.min(s.done, s.total), total: s.total })}
                </span>
              ) : null}
              <span className="sr-only">{t(`discordSetup.state.${s.state}`)}</span>
            </li>
          );
        })}
      </ol>
      {left ? (
        <Notice tone="blue" icon={Hourglass} title={t('discordSetup.waitTitle')}>
          {t('discordSetup.waitText', { seconds: left })}
        </Notice>
      ) : null}
      {progress.error ? (
        <Notice tone="danger" icon={TriangleAlert} title={t('discordSetup.failedTitle')}>
          <p>{t(`discordSetup.error.${progress.error}`, { defaultValue: t('discordSetup.error.other') })}</p>
          {progress.missing.length ? (
            <p>{t('discordSetup.missing', { rights: rights(progress.missing) })}</p>
          ) : null}
        </Notice>
      ) : null}
      {report ? (
        <Notice tone="success" icon={PartyPopper} title={t('discordSetup.doneTitle')}>
          <p>
            {t('discordSetup.doneText', {
              roles: report.roles,
              channels: report.channels,
              messages: report.messages,
              created: report.created,
            })}
          </p>
          {report.kept.length ? <p>{t('discordSetup.kept', { names: report.kept.join(', ') })}</p> : null}
          {report.community === 'failed' ? <p>{t('discordAdmin.result.communityFailed')}</p> : null}
          {report.icon === 'kept' ? <p>{t('discordSetup.iconKept')}</p> : null}
          {report.icon === 'failed' ? <p>{t('discordSetup.iconFailed')}</p> : null}
        </Notice>
      ) : null}
      {report?.ownerAdminManual ? (
        <Notice tone="neutral" icon={Info} title={t('discordSetup.ownerAdminTitle')}>
          {t('discordSetup.ownerAdminText')}
        </Notice>
      ) : null}
      {report?.missing.length ? (
        <Notice tone="warning" icon={TriangleAlert} title={t('discordSetup.someMissingTitle')}>
          {t('discordSetup.someMissing', { rights: rights(report.missing) })}
        </Notice>
      ) : null}
    </div>
  );
}
