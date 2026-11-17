import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Bot,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  Hash,
  KeyRound,
  LogIn,
  MessagesSquare,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ToggleRight,
  TriangleAlert,
  UserPlus,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CopyButton } from '~/components/controls';
import { FoldCard, openFold } from '~/components/fold-card';
import { Button, Card, Pill, Skeleton, type PillTone } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { AreaGate } from '../AreaGate';
import { PageHead } from '../PanelShell';
import { Notice } from '../settings/extras/parts';
import { AccessField } from './AccessField';
import { AppearanceCard } from './AppearanceCard';
import { RanksCard } from './RanksCard';
import { SetupProgressView } from './SetupProgress';
import { DISCORD_KEY, useDiscordStatus, type BotStatus, type SetupProgress } from './model';

const PORTAL_URL = 'https://discord.com/developers/applications';

type Overall =
  'missing' | 'tokenInvalid' | 'connecting' | 'noGuild' | 'running' | 'intent' | 'ready' | 'done';

const OVERALL_TONE: Readonly<Record<Overall, PillTone>> = {
  missing: 'neutral',
  tokenInvalid: 'danger',
  connecting: 'warning',
  noGuild: 'blue',
  running: 'blue',
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
    [s.setup.running, 'running'],
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
      <span className="grid min-w-0 gap-0.5">
        <span className="font-semibold">{label}</span>
        {detail ? (
          <span className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{detail}</span>
        ) : null}
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
  const tokenOk = status.configured && status.error !== 'token_invalid';
  const botLine = status.bot ? t('discordAdmin.check.botName', { name: status.bot.name }) : undefined;
  const tokenDetail = status.error === 'token_invalid' ? t('discordAdmin.check.tokenInvalid') : botLine;
  return (
    <Card className="grid gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-[14px]',
              overall === 'done' ? 'bg-success-soft text-success' : 'bg-blue-soft text-blue',
            )}
            aria-hidden
          >
            <Bot className="size-6" />
          </span>
          <div className="grid min-w-0 gap-1.5">
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
      <ul className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-3">
        <Check ok={tokenOk} label={t('discordAdmin.check.token')} detail={tokenDetail} />
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
        <Check
          ok={status.credentials.clientSecret.set}
          label={t('discordAdmin.check.login')}
          detail={status.credentials.clientSecret.set ? undefined : t('discordAdmin.check.loginOptional')}
        />
      </ul>
    </Card>
  );
}

function StepCard({
  n,
  done,
  icon: Icon,
  title,
  optional = false,
  children,
}: {
  readonly n: number;
  readonly done: boolean;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly optional?: boolean;
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
        {optional && !done ? <Pill tone="neutral">{t('discordAdmin.optional')}</Pill> : null}
        {done ? <Pill tone="success">{t('discordAdmin.stepDone')}</Pill> : null}
      </h3>
      <div className="grid min-w-0 gap-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </li>
  );
}

function PortalLink(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <a
      href={PORTAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
    >
      {t('discordAdmin.steps.s1.portal')}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

/** The rights the invite asks for, in plain words. */
function RightsList({ names }: { readonly names: readonly string[] }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('discordAdmin.steps.s4.rights')}>
      {names.map((name) => (
        <li
          key={name}
          className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[12.5px] font-semibold text-foreground"
        >
          {t(`discordAdmin.perm.${name}`, { defaultValue: name })}
        </li>
      ))}
    </ul>
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
  { key: 'look', icon: Palette },
];

function WhatItCreates(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <FoldCard
      id="discord:creates"
      title={t('discordAdmin.creates.title')}
      text={t('discordAdmin.creates.text')}
      defaultOpen={false}
      bodyClassName="grid content-start gap-4"
    >
      <ul className="grid gap-3">
        {CREATES.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-3">
            <span
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-muted text-primary"
              aria-hidden
            >
              <Icon className="size-4" />
            </span>
            <span className="grid min-w-0 gap-0.5">
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
    </FoldCard>
  );
}

function setupLabelOf(s: BotStatus, pending: boolean): string {
  if (pending || s.setup.running) return 'busy';
  return s.setupDone ? 'buttonAgain' : 'button';
}

function DiscordSetup(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [setupError, setSetupError] = useState<string | null>(null);
  const status = useDiscordStatus();
  const setup = useMutation({
    mutationFn: () => mmApi<SetupProgress>('/api/panel/discord/setup', { method: 'POST' }),
    onMutate: () => setSetupError(null),
    onSuccess: (progress) => {
      // Show the first steps at once; the page then asks every 1.5 s until the bot is through.
      queryClient.setQueryData<BotStatus>(DISCORD_KEY, (old) => (old ? { ...old, setup: progress } : old));
      toast.success(t('discordAdmin.steps.s5.started'));
    },
    onError: (err) => setSetupError(errorText(err)),
  });

  if (status.isPending) return <Skeleton className="h-96 rounded-[16px]" />;
  if (status.isError) return <Card className="p-6 text-muted-foreground">{errorText(status.error)}</Card>;
  const s = status.data;
  const tokenOk = s.configured && s.error !== 'token_invalid';
  const intentOk = s.membersIntent && s.error !== 'members_intent_missing';
  const guildOk = Boolean(s.guild);
  const running = setup.isPending || s.setup.running;
  const secretSet = s.credentials.clientSecret.set;

  return (
    <>
      <StatusCard status={s} onRefresh={() => void status.refetch()} busy={status.isFetching} />
      <div
        className="grid items-start gap-[22px] xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
        id="einrichten"
      >
        <FoldCard
          id="discord:steps"
          title={t('discordAdmin.steps.title')}
          defaultOpen={!s.setupDone}
          summary={s.setupDone ? t('discordAdmin.overall.done.pill') : undefined}
          className="overflow-hidden"
          bodyClassName="px-0 pb-0 pt-0 sm:px-0"
        >
          <p className="px-5 pt-4 text-sm text-muted-foreground sm:px-6">{t('discordAdmin.steps.text')}</p>
          <ol className="grid divide-y divide-border">
            <StepCard n={1} done={tokenOk} icon={Bot} title={t('discordAdmin.steps.s1.title')}>
              <ol className="grid list-decimal gap-1 pl-5">
                <li>
                  {t('discordAdmin.steps.s1.a')} <PortalLink />
                </li>
                <li>{t('discordAdmin.steps.s1.b')}</li>
                <li>{t('discordAdmin.steps.s1.c')}</li>
                <li>{t('discordAdmin.steps.s1.d')}</li>
              </ol>
              <AccessField
                kind="token"
                state={s.credentials.token}
                canEdit={s.canEditAccess}
                botName={s.bot?.name ?? null}
              />
              {s.error === 'token_invalid' ? (
                <p className="font-semibold text-destructive">{t('discordAdmin.check.tokenInvalid')}</p>
              ) : null}
            </StepCard>
            <StepCard n={2} done={intentOk} icon={ToggleRight} title={t('discordAdmin.steps.s2.title')}>
              <ul className="grid list-disc gap-1 pl-5">
                <li>{t('discordAdmin.steps.s2.intent')}</li>
                <li>{t('discordAdmin.steps.s2.public')}</li>
              </ul>
              <p className="text-[13.5px]">{t('discordAdmin.steps.s2.why')}</p>
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
              {s.permissions.length ? (
                <div className="grid gap-2">
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {t('discordAdmin.steps.s4.rights')}
                  </p>
                  <RightsList names={s.permissions} />
                  <p className="text-[13px]">{t('discordAdmin.steps.s4.noAdmin')}</p>
                </div>
              ) : null}
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
                disabled={running}
              >
                <Wand2 className={cn(running && 'animate-pulse')} />
                {t(`discordAdmin.steps.s5.${setupLabelOf(s, setup.isPending)}`)}
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
              <SetupProgressView progress={s.setup} />
              <p className="text-[13px]">{t('discordAdmin.steps.s5.roleTip')}</p>
            </StepCard>
            <StepCard n={6} done={secretSet} optional icon={LogIn} title={t('discordAdmin.steps.s6.title')}>
              <p>{t('discordAdmin.steps.s6.text')}</p>
              <ol className="grid list-decimal gap-1 pl-5">
                <li>
                  {t('discordAdmin.steps.s6.a')} <PortalLink />
                </li>
                <li>{t('discordAdmin.steps.s6.b')}</li>
              </ol>
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-[12px] border border-border bg-muted/50 px-3.5 py-2.5">
                <code className="min-w-0 flex-1 basis-56 font-mono text-[13px] text-foreground [overflow-wrap:anywhere]">
                  {s.redirectUrl}
                </code>
                <CopyButton value={s.redirectUrl} variant="secondary" />
              </div>
              <ol className="grid list-decimal gap-1 pl-5" start={3}>
                <li>{t('discordAdmin.steps.s6.c')}</li>
              </ol>
              <AccessField kind="clientSecret" state={s.credentials.clientSecret} canEdit={s.canEditAccess} />
            </StepCard>
          </ol>
        </FoldCard>
        <WhatItCreates />
      </div>
      {guildOk || tokenOk ? (
        <>
          <AppearanceCard ready={tokenOk && s.connected} />
          <RanksCard ready={tokenOk && s.connected} />
        </>
      ) : (
        <Notice tone="neutral" icon={Palette} title={t('discordLook.title')}>
          {t('discordLook.notReady')}
        </Notice>
      )}
    </>
  );
}

/** Panel: connect and set up MoinMorni's own Discord bot – /panel/discord. */
export function DiscordPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <AreaGate area="discord">
      <PageHead icon={MessagesSquare} title={t('discordAdmin.title')} text={t('discordAdmin.text')}>
        <nav className="flex flex-wrap gap-2" aria-label={t('discordAdmin.jump')}>
          <Button asChild variant="secondary" size="sm">
            <a href="#einrichten" onClick={() => openFold('discord:steps')}>
              <Wand2 />
              {t('discordAdmin.jumpSetup')}
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href="#aussehen" onClick={() => openFold('discord:look')}>
              <Palette />
              {t('discordLook.title')}
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href="#raenge" onClick={() => openFold('discord:ranks')}>
              <Award />
              {t('discordRanks.title')}
            </a>
          </Button>
        </nav>
      </PageHead>
      <DiscordSetup />
    </AreaGate>
  );
}
