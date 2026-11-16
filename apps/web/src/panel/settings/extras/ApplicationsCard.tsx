import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ClipboardList,
  Globe,
  Inbox,
  MessagesSquare,
  UserCheck,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { CopyButton } from '~/components/controls';
import { MinecraftHead } from '~/components/minecraft-head';
import { Button, Card, Pill, Skeleton, Textarea } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { useTimeText } from '~/lib/time';
import { ConfirmDialog } from '../../team/dialogs';
import {
  APPLICATION_STATUSES,
  APPLICATIONS_KEY,
  isBedrockName,
  NOTE_MAX,
  useApplicationsQuery,
  WHITELIST_KEY,
  type Application,
  type ApplicationStatus,
} from './model';
import { ExtraCard, FilterChip } from './parts';

const SKELETON_ROWS = ['a', 'b'];
/** Answers of the form in this order; anything else the server stores comes after them. */
const ANSWER_ORDER = ['about', 'why', 'age'] as const;
const APPLY_PATH = '/mornicraft/bewerben';
const OPEN_SETTING = 'setting-applicationsOpen';
// The scheme in front of an address, shown without it: "https://morni.net/…" → "morni.net/…"; "morni.net" stays.
// https://regex101.com/?flavor=javascript&regex=%5Ehttps%3F%3A%5C%2F%5C%2F&testString=https%3A%2F%2Fmorni.net%2Fmornicraft%2Fbewerben
const SCHEME = /^https?:\/\//;

const EMPTY_ICON: Readonly<Record<ApplicationStatus, LucideIcon>> = {
  pending: Inbox,
  accepted: UserCheck,
  rejected: UserX,
};

/** The Minecraft head (Java names; Bedrock players have no Mojang skin) or the first letter. */
export function NameHead({
  name,
  className,
}: {
  readonly name: string;
  readonly className?: string;
}): ReactElement {
  return (
    <MinecraftHead
      uuid={isBedrockName(name) ? null : name}
      name={name.replace('.', '')}
      className={cn('size-11 rounded-[12px] bg-muted text-lg', className)}
      letterClassName="text-muted-foreground"
    />
  );
}

function Meta({
  icon: Icon,
  children,
}: {
  readonly icon: LucideIcon;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}

function Answers({ answers }: { readonly answers: Readonly<Record<string, string>> }): ReactElement {
  const { t, i18n } = useTranslation(MM_NAMESPACE);
  const known: readonly string[] = ANSWER_ORDER;
  const keys = [...ANSWER_ORDER, ...Object.keys(answers).filter((k) => !known.includes(k))].filter((k) =>
    Boolean(answers[k]?.trim()),
  );
  const label = (key: string): string => {
    const text = `applicationsCard.answers.${key}`;
    return i18n.exists(text, { ns: MM_NAMESPACE }) ? t(text) : key;
  };
  return (
    <dl className="grid gap-3 rounded-[14px] bg-muted/55 p-3.5 sm:p-4 dark:bg-white/[0.03]">
      {keys.map((key) => (
        <div key={key} className="grid gap-0.5">
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{label(key)}</dt>
          <dd className="whitespace-pre-line text-[14.5px] leading-relaxed text-pretty [overflow-wrap:anywhere]">
            {answers[key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Decision({ app }: { readonly app: Application }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
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
        {t(accepted ? 'applicationsCard.acceptedBy' : 'applicationsCard.rejectedBy', {
          name: app.decidedBy ?? '?',
          time: app.decidedAt ? time.relative(app.decidedAt) : '',
        })}
      </p>
      {app.note ? (
        <p className="text-foreground/85 [overflow-wrap:anywhere]">
          {t('applicationsCard.noteShown', { note: app.note })}
        </p>
      ) : null}
    </div>
  );
}

/** Annehmen / Ablehnen – each asks once more and takes an optional note. */
function DecideButtons({ app }: { readonly app: Application }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const noteId = useId();
  const [choice, setChoice] = useState<'accept' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const name = app.minecraftName;
  const decide = useMutation({
    mutationFn: (accept: boolean) =>
      mmApi<Application>(`/api/panel/applications/${app.id}/decide`, {
        method: 'POST',
        body: { accept, note: note.trim() },
      }),
    onSuccess: async (result) => {
      setChoice(null);
      setNote('');
      toast.success(
        result.status === 'accepted'
          ? t('applicationsCard.acceptedToast', { name })
          : t('applicationsCard.rejectedToast', { name }),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: WHITELIST_KEY }),
      ]);
    },
    onError: async (err) => {
      toast.error(errorText(err));
      // Decided elsewhere (Discord, another team member): show the current state.
      await queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY });
      setChoice(null);
    },
  });
  const accept = choice === 'accept';
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setChoice('accept')}>
        <UserCheck />
        {t('applicationsCard.accept')}
      </Button>
      <Button size="sm" variant="danger" onClick={() => setChoice('reject')}>
        <UserX />
        {t('applicationsCard.reject')}
      </Button>
      <ConfirmDialog
        open={choice !== null}
        onOpenChange={(open) => {
          if (!open) setChoice(null);
        }}
        title={t(accept ? 'applicationsCard.acceptTitle' : 'applicationsCard.rejectTitle', { name })}
        text={t(accept ? 'applicationsCard.acceptText' : 'applicationsCard.rejectText', { name })}
        confirm={t(accept ? 'applicationsCard.accept' : 'applicationsCard.reject')}
        icon={accept ? UserCheck : UserX}
        danger={!accept}
        busy={decide.isPending}
        onConfirm={() => decide.mutate(accept)}
      >
        <div className="grid gap-1.5">
          <label htmlFor={noteId} className="text-sm font-semibold">
            {t(accept ? 'applicationsCard.noteAccept' : 'applicationsCard.noteReject')}
          </label>
          <Textarea
            id={noteId}
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(
              accept ? 'applicationsCard.noteAcceptPlaceholder' : 'applicationsCard.noteRejectPlaceholder',
            )}
            className="min-h-20"
          />
          <p className="text-[13px] leading-snug text-muted-foreground">
            {t(accept ? 'applicationsCard.noteAcceptHelp' : 'applicationsCard.noteRejectHelp', { name })}
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function ApplicationItem({ app }: { readonly app: Application }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const bedrock = isBedrockName(app.minecraftName);
  return (
    <li className="grid gap-4 px-3.5 py-5 sm:px-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3.5">
          <NameHead name={app.minecraftName} />
          <div className="grid min-w-0 gap-1">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="min-w-0 text-[15px] font-bold [overflow-wrap:anywhere]">
                {app.minecraftName}
              </span>
              {bedrock ? <Pill tone="blue">{t('applicationsCard.bedrock')}</Pill> : null}
              <span className="text-xs text-muted-foreground">#{app.id}</span>
            </p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <Meta icon={MessagesSquare}>
                {app.discordName
                  ? t('applicationsCard.discord', { name: app.discordName })
                  : t('applicationsCard.noDiscord')}
              </Meta>
              <Meta icon={app.via === 'website' ? Globe : ClipboardList}>
                {t(`applicationsCard.via.${app.via}`)}
              </Meta>
              <span title={time.date(app.createdAt)}>
                <Meta icon={CalendarDays}>{time.relative(app.createdAt)}</Meta>
              </span>
            </p>
          </div>
        </div>
        {app.status === 'pending' ? <DecideButtons app={app} /> : null}
      </div>
      <Answers answers={app.answers} />
      <Decision app={app} />
    </li>
  );
}

/** Einstellungen → MorniCraft: who wants to join, with their answers – accept or reject. */
export function ApplicationsCard({ open }: { readonly open: boolean }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const [status, setStatus] = useState<ApplicationStatus>('pending');
  const pending = useApplicationsQuery('pending');
  const list = useApplicationsQuery(status);
  const rows = list.data ?? [];
  const EmptyIcon = EMPTY_ICON[status];
  const address = `${window.location.origin}${APPLY_PATH}`;

  return (
    <ExtraCard
      id="bewerbungen"
      icon={ClipboardList}
      title={t('applicationsCard.title')}
      text={t('applicationsCard.text')}
      aside={
        <Link to={{ hash: OPEN_SETTING }} title={t('applicationsCard.openSetting')}>
          <Pill tone={open ? 'success' : 'neutral'} dot className="px-3 py-1 text-[13px]">
            {open ? t('applicationsCard.open') : t('applicationsCard.closed')}
          </Pill>
        </Link>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('applicationsCard.filter')}>
          {APPLICATION_STATUSES.map((s) => (
            <FilterChip
              key={s}
              active={status === s}
              onClick={() => setStatus(s)}
              count={s === 'pending' ? pending.data?.length : undefined}
            >
              {t(`applicationsCard.status.${s}`)}
            </FilterChip>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span>{t('applicationsCard.page')}</span>
          <a
            href={APPLY_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 font-mono text-foreground underline-offset-2 [overflow-wrap:anywhere] hover:underline"
          >
            {address.replace(SCHEME, '')}
          </a>
          <CopyButton value={address} variant="secondary" className="min-w-0" />
        </div>
      </div>

      {list.isError ? <p className="text-muted-foreground">{errorText(list.error)}</p> : null}
      {list.isPending ? (
        <Card className="grid divide-y divide-border shadow-none">
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="flex items-start gap-3.5 px-5 py-5">
              <Skeleton className="size-11" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ))}
        </Card>
      ) : null}
      {list.isSuccess && !rows.length ? (
        <div className="grid justify-items-center gap-2 rounded-[14px] border border-dashed border-border px-6 py-10 text-center">
          <span
            className="grid size-11 place-items-center rounded-[13px] bg-muted text-muted-foreground"
            aria-hidden
          >
            <EmptyIcon className="size-5" />
          </span>
          <p className="font-semibold">{t(`applicationsCard.empty.${status}`)}</p>
          {status === 'pending' && !open ? (
            <p className="max-w-[52ch] text-sm text-muted-foreground">{t('applicationsCard.emptyClosed')}</p>
          ) : null}
        </div>
      ) : null}
      {rows.length ? (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <ul className="grid divide-y divide-border">
            {rows.map((app) => (
              <ApplicationItem key={app.id} app={app} />
            ))}
          </ul>
        </div>
      ) : null}
    </ExtraCard>
  );
}
