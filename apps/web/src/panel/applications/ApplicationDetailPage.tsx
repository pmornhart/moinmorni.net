import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Globe,
  Languages,
  Lock,
  MessagesSquare,
  NotebookPen,
  Send,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  UserRoundPlus,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button, Card, Input, Label, Skeleton, Switch, Textarea } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { AreaGate } from '../AreaGate';
import { Notice } from '../settings/extras/parts';
import { AccessDialog, ConfirmDialog, type AccessData } from '../team/dialogs';
import {
  APPLICATIONS_ROOT,
  NOTE_MAX,
  detailKey,
  useApplication,
  useApplicationList,
  type ApplicationDetail,
  type DecideResult,
  type PositionView,
  type VoteCount,
} from './model';
import { ApplicantHead, DecisionBox, PositionBadge, StatusPill } from './parts';

const VOTE_UP = 1;
const VOTE_DOWN = -1;
const VOTE_NONE = 0;
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const EMAIL_MAX = 254;
/** MorniCraft's form keys; team answers are keyed by their question. */
const MORNICRAFT_ORDER = ['about', 'why', 'age'] as const;

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

function SideCard({
  icon: Icon,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card className="grid min-w-0 content-start gap-4 p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Icon className="size-[18px] text-gold" aria-hidden />
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Answers({ app }: { readonly app: ApplicationDetail }): ReactElement {
  const { t, i18n } = useTranslation(MM_NAMESPACE);
  const known: readonly string[] = MORNICRAFT_ORDER;
  const keys =
    app.kind === 'mornicraft'
      ? [...MORNICRAFT_ORDER, ...Object.keys(app.answers).filter((k) => !known.includes(k))]
      : Object.keys(app.answers);
  const label = (key: string): string => {
    const text = `applicationsCard.answers.${key}`;
    return app.kind === 'mornicraft' && i18n.exists(text, { ns: MM_NAMESPACE }) ? t(text) : key;
  };
  const shown = keys.filter((k) => Boolean(app.answers[k]?.trim()));
  return (
    <Card className="grid min-w-0 content-start gap-4 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <ClipboardList className="size-[18px] text-gold" aria-hidden />
        {t('applications.answers')}
      </h2>
      {shown.length ? (
        <dl className="grid gap-4">
          {shown.map((key) => (
            <div
              key={key}
              className="grid gap-1 rounded-[14px] bg-muted/55 p-3.5 sm:p-4 dark:bg-white/[0.03]"
            >
              <dt className="text-[13px] font-bold text-muted-foreground">{label(key)}</dt>
              <dd className="whitespace-pre-line text-[15px] leading-relaxed text-pretty [overflow-wrap:anywhere]">
                {app.answers[key]}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground">{t('applications.noAnswers')}</p>
      )}
    </Card>
  );
}

function Votes({ app }: { readonly app: ApplicationDetail }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const vote = useMutation({
    mutationFn: (value: number) =>
      mmApi<VoteCount & { voters: ApplicationDetail['voters'] }>(`/api/panel/applications/${app.id}/vote`, {
        method: 'PUT',
        body: { vote: value },
      }),
    onSuccess: (view) => {
      queryClient.setQueryData<ApplicationDetail>(detailKey(app.id), (old) =>
        old ? { ...old, votes: { up: view.up, down: view.down, mine: view.mine }, voters: view.voters } : old,
      );
      void queryClient.invalidateQueries({ queryKey: [...APPLICATIONS_ROOT, 'all'] });
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const mine = app.votes.mine;
  const toggle = (value: number): void => vote.mutate(mine === value ? VOTE_NONE : value);
  return (
    <SideCard icon={ThumbsUp} title={t('applications.votes')}>
      <p className="text-[13.5px] text-muted-foreground">{t('applications.votesText')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={mine === VOTE_UP ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={mine === VOTE_UP}
          disabled={vote.isPending}
          onClick={() => toggle(VOTE_UP)}
        >
          <ThumbsUp />
          {t('applications.voteUp')}
          <span className="tabular">{app.votes.up}</span>
        </Button>
        <Button
          variant={mine === VOTE_DOWN ? 'danger' : 'secondary'}
          className={cn(mine === VOTE_DOWN && 'border-destructive bg-destructive-soft')}
          size="sm"
          aria-pressed={mine === VOTE_DOWN}
          disabled={vote.isPending}
          onClick={() => toggle(VOTE_DOWN)}
        >
          <ThumbsDown />
          {t('applications.voteDown')}
          <span className="tabular">{app.votes.down}</span>
        </Button>
      </div>
      {app.voters.length ? (
        <ul className="flex flex-wrap gap-1.5 text-[13px]">
          {app.voters.map((v) => (
            <li
              key={v.name}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold',
                v.vote > 0 ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
              )}
            >
              {v.vote > 0 ? (
                <ThumbsUp className="size-3" aria-hidden />
              ) : (
                <ThumbsDown className="size-3" aria-hidden />
              )}
              {v.name}
            </li>
          ))}
        </ul>
      ) : null}
    </SideCard>
  );
}

function Notes({ app }: { readonly app: ApplicationDetail }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const time = useTimeText();
  const queryClient = useQueryClient();
  const id = useId();
  const [text, setText] = useState('');
  const add = useMutation({
    mutationFn: () =>
      mmApi(`/api/panel/applications/${app.id}/notes`, { method: 'POST', body: { text: text.trim() } }),
    onSuccess: async () => {
      setText('');
      await queryClient.invalidateQueries({ queryKey: APPLICATIONS_ROOT });
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (text.trim()) add.mutate();
  };
  return (
    <SideCard icon={NotebookPen} title={t('applications.notes')}>
      <p className="flex items-start gap-2 text-[13.5px] text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('applications.notesText')}
      </p>
      {app.notesList.length ? (
        <ol className="grid gap-2.5">
          {app.notesList.map((n) => (
            <li
              key={n.id}
              className="grid gap-1 rounded-[12px] border border-border bg-muted/40 px-3.5 py-2.5"
            >
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px] text-muted-foreground">
                <span className="font-semibold text-foreground">{n.author}</span>
                <span title={time.date(n.createdAt)}>{time.relative(n.createdAt)}</span>
              </p>
              <p className="whitespace-pre-line text-[14px] leading-relaxed [overflow-wrap:anywhere]">
                {n.text}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
      <form onSubmit={submit} className="grid gap-2">
        <label htmlFor={id} className="sr-only">
          {t('applications.notePlaceholder')}
        </label>
        <Textarea
          id={id}
          value={text}
          maxLength={NOTE_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('applications.notePlaceholder')}
          className="min-h-20"
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="justify-self-start"
          disabled={!text.trim() || add.isPending}
        >
          <NotebookPen />
          {t('applications.noteSave')}
        </Button>
      </form>
    </SideCard>
  );
}

function Decide({
  app,
  positions,
  onAccount,
}: {
  readonly app: ApplicationDetail;
  readonly positions: readonly PositionView[];
  /** A panel account was created with the acceptance: show its start password (outside, it outlives this card). */
  readonly onAccount: (access: AccessData) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const pick = usePick();
  const time = useTimeText();
  const queryClient = useQueryClient();
  const noteId = useId();
  const userId = useId();
  const mailId = useId();
  const switchId = useId();
  const [choice, setChoice] = useState<'accept' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [withAccount, setWithAccount] = useState(false);
  const [username, setUsername] = useState(app.suggestedUsername);
  const [email, setEmail] = useState('');
  const name = app.minecraftName;
  const role = positions.find((p) => p.id === app.position)?.role;
  const roleName = role ? pick(role.name) : (app.position ?? '');
  const decide = useMutation({
    mutationFn: (accept: boolean) =>
      mmApi<DecideResult>(`/api/panel/applications/${app.id}/decide`, {
        method: 'POST',
        body: {
          accept,
          note: note.trim(),
          ...(accept && withAccount && app.accountPossible
            ? { account: { username: username.trim(), ...(email.trim() ? { email: email.trim() } : {}) } }
            : {}),
        },
      }),
    onSuccess: async (result) => {
      setChoice(null);
      toast.success(
        result.status === 'accepted'
          ? t('applications.acceptedToast', { name })
          : t('applications.rejectedToast', { name }),
      );
      if (result.account) onAccount({ ...result.account, kind: 'created' });
      await queryClient.invalidateQueries({ queryKey: APPLICATIONS_ROOT });
    },
    onError: async (err) => {
      setChoice(null);
      toast.error(errorText(err));
      await queryClient.invalidateQueries({ queryKey: APPLICATIONS_ROOT });
    },
  });

  if (app.status !== 'pending')
    return (
      <SideCard icon={UserCheck} title={t('applications.decision')}>
        <DecisionBox app={app} time={app.decidedAt ? time.relative(app.decidedAt) : ''} />
      </SideCard>
    );
  if (!app.canDecide)
    return (
      <SideCard icon={UserCheck} title={t('applications.decision')}>
        <Notice tone="neutral" icon={Lock}>
          {app.kind === 'team'
            ? t('applications.noRight', { role: roleName })
            : t('applications.noRightMornicraft')}
        </Notice>
      </SideCard>
    );

  const accept = choice === 'accept';
  const accountReady = !withAccount || username.trim().length >= USERNAME_MIN;
  const confirmText = ((): string => {
    if (!accept) return t('applications.rejectText', { name });
    if (app.kind === 'mornicraft') return t('applications.acceptTextMornicraft', { name });
    return t('applications.acceptText', { name, role: roleName });
  })();
  return (
    <SideCard icon={UserCheck} title={t('applications.decision')}>
      <div className="grid gap-1.5">
        <label htmlFor={noteId} className="text-sm font-semibold">
          {t('applications.messageLabel', { name })}
        </label>
        <Textarea
          id={noteId}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('applications.messagePlaceholder')}
          className="min-h-24"
        />
        <p className="text-[13px] leading-snug text-muted-foreground">{t('applications.messageHelp')}</p>
      </div>
      {app.accountPossible ? (
        <div className="grid gap-3 rounded-[14px] border border-border bg-muted/40 p-3.5">
          <div className="flex items-start gap-3">
            <Switch id={switchId} checked={withAccount} onCheckedChange={setWithAccount} />
            <Label htmlFor={switchId} className="grid gap-0.5">
              <span className="flex items-center gap-1.5 font-semibold">
                <UserRoundPlus className="size-4 text-muted-foreground" aria-hidden />
                {t('applications.account')}
              </span>
              <span className="text-[13px] font-normal text-muted-foreground">
                {t('applications.accountText', { role: roleName })}
              </span>
            </Label>
          </div>
          {withAccount ? (
            <div className="grid gap-2.5">
              <div className="grid gap-1">
                <label htmlFor={userId} className="text-[13px] font-semibold">
                  {t('applications.username')}
                </label>
                <Input
                  id={userId}
                  value={username}
                  maxLength={USERNAME_MAX}
                  autoComplete="off"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor={mailId} className="text-[13px] font-semibold">
                  {t('applications.email')}
                </label>
                <Input
                  id={mailId}
                  type="email"
                  value={email}
                  maxLength={EMAIL_MAX}
                  autoComplete="off"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setChoice('accept')} disabled={!accountReady}>
          <UserCheck />
          {t('applications.accept')}
        </Button>
        <Button variant="danger" onClick={() => setChoice('reject')}>
          <UserX />
          {t('applications.reject')}
        </Button>
      </div>
      <ConfirmDialog
        open={choice !== null}
        onOpenChange={(open) => {
          if (!open) setChoice(null);
        }}
        title={t(accept ? 'applications.acceptTitle' : 'applications.rejectTitle', { name })}
        text={confirmText}
        confirm={t(accept ? 'applications.accept' : 'applications.reject')}
        icon={accept ? UserCheck : UserX}
        danger={!accept}
        busy={decide.isPending}
        onConfirm={() => decide.mutate(accept)}
      >
        {note.trim() ? (
          <p className="whitespace-pre-line rounded-[12px] bg-muted/60 px-3.5 py-2.5 text-sm [overflow-wrap:anywhere]">
            {t('applications.message', { note: note.trim() })}
          </p>
        ) : null}
        {accept && withAccount && app.accountPossible ? (
          <p className="text-sm text-muted-foreground">
            {t('applications.accountConfirm', { username: username.trim() })}
          </p>
        ) : null}
      </ConfirmDialog>
    </SideCard>
  );
}

function Detail({ id }: { readonly id: number }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const time = useTimeText();
  const detail = useApplication(id);
  const list = useApplicationList({ position: 'all', status: 'all' });
  const positions = list.data?.positions ?? [];
  const [access, setAccess] = useState<AccessData | null>(null);

  if (detail.isPending) return <Skeleton className="h-96 rounded-[16px]" />;
  if (detail.isError) return <Card className="p-6 text-muted-foreground">{errorText(detail.error)}</Card>;
  const app = detail.data;
  return (
    <>
      <Card className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <ApplicantHead app={app} className="size-16 rounded-[16px] text-2xl" />
        <div className="grid min-w-0 flex-1 gap-2">
          <h1 className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight">
            <span className="min-w-0 [overflow-wrap:anywhere]">{app.minecraftName}</span>
            <PositionBadge app={app} positions={positions} />
            <StatusPill status={app.status} />
          </h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-muted-foreground">
            <Meta icon={MessagesSquare}>
              {app.discordName
                ? t('applications.discord', { name: app.discordName })
                : t('applications.noDiscord')}
            </Meta>
            <Meta icon={app.via === 'website' ? Globe : Send}>{t(`applications.via.${app.via}`)}</Meta>
            <span title={time.date(app.createdAt)}>
              <Meta icon={CalendarDays}>{time.relative(app.createdAt)}</Meta>
            </span>
            {app.lang ? (
              <Meta icon={Languages}>{t(`applications.lang.${app.lang === 'en' ? 'en' : 'de'}`)}</Meta>
            ) : null}
            <span className="text-xs">#{app.id}</span>
          </p>
        </div>
      </Card>
      <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Answers app={app} />
        <div className="grid min-w-0 gap-[22px]">
          <Decide key={`${app.id}-${app.status}`} app={app} positions={positions} onAccount={setAccess} />
          <Votes app={app} />
          <Notes app={app} />
        </div>
      </div>
      <AccessDialog data={access} onClose={() => setAccess(null)} />
    </>
  );
}

/** Panel → Bewerbungen → one application: answers, thumbs, notes, decision – /panel/bewerbungen/:id. */
export function ApplicationDetailPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const params = useParams();
  const id = Number(params['id']);
  return (
    <AreaGate area="players">
      <Link
        to="/bewerbungen"
        className="inline-flex items-center gap-1.5 justify-self-start text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('applications.back')}
      </Link>
      <Detail id={id} />
    </AreaGate>
  );
}
