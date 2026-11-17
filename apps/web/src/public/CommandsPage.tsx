import {
  ArrowRight,
  Check,
  Copy,
  Gamepad2,
  House,
  MapPin,
  MessageCircle,
  Mic,
  Search,
  ShieldHalf,
  SlidersHorizontal,
  Terminal,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  COMMAND_TOPICS,
  mayUseCommand,
  NETWORK_COMMANDS,
  SETTING_AREAS,
  type CommandTopic,
  type GameRight,
  type ModeStatus,
  type PanelArea,
} from '@moinmorni/shared';
import { useCopy } from '~/components/controls';
import { PlayerFace } from '~/components/player-face';
import { Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useCommandsInfo, type CommandRole } from '~/lib/site';
import { shownModes, useNetworkStatus } from '~/lib/status';
import { useLanguage, usePick } from '~/lib/text';
import { modeStyle } from './cards';
import { Chip, GameButton, LoadError, ModeStateChip, Panel, RankTag } from './kit';
import { guideSyntax, MODE_GUIDES, type GuideCommand } from './mode-guides';
import { PageHero } from './page-hero';
import { WRAP } from './parts';

/**
 * All commands on one page (/befehle, /commands): the network's for everyone, each game mode's, and the team's by
 * rank. `?spieler=<name>` makes it personal – rank and head, only what that player really may; `/befehle/<mode>`
 * puts the mode first (MorniCraft links its players to /befehle/mornicraft?spieler=<name>). A click copies the
 * command. Sources: NETWORK_COMMANDS (the hub's list), MODE_GUIDES (the mode pages) and the settings catalogue.
 */

const PLAYER_PARAM = 'spieler';
const NAME_MAX = 16;
const EVERYONE_ID = 'alle';
const TEAM_ID = 'team';
const modeSection = (id: string): string => `modus-${id}`;
const TOPIC_ICON: Readonly<Record<CommandTopic, LucideIcon>> = {
  travel: MapPin,
  friends: Users,
  chat: MessageCircle,
  voice: Mic,
  account: UserRound,
  lobby: House,
  team: ShieldHalf,
};
/** Everyone's topics in the order of the page; the team's come in their own section. */
const PLAYER_TOPICS = COMMAND_TOPICS.filter((topic) => topic !== 'team');
// Up to the first placeholder: "/msg <spieler> <nachricht>" → "/msg", "/voice gruppe <name>" → "/voice gruppe".
// https://regex101.com/?flavor=javascript&regex=%5Cs*%5B%3C%5B%5D.*%24&testString=%2Fvoice%20gruppe%20%3Cname%3E%20%5Bpasswort%5D
const PLACEHOLDERS = /\s*[<[].*$/;

/** What can be used: a right in the game, a panel area (settings in the game), or nothing (everyone). */
type Need =
  | { readonly kind: 'right'; readonly right: GameRight }
  | { readonly kind: 'area'; readonly area: PanelArea }
  | { readonly kind: 'none' };

interface Row {
  readonly id: string;
  readonly syntax: string;
  readonly text: string;
  readonly need: Need;
}

/** Like the hub: a right in the rank; settings like the panel (the area, or "everything" = admin). */
function mayUse(role: Pick<CommandRole, 'game' | 'panel'>, need: Need): boolean {
  if (need.kind === 'none') return true;
  if (need.kind === 'right') return mayUseCommand(role, { right: need.right });
  return role.panel.includes(need.area) || role.game.includes('admin');
}

const needOf = (right: GameRight | undefined): Need => (right ? { kind: 'right', right } : { kind: 'none' });

/** A command as a button: shows the whole syntax, copies the command up to its first placeholder. */
function CommandButton({ syntax }: { readonly syntax: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const value = syntax.replace(PLACEHOLDERS, '');
  const { copied, copy } = useCopy(value);
  return (
    <button
      type="button"
      onClick={copy}
      title={t('site.commands.copy', { command: value })}
      className="group inline-flex max-w-full cursor-pointer items-center gap-2 justify-self-start rounded-[6px] border-2 border-black/30 bg-[#101814] px-2.5 py-1 text-left font-pixel text-[15px] font-semibold leading-snug text-[#e8f3ec] shadow-[0_3px_0_rgba(0,0,0,0.3)] transition-colors hover:border-gold-bright/70 active:translate-y-px"
      aria-live="polite"
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{syntax}</span>
      {copied ? (
        <Check className="size-4 shrink-0 text-[#3ddc84]" aria-hidden />
      ) : (
        <Copy className="size-4 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
      )}
      <span className="sr-only">{copied ? t('copy.done') : t('copy.action')}</span>
    </button>
  );
}

/** The ranks that may use a team command (general page). */
function WhoMay({
  roles,
  need,
}: {
  readonly roles: readonly CommandRole[];
  readonly need: Need;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const who = roles.filter((r) => !r.fallback && mayUse(r, need));
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={t('site.commands.whoMay')}>
      {who.map((r) => (
        <RankTag key={r.id} role={r} />
      ))}
    </div>
  );
}

function CommandRows({
  rows,
  roles,
  showRanks,
}: {
  readonly rows: readonly Row[];
  /** With ranks: shows who may use each line (team lines on the general page). */
  readonly roles?: readonly CommandRole[];
  readonly showRanks?: boolean;
}): ReactElement {
  return (
    <ul className="grid overflow-hidden rounded-[8px] border-2 border-border">
      {rows.map((row) => (
        <li
          key={row.id}
          className={cn(
            'grid gap-2 border-b-2 border-border px-4 py-3 last:border-b-0 even:bg-background-alt/60 sm:items-center sm:gap-4',
            showRanks
              ? 'sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,240px)]'
              : 'sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]',
          )}
        >
          <CommandButton syntax={row.syntax} />
          <p className="text-[15px] leading-snug text-muted-foreground text-pretty">{row.text}</p>
          {showRanks && roles ? <WhoMay roles={roles} need={row.need} /> : null}
        </li>
      ))}
    </ul>
  );
}

function SectionTitle({
  id,
  icon: Icon,
  title,
  text,
  aside,
  tone = 'gold',
}: {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly text?: string;
  readonly aside?: ReactNode;
  readonly tone?: 'gold' | 'mode';
}): ReactElement {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="grid min-w-0 gap-2">
        <h2
          id={id}
          // Below the sticky header and jump bar when jumped to.
          className="flex scroll-mt-40 items-center gap-3 font-pixel md:scroll-mt-52 text-[clamp(1.8rem,4vw,2.5rem)] font-bold leading-none"
        >
          <span
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-[6px] border-2 border-black/20',
              tone === 'mode'
                ? 'mm-mode-bg text-white'
                : 'bg-gold-bright text-[#2a1b00] shadow-[inset_0_3px_0_rgba(255,255,255,0.45)]',
            )}
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
        </h2>
        {text ? (
          <p className="max-w-[64ch] text-[15.5px] leading-relaxed text-muted-foreground">{text}</p>
        ) : null}
      </div>
      {aside}
    </div>
  );
}

function Group({
  icon: Icon,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="grid gap-2.5">
      <h3 className="flex items-center gap-2 font-pixel text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="size-4 text-gold" aria-hidden />
        {title}
      </h3>
      {children}
    </div>
  );
}

/** "Only my commands": a name field that puts ?spieler= into the address. */
function MineForm({ current }: { readonly current: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [, setParams] = useSearchParams();
  const [name, setName] = useState(current);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const clean = name.trim();
    setParams(clean ? { [PLAYER_PARAM]: clean } : {});
  };
  return (
    <form onSubmit={submit} className="flex w-full max-w-[460px] flex-wrap gap-2 pt-1" role="search">
      <label htmlFor="mine-name" className="sr-only">
        {t('site.commands.mine.label')}
      </label>
      <div className="relative min-w-0 flex-1 basis-52">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-white/60"
          aria-hidden
        />
        <input
          id="mine-name"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('site.commands.mine.placeholder')}
          onChange={(e) => setName(e.target.value)}
          className="h-11 w-full rounded-[6px] border-2 border-white/25 bg-black/45 pl-10 pr-3 font-pixel text-[16px] text-white backdrop-blur-sm placeholder:text-white/55 focus-visible:border-gold-bright focus-visible:outline-none"
        />
      </div>
      <GameButton type="submit" size="sm" className="h-11">
        <UserRound />
        {t('site.commands.mine.go')}
      </GameButton>
    </form>
  );
}

/** Who the page is for: head, name, rank – and a way back to all commands. */
function PlayerCard({
  name,
  uuid,
  role,
}: {
  readonly name: string;
  readonly uuid: string;
  readonly role: CommandRole;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const [, setParams] = useSearchParams();
  return (
    <div className="flex w-full max-w-[520px] flex-wrap items-center gap-4 rounded-[10px] border-2 border-white/20 bg-black/50 p-3 pr-4 backdrop-blur-sm">
      <PlayerFace
        uuid={uuid}
        colour={role.colour}
        className="size-16 shrink-0"
        faceClassName="rounded-[8px] border-2 border-black/30"
      />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <span className="truncate font-pixel text-[1.6rem] font-bold leading-none text-white">{name}</span>
        <RankTag role={role} size="md" />
      </div>
      <button
        type="button"
        onClick={() => setParams({})}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-white/20 px-2.5 py-1.5 font-pixel text-[13px] font-semibold text-white/85 transition-colors hover:border-gold-bright/70 hover:text-white"
      >
        <X className="size-4" aria-hidden />
        {t('site.commands.mine.clear')}
      </button>
    </div>
  );
}

/** Jump to a part of the page (buttons, so the demo's #-addresses stay untouched). */
function JumpBar({
  items,
}: {
  readonly items: ReadonlyArray<{ readonly id: string; readonly label: string; readonly mode?: string }>;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const jump = (id: string): void => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav
      aria-label={t('site.commands.jump')}
      className="sticky top-[var(--header-h-small)] z-20 border-b-2 border-border bg-background/92 backdrop-blur-md"
    >
      {/* Phones scroll sideways; from tablets on everything wraps into rows, so no mode is out of reach. */}
      <div
        className={cn(
          WRAP,
          'flex gap-2 overflow-x-auto py-2.5 [scrollbar-width:none] md:flex-wrap md:gap-1.5 md:overflow-x-visible',
        )}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => jump(item.id)}
            style={item.mode ? modeStyle(item.mode) : undefined}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-[6px] border-2 border-border bg-card px-3 py-1.5 font-pixel text-[14px] font-semibold text-foreground transition-colors hover:border-gold"
          >
            {item.mode ? (
              <span className="mm-mode-bg size-3 rounded-[2px] border border-black/20" aria-hidden />
            ) : null}
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function ModeSection({
  mode,
  me,
  roles,
}: {
  readonly mode: ModeStatus;
  readonly me: CommandRole | null;
  readonly roles: readonly CommandRole[];
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const language = useLanguage();
  const guide = MODE_GUIDES[mode.id];
  if (!guide) return null;
  const row = (c: GuideCommand): Row => ({
    id: `${mode.id}-${c.key}`,
    syntax: guideSyntax(c, language),
    text: t(`site.guide.${mode.id}.cmd.${c.key}`),
    need: needOf(c.right),
  });
  const everyone = [...guide.commands, ...(guide.more ?? [])].map(row);
  const team = (guide.team ?? []).map(row).filter((r) => !me || mayUse(me, r.need));
  return (
    <section className="grid gap-5" aria-labelledby={modeSection(mode.id)} style={modeStyle(mode.id)}>
      <SectionTitle
        id={modeSection(mode.id)}
        icon={Gamepad2}
        tone="mode"
        title={pick(mode.name)}
        text={t('site.commands.modeText', { name: pick(mode.name) })}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <ModeStateChip mode={mode} />
            <Link
              to={`/spielmodi/${mode.id}`}
              className="inline-flex items-center gap-1 font-pixel text-[14px] font-semibold text-primary hover:underline"
            >
              {t('site.commands.modeLink')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        }
      />
      <CommandRows rows={everyone} />
      {team.length ? (
        <Group icon={ShieldHalf} title={t('site.commands.modeTeam')}>
          <CommandRows rows={team} roles={roles} showRanks={!me} />
        </Group>
      ) : null}
    </section>
  );
}

function Commands(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const pick = usePick();
  const { mode: modeParam } = useParams();
  const [params] = useSearchParams();
  const wanted = (params.get(PLAYER_PARAM) ?? '').trim().slice(0, NAME_MAX);
  const info = useCommandsInfo(wanted);
  const status = useNetworkStatus();
  const roles = [...(info.data?.roles ?? [])].sort((a, b) => a.position - b.position);
  const player = info.data?.player ?? null;
  const me = player ? (roles.find((r) => r.id === player.role) ?? null) : null;
  const unknown = Boolean(wanted) && info.isSuccess && !player;

  // Everyone's commands, by topic (lines only for some ranks – /voice zu – show on the team side).
  const lineRows = (topic: CommandTopic): Row[] =>
    NETWORK_COMMANDS.filter((c) => c.topic === topic).flatMap((c) =>
      c.lines.map((l) => ({
        id: `${c.name}-${l.key}`,
        syntax: l.syntax[language],
        text: t(`site.commands.lines.${l.key}`),
        need: needOf(l.right ?? c.right),
      })),
    );
  const forEveryone = PLAYER_TOPICS.map((topic) => ({
    topic,
    rows: lineRows(topic).filter((r) => r.need.kind === 'none'),
  })).filter((g) => g.rows.length);
  const teamLines = [...PLAYER_TOPICS, 'team' as const]
    .flatMap(lineRows)
    .filter((r) => r.need.kind !== 'none' && (!me || mayUse(me, r.need)));
  // One line per settings command – /netzwerk covers two areas (network, friends & party): their settings count together.
  const withCommand = SETTING_AREAS.flatMap((area) =>
    area.sections
      .flatMap((s) => s.settings)
      .flatMap((d) => (d.command ? [{ area, root: d.command.split(' ')[0] ?? d.command }] : [])),
  );
  const settingRows: Row[] = [...new Set(withCommand.map((c) => c.root))]
    .flatMap((root): Row[] => {
      const mine = withCommand.filter((c) => c.root === root);
      const area = mine[0]?.area;
      if (!area) return [];
      return [
        {
          id: `set-${root}`,
          syntax: root,
          text: t('site.commands.settingLine', { area: pick(area.title), count: mine.length }),
          need: { kind: 'area', area: area.panel },
        },
      ];
    })
    .filter((r) => !me || mayUse(me, r.need));

  // Winter Games and Summer Games share one place: only the one that is on – the other one still opens by link
  // (/befehle/wintersport in summer).
  const modes = shownModes(status.data).filter((m) => MODE_GUIDES[m.id]);
  const first = (status.data?.modes ?? []).find((m) => m.id === modeParam && MODE_GUIDES[m.id]);
  const ordered = first ? [first, ...modes.filter((m) => m !== first)] : modes;
  const showTeam = teamLines.length > 0 || settingRows.length > 0;

  const jumpItems = [
    ...(first ? [{ id: modeSection(first.id), label: pick(first.name), mode: first.id }] : []),
    { id: EVERYONE_ID, label: t('site.commands.jumpEveryone') },
    ...ordered
      .filter((m) => m !== first)
      .map((m) => ({ id: modeSection(m.id), label: pick(m.name), mode: m.id })),
    ...(showTeam ? [{ id: TEAM_ID, label: t('site.commands.jumpTeam') }] : []),
  ];

  const everyoneSection = (
    <section key="alle" className="grid gap-6" aria-labelledby={EVERYONE_ID}>
      <SectionTitle
        id={EVERYONE_ID}
        icon={Terminal}
        title={t('site.commands.everyoneTitle')}
        text={t('site.commands.everyoneText')}
      />
      {forEveryone.map((g) => (
        <Group key={g.topic} icon={TOPIC_ICON[g.topic]} title={t(`site.commands.topics.${g.topic}`)}>
          <CommandRows rows={g.rows} />
        </Group>
      ))}
    </section>
  );
  const modeSections = ordered.map((m) => <ModeSection key={m.id} mode={m} me={me} roles={roles} />);

  return (
    <>
      <PageHero
        eyebrow={t('site.commands.eyebrow')}
        title={player ? t('site.commands.titleFor', { name: player.name }) : t('site.commands.title')}
        text={
          player && me
            ? t('site.commands.textFor', { name: player.name, rank: pick(me.name) })
            : t('site.commands.text')
        }
        scene="handwerkergasse"
      >
        {player && me ? (
          <PlayerCard name={player.name} uuid={player.uuid} role={me} />
        ) : (
          <MineForm current={wanted} />
        )}
      </PageHero>
      <JumpBar items={jumpItems} />
      <div className={cn(WRAP, 'grid max-w-[1100px] gap-14 py-12 sm:py-14')}>
        {unknown ? (
          <Panel className="flex flex-wrap items-center gap-3 border-gold/40 p-4 text-[15px]">
            <UserRound className="size-5 text-gold" aria-hidden />
            {t('site.commands.unknown', { name: wanted })}
          </Panel>
        ) : null}
        {info.isError || status.isError ? <LoadError /> : null}
        {first ? modeSections[0] : null}
        {everyoneSection}
        {status.isPending ? <Skeleton className="h-72 rounded-[10px]" /> : null}
        {first ? modeSections.slice(1) : modeSections}
        {showTeam && info.isSuccess ? (
          <section className="grid gap-6" aria-labelledby={TEAM_ID}>
            <SectionTitle
              id={TEAM_ID}
              icon={ShieldHalf}
              title={t('site.commands.teamTitle')}
              text={
                me ? t('site.commands.teamTextFor', { rank: pick(me.name) }) : t('site.commands.teamText')
              }
              aside={me ? <Chip tone="gold">{pick(me.name)}</Chip> : undefined}
            />
            {teamLines.length ? (
              <Group icon={ShieldHalf} title={t('site.commands.topics.team')}>
                <CommandRows rows={teamLines} roles={roles} showRanks={!me} />
              </Group>
            ) : null}
            {settingRows.length ? (
              <Group icon={SlidersHorizontal} title={t('site.commands.settingsTitle')}>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  {t('site.commands.settingsText')}
                </p>
                <CommandRows rows={settingRows} roles={roles} showRanks={!me} />
              </Group>
            ) : null}
          </section>
        ) : null}
        <p className="text-[14px] text-muted-foreground">{t('site.help.commands.tab')}</p>
      </div>
    </>
  );
}

/** All commands; personal with ?spieler=<name>, a mode first with /befehle/<mode>. */
export function CommandsPage(): ReactElement {
  return <Commands />;
}
