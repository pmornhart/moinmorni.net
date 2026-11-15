import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  Hourglass,
  Lock,
  LogIn,
  LogOut,
  MessagesSquare,
  PartyPopper,
  Send,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useCopy } from '~/components/controls';
import { Input, Skeleton, Textarea } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { errorCode, useErrorText } from '~/lib/errors';
import { INVALID_FIELD, isBedrockName, MINECRAFT_NAME_MAX, validMinecraftName } from '~/lib/minecraft-name';
import { mmApi } from '~/lib/mm-api';
import { useSite } from '~/lib/site';
import { useNetworkStatus } from '~/lib/status';
import { useTimeText } from '~/lib/time';
import { modeArt } from './art';
import { Cmd, GameButton, Panel, type GameTone } from './kit';
import { PageHero } from './page-hero';
import { EXTERNAL, FALLBACK_ADDRESS, WRAP } from './parts';

/**
 * MorniCraft is invitation only. Here people apply: first sign in with Discord (the server keeps only the Discord
 * name, in a signed cookie for two hours), then the form. API: apps/server/src/mornicraft/routes.ts.
 */

type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

interface MyApplication {
  readonly status: ApplicationStatus;
  readonly minecraftName: string;
  readonly createdAt: string;
}

interface ApplyState {
  readonly open: boolean;
  /** Discord sign-in is set up (bot + client secret). */
  readonly discordLogin: boolean;
  readonly me: { readonly name: string } | null;
  readonly application: MyApplication | null;
}

const APPLY_KEY = ['apply'] as const;
const APPLY_MODE = 'mornicraft';
/** Form fields in the website's blocky look. */
const FIELD = 'rounded-[6px] border-2 bg-card shadow-[inset_0_3px_0_rgba(0,0,0,0.06)] dark:bg-[#0d1512]';
const LOGIN_URL = '/api/public/apply/login';
const MODE_PAGE = '/spielmodi/mornicraft';
/** Limits of the form (apps/server/src/mornicraft/applications.ts). */
const ABOUT_MIN = 20;
const ANSWER_MAX = 1000;
const AGE_MAX = 3;
/** Codes the server puts into "?fehler=" after the Discord sign-in. */
const LOGIN_ERRORS = ['discord_login_off', 'discord_login_failed'] as const;
type LoginError = (typeof LOGIN_ERRORS)[number];
const ERROR_PARAM = 'fehler';
// An age is up to three digits: "15" fits, "fünfzehn" or "15 Jahre" do not.
// https://regex101.com/?flavor=javascript&regex=%5E%5Cd%7B1%2C3%7D%24&testString=15
const AGE = /^\d{1,3}$/;

function isLoginError(value: string | null): value is LoginError {
  return LOGIN_ERRORS.some((e) => e === value);
}

function useApplyState(): UseQueryResult<ApplyState> {
  return useQuery({ queryKey: APPLY_KEY, queryFn: () => mmApi<ApplyState>('/api/public/apply') });
}

/** A big card with a round symbol, title and text – each state of the page is one. */
function StateCard({
  icon: Icon,
  tone,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly tone: 'gold' | 'success' | 'neutral' | 'blue';
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  const tones = {
    gold: 'bg-gold-bright text-[#2a1b00]',
    success: 'bg-[#2fd27a] text-[#03240f]',
    neutral: 'bg-muted text-muted-foreground',
    blue: 'bg-[#2f6db3] text-white',
  } as const;
  return (
    <Panel className="grid content-start gap-5 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span
          className={cn(
            'grid size-14 shrink-0 place-items-center rounded-[6px] border-2 border-black/25 shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-4px_0_rgba(0,0,0,0.15)]',
            tones[tone],
          )}
          aria-hidden
        >
          <Icon className="size-7" />
        </span>
        <h2 className="pt-1 font-pixel text-[clamp(1.6rem,3.6vw,2rem)] font-bold leading-[1.05] text-balance">
          {title}
        </h2>
      </div>
      <div className="grid gap-4 text-[15.5px] leading-relaxed text-pretty">{children}</div>
    </Panel>
  );
}

function DiscordInvite({ tone = 'stone' }: { readonly tone?: GameTone }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const invite = useSite().data?.discordInvite;
  if (!invite) return null;
  return (
    <GameButton asChild tone={tone} className="justify-self-start">
      <a href={invite} {...EXTERNAL}>
        <MessagesSquare />
        {t('apply.discordJoin')}
      </a>
    </GameButton>
  );
}

/** The server address with a copy button (shown after an acceptance). */
function AddressCopy({ address }: { readonly address: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { copied, copy } = useCopy(address);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border-2 border-black/40 bg-[#0b1511] p-2 pl-4 text-white shadow-[0_4px_0_rgba(0,0,0,0.25)]">
      <span className="min-w-0 truncate font-pixel text-[1.4rem] font-bold">{address}</span>
      <GameButton onClick={copy} size="sm" aria-live="polite">
        {copied ? <Check /> : <Copy />}
        {copied ? t('copy.done') : t('copy.action')}
      </GameButton>
    </div>
  );
}

function LoginBanner({
  code,
  onClose,
}: {
  readonly code: LoginError;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[8px] border-2 border-warning/40 bg-warning-soft px-4 py-3.5 text-warning"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p className="flex-1 text-[15px] font-semibold leading-relaxed text-pretty">
        {t(`apply.loginError.${code}`)}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('nav.close')}
        className="-my-1 grid size-8 cursor-pointer place-items-center rounded-[4px] text-warning hover:bg-black/10"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function SignedIn({ name }: { readonly name: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => mmApi('/api/public/apply/logout', { method: 'POST', anonymous: true }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: APPLY_KEY }),
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border-2 border-border bg-background-alt px-3.5 py-2 text-[14px]">
      <span className="flex min-w-0 items-center gap-2">
        <MessagesSquare className="size-4 shrink-0 text-blue" aria-hidden />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {t('apply.signedInAs')} <strong>{name}</strong>
        </span>
      </span>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] px-2 py-1 font-pixel text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden />
        {t('apply.logout')}
      </button>
    </div>
  );
}

function SignInCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <StateCard icon={LogIn} tone="gold" title={t('apply.signIn.title')}>
      <p>{t('apply.signIn.text')}</p>
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

interface Draft {
  readonly minecraftName: string;
  readonly about: string;
  readonly why: string;
  readonly age: string;
}

const EMPTY_DRAFT: Draft = { minecraftName: '', about: '', why: '', age: '' };
type FieldKey = keyof Draft;
const FIELD_KEYS: readonly FieldKey[] = ['minecraftName', 'about', 'why', 'age'];
/** The answers survive the trip to Discord and back (sign-in expired while writing) – in this tab only. */
const DRAFT_KEY = 'mm-apply-draft';

function storedDraft(): Draft {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_DRAFT;
    const record = parsed as Record<string, unknown>;
    const text = (key: FieldKey): string => {
      const value = record[key];
      return typeof value === 'string' ? value : '';
    };
    return Object.fromEntries(FIELD_KEYS.map((k) => [k, text(k)])) as unknown as Draft;
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

/** Which fields still do not fit – the same rules as the server. */
function problemsOf(draft: Draft): Partial<Record<FieldKey, string>> {
  const age = draft.age.trim();
  return Object.fromEntries(
    [
      ['minecraftName', validMinecraftName(draft.minecraftName) ? null : 'apply.form.nameProblem'],
      ['about', draft.about.trim().length >= ABOUT_MIN ? null : 'apply.form.aboutProblem'],
      ['why', draft.why.trim() ? null : 'apply.form.whyProblem'],
      ['age', !age || AGE.test(age) ? null : 'apply.form.ageProblem'],
    ].filter(([, problem]) => problem !== null),
  ) as Partial<Record<FieldKey, string>>;
}

function Field({
  id,
  label,
  optional,
  help,
  problem,
  count,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly optional?: boolean;
  readonly help?: ReactNode;
  readonly problem?: string;
  readonly count?: string;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <label htmlFor={id} className="font-pixel text-[1.1rem] font-bold">
          {label}
          {optional ? (
            <span className="font-sans text-[14px] font-normal text-muted-foreground">
              {' '}
              · {t('apply.form.optional')}
            </span>
          ) : null}
        </label>
        {count ? <span className="tabular text-xs text-muted-foreground">{count}</span> : null}
      </div>
      {children}
      {problem || help ? (
        <p
          id={`${id}-help`}
          className={cn(
            'text-[13.5px] leading-snug',
            problem ? 'font-semibold text-destructive' : 'text-muted-foreground',
          )}
        >
          {problem ?? help}
        </p>
      ) : null}
    </div>
  );
}

function ApplyForm({ name }: { readonly name: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const base = useId();
  const [draft, setDraft] = useState<Draft>(storedDraft);
  useEffect(() => storeDraft(draft), [draft]);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const problems = problemsOf(draft);
  const shown = tried ? problems : {};
  const ids: Readonly<Record<FieldKey, string>> = {
    minecraftName: `${base}-name`,
    about: `${base}-about`,
    why: `${base}-why`,
    age: `${base}-age`,
  };
  const set =
    (key: FieldKey) =>
    (e: { readonly target: { readonly value: string } }): void => {
      setDraft((d) => ({ ...d, [key]: e.target.value }));
      setFailure(null);
    };

  const send = useMutation({
    mutationFn: () =>
      mmApi<MyApplication>('/api/public/apply', {
        method: 'POST',
        anonymous: true,
        body: {
          minecraftName: draft.minecraftName.trim(),
          answers: { about: draft.about.trim(), why: draft.why.trim(), age: draft.age.trim() },
        },
      }),
    onSuccess: (application) => {
      storeDraft(null);
      queryClient.setQueryData<ApplyState>(APPLY_KEY, (state) => (state ? { ...state, application } : state));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: async (err) => {
      setFailure(errorText(err));
      // Signed out meanwhile or applications closed: show the page as it is now.
      const code = errorCode(err);
      if (code === 'apply_login_required' || code === 'applications_closed')
        await queryClient.invalidateQueries({ queryKey: APPLY_KEY });
    },
  });
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length) {
      document.getElementById(ids[Object.keys(problems)[0] as FieldKey])?.focus();
      return;
    }
    send.mutate();
  };
  const problemText = (key: FieldKey): string | undefined => {
    const text = shown[key];
    return text ? t(text, { min: ABOUT_MIN }) : undefined;
  };
  const describedBy = (key: FieldKey): string => `${ids[key]}-help`;
  const bedrock = isBedrockName(draft.minecraftName.trim());

  return (
    <Panel className="grid content-start gap-6 p-6 sm:p-8">
      <div className="grid gap-3">
        <h2 className="font-pixel text-[clamp(1.6rem,3.6vw,2rem)] font-bold leading-tight">
          {t('apply.form.title')}
        </h2>
        <SignedIn name={name} />
      </div>
      <form onSubmit={submit} noValidate className="grid gap-5">
        <Field
          id={ids.minecraftName}
          label={t('apply.form.name')}
          problem={problemText('minecraftName')}
          help={bedrock ? t('apply.form.nameBedrock') : t('apply.form.nameHelp')}
        >
          <Input
            id={ids.minecraftName}
            value={draft.minecraftName}
            onChange={set('minecraftName')}
            maxLength={MINECRAFT_NAME_MAX}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={t('apply.form.namePlaceholder')}
            aria-invalid={shown.minecraftName ? true : undefined}
            aria-describedby={describedBy('minecraftName')}
            className={cn(FIELD, 'max-w-sm font-semibold', INVALID_FIELD)}
          />
        </Field>
        <Field
          id={ids.about}
          label={t('apply.form.about')}
          problem={problemText('about')}
          help={t('apply.form.aboutHelp', { min: ABOUT_MIN })}
          count={t('apply.form.count', { count: draft.about.trim().length, max: ANSWER_MAX })}
        >
          <Textarea
            id={ids.about}
            value={draft.about}
            onChange={set('about')}
            maxLength={ANSWER_MAX}
            rows={5}
            placeholder={t('apply.form.aboutPlaceholder')}
            aria-invalid={shown.about ? true : undefined}
            aria-describedby={describedBy('about')}
            className={cn(FIELD, INVALID_FIELD)}
          />
        </Field>
        <Field
          id={ids.why}
          label={t('apply.form.why')}
          problem={problemText('why')}
          help={t('apply.form.whyHelp')}
          count={t('apply.form.count', { count: draft.why.trim().length, max: ANSWER_MAX })}
        >
          <Textarea
            id={ids.why}
            value={draft.why}
            onChange={set('why')}
            maxLength={ANSWER_MAX}
            rows={4}
            placeholder={t('apply.form.whyPlaceholder')}
            aria-invalid={shown.why ? true : undefined}
            aria-describedby={describedBy('why')}
            className={cn(FIELD, INVALID_FIELD)}
          />
        </Field>
        <Field
          id={ids.age}
          label={t('apply.form.age')}
          optional
          problem={problemText('age')}
          help={t('apply.form.ageHelp')}
        >
          <Input
            id={ids.age}
            value={draft.age}
            onChange={set('age')}
            maxLength={AGE_MAX}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={shown.age ? true : undefined}
            aria-describedby={describedBy('age')}
            className={cn(FIELD, 'w-28 font-semibold', INVALID_FIELD)}
          />
        </Field>
        {failure ? (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-[6px] border-2 border-destructive/30 bg-destructive-soft px-4 py-3 text-[14px] font-semibold text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {failure}
          </p>
        ) : null}
        <div className="grid gap-4 border-t-2 border-border pt-5">
          <p className="text-[14px] text-muted-foreground text-pretty">{t('apply.form.who', { name })}</p>
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

function StatusCard({
  application,
  open,
  me,
  onAgain,
}: {
  readonly application: MyApplication;
  readonly open: boolean;
  /** Discord name of the person signed in. */
  readonly me: string;
  readonly onAgain: () => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const status = useNetworkStatus();
  const address = status.data?.javaAddress ?? FALLBACK_ADDRESS;
  const name = application.minecraftName;
  const facts = (
    <dl className="grid gap-3 rounded-[8px] border-2 border-border bg-background-alt p-4 text-[14px] sm:grid-cols-2">
      <div className="grid gap-1">
        <dt className="font-pixel text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t('apply.status.name')}
        </dt>
        <dd className="text-[1.05rem] font-bold [overflow-wrap:anywhere]">{name}</dd>
      </div>
      <div className="grid gap-1">
        <dt className="font-pixel text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t('apply.status.sent')}
        </dt>
        <dd className="font-semibold">{time.date(application.createdAt)}</dd>
      </div>
    </dl>
  );
  const signedIn = <SignedIn name={me} />;
  if (application.status === 'accepted') {
    return (
      <StateCard icon={PartyPopper} tone="success" title={t('apply.status.acceptedTitle')}>
        <p>{t('apply.status.acceptedText', { name })}</p>
        {facts}
        <AddressCopy address={address} />
        <p>
          {t('apply.status.acceptedHow')} <Cmd>/server mornicraft</Cmd>
        </p>
        <GameButton asChild tone="stone" className="justify-self-start">
          <Link to={MODE_PAGE}>
            {t('apply.status.modePage')}
            <ArrowRight />
          </Link>
        </GameButton>
        {signedIn}
      </StateCard>
    );
  }
  if (application.status === 'rejected') {
    return (
      <StateCard icon={UserX} tone="neutral" title={t('apply.status.rejectedTitle')}>
        <p>{t('apply.status.rejectedText')}</p>
        {facts}
        {open ? (
          <GameButton tone="stone" className="justify-self-start" onClick={onAgain}>
            <ClipboardList />
            {t('apply.status.again')}
          </GameButton>
        ) : (
          <p className="text-[14px] text-muted-foreground">{t('apply.status.againLater')}</p>
        )}
        {signedIn}
      </StateCard>
    );
  }
  return (
    <StateCard icon={Hourglass} tone="blue" title={t('apply.status.pendingTitle')}>
      <p>{t('apply.status.pendingText')}</p>
      {facts}
      <p className="flex items-start gap-2.5 rounded-[6px] border-2 border-gold/30 bg-gold-soft px-4 py-3 text-[14px] text-gold-strong">
        <MessagesSquare className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('apply.status.pendingTip')}
      </p>
      <DiscordInvite />
      {signedIn}
    </StateCard>
  );
}

/** What happens after sending – the same for everybody. */
function HowItWorks(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const steps = ['step1', 'step2', 'step3', 'step4'] as const;
  return (
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
              <span className="font-semibold leading-snug">{t(`apply.how.${step}`)}</span>
              <span className="text-[14px] leading-relaxed text-muted-foreground">
                {t(`apply.how.${step}Text`)}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <Link
        to={MODE_PAGE}
        className="group inline-flex items-center gap-1.5 justify-self-start font-pixel text-[15px] font-semibold uppercase tracking-[0.04em] text-primary"
      >
        {t('apply.how.mode')}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
      </Link>
    </Panel>
  );
}

function MainPart({ state }: { readonly state: ApplyState }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [again, setAgain] = useState(false);
  const { application, me } = state;
  if (me && application && !(again && application.status === 'rejected' && state.open)) {
    return (
      <StatusCard application={application} open={state.open} me={me.name} onAgain={() => setAgain(true)} />
    );
  }
  if (!state.open) {
    return (
      <StateCard icon={Lock} tone="neutral" title={t('apply.closed.title')}>
        <p>{t('apply.closed.text')}</p>
        <DiscordInvite />
      </StateCard>
    );
  }
  if (!state.discordLogin) {
    return (
      <StateCard icon={MessagesSquare} tone="neutral" title={t('apply.noLogin.title')}>
        <p>
          {t('apply.noLogin.text')} <Cmd>/bewerben</Cmd>
        </p>
        <DiscordInvite tone="blue" />
      </StateCard>
    );
  }
  if (!me) return <SignInCard />;
  return <ApplyForm name={me.name} />;
}

/** /mornicraft/bewerben – apply for MorniCraft with Discord sign-in. */
export function ApplyPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [params, setParams] = useSearchParams();
  const apply = useApplyState();
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
        eyebrow={t('apply.eyebrow')}
        title={t('apply.title')}
        text={t('apply.text')}
        scene="schloss"
        figure={APPLY_MODE}
        tint={modeArt(APPLY_MODE).a}
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
          <div className="grid min-w-0 gap-6">
            <HowItWorks />
            <Panel className="flex items-start gap-3 p-5 text-[14px] leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span className="text-pretty">{t('apply.fair')}</span>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
