import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CalendarPlus,
  Clock,
  Crown,
  Lock,
  Search,
  Smartphone,
  Trophy,
  UserSearch,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type CSSProperties, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { PlayerFace } from '~/components/player-face';
import { Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { findMode, isNotFound, TOP_ALL, usePlayerProfile, useTopPlayers, type PublicProfile, type TopPlayer } from '~/lib/site';
import { useNetworkStatus } from '~/lib/status';
import { useLanguage, usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { modeArt } from './art';
import { ModeFigure, modeStyle } from './cards';
import { Chip, Cmd, EmptyState, GameButton, LiveDot, LoadError, Panel, RankTag } from './kit';
import { PageHero } from './page-hero';
import { usePageTitle, WRAP } from './parts';

/** Longest name the API takes (Bedrock names carry a dot in front). */
const NAME_MAX = 17;
const PODIUM = 3;
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'];
const PERCENT = 100;

/** Gold, silver and bronze as block faces with a darker bottom edge. */
const MEDALS = [
  { face: '#f6c544', edge: '#a87708', step: 'h-40 sm:h-48' },
  { face: '#cfd8df', edge: '#7c8b96', step: 'h-28 sm:h-36' },
  { face: '#d9904f', edge: '#8a4f1f', step: 'h-20 sm:h-28' },
] as const;

/** Type a name, land on the profile. */
function PlayerSearch({
  onDark = false,
  className,
}: {
  readonly onDark?: boolean;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const navigate = useNavigate();
  const id = useId();
  const [name, setName] = useState('');
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    void navigate(`/spieler/${encodeURIComponent(clean)}`);
  };
  return (
    <form onSubmit={submit} className={cn('grid w-full gap-2', className)} role="search">
      <label
        htmlFor={id}
        className={cn(
          'font-pixel text-[14px] font-semibold uppercase tracking-[0.12em]',
          onDark ? 'text-gold-bright' : 'text-gold',
        )}
      >
        {t('site.players.searchLabel')}
      </label>
      <div className="flex gap-2.5">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id={id}
            type="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={NAME_MAX}
            placeholder={t('site.players.searchPlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 w-full rounded-[6px] border-2 border-input bg-card pl-11 pr-4 text-[16px] font-semibold text-foreground shadow-[inset_0_3px_0_rgba(0,0,0,0.08)] transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/25"
          />
        </div>
        <GameButton type="submit" size="md" className="h-12 px-5" disabled={!name.trim()}>
          <UserSearch />
          <span className="max-sm:sr-only">{t('site.players.searchButton')}</span>
        </GameButton>
      </div>
      <p className={cn('text-[13.5px]', onDark ? 'text-white/75' : 'text-muted-foreground')}>
        {t('site.players.searchHint')}
      </p>
    </form>
  );
}

function PodiumStep({ player }: { readonly player: TopPlayer }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const medal = MEDALS[player.rank - 1] ?? MEDALS[0];
  const first = player.rank === 1;
  const blockStyle: CSSProperties = {
    backgroundColor: medal.face,
    boxShadow: `inset 0 6px 0 rgba(255,255,255,0.45), inset 0 -10px 0 ${medal.edge}, 0 6px 0 rgba(0,0,0,0.3)`,
  };
  return (
    <li className="grid min-w-0 content-end justify-items-center gap-3">
      <Link
        to={`/spieler/${encodeURIComponent(player.name)}`}
        className="group grid min-w-0 justify-items-center gap-2 rounded-[8px] px-1 text-center"
      >
        <span className="relative">
          {first ? (
            <Crown
              className="absolute -top-8 left-1/2 size-8 -translate-x-1/2 fill-gold-bright text-[#a87708] drop-shadow-[0_2px_0_rgba(0,0,0,0.3)]"
              aria-hidden
            />
          ) : null}
          <PlayerFace
            uuid={player.uuid}
            colour={player.role.colour}
            className={cn(
              'transition-transform group-hover:-translate-y-1',
              first ? 'size-20 sm:size-28' : 'size-16 sm:size-24',
            )}
            faceClassName="rounded-[6px] border-2 border-black/30 shadow-[0_4px_0_rgba(0,0,0,0.25)]"
          />
        </span>
        <span className="max-w-full truncate text-[0.95rem] font-bold group-hover:text-primary sm:text-[1.1rem]">
          {player.name}
        </span>
        {player.role.symbol ? <RankTag role={player.role} className="max-sm:hidden" /> : null}
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground sm:text-[14px]">
          <Clock className="size-4 max-sm:hidden" aria-hidden />
          <span className="tabular">{time.playtime(player.playMinutes)}</span>
        </span>
      </Link>
      <div
        className={cn('grid w-full place-items-center rounded-t-[6px] border-2 border-black/30', medal.step)}
        style={blockStyle}
      >
        <span className="font-pixel text-[2.6rem] font-bold leading-none text-black/55 sm:text-[3.6rem]">
          {player.rank}
        </span>
        <span className="sr-only">{t('site.stats.place', { rank: player.rank })}</span>
      </div>
    </li>
  );
}

function LeaderRow({ player, best }: { readonly player: TopPlayer; readonly best: number }): ReactElement {
  const time = useTimeText();
  const share = best ? (player.playMinutes / best) * PERCENT : 0;
  const bar: CSSProperties = { width: `${share}%`, backgroundColor: player.role.colour };
  return (
    <li>
      <Link
        to={`/spieler/${encodeURIComponent(player.name)}`}
        className="group grid grid-cols-[2.5rem_auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/60 sm:gap-4 sm:px-5"
      >
        <span className="tabular text-center font-pixel text-[1.35rem] font-bold text-muted-foreground">
          {player.rank}
        </span>
        <PlayerFace
          uuid={player.uuid}
          colour={player.role.colour}
          className="size-11"
          faceClassName="rounded-[6px] border-2 border-black/20"
        />
        <span className="grid min-w-0 gap-1.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0 truncate text-[1rem] font-bold leading-tight group-hover:text-primary">
              {player.name}
            </span>
            {player.role.symbol ? <RankTag role={player.role} className="max-sm:hidden" /> : null}
          </span>
          <span className="block h-1.5 w-full max-w-[320px] overflow-hidden bg-muted" aria-hidden>
            <span className="block h-full opacity-80" style={bar} />
          </span>
        </span>
        <span className="tabular shrink-0 font-pixel text-[15px] font-semibold">{time.playtime(player.playMinutes)}</span>
      </Link>
    </li>
  );
}

/** Leaderboard by play time with a podium for the best three, and the player search. */
export function StatsPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const top = useTopPlayers(TOP_ALL);
  const list = top.data ?? [];
  const podium = list.slice(0, PODIUM);
  const rest = list.slice(PODIUM);
  const best = list[0]?.playMinutes ?? 0;
  // Second place stands left of the winner, third right of it.
  const order = [podium[1], podium[0], podium[2]].filter((p): p is TopPlayer => Boolean(p));
  return (
    <>
      <PageHero eyebrow={t('site.stats.eyebrow')} title={t('site.stats.title')} text={t('site.stats.text')} scene="schloss">
        <PlayerSearch onDark className="max-w-[560px] pt-2" />
      </PageHero>
      <div className={cn(WRAP, 'grid gap-8 py-14 sm:py-16')}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="flex items-center gap-3 font-pixel text-[clamp(1.8rem,4vw,2.4rem)] font-bold leading-none">
            <Trophy className="size-7 text-gold" aria-hidden />
            {t('site.stats.byPlaytime')}
          </h2>
          <p className="text-[14px] text-muted-foreground">{t('site.stats.privateHint')}</p>
        </div>
        {top.isPending ? (
          <Panel className="grid divide-y-2 divide-border">
            {SKELETON_ROWS.map((k) => (
              <div key={k} className="flex items-center gap-4 px-5 py-3.5">
                <Skeleton className="size-11" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </Panel>
        ) : null}
        {top.isError ? <LoadError /> : null}
        {top.isSuccess && !list.length ? (
          <EmptyState icon={BarChart3} title={t('site.stats.emptyTitle')} text={t('site.stats.noneYet')} />
        ) : null}
        {order.length ? (
          <Panel className="px-3 pb-0 pt-12 sm:px-8">
            <ol className="mx-auto grid max-w-[720px] grid-cols-3 items-end gap-3 sm:gap-6">
              {order.map((p) => (
                <PodiumStep key={p.uuid} player={p} />
              ))}
            </ol>
          </Panel>
        ) : null}
        {rest.length ? (
          <Panel className="overflow-hidden">
            <ol className="grid divide-y-2 divide-border" start={PODIUM + 1}>
              {rest.map((p) => (
                <LeaderRow key={p.uuid} player={p} best={best} />
              ))}
            </ol>
          </Panel>
        ) : null}
      </div>
    </>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Panel className="grid content-start gap-2.5 p-3.5 sm:gap-3 sm:p-5">
      <span className="flex items-start gap-2 font-pixel text-[12.5px] font-semibold uppercase leading-tight tracking-[0.1em] text-muted-foreground sm:items-center sm:text-[13px]">
        <Icon className="size-4 shrink-0 text-gold" aria-hidden />
        {label}
      </span>
      <div className="font-pixel text-[1.25rem] font-bold leading-tight sm:text-[1.5rem]">{children}</div>
    </Panel>
  );
}

const NUMBER_LOCALE = { de: 'de-DE', en: 'en-GB' } as const;
/** Values whose name ends like this are times in milliseconds (best times of a course, a round …). */
const TIME_SUFFIX = '_ms';
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MS_DIGITS = 3;
const TWO_DIGITS = 2;

/** "1:23,456" (or "23,456 s" under a minute) for a time in milliseconds. */
function formatTime(ms: number, locale: string): string {
  const minutes = Math.floor(ms / (MS_PER_SECOND * SECONDS_PER_MINUTE));
  const seconds = (ms / MS_PER_SECOND) % SECONDS_PER_MINUTE;
  const digits = { minimumFractionDigits: MS_DIGITS, maximumFractionDigits: MS_DIGITS };
  if (!minutes) return `${new Intl.NumberFormat(locale, digits).format(seconds)} s`;
  const padded = new Intl.NumberFormat(locale, { ...digits, minimumIntegerDigits: TWO_DIGITS }).format(seconds);
  return `${minutes}:${padded}`;
}

/** A value's own name when there is no text for it: "best_streak" → "Best streak". */
function readable(key: string): string {
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What the player did in each game mode (the modes report it; names of values come from the mode). */
function ModeStats({ stats }: { readonly stats: NonNullable<PublicProfile['modes']> }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const language = useLanguage();
  const status = useNetworkStatus();
  const locale = NUMBER_LOCALE[language];
  const number = new Intl.NumberFormat(locale);
  const entries = Object.entries(stats).filter(([, values]) => Object.keys(values).length);
  if (!entries.length) return null;
  return (
    <section className="grid gap-5" aria-labelledby="mode-stats">
      <h2 id="mode-stats" className="font-pixel text-[clamp(1.8rem,4vw,2.3rem)] font-bold leading-none">
        {t('site.players.modeStats')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([modeId, values]) => {
          const mode = findMode(status.data?.modes, modeId);
          return (
            <article
              key={modeId}
              className="overflow-hidden rounded-[10px] border-2 border-[color-mix(in_srgb,var(--mode-b)_72%,#000)] bg-card shadow-[0_5px_0_color-mix(in_srgb,var(--mode-b)_72%,#000)]"
              style={modeStyle(modeId)}
            >
              <header className="mm-mode-bg relative flex h-24 items-end overflow-hidden px-4 pb-3">
                <div className="mm-noise absolute inset-0 opacity-60 mix-blend-overlay" aria-hidden />
                {modeArt(modeId).figure ? (
                  <ModeFigure id={modeId} look="open" className="bottom-[-80%] left-[80%] h-[170%]" />
                ) : null}
                <h3 className="relative font-pixel text-[1.6rem] font-bold leading-none text-white [text-shadow:0_3px_0_rgba(0,0,0,0.4)]">
                  {mode ? pick(mode.name) : readable(modeId)}
                </h3>
              </header>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
                {Object.entries(values).map(([key, value]) => (
                  <div key={key} className="grid gap-0.5">
                    <dt className="font-pixel text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {t(`site.players.stats.${key}`, { defaultValue: readable(key) })}
                    </dt>
                    <dd className="tabular font-pixel text-[1.5rem] font-bold leading-none">
                      {key.endsWith(TIME_SUFFIX) ? formatTime(value, locale) : number.format(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BackToStats(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <GameButton asChild tone="stone">
      <Link to="/statistiken">
        <ArrowLeft />
        {t('site.players.back')}
      </Link>
    </GameButton>
  );
}

function ProfileTop({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className={cn(WRAP, 'grid max-w-[820px] gap-6 pb-16 pt-[calc(var(--header-h)+40px)]')}>{children}</div>;
}

/** A player's public profile (or a friendly note when it is private or unknown). */
export function PlayerProfilePage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { name = '' } = useParams();
  const pick = usePick();
  const time = useTimeText();
  const profile = usePlayerProfile(name);
  const top = useTopPlayers(TOP_ALL);
  usePageTitle(profile.data ? undefined : name);

  if (profile.isPending) {
    return (
      <ProfileTop>
        <div className="flex items-center gap-4">
          <Skeleton className="size-28 rounded-[10px]" />
          <Skeleton className="h-12 w-56" />
        </div>
        <Skeleton className="h-32 rounded-[10px]" />
      </ProfileTop>
    );
  }
  if (profile.isError || !profile.data) {
    const unknown = isNotFound(profile.error);
    return (
      <ProfileTop>
        <EmptyState
          icon={UserSearch}
          title={unknown ? t('site.players.unknownTitle') : t('site.loadError')}
          text={unknown ? t('site.players.unknownText', { name }) : undefined}
        />
        <Panel className="p-5 sm:p-6">
          <PlayerSearch />
        </Panel>
        <div>
          <BackToStats />
        </div>
      </ProfileTop>
    );
  }
  const p = profile.data;
  if (p.private) {
    return (
      <>
        <PageHero eyebrow={t('site.players.eyebrow')} title={p.name} scene="handwerkergasse" />
        <div className={cn(WRAP, 'grid max-w-[820px] gap-6 py-12 sm:py-16')}>
          <EmptyState icon={Lock} title={t('site.players.privateTitle')} text={t('site.players.privateText')}>
            <p className="flex flex-wrap items-center justify-center gap-2 text-[15px] text-muted-foreground">
              {t('site.players.privateHow')} <Cmd>/profil öffentlich</Cmd>
            </p>
          </EmptyState>
          <div>
            <BackToStats />
          </div>
        </div>
      </>
    );
  }
  const where = p.online?.where ? pick(p.online.where) : null;
  const place = top.data?.find((entry) => entry.uuid === p.uuid)?.rank;
  return (
    <>
      <PageHero
        eyebrow={t('site.players.eyebrow')}
        title={p.name}
        scene="handwerkergasse"
        titleClassName="text-[clamp(2.2rem,6.4vw,4.2rem)]"
        aside={
          <PlayerFace
            uuid={p.uuid}
            colour={p.role.colour}
            className="ml-auto size-56"
            faceClassName="rounded-[10px] border-4 border-black/40 shadow-[0_8px_0_rgba(0,0,0,0.4)]"
          />
        }
      >
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <PlayerFace
            uuid={p.uuid}
            colour={p.role.colour}
            online={Boolean(p.online)}
            className="size-20 lg:hidden"
            faceClassName="rounded-[8px] border-[3px] border-black/40"
            dotClassName="size-5 border-[3px] border-band"
          />
          <div className="grid gap-2">
            <RankTag role={p.role} size="md" />
            <div className="flex flex-wrap items-center gap-2">
              {p.bedrock ? (
                <Chip tone="glass" icon={Smartphone}>
                  {t('site.players.bedrock')}
                </Chip>
              ) : null}
              {p.online ? (
                <Chip tone="brightGreen" pulse>
                  {where ? t('site.players.onlineIn', { where }) : t('site.players.onlineNow')}
                </Chip>
              ) : (
                <span className="inline-flex items-center gap-2 text-[15px] text-white/80">
                  <LiveDot live={false} />
                  {t('site.players.lastSeen', { when: time.relative(p.lastSeen) })}
                </span>
              )}
            </div>
          </div>
        </div>
      </PageHero>
      <div className={cn(WRAP, 'grid gap-8 py-12 sm:py-14')}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Fact icon={Trophy} label={t('site.players.place')}>
            {place ? (
              <Link to="/statistiken" className="text-primary hover:underline">
                {t('site.stats.place', { rank: place })}
              </Link>
            ) : (
              <span className="text-[1.1rem] text-muted-foreground">{t('site.players.noPlace')}</span>
            )}
          </Fact>
          <Fact icon={Clock} label={t('site.players.playtime')}>
            <span className="tabular">{time.playtime(p.playMinutes)}</span>
          </Fact>
          <Fact icon={CalendarPlus} label={t('site.players.firstSeen')}>
            {time.day(p.firstSeen)}
          </Fact>
          <Fact icon={CalendarClock} label={t('site.players.lastSeenLabel')}>
            {p.online ? (
              <span className="text-success">{t('site.players.rightNow')}</span>
            ) : (
              <span title={time.date(p.lastSeen)}>{time.relative(p.lastSeen)}</span>
            )}
          </Fact>
        </div>
        {p.modes ? <ModeStats stats={p.modes} /> : null}
        <Panel className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <PlayerSearch className="max-w-[560px]" />
          <BackToStats />
        </Panel>
      </div>
    </>
  );
}
