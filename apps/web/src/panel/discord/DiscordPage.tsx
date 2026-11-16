import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  Hash,
  KeyRound,
  MessagesSquare,
  PartyPopper,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserPlus,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Card, Kbd, Pill, Skeleton, type PillTone } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { errorCode, useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { AreaGate } from '../AreaGate';
import { PageHead } from '../PanelShell';

/** State of morni.net's Discord bot (apps/server/src/discord/bot.ts → BotStatus). */
interface BotStatus {
  readonly configured: boolean;
  readonly connected: boolean;
  readonly error: 'members_intent_missing' | 'token_invalid' | null;
  readonly membersIntent: boolean;
  readonly inviteUrl: string | null;
  readonly guild: { readonly id: string; readonly name: string } | null;
  readonly setupDone: boolean;
}

interface SetupReport {
  readonly roles: number;
  readonly channels: number;
  readonly community: 'ok' | 'failed';
}

const STATUS_KEY = ['panel', 'discord'] as const;
const REFRESH_MS = 10_000;
const PORTAL_URL = 'https://discord.com/developers/applications';

type Overall = 'missing' | 'tokenInvalid' | 'connecting' | 'noGuild' | 'intent' | 'ready' | 'done';

const OVERALL_TONE: Readonly<Record<Overall, PillTone>> = {
  missing: 'neutral',
  tokenInvalid: 'danger',
  connecting: 'warning',
  noGuild: 'blue',
  intent: 'warning',
  ready: 'gold',
  done: 'success',
};

/** One sentence for the whole bot, most urgent first. */
function overallOf(s: BotStatus): Overall {
  const checks: readonly (readonly [boolean, Overall])[] = [
    [!s.configured, 'missing'],
    [s.error === 'token_invalid', 'tokenInvalid'],
    [!s.connected, 'connecting'],
    [!s.guild, 'noGuild'],
    [s.error === 'members_intent_missing' || !s.membersIntent, 'intent'],
    [!s.setupDone, 'ready'],
  ];
  return checks.find(([hit]) => hit)?.[1] ?? 'done';
}

function Check({
  ok,
  label,
  detail,
}: {
  readonly ok: boolean;
  readonly label: string;
  readonly detail?: string;
}): ReactElement {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? (
        <CircleCheck className="mt-0.5 size-[18px] shrink-0 text-success" aria-hidden />
      ) : (
        <CircleDashed className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="grid gap-0.5">
        <span className="font-semibold">{label}</span>
        {detail ? <span className="text-[13px] text-muted-foreground">{detail}</span> : null}
      </span>
    </li>
  );
}

function StatusCard({
  status,
  onRefresh,
  busy,
}: {
  readonly status: BotStatus;
  readonly onRefresh: () => void;
  readonly busy: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const overall = overallOf(status);
  return (
    <Card className="grid gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-[14px]',
              overall === 'done' ? 'bg-success-soft text-success' : 'bg-blue-soft text-blue',
            )}
            aria-hidden
          >
            <Bot className="size-6" />
          </span>
          <div className="grid gap-1.5">
            <Pill tone={OVERALL_TONE[overall]} dot className="justify-self-start">
              {t(`discordAdmin.overall.${overall}.pill`)}
            </Pill>
            <p className="max-w-[62ch] text-[15px] text-muted-foreground text-pretty">
              {t(`discordAdmin.overall.${overall}.text`, { guild: status.guild?.name ?? '' })}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={busy}>
          <RefreshCw className={cn(busy && 'animate-spin')} />
          {t('discordAdmin.refresh')}
        </Button>
      </div>
      <ul className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
        <Check
          ok={status.configured && status.error !== 'token_invalid'}
          label={t('discordAdmin.check.token')}
          detail={status.error === 'token_invalid' ? t('discordAdmin.check.tokenInvalid') : undefined}
        />
        <Check ok={status.connected} label={t('discordAdmin.check.online')} />
        <Check
          ok={status.membersIntent && status.error !== 'members_intent_missing'}
          label={t('discordAdmin.check.intent')}
        />
        <Check
          ok={Boolean(status.guild)}
          label={t('discordAdmin.check.guild')}
          detail={status.guild ? status.guild.name : t('discordAdmin.check.noGuild')}
        />
        <Check ok={status.setupDone} label={t('discordAdmin.check.setup')} />
      </ul>
    </Card>
  );
}

function StepCard({
  n,
  done,
  icon: Icon,
  title,
  children,
}: {
  readonly n: number;
  readonly done: boolean;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 px-5 py-5 sm:px-6">
      <span
        className={cn(
          'row-span-2 grid size-9 place-items-center rounded-full font-display text-base font-semibold',
          done ? 'bg-success text-white' : 'bg-gold-soft text-gold',
        )}
        aria-hidden
      >
        {done ? <CircleCheck className="size-5" /> : n}
      </span>
      <h3 className="flex flex-wrap items-center gap-2 pt-1 font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t('discordAdmin.stepN', { n })}</span>
        {title}
        {done ? <Pill tone="success">{t('discordAdmin.stepDone')}</Pill> : null}
      </h3>
      <div className="grid gap-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </li>
  );
}

function SetupResult({ report }: { readonly report: SetupReport }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid gap-2 rounded-[14px] border border-success/30 bg-success-soft px-4 py-3.5 text-foreground">
      <p className="flex items-center gap-2 font-semibold text-success">
        <PartyPopper className="size-4" aria-hidden />
        {t('discordAdmin.result.title')}
      </p>
      <p>{t('discordAdmin.result.counts', { roles: report.roles, channels: report.channels })}</p>
      <p className={cn('text-[13px]', report.community === 'ok' ? 'text-muted-foreground' : 'text-warning')}>
        {report.community === 'ok'
          ? t('discordAdmin.result.communityOk')
          : t('discordAdmin.result.communityFailed')}
      </p>
    </div>
  );
}

const CREATES: readonly { readonly key: string; readonly icon: LucideIcon }[] = [
  { key: 'roles', icon: ShieldCheck },
  { key: 'info', icon: Hash },
  { key: 'community', icon: MessagesSquare },
  { key: 'help', icon: Sparkles },
  { key: 'voice', icon: Users },
  { key: 'team', icon: KeyRound },
  { key: 'extras', icon: Wand2 },
];

function WhatItCreates(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Card className="grid content-start gap-4 p-6">
      <div className="grid gap-1">
        <h2 className="font-display text-xl font-semibold">{t('discordAdmin.creates.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('discordAdmin.creates.text')}</p>
      </div>
      <ul className="grid gap-3">
        {CREATES.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-3">
            <span
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-muted text-primary"
              aria-hidden
            >
              <Icon className="size-4" />
            </span>
            <span className="grid gap-0.5">
              <span className="font-semibold">{t(`discordAdmin.creates.${key}.title`)}</span>
              <span className="text-[13.5px] leading-snug text-muted-foreground">
                {t(`discordAdmin.creates.${key}.text`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="rounded-[12px] bg-muted/70 px-3.5 py-2.5 text-[13px] text-muted-foreground">
        {t('discordAdmin.creates.safe')}
      </p>
    </Card>
  );
}

function DiscordSetup(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [report, setReport] = useState<SetupReport | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => mmApi<BotStatus>('/api/panel/discord'),
    refetchInterval: REFRESH_MS,
  });
  const setup = useMutation({
    mutationFn: () => mmApi<SetupReport>('/api/panel/discord/setup', { method: 'POST' }),
    onMutate: () => setSetupError(null),
    onSuccess: async (r) => {
      setReport(r);
      toast.success(t('discordAdmin.result.title'));
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    onError: (err) => {
      // Without a token the server also says "no guild"; the missing token is the real first step.
      const code = status.data?.configured === false ? 'discord_not_configured' : errorCode(err);
      const known = code === 'discord_no_guild' || code === 'discord_not_configured';
      setSetupError(known ? t(`discordAdmin.errors.${code}`) : errorText(err));
    },
  });

  if (status.isPending) return <Skeleton className="h-96 rounded-[16px]" />;
  if (status.isError) return <Card className="p-6 text-muted-foreground">{errorText(status.error)}</Card>;
  const s = status.data;
  const tokenOk = s.configured && s.error !== 'token_invalid';
  const intentOk = s.membersIntent && s.error !== 'members_intent_missing';
  const guildOk = Boolean(s.guild);
  const setupLabel = ((): string => {
    if (setup.isPending) return 'busy';
    return s.setupDone ? 'buttonAgain' : 'button';
  })();

  return (
    <>
      <StatusCard status={s} onRefresh={() => void status.refetch()} busy={status.isFetching} />
      <div className="grid items-start gap-[22px] xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="grid gap-1 border-b border-border px-5 py-5 sm:px-6">
            <h2 className="font-display text-xl font-semibold">{t('discordAdmin.steps.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('discordAdmin.steps.text')}</p>
          </div>
          <ol className="grid divide-y divide-border">
            <StepCard n={1} done={tokenOk} icon={Bot} title={t('discordAdmin.steps.s1.title')}>
              <ol className="grid list-decimal gap-1 pl-5">
                <li>
                  {t('discordAdmin.steps.s1.a')}{' '}
                  <a
                    href={PORTAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    {t('discordAdmin.steps.s1.portal')}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </li>
                <li>{t('discordAdmin.steps.s1.b')}</li>
                <li>{t('discordAdmin.steps.s1.c')}</li>
                <li>
                  {t('discordAdmin.steps.s1.d')} <Kbd>MM_DISCORD_TOKEN</Kbd>
                </li>
              </ol>
              <p className="flex items-start gap-2 rounded-[12px] bg-warning-soft px-3.5 py-2.5 text-[13.5px] text-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                {t('discordAdmin.steps.s1.secret')}
              </p>
              {s.error === 'token_invalid' ? (
                <p className="font-semibold text-destructive">{t('discordAdmin.check.tokenInvalid')}</p>
              ) : null}
            </StepCard>
            <StepCard n={2} done={intentOk} icon={Users} title={t('discordAdmin.steps.s2.title')}>
              <p>{t('discordAdmin.steps.s2.text')}</p>
            </StepCard>
            <StepCard n={3} done={guildOk} icon={MessagesSquare} title={t('discordAdmin.steps.s3.title')}>
              <p>{t('discordAdmin.steps.s3.text')}</p>
            </StepCard>
            <StepCard n={4} done={guildOk} icon={UserPlus} title={t('discordAdmin.steps.s4.title')}>
              <p>
                {guildOk
                  ? t('discordAdmin.steps.s4.done', { guild: s.guild?.name ?? '' })
                  : t('discordAdmin.steps.s4.text')}
              </p>
              {s.inviteUrl ? (
                <Button asChild variant={guildOk ? 'secondary' : 'primary'} className="justify-self-start">
                  <a href={s.inviteUrl} target="_blank" rel="noopener noreferrer">
                    <UserPlus />
                    {t('discordAdmin.steps.s4.button')}
                    <ExternalLink />
                  </a>
                </Button>
              ) : (
                <p className="text-[13px] font-semibold">{t('discordAdmin.steps.s4.noLink')}</p>
              )}
            </StepCard>
            <StepCard n={5} done={s.setupDone} icon={Wand2} title={t('discordAdmin.steps.s5.title')}>
              <p>{s.setupDone ? t('discordAdmin.steps.s5.again') : t('discordAdmin.steps.s5.text')}</p>
              <Button
                variant={s.setupDone ? 'secondary' : 'primary'}
                className="justify-self-start"
                onClick={() => setup.mutate()}
                disabled={setup.isPending}
              >
                <Wand2 />
                {t(`discordAdmin.steps.s5.${setupLabel}`)}
              </Button>
              {setupError ? (
                <p
                  className="flex items-start gap-2 rounded-[12px] bg-destructive-soft px-3.5 py-2.5 text-[13.5px] font-semibold text-destructive"
                  role="alert"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {setupError}
                </p>
              ) : null}
              {report ? <SetupResult report={report} /> : null}
            </StepCard>
          </ol>
        </Card>
        <WhatItCreates />
      </div>
    </>
  );
}

/** Panel: connect and set up morni.net's own Discord bot – /panel/discord. */
export function DiscordPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <AreaGate area="discord">
      <PageHead icon={MessagesSquare} title={t('discordAdmin.title')} text={t('discordAdmin.text')} />
      <DiscordSetup />
    </AreaGate>
  );
}
