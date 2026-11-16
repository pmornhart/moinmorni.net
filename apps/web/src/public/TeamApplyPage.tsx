import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  Hourglass,
  Link2,
  Lock,
  LogIn,
  MessagesSquare,
  PartyPopper,
  Send,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { Text } from '@moinmorni/shared';
import { Input, Skeleton, Textarea } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { errorCode, useErrorText } from '~/lib/errors';
import { INVALID_FIELD, MINECRAFT_NAME_MAX, validMinecraftName } from '~/lib/minecraft-name';
import { mmApi } from '~/lib/mm-api';
import type { PublicRole } from '~/lib/site';
import { useLanguage, usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import {
  DiscordInvite,
  ERROR_PARAM,
  FIELD,
  Field,
  isLoginError,
  LoginBanner,
  SignedIn,
  StateCard,
} from './apply-parts';
import { Cmd, GameButton, Panel, RankBlock, RankTag } from './kit';
import { PageHero } from './page-hero';
import { WRAP } from './parts';

/**
 * /team/bewerben – apply for a team position (Moderator, Supporter, Builder …): sign in with Discord (the same sign-in
 * as for MorniCraft), choose a position, answer its questions, see the own applications with the team's answer.
 * API: apps/server/src/applications/routes.ts.
 */

type Status = 'pending' | 'accepted' | 'rejected';
type BlockCode =
  'team_apply_closed' | 'team_apply_pending' | 'team_apply_cooldown' | 'team_apply_link_required';

interface Position {
  readonly id: string;
  readonly role: PublicRole;
  readonly text: Text;
  readonly questions: { readonly de: readonly string[]; readonly en: readonly string[] };
}

interface MyApplication {
  readonly id: number;
  readonly position: string | null;
  readonly status: Status;
  readonly minecraftName: string;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  readonly note: string | null;
}

interface TeamApplyState {
  readonly positions: readonly Position[];
  readonly discordLogin: boolean;
  readonly rules: {
    readonly cooldownDays: number;
    readonly linkedRequired: boolean;
    readonly onePending: boolean;
  };
  readonly me: { readonly name: string; readonly minecraft: { readonly name: string } | null } | null;
  readonly blocked: { readonly code: BlockCode; readonly until: string | null } | null;
  readonly applications: readonly MyApplication[];
}

const TEAM_APPLY_KEY = ['team-apply'] as const;
/** The same Discord sign-in as for MorniCraft – it comes back here. */
const LOGIN_URL = '/api/public/apply/login?ziel=team';
const ANSWER_MAX = 1000;
const DRAFT_KEY = 'mm-team-apply-draft';
/** Codes after which the page asks the server again (signed out, closed meanwhile …). */
const REFRESH_CODES = new Set([
  'apply_login_required',
  'team_apply_closed',
  'team_apply_pending',
  'team_apply_cooldown',
  'team_apply_link_required',
  'team_position_unknown',
]);

const STATUS_LOOK: Readonly<Record<Status, { readonly icon: LucideIcon; readonly className: string }>> = {
  pending: { icon: Hourglass, className: 'border-blue/30 bg-blue-soft text-blue' },
  accepted: { icon: PartyPopper, className: 'border-success/30 bg-success-soft text-success' },
  rejected: { icon: UserX, className: 'border-border bg-muted text-muted-foreground' },
};

function useTeamApplyState(): UseQueryResult<TeamApplyState> {
  return useQuery({
    queryKey: TEAM_APPLY_KEY,
    queryFn: () => mmApi<TeamApplyState>('/api/public/team-apply'),
  });
}

interface Draft {
  readonly position: string;
  readonly answers: readonly string[];
  readonly minecraftName: string;
}

const EMPTY_DRAFT: Draft = { position: '', answers: [], minecraftName: '' };

/** The answers survive the trip to Discord and back (sign-in expired while writing) – in this tab only. */
function storedDraft(): Draft {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_DRAFT;
    const record = parsed as Record<string, unknown>;
    const answers = Array.isArray(record['answers'])
      ? record['answers'].map((a) => (typeof a === 'string' ? a : ''))
      : [];
    return {
      position: typeof record['position'] === 'string' ? record['position'] : '',
      answers,
      minecraftName: typeof record['minecraftName'] === 'string' ? record['minecraftName'] : '',
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function storeDraft(draft: Draft | null): void {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Without storage the answers just stay in the page.
  }
}

function SignInCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <StateCard icon={LogIn} tone="gold" title={t('teamApply.signIn.title')}>
      <p>{t('teamApply.signIn.text')}</p>
      <p className="flex items-start gap-2.5 rounded-[6px] border-2 border-border bg-background-alt px-4 py-3 text-[14px] text-muted-foreground">
        <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('apply.signIn.privacy')}
      </p>
      <GameButton asChild tone="blue" size="lg" className="justify-self-start">
        {/* A real page change: the server sends the browser on to Discord and back. */}
        <a href={LOGIN_URL}>
          <LogIn />
          {t('apply.signIn.button')}
        </a>
      </GameButton>
    </StateCard>
  );
}

/** Pending, waiting time after a rejection or Minecraft account not linked yet. */
function BlockedCard({
  blocked,
  me,
}: {
  readonly blocked: NonNullable<TeamApplyState['blocked']>;
  readonly me: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const signedIn = <SignedIn name={me} />;
  if (blocked.code === 'team_apply_link_required')
    return (
      <StateCard icon={Link2} tone="gold" title={t('teamApply.link.title')}>
        <p>{t('teamApply.link.text')}</p>
        <ol className="grid list-decimal gap-1.5 pl-5">
          <li>
            {t('teamApply.link.step1')} <Cmd>/discord</Cmd>
          </li>
          <li>
            {t('teamApply.link.step2')} <Cmd>/verbinden</Cmd>
          </li>
          <li>{t('teamApply.link.step3')}</li>
        </ol>
        <DiscordInvite tone="blue" />
        {signedIn}
      </StateCard>
    );
  if (blocked.code === 'team_apply_cooldown')
    return (
      <StateCard icon={CalendarClock} tone="neutral" title={t('teamApply.cooldown.title')}>
        <p>{t('teamApply.cooldown.text', { date: blocked.until ? time.date(blocked.until) : '' })}</p>
        {signedIn}
      </StateCard>
    );
  return (
    <StateCard icon={Hourglass} tone="blue" title={t('teamApply.pending.title')}>
      <p>{t('teamApply.pending.text')}</p>
      <p className="flex items-start gap-2.5 rounded-[6px] border-2 border-gold/30 bg-gold-soft px-4 py-3 text-[14px] text-gold-strong">
        <MessagesSquare className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('apply.status.pendingTip')}
      </p>
      <DiscordInvite />
      {signedIn}
    </StateCard>
  );
}

/** Choose a position: one card per open position with the role's colour and a short text. */
function PositionChoice({
  positions,
  value,
  onChange,
}: {
  readonly positions: readonly Position[];
  readonly value: string;
  readonly onChange: (id: string) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const name = useId();
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-2 font-pixel text-[1.1rem] font-bold">{t('teamApply.form.position')}</legend>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {positions.map((p) => (
          <label
            key={p.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-[8px] border-2 px-3.5 py-3 transition-colors',
              value === p.id
                ? 'border-primary bg-primary/[0.07] shadow-[0_3px_0_rgba(0,0,0,0.12)]'
                : 'border-border bg-card hover:border-muted-foreground/40',
            )}
          >
            <input
              type="radio"
              name={name}
              value={p.id}
              checked={value === p.id}
              onChange={() => onChange(p.id)}
              className="sr-only"
            />
            <RankBlock role={p.role} className="size-10 text-lg" />
            <span className="grid min-w-0 gap-1">
              <RankTag role={p.role} size="md" />
              <span className="text-[13.5px] leading-snug text-muted-foreground text-pretty">
                {pick(p.text)}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TeamForm({ state }: { readonly state: TeamApplyState }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const base = useId();
  const me = state.me ?? { name: '', minecraft: null };
  const [draft, setDraft] = useState<Draft>(() => {
    const stored = storedDraft();
    const known = state.positions.some((p) => p.id === stored.position);
    return known ? stored : { ...stored, position: state.positions[0]?.id ?? '' };
  });
  useEffect(() => storeDraft(draft), [draft]);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const position = state.positions.find((p) => p.id === draft.position);
  const questions = position ? position.questions[language] : [];
  const answers = questions.map((_, i) => draft.answers[i] ?? '');
  const needsName = !me.minecraft;
  const nameOk = !needsName || validMinecraftName(draft.minecraftName);
  const missing = answers.map((a) => !a.trim());
  const ready = Boolean(position) && nameOk && !missing.some(Boolean);
  const setAnswer = (i: number, value: string): void => {
    setDraft((d) => ({ ...d, answers: questions.map((_, k) => (k === i ? value : (d.answers[k] ?? ''))) }));
    setFailure(null);
  };

  const send = useMutation({
    mutationFn: () =>
      mmApi<MyApplication>('/api/public/team-apply', {
        method: 'POST',
        anonymous: true,
        body: {
          position: draft.position,
          answers: answers.map((a) => a.trim()),
          lang: language,
          ...(needsName ? { minecraftName: draft.minecraftName.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      storeDraft(null);
      await queryClient.invalidateQueries({ queryKey: TEAM_APPLY_KEY });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: async (err) => {
      setFailure(errorText(err));
      if (REFRESH_CODES.has(errorCode(err)))
        await queryClient.invalidateQueries({ queryKey: TEAM_APPLY_KEY });
    },
  });
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTried(true);
    if (ready) send.mutate();
  };

  return (
    <Panel className="grid content-start gap-6 p-6 sm:p-8">
      <div className="grid gap-3">
        <h2 className="font-pixel text-[clamp(1.6rem,3.6vw,2rem)] font-bold leading-tight">
          {t('teamApply.form.title')}
        </h2>
        <SignedIn name={me.name} />
      </div>
      <form onSubmit={submit} noValidate className="grid gap-6">
        <PositionChoice
          positions={state.positions}
          value={draft.position}
          onChange={(id) => setDraft((d) => ({ ...d, position: id, answers: [] }))}
        />
        {me.minecraft ? (
          <p className="flex items-start gap-2.5 rounded-[6px] border-2 border-success/30 bg-success-soft px-4 py-3 text-[14px] text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>{t('teamApply.form.linked', { name: me.minecraft.name })}</span>
          </p>
        ) : (
          <Field
            id={`${base}-name`}
            label={t('apply.form.name')}
            problem={tried && !nameOk ? t('apply.form.nameProblem') : undefined}
            help={t('teamApply.form.nameHelp')}
          >
            <Input
              id={`${base}-name`}
              value={draft.minecraftName}
              onChange={(e) => setDraft((d) => ({ ...d, minecraftName: e.target.value }))}
              maxLength={MINECRAFT_NAME_MAX}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={t('apply.form.namePlaceholder')}
              aria-invalid={tried && !nameOk ? true : undefined}
              aria-describedby={`${base}-name-help`}
              className={cn(FIELD, 'max-w-sm font-semibold', INVALID_FIELD)}
            />
          </Field>
        )}
        {questions.map((question, i) => {
          const id = `${base}-q${i}`;
          const problem = tried && missing[i] ? t('teamApply.form.answerProblem') : undefined;
          return (
            <Field
              key={`${draft.position}-${question}`}
              id={id}
              label={question}
              problem={problem}
              count={t('apply.form.count', { count: answers[i]?.trim().length ?? 0, max: ANSWER_MAX })}
            >
              <Textarea
                id={id}
                value={answers[i] ?? ''}
                onChange={(e) => setAnswer(i, e.target.value)}
                maxLength={ANSWER_MAX}
                rows={3}
                aria-invalid={problem ? true : undefined}
                aria-describedby={`${id}-help`}
                className={cn(FIELD, INVALID_FIELD)}
              />
            </Field>
          );
        })}
        {failure ? (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-[6px] border-2 border-destructive/30 bg-destructive-soft px-4 py-3 text-[14px] font-semibold text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {failure}
          </p>
        ) : null}
        {tried && !ready && !failure ? (
          <p role="alert" className="text-[14px] font-semibold text-destructive">
            {t('teamApply.form.notReady')}
          </p>
        ) : null}
        <div className="grid gap-4 border-t-2 border-border pt-5">
          <p className="text-[14px] text-muted-foreground text-pretty">
            {t('teamApply.form.who', { name: me.name })}
          </p>
          <GameButton
            type="submit"
            tone="emerald"
            size="lg"
            className="justify-self-start"
            disabled={send.isPending}
          >
            <Send />
            {send.isPending ? t('apply.form.sending') : t('apply.form.send')}
          </GameButton>
        </div>
      </form>
    </Panel>
  );
}

/** The own applications with the team's answer. */
function MyApplications({
  list,
  positions,
}: {
  readonly list: readonly MyApplication[];
  readonly positions: readonly Position[];
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const time = useTimeText();
  return (
    <Panel className="grid content-start gap-4 p-6">
      <h2 className="font-pixel text-[1.5rem] font-bold">{t('teamApply.mine.title')}</h2>
      <ul className="grid gap-3">
        {list.map((a) => {
          const look = STATUS_LOOK[a.status];
          const Icon = look.icon;
          const role = positions.find((p) => p.id === a.position)?.role;
          return (
            <li key={a.id} className={cn('grid gap-2 rounded-[8px] border-2 px-4 py-3', look.className)}>
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <Icon className="size-4 shrink-0" aria-hidden />
                {t(`teamApply.mine.${a.status}`, { position: role ? pick(role.name) : (a.position ?? '') })}
              </p>
              <p className="text-[13.5px] text-foreground/80">
                {t('teamApply.mine.sent', { date: time.date(a.createdAt), name: a.minecraftName })}
              </p>
              {a.note ? (
                <p className="whitespace-pre-line rounded-[6px] bg-background/60 px-3 py-2 text-[14px] text-foreground [overflow-wrap:anywhere]">
                  {t('teamApply.mine.note', { note: a.note })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function MainPart({ state }: { readonly state: TeamApplyState }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const mine = state.applications.length ? (
    <MyApplications list={state.applications} positions={state.positions} />
  ) : null;
  const main = ((): ReactElement => {
    if (!state.positions.length)
      return (
        <StateCard icon={Lock} tone="neutral" title={t('teamApply.closed.title')}>
          <p>{t('teamApply.closed.text')}</p>
          <DiscordInvite />
        </StateCard>
      );
    if (!state.discordLogin)
      return (
        <StateCard icon={MessagesSquare} tone="neutral" title={t('apply.noLogin.title')}>
          <p>
            {t('teamApply.noLogin')} <Cmd>/bewerben</Cmd>
          </p>
          <DiscordInvite tone="blue" />
        </StateCard>
      );
    if (!state.me) return <SignInCard />;
    if (state.blocked) return <BlockedCard blocked={state.blocked} me={state.me.name} />;
    return <TeamForm state={state} />;
  })();
  return (
    <>
      {main}
      {mine}
    </>
  );
}

/** "Wir suchen …" and how it goes on after sending. */
function Aside({ state }: { readonly state: TeamApplyState | undefined }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const steps = ['step1', 'step2', 'step3'] as const;
  return (
    <div className="grid min-w-0 gap-6">
      {state?.positions.length ? (
        <Panel className="grid content-start gap-4 p-6">
          <h2 className="flex items-center gap-2 font-pixel text-[1.5rem] font-bold">
            <Users className="size-5 text-gold" aria-hidden />
            {t('teamApply.search')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {state.positions.map((p) => (
              <li key={p.id}>
                <RankTag role={p.role} size="md" />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel className="grid content-start gap-5 p-6">
        <h2 className="font-pixel text-[1.5rem] font-bold">{t('apply.how.title')}</h2>
        <ol className="grid gap-4">
          {steps.map((step, i) => (
            <li key={step} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
              <span
                className="grid size-9 place-items-center rounded-[5px] border-2 border-black/25 bg-gold-bright font-pixel text-[1.1rem] font-bold text-[#2a1b00] shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]"
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="grid gap-0.5 pt-0.5">
                <span className="font-semibold leading-snug">{t(`teamApply.how.${step}`)}</span>
                <span className="text-[14px] leading-relaxed text-muted-foreground">
                  {t(`teamApply.how.${step}Text`, { days: state?.rules.cooldownDays ?? 0 })}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <Link
          to="/team"
          className="justify-self-start font-pixel text-[15px] font-semibold uppercase tracking-[0.04em] text-primary hover:underline"
        >
          {t('teamApply.meetTeam')}
        </Link>
      </Panel>
      <Panel className="flex items-start gap-3 p-5 text-[14px] leading-relaxed text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <span className="text-pretty">{t('teamApply.fair')}</span>
      </Panel>
    </div>
  );
}

/** /team/bewerben – apply for the team with Discord sign-in. */
export function TeamApplyPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [params, setParams] = useSearchParams();
  const apply = useTeamApplyState();
  const loginError = params.get(ERROR_PARAM);
  const closeBanner = (): void =>
    setParams(
      (p) => {
        p.delete(ERROR_PARAM);
        return p;
      },
      { replace: true },
    );
  return (
    <>
      <PageHero
        eyebrow={t('teamApply.eyebrow')}
        title={t('teamApply.title')}
        text={t('teamApply.text')}
        scene="biergarten"
      />
      <div className={cn(WRAP, 'grid max-w-[1140px] gap-6 py-12 sm:py-14')}>
        {isLoginError(loginError) ? <LoginBanner code={loginError} onClose={closeBanner} /> : null}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-6">
            {apply.isPending ? <Skeleton className="h-80 rounded-[10px]" /> : null}
            {apply.isError ? (
              <Panel className="flex items-start gap-3 p-6 text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
                {t('site.loadError')}
              </Panel>
            ) : null}
            {apply.data ? <MainPart state={apply.data} /> : null}
          </div>
          <Aside state={apply.data} />
        </div>
      </div>
    </>
  );
}
