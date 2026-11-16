import { Check, Pickaxe, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MinecraftHead } from '~/components/minecraft-head';
import { RoleBadge } from '~/components/role-visuals';
import { Pill, type PillTone } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { isBedrockName } from '~/lib/minecraft-name';
import type { ApplicationStatus, ApplicationSummary, PositionView, VoteCount } from './model';

/** Small pieces shared by the list and the detail page of the applications. */

export const STATUS_TONE: Readonly<Record<ApplicationStatus, PillTone>> = {
  pending: 'gold',
  accepted: 'success',
  rejected: 'danger',
};

export function StatusPill({ status }: { readonly status: ApplicationStatus }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Pill tone={STATUS_TONE[status]} dot>
      {t(`applications.status.${status}`)}
    </Pill>
  );
}

/** The Minecraft head: by UUID when known (Java), otherwise by name; Bedrock players get the first letter. */
export function ApplicantHead({
  app,
  className,
}: {
  readonly app: Pick<ApplicationSummary, 'minecraftName' | 'minecraftUuid'>;
  readonly className?: string;
}): ReactElement {
  const bedrock = isBedrockName(app.minecraftName);
  return (
    <MinecraftHead
      uuid={bedrock ? null : (app.minecraftUuid ?? app.minecraftName)}
      name={app.minecraftName.replace('.', '')}
      className={cn('size-11 rounded-[12px] bg-muted text-lg', className)}
      letterClassName="text-muted-foreground"
    />
  );
}

/** The position as the role badge (symbol and colour like in the game) – or "MorniCraft". */
export function PositionBadge({
  app,
  positions,
}: {
  readonly app: Pick<ApplicationSummary, 'kind' | 'position'>;
  readonly positions: readonly PositionView[];
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  if (app.kind === 'mornicraft')
    return (
      <Pill tone="success">
        <Pickaxe className="size-3" aria-hidden />
        MorniCraft
      </Pill>
    );
  const role = positions.find((p) => p.id === app.position)?.role;
  return role ? (
    <RoleBadge role={role} />
  ) : (
    <Pill tone="neutral">{app.position ?? t('applications.unknownPosition')}</Pill>
  );
}

/** 👍 3 · 👎 1 – my own vote highlighted. */
export function VoteTally({ votes }: { readonly votes: VoteCount }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  if (!votes.up && !votes.down) return null;
  return (
    <span
      className="inline-flex items-center gap-2.5 text-[13px] tabular text-muted-foreground"
      aria-label={t('applications.votesLabel', { up: votes.up, down: votes.down })}
    >
      <span className={cn('inline-flex items-center gap-1', votes.mine > 0 && 'font-bold text-success')}>
        <ThumbsUp className="size-3.5" aria-hidden />
        {votes.up}
      </span>
      <span className={cn('inline-flex items-center gap-1', votes.mine < 0 && 'font-bold text-destructive')}>
        <ThumbsDown className="size-3.5" aria-hidden />
        {votes.down}
      </span>
    </span>
  );
}

/** Who decided, when and with which message. */
export function DecisionBox({
  app,
  time,
}: {
  readonly app: Pick<ApplicationSummary, 'status' | 'decidedBy' | 'note'>;
  readonly time: string;
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  if (app.status === 'pending') return null;
  const accepted = app.status === 'accepted';
  return (
    <div
      className={cn(
        'grid gap-1 rounded-[12px] border px-3.5 py-2.5 text-sm',
        accepted ? 'border-success/25 bg-success-soft' : 'border-destructive/20 bg-destructive-soft',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 font-semibold',
          accepted ? 'text-success' : 'text-destructive',
        )}
      >
        {accepted ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
        {t(accepted ? 'applications.acceptedBy' : 'applications.rejectedBy', {
          name: app.decidedBy ?? '?',
          time,
        })}
      </p>
      {app.note ? (
        <p className="whitespace-pre-line text-foreground/85 [overflow-wrap:anywhere]">
          {t('applications.message', { note: app.note })}
        </p>
      ) : null}
    </div>
  );
}
