import {
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  ExternalLink,
  Gamepad2,
  Gavel,
  Headphones,
  LifeBuoy,
  Link2,
  LogIn,
  MessagesSquare,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { NETWORK_COMMANDS } from '@moinmorni/shared';
import { useCopy } from '~/components/controls';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useSite } from '~/lib/site';
import { ModeGlyph } from '~/components/mode-visuals';
import { useNetworkStatus } from '~/lib/status';
import { useLanguage, usePick } from '~/lib/text';
import { Cmd, GameButton, Panel } from './kit';
import { PageHero } from './page-hero';
import { APPLY_PAGE, EXTERNAL, FALLBACK_ADDRESS, FALLBACK_BEDROCK_PORT, WRAP } from './parts';

/** The voice chat mod's page (link only – no logo, no picture). */
const VOICE_MOD_URL = 'https://modrinth.com/plugin/simple-voice-chat';

type SectionId =
  'reinkommen' | 'spielmodi' | 'sprachchat' | 'discord' | 'mornicraft' | 'befehle' | 'regeln' | 'team-hilfe';

interface HelpSection {
  readonly id: SectionId;
  readonly key: string;
  readonly icon: LucideIcon;
}

const SECTIONS: readonly HelpSection[] = [
  { id: 'reinkommen', key: 'join', icon: LogIn },
  { id: 'spielmodi', key: 'modes', icon: Gamepad2 },
  { id: 'sprachchat', key: 'voice', icon: Headphones },
  { id: 'discord', key: 'discord', icon: Link2 },
  { id: 'mornicraft', key: 'mornicraft', icon: ClipboardList },
  { id: 'befehle', key: 'commands', icon: Terminal },
  { id: 'regeln', key: 'rules', icon: Gavel },
  { id: 'team-hilfe', key: 'team', icon: LifeBuoy },
];

/**
 * The most important commands for everyone: the first line of each network command a player has (from the hub's
 * list, texts under site.commands.lines.*); all of them – modes and team too – are on /befehle.
 */
const COMMANDS = NETWORK_COMMANDS.filter(
  (c) => !c.right && c.topic !== 'lobby' && c.topic !== 'team' && c.where === 'hub',
).flatMap((c) => c.lines.slice(0, 1));

/** In case the website does not know the channels yet (older server version). */
const VOICE_FALLBACK = ['Dorfplatz', 'Biergarten', 'Turnier'] as const;

function isSection(value: string): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

function Steps({ items }: { readonly items: readonly ReactNode[] }): ReactElement {
  return (
    <ol className="grid gap-3">
      {items.map((item, i) => (
        // Steps are fixed text in a fixed order.
        <li key={`step-${i + 1}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <span
            className="grid size-8 place-items-center rounded-[5px] border-2 border-black/25 bg-gold-bright font-pixel text-[1.05rem] font-bold text-[#2a1b00] shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="pt-1 leading-relaxed">{item}</span>
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
    <div className="grid content-start gap-4 rounded-[8px] border-2 border-border bg-background-alt p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-pixel text-[1.2rem] font-bold">
        <Icon className="size-5 text-primary" aria-hidden />
        {title}
      </h3>
      {children}
    </div>
  );
}

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

function JoinBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const address = status.data?.javaAddress ?? FALLBACK_ADDRESS;
  const bedrock = status.data?.bedrockAddress ?? FALLBACK_ADDRESS;
  const port = status.data?.bedrockPort ?? FALLBACK_BEDROCK_PORT;
  return (
    <div className="grid gap-5">
      <p>{t('site.help.join.intro')}</p>
      <AddressCopy address={address} />
      <div className="grid gap-4 md:grid-cols-2">
        <SubCard icon={Monitor} title={t('site.help.join.javaTitle')}>
          <Steps
            items={[
              t('site.help.join.java1'),
              t('site.help.join.java2'),
              <>
                {t('site.help.join.java3')} <Cmd>{address}</Cmd>
              </>,
              t('site.help.join.java4'),
            ]}
          />
          <p className="text-[14px] text-muted-foreground">{t('site.help.join.javaVersions')}</p>
        </SubCard>
        <SubCard icon={Smartphone} title={t('site.help.join.bedrockTitle')}>
          <Steps
            items={[
              t('site.help.join.bedrock1'),
              t('site.help.join.bedrock2'),
              <>
                {t('site.help.join.bedrock3')} <Cmd>{bedrock}</Cmd> · {t('site.help.join.port')}{' '}
                <Cmd>{port}</Cmd>
              </>,
              t('site.help.join.bedrock4'),
            ]}
          />
          <p className="text-[14px] text-muted-foreground">{t('site.help.join.consoles')}</p>
        </SubCard>
      </div>
    </div>
  );
}

function VoiceBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const live = site.data?.voiceChannels ?? [];
  const channels: readonly string[] = live.length ? live : VOICE_FALLBACK;
  return (
    <div className="grid gap-5">
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
            {t('site.help.voice.step3a')} <Cmd>V</Cmd> {t('site.help.voice.step3b')} <Cmd>G</Cmd>{' '}
            {t('site.help.voice.step3c')}
          </>,
        ]}
      />
      <div className="grid gap-3 rounded-[8px] border-2 border-border bg-background-alt p-4">
        <p className="font-pixel text-[1.15rem] font-bold">{t('site.help.voice.channelsTitle')}</p>
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-[5px] border-2 border-black/15 bg-card px-3 py-1.5 font-pixel text-[15px] font-semibold shadow-[0_2px_0_rgba(0,0,0,0.12)]"
            >
              <Headphones className="size-4 text-primary" aria-hidden />
              {c}
            </span>
          ))}
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-[14px] text-muted-foreground">
          {t('site.help.voice.channelsText')} <Cmd>/voice</Cmd> ·{' '}
          <Cmd>/voice {channels[0] ?? 'Dorfplatz'}</Cmd> · <Cmd>/voice raus</Cmd>
        </p>
      </div>
      <p className="text-[14px] text-muted-foreground">{t('site.help.voice.bedrock')}</p>
    </div>
  );
}

function DiscordBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const invite = site.data?.discordInvite;
  return (
    <div className="grid gap-5">
      <p>{t('site.help.discord.intro')}</p>
      <Steps
        items={[
          invite ? t('site.help.discord.step0') : t('site.help.discord.step0Soon'),
          <>
            {t('site.help.discord.step1')} <Cmd>/discord</Cmd>
          </>,
          <>
            {t('site.help.discord.step2')} <Cmd>/verbinden &lt;code&gt;</Cmd>
          </>,
          t('site.help.discord.step3'),
        ]}
      />
      {invite ? (
        <GameButton asChild tone="blue" className="justify-self-start">
          <a href={invite} {...EXTERNAL}>
            <MessagesSquare />
            {t('site.help.discord.join')}
          </a>
        </GameButton>
      ) : null}
    </div>
  );
}

function MorniCraftBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid gap-5">
      <p>{t('site.help.mornicraft.intro')}</p>
      <Steps
        items={[
          t('site.help.mornicraft.step1'),
          t('site.help.mornicraft.step2'),
          t('site.help.mornicraft.step3'),
          <>
            {t('site.help.mornicraft.step4')} <Cmd>/bewerben</Cmd>
          </>,
        ]}
      />
      <GameButton asChild tone="emerald" className="justify-self-start">
        <Link to={APPLY_PAGE}>
          <ClipboardList />
          {t('site.help.mornicraft.link')}
        </Link>
      </GameButton>
    </div>
  );
}

function CommandsBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  return (
    <div className="grid gap-5">
      <p>{t('site.help.commands.intro')}</p>
      <dl className="grid overflow-hidden rounded-[8px] border-2 border-border">
        {COMMANDS.map((c) => (
          <div
            key={c.key}
            className="grid gap-1.5 border-b-2 border-border px-4 py-3 last:border-b-0 even:bg-background-alt/60 sm:grid-cols-[240px_minmax(0,1fr)] sm:items-center sm:gap-4"
          >
            <dt>
              <Cmd>{c.syntax[language]}</Cmd>
            </dt>
            <dd className="text-[15px] text-muted-foreground">{t(`site.commands.lines.${c.key}`)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[14px] text-muted-foreground">{t('site.help.commands.tab')}</p>
      <GameButton asChild tone="stone" className="justify-self-start">
        <Link to="/befehle">
          <Terminal />
          {t('site.help.commands.all')}
        </Link>
      </GameButton>
    </div>
  );
}

/** All game modes with one line each and a link to their page; how sleeping and the summer break work. */
function ModesBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const status = useNetworkStatus();
  const modes = status.data?.modes ?? [];
  return (
    <div className="grid gap-5">
      <p>{t('site.help.modes.intro')}</p>
      {modes.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {modes.map((m, i) => (
            <li key={m.id}>
              <Link
                to={`/spielmodi/${m.id}`}
                className="group grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[8px] border-2 border-border bg-background-alt p-3 transition-colors hover:border-gold/55"
              >
                <ModeGlyph id={m.id} position={i} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-pixel text-[1.15rem] font-bold leading-tight group-hover:text-primary">
                    {pick(m.name)}
                  </span>
                  <span className="line-clamp-2 text-[13.5px] leading-snug text-muted-foreground">
                    {pick(m.description)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="flex items-start gap-2.5 text-[15px] text-muted-foreground">
        <Moon className="mt-1 size-4 shrink-0 text-blue" aria-hidden />
        {t('site.help.modes.sleep')}
      </p>
      <p className="flex items-start gap-2.5 text-[15px] text-muted-foreground">
        <Sun className="mt-1 size-4 shrink-0 text-gold" aria-hidden />
        {t('site.help.modes.pause')}
      </p>
      <GameButton asChild tone="stone" className="justify-self-start">
        <Link to="/spielmodi">
          <Gamepad2 />
          {t('site.help.modes.all')}
        </Link>
      </GameButton>
    </div>
  );
}

function RulesBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="grid gap-5">
      <p>{t('site.help.rules.intro')}</p>
      <p>{t('site.help.rules.punish')}</p>
      <GameButton asChild tone="stone" className="justify-self-start">
        <Link to="/regeln">
          <Gavel />
          {t('site.help.rules.link')}
        </Link>
      </GameButton>
    </div>
  );
}

function TeamBody(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const invite = site.data?.discordInvite;
  return (
    <div className="grid gap-5">
      <p>{t('site.help.team.intro')}</p>
      <Steps items={[t('site.help.team.step1'), t('site.help.team.step2'), t('site.help.team.step3')]} />
      <div className="flex flex-wrap gap-3">
        {invite ? (
          <GameButton asChild tone="blue">
            <a href={invite} {...EXTERNAL}>
              <MessagesSquare />
              {t('site.help.team.ticket')}
            </a>
          </GameButton>
        ) : null}
        <GameButton asChild tone="stone">
          <Link to="/team">{t('site.help.team.teamLink')}</Link>
        </GameButton>
      </div>
    </div>
  );
}

const BODIES: Readonly<Record<SectionId, () => ReactElement>> = {
  reinkommen: JoinBody,
  spielmodi: ModesBody,
  sprachchat: VoiceBody,
  discord: DiscordBody,
  mornicraft: MorniCraftBody,
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
      <PageHero
        eyebrow={t('site.help.eyebrow')}
        title={t('site.help.title')}
        text={t('site.help.text')}
        scene="karte"
      >
        <nav className="flex flex-wrap gap-2 pt-2" aria-label={t('site.help.contents')}>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.id}
                to={`/hilfe#${s.id}`}
                className="inline-flex items-center gap-1.5 rounded-[6px] border-2 border-white/20 bg-black/45 px-3 py-1.5 font-pixel text-[14px] font-semibold text-white/90 backdrop-blur-sm transition-colors hover:border-gold-bright/70 hover:text-white"
              >
                <Icon className="size-4 text-gold-bright" aria-hidden />
                {t(`site.help.${s.key}.title`)}
              </Link>
            );
          })}
        </nav>
      </PageHero>
      <div className={cn(WRAP, 'grid max-w-[1000px] gap-4 py-14 sm:py-16')}>
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
              className={cn(
                'mm-details overflow-hidden rounded-[10px] border-2 bg-card shadow-card transition-colors',
                isOpen ? 'border-gold/55' : 'border-border',
              )}
            >
              <summary className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-muted/50 sm:p-5">
                <span
                  className={cn(
                    'grid size-12 shrink-0 place-items-center rounded-[6px] border-2 border-black/20 transition-colors',
                    isOpen
                      ? 'bg-gold-bright text-[#2a1b00] shadow-[inset_0_3px_0_rgba(255,255,255,0.45)]'
                      : 'bg-accent text-primary',
                  )}
                  aria-hidden
                >
                  <Icon className="size-6" />
                </span>
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="font-pixel text-[1.45rem] font-bold leading-tight">
                    {t(`site.help.${s.key}.title`)}
                  </span>
                  <span className="text-[14px] text-muted-foreground">{t(`site.help.${s.key}.short`)}</span>
                </span>
                <ChevronDown
                  className="mm-chevron size-6 shrink-0 text-muted-foreground transition-transform"
                  aria-hidden
                />
              </summary>
              <div className="border-t-2 border-border px-4 pb-6 pt-5 text-[15.5px] leading-relaxed sm:px-6">
                <Body />
              </div>
            </details>
          );
        })}
        <Panel className="mt-4 flex flex-wrap items-center gap-3 p-5 text-[15px] text-muted-foreground">
          <MessagesSquare className="size-5 text-gold" aria-hidden />
          {t('site.help.stillStuck')}
          <Link to="/hilfe#team-hilfe" className="font-semibold text-primary hover:underline">
            {t('site.help.team.title')}
          </Link>
        </Panel>
      </div>
    </>
  );
}
