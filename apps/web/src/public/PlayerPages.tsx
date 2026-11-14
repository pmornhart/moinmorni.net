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
import { useId, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { PlayerFace } from '~/components/player-face';
import { RoleBadge } from '~/components/role-visuals';
import { Button, Card, Kbd, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { isNotFound, TOP_ALL, usePlayerProfile, useTopPlayers, type TopPlayer } from '~/lib/site';
import { usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { EmptyState, PageBand, usePageTitle, WRAP } from './parts';

/** Longest name the API takes (Bedrock names carry a dot in front). */
const NAME_MAX = 17;
const PODIUM = 3;
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'];
/** Medal colours of places 1–3 (gold, silver, bronze). */
const MEDALS = ['#e7bb4d', '#b8c2cc', '#c98a52'] as const;

/** Type a name, land on the profile. */
export function PlayerSearch({
  onBand = false,
  className,
}: {
  readonly onBand?: boolean;
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
    <form onSubmit={submit} className={cn('grid gap-2', className)} role="search">
      <label htmlFor={id} className={cn('text-sm font-semibold', onBand && 'text-band-foreground')}>
        {t('site.players.searchLabel')}
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
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
            className="h-12 w-full rounded-[14px] border border-input bg-card pl-11 pr-4 text-[15px] text-foreground shadow-card transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20"
          />
        </div>
        <Button
          type="submit"
          variant={onBand ? 'gold' : 'primary'}
          className="h-12 px-5"
          disabled={!name.trim()}
        >
          <UserSearch />
          <span className="max-sm:sr-only">{t('site.players.searchButton')}</span>
        </Button>
      </div>
      <p className={cn('text-[13px]', onBand ? 'text-band-muted' : 'text-muted-foreground')}>
        {t('site.players.searchHint')}
      </p>
    </form>
  );
}

function PodiumCard({ player }: { readonly player: TopPlayer }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const medal = MEDALS[player.rank - 1] ?? MEDALS[0];
  return (
    <Link
      to={`/spieler/${encodeURIComponent(player.name)}`}
      className={cn(
        'group relative grid justify-items-center gap-3 overflow-hidden rounded-[18px] border border-border bg-card px-5 pb-6 pt-7 text-center shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-float',
        player.rank === 1 && 'sm:-mt-4 sm:pb-8',
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: medal }} aria-hidden />
      <span
        className="grid size-9 place-items-center rounded-full font-display text-lg font-bold text-[#1f1503]"
        style={{ backgroundColor: medal }}
        aria-label={t('site.stats.place', { rank: player.rank })}
      >
        {player.rank === 1 ? <Crown className="size-[18px]" aria-hidden /> : player.rank}
      </span>
      <PlayerFace
        uuid={player.uuid}
        colour={player.role.colour}
        className="size-20"
        faceClassName="rounded-[18px]"
      />
      <span className="grid justify-items-center gap-1.5">
        <span className="max-w-full truncate text-lg font-bold group-hover:text-primary">{player.name}</span>
        <RoleBadge role={player.role} className="justify-self-center" />
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Clock className="size-4" aria-hidden />
        <span className="tabular">{time.playtime(player.playMinutes)}</span>
      </span>
    </Link>
  );
}

function LeaderRow({ player }: { readonly player: TopPlayer }): ReactElement {
  const time = useTimeText();
  return (
    <li>
      <Link
        to={`/spieler/${encodeURIComponent(player.name)}`}
        className="group flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5"
      >
        <span className="tabular w-8 shrink-0 text-center font-display text-lg font-semibold text-muted-foreground">
          {player.rank}
        </span>
        <PlayerFace uuid={player.uuid} colour={player.role.colour} className="size-10" />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="min-w-0 truncate font-bold group-hover:text-primary">{player.name}</span>
          <RoleBadge role={player.role} />
        </span>
        <span className="tabular shrink-0 text-sm font-semibold">{time.playtime(player.playMinutes)}</span>
      </Link>
    </li>
  );
}

/** Leaderboard by play time and the player search. */
export function StatsPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const top = useTopPlayers(TOP_ALL);
  const list = top.data ?? [];
  const podium = list.slice(0, PODIUM);
  const rest = list.slice(PODIUM);
  // On wide screens second place stands left of the winner, third right of it.
  const order = [podium[1], podium[0], podium[2]].filter((p): p is TopPlayer => Boolean(p));
  return (
    <>
      <PageBand
        eyebrow={t('site.stats.eyebrow')}
        title={t('site.stats.title')}
        text={t('site.stats.text')}
        icon={BarChart3}
      >
        <PlayerSearch onBand className="max-w-[560px] pt-4" />
      </PageBand>
      <div className={cn(WRAP, 'grid gap-8 py-12 sm:py-16')}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-[1.8rem] font-semibold">{t('site.stats.byPlaytime')}</h2>
          <p className="text-sm text-muted-foreground">{t('site.stats.privateHint')}</p>
        </div>
        {top.isPending ? (
          <Card className="grid divide-y divide-border">
            {SKELETON_ROWS.map((k) => (
              <div key={k} className="flex items-center gap-3.5 px-5 py-3.5">
                <Skeleton className="size-10" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </Card>
        ) : null}
        {top.isError ? <Card className="p-6 text-muted-foreground">{t('site.loadError')}</Card> : null}
        {top.isSuccess && !list.length ? (
          <EmptyState icon={BarChart3} title={t('site.stats.emptyTitle')} text={t('site.stats.noneYet')} />
        ) : null}
        {order.length ? (
          <ol className="grid items-end gap-4 sm:grid-cols-3">
            {order.map((p) => (
              <li key={p.uuid} className={cn('grid', p.rank === 1 ? 'order-first sm:order-none' : '')}>
                <PodiumCard player={p} />
              </li>
            ))}
          </ol>
        ) : null}
        {rest.length ? (
          <Card className="overflow-hidden">
            <ol className="grid divide-y divide-border" start={PODIUM + 1}>
              {rest.map((p) => (
                <LeaderRow key={p.uuid} player={p} />
              ))}
            </ol>
          </Card>
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
    <div className="grid content-start gap-2 rounded-[16px] border border-border bg-card p-5 shadow-card">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-4 text-gold" aria-hidden />
        {label}
      </span>
      <div className="text-lg font-semibold">{children}</div>
    </div>
  );
}

function BackToStats(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <Button asChild variant="secondary">
      <Link to="/statistiken">
        <ArrowLeft />
        {t('site.players.back')}
      </Link>
    </Button>
  );
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
      <div className={cn(WRAP, 'grid gap-5 py-14')}>
        <div className="flex items-center gap-4">
          <Skeleton className="size-24 rounded-[20px]" />
          <Skeleton className="h-10 w-56" />
        </div>
        <Skeleton className="h-32 rounded-[16px]" />
      </div>
    );
  }
  if (profile.isError || !profile.data) {
    const unknown = isNotFound(profile.error);
    return (
      <div className={cn(WRAP, 'grid max-w-[760px] gap-6 py-16')}>
        <EmptyState
          icon={UserSearch}
          title={unknown ? t('site.players.unknownTitle') : t('site.loadError')}
          text={unknown ? t('site.players.unknownText', { name }) : undefined}
        />
        <Card className="p-5 sm:p-6">
          <PlayerSearch />
        </Card>
        <div>
          <BackToStats />
        </div>
      </div>
    );
  }
  const p = profile.data;
  if (p.private) {
    return (
      <>
        <PageBand eyebrow={t('site.players.eyebrow')} title={p.name} />
        <div className={cn(WRAP, 'grid max-w-[760px] gap-6 py-12 sm:py-16')}>
          <EmptyState icon={Lock} title={t('site.players.privateTitle')} text={t('site.players.privateText')}>
            <p className="text-sm text-muted-foreground">
              {t('site.players.privateHow')} <Kbd>/profil öffentlich</Kbd>
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
      <PageBand eyebrow={t('site.players.eyebrow')} title={p.name}>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <PlayerFace
            uuid={p.uuid}
            colour={p.role.colour}
            online={Boolean(p.online)}
            className="size-20 sm:size-24"
            faceClassName="rounded-[20px]"
            dotClassName="size-5 border-[3px] border-band"
          />
          <div className="grid gap-2">
            <RoleBadge role={p.role} onBand className="text-sm" />
            <div className="flex flex-wrap gap-2">
              {p.bedrock ? (
                <Pill tone="blue" className="gap-1">
                  <Smartphone className="size-3" aria-hidden />
                  {t('site.players.bedrock')}
                </Pill>
              ) : null}
              {p.online ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
                  {where ? t('site.players.onlineIn', { where }) : t('site.players.onlineNow')}
                </span>
              ) : (
                <span className="text-sm text-band-muted">
                  {t('site.players.lastSeen', { when: time.relative(p.lastSeen) })}
                </span>
              )}
            </div>
          </div>
        </div>
      </PageBand>
      <div className={cn(WRAP, 'grid gap-8 py-12 sm:py-14')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact icon={Trophy} label={t('site.players.place')}>
            {place ? (
              <Link to="/statistiken" className="text-primary hover:underline">
                {t('site.stats.place', { rank: place })}
              </Link>
            ) : (
              <span className="text-muted-foreground">{t('site.players.noPlace')}</span>
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
        <Card className="p-5 sm:p-6">
          <PlayerSearch />
        </Card>
        <div>
          <BackToStats />
        </div>
      </div>
    </>
  );
}
