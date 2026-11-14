import {
  ChevronDown,
  ExternalLink,
  Gavel,
  Headphones,
  LifeBuoy,
  Link2,
  LogIn,
  MessagesSquare,
  Monitor,
  Smartphone,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { CopyButton } from '~/components/controls';
import { Button, Card, Kbd } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useSite } from '~/lib/site';
import { useNetworkStatus } from '~/lib/status';
import { EXTERNAL, PageBand, WRAP } from './parts';
import { FALLBACK_ADDRESS, FALLBACK_BEDROCK_PORT } from './PublicLayout';

/** The voice chat mod's page (link only – no logo, no picture). */
const VOICE_MOD_URL = 'https://modrinth.com/plugin/simple-voice-chat';

type SectionId = 'reinkommen' | 'sprachchat' | 'discord' | 'befehle' | 'regeln' | 'team-hilfe';

interface HelpSection {
  readonly id: SectionId;
  readonly key: string;
  readonly icon: LucideIcon;
}

const SECTIONS: readonly HelpSection[] = [
  { id: 'reinkommen', key: 'join', icon: LogIn },
  { id: 'sprachchat', key: 'voice', icon: Headphones },
  { id: 'discord', key: 'discord', icon: Link2 },
  { id: 'befehle', key: 'commands', icon: Terminal },
  { id: 'regeln', key: 'rules', icon: Gavel },
  { id: 'team-hilfe', key: 'team', icon: LifeBuoy },
];

/** In-game commands for everyone, with what they do (texts under site.help.commands.list.*). */
const COMMANDS: readonly { readonly key: string; readonly syntax: string }[] = [
  { key: 'freunde', syntax: '/freunde <name>' },
  { key: 'party', syntax: '/party <name>' },
  { key: 'pc', syntax: '/pc <…>' },
  { key: 'msg', syntax: '/msg <name> <…>' },
  { key: 'r', syntax: '/r <…>' },
  { key: 'sprache', syntax: '/sprache <de|en>' },
  { key: 'profil', syntax: '/profil [privat|öffentlich]' },
  { key: 'voice', syntax: '/voice [kanal|raus]' },
  { key: 'lobby', syntax: '/lobby' },
  { key: 'discord', syntax: '/discord' },
];

/** Falls die Webseite die Kanäle noch nicht kennt (ältere Server-Version). */
const VOICE_FALLBACK = ['Dorfplatz', 'Biergarten', 'Turnier'] as const;

function isSection(value: string): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

function Steps({ items }: { readonly items: readonly ReactNode[] }): ReactElement {
  return (
    <ol className="grid gap-2.5">
      {items.map((item, i) => (
        // Steps are fixed text in a fixed order.
        <li key={`step-${i + 1}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <span
            className="grid size-7 place-items-center rounded-full bg-gold-soft text-sm font-bold text-gold"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="pt-0.5 leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function SubCard({
  icon: Icon,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="grid content-start gap-3 rounded-[14px] border border-border bg-background/60 p-4 sm:p-5 dark:bg-white/[0.02]">
      <h3 className="flex items-center gap-2 font-semibold">
        <Icon className="size-[18px] text-primary" aria-hidden />
        {title}
      </h3>
      {children}
    </div>
  );
}

function JoinBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const address = status.data?.javaAddress ?? FALLBACK_ADDRESS;
  const bedrock = status.data?.bedrockAddress ?? FALLBACK_ADDRESS;
  const port = status.data?.bedrockPort ?? FALLBACK_BEDROCK_PORT;
  return (
    <div className="grid gap-4">
      <p>{t('site.help.join.intro')}</p>
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-muted/70 p-3 pl-4">
        <span className="font-mono text-lg font-medium">{address}</span>
        <CopyButton value={address} variant="secondary" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SubCard icon={Monitor} title={t('site.help.join.javaTitle')}>
          <Steps
            items={[
              t('site.help.join.java1'),
              t('site.help.join.java2'),
              <>
                {t('site.help.join.java3')} <Kbd>{address}</Kbd>
              </>,
              t('site.help.join.java4'),
            ]}
          />
          <p className="text-sm text-muted-foreground">{t('site.help.join.javaVersions')}</p>
        </SubCard>
        <SubCard icon={Smartphone} title={t('site.help.join.bedrockTitle')}>
          <Steps
            items={[
              t('site.help.join.bedrock1'),
              t('site.help.join.bedrock2'),
              <>
                {t('site.help.join.bedrock3')} <Kbd>{bedrock}</Kbd> · {t('site.help.join.port')}{' '}
                <Kbd>{port}</Kbd>
              </>,
              t('site.help.join.bedrock4'),
            ]}
          />
          <p className="text-sm text-muted-foreground">{t('site.help.join.consoles')}</p>
        </SubCard>
      </div>
    </div>
  );
}

function VoiceBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const live = site.data?.voiceChannels ?? [];
  const channels: readonly string[] = live.length > 0 ? live : VOICE_FALLBACK;
  return (
    <div className="grid gap-4">
      <p>{t('site.help.voice.intro')}</p>
      <Steps
        items={[
          <>
            {t('site.help.voice.step1')}{' '}
            <a
              href={VOICE_MOD_URL}
              {...EXTERNAL}
              className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
            >
              {t('site.help.voice.modLink')}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </>,
          t('site.help.voice.step2'),
          <>
            {t('site.help.voice.step3a')} <Kbd>V</Kbd> {t('site.help.voice.step3b')} <Kbd>G</Kbd>{' '}
            {t('site.help.voice.step3c')}
          </>,
        ]}
      />
      <div className="grid gap-2 rounded-[14px] bg-muted/70 p-4">
        <p className="font-semibold">{t('site.help.voice.channelsTitle')}</p>
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold"
            >
              <Headphones className="size-3.5 text-primary" aria-hidden />
              {c}
            </span>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('site.help.voice.channelsText')} <Kbd>/voice</Kbd> ·{' '}
          <Kbd>/voice {channels[0] ?? 'Dorfplatz'}</Kbd> · <Kbd>/voice raus</Kbd>
        </p>
      </div>
      <p className="text-sm text-muted-foreground">{t('site.help.voice.bedrock')}</p>
    </div>
  );
}

function DiscordBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const invite = site.data?.discordInvite;
  return (
    <div className="grid gap-4">
      <p>{t('site.help.discord.intro')}</p>
      <Steps
        items={[
          invite ? t('site.help.discord.step0') : t('site.help.discord.step0Soon'),
          <>
            {t('site.help.discord.step1')} <Kbd>/discord</Kbd>
          </>,
          <>
            {t('site.help.discord.step2')} <Kbd>/verbinden &lt;code&gt;</Kbd>
          </>,
          t('site.help.discord.step3'),
        ]}
      />
      {invite ? (
        <Button asChild className="justify-self-start">
          <a href={invite} {...EXTERNAL}>
            <MessagesSquare />
            {t('site.help.discord.join')}
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function CommandsBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid gap-4">
      <p>{t('site.help.commands.intro')}</p>
      <dl className="grid overflow-hidden rounded-[14px] border border-border">
        {COMMANDS.map((c) => (
          <div
            key={c.key}
            className="grid gap-1.5 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[230px_minmax(0,1fr)] sm:gap-4"
          >
            <dt>
              <Kbd className="text-[13px] text-foreground">{c.syntax}</Kbd>
            </dt>
            <dd className="text-[15px] text-muted-foreground">{t(`site.help.commands.list.${c.key}`)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">{t('site.help.commands.tab')}</p>
    </div>
  );
}

function RulesBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid gap-4">
      <p>{t('site.help.rules.intro')}</p>
      <p>{t('site.help.rules.punish')}</p>
      <Button asChild variant="secondary" className="justify-self-start">
        <Link to="/regeln">
          <Gavel />
          {t('site.help.rules.link')}
        </Link>
      </Button>
    </div>
  );
}

function TeamBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const invite = site.data?.discordInvite;
  return (
    <div className="grid gap-4">
      <p>{t('site.help.team.intro')}</p>
      <Steps items={[t('site.help.team.step1'), t('site.help.team.step2'), t('site.help.team.step3')]} />
      <div className="flex flex-wrap gap-3">
        {invite ? (
          <Button asChild>
            <a href={invite} {...EXTERNAL}>
              <MessagesSquare />
              {t('site.help.team.ticket')}
            </a>
          </Button>
        ) : null}
        <Button asChild variant="secondary">
          <Link to="/team">{t('site.help.team.teamLink')}</Link>
        </Button>
      </div>
    </div>
  );
}

const BODIES: Readonly<Record<SectionId, () => ReactElement>> = {
  reinkommen: JoinBody,
  sprachchat: VoiceBody,
  discord: DiscordBody,
  befehle: CommandsBody,
  regeln: RulesBody,
  'team-hilfe': TeamBody,
};

/** Opens the section named in the address ("/hilfe#sprachchat") and scrolls to it. */
function useOpenSections(): readonly [ReadonlySet<SectionId>, (id: SectionId, open: boolean) => void] {
  const { hash } = useLocation();
  const target = hash.slice(1);
  const [open, setOpen] = useState<ReadonlySet<SectionId>>(() => new Set(isSection(target) ? [target] : []));
  useEffect(() => {
    if (!isSection(target)) return undefined;
    setOpen((before) => new Set([...before, target]));
    const frame = window.requestAnimationFrame(() =>
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [target]);
  const toggle = (id: SectionId, next: boolean): void =>
    setOpen((before) => {
      if (before.has(id) === next) return before;
      return next ? new Set([...before, id]) : new Set([...before].filter((s) => s !== id));
    });
  return [open, toggle];
}

/** Help: how to join, voice chat, Discord, commands, rules and help from the team – each to open and close. */
export function HelpPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [open, toggle] = useOpenSections();
  return (
    <>
      <PageBand
        eyebrow={t('site.help.eyebrow')}
        title={t('site.help.title')}
        text={t('site.help.text')}
        icon={LifeBuoy}
      >
        <nav className="flex flex-wrap gap-2 pt-3" aria-label={t('site.help.contents')}>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.id}
                to={`/hilfe#${s.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-band-line bg-white/[0.05] px-3.5 py-1.5 text-sm font-semibold text-band-muted transition-colors hover:text-band-foreground"
              >
                <Icon className="size-3.5" aria-hidden />
                {t(`site.help.${s.key}.title`)}
              </Link>
            );
          })}
        </nav>
      </PageBand>
      <div className={cn(WRAP, 'grid max-w-[960px] gap-4 py-12 sm:py-16')}>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const Body = BODIES[s.id];
          const isOpen = open.has(s.id);
          return (
            <details
              key={s.id}
              id={s.id}
              open={isOpen}
              onToggle={(e: SyntheticEvent<HTMLDetailsElement>) => toggle(s.id, e.currentTarget.open)}
              className="mm-details scroll-mt-24 overflow-hidden rounded-[18px] border border-border bg-card shadow-card md:scroll-mt-20"
            >
              <summary className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-muted/40 sm:p-5">
                <span
                  className={cn(
                    'grid size-11 shrink-0 place-items-center rounded-[13px] transition-colors',
                    isOpen ? 'bg-primary text-primary-foreground' : 'bg-accent text-primary',
                  )}
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-display text-[1.3rem] font-semibold leading-tight">
                    {t(`site.help.${s.key}.title`)}
                  </span>
                  <span className="text-sm text-muted-foreground">{t(`site.help.${s.key}.short`)}</span>
                </span>
                <ChevronDown
                  className="mm-chevron size-5 shrink-0 text-muted-foreground transition-transform"
                  aria-hidden
                />
              </summary>
              <div className="border-t border-border px-4 pb-6 pt-5 text-[15.5px] leading-relaxed sm:px-6">
                <Body />
              </div>
            </details>
          );
        })}
        <Card className="mt-4 flex flex-wrap items-center gap-3 p-5 text-[15px] text-muted-foreground">
          <MessagesSquare className="size-5 text-gold" aria-hidden />
          {t('site.help.stillStuck')}
          <Link to="/hilfe#team-hilfe" className="font-semibold text-primary hover:underline">
            {t('site.help.team.title')}
          </Link>
        </Card>
      </div>
    </>
  );
}
