import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Gamepad2,
  MessagesSquare,
  Monitor,
  Moon,
  Newspaper,
  Play,
  Smartphone,
  Sun,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type CSSProperties, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { NETWORK_TITLE, type ModeStatus } from '@morninet/shared';
import { Crest } from '~/components/brand';
import { useCopy } from '~/components/controls';
import { PlayerFace } from '~/components/player-face';
import { Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useNews, useSite, useTeam, useTopPlayers, type TeamGroup, type TopPlayer } from '~/lib/site';
import { modeJoinable, modeLook, useNetworkStatus } from '~/lib/status';
import { useLanguage, usePick } from '~/lib/text';
import { useTheme } from '~/lib/theme';
import { useTimeText } from '~/lib/time';
import { heroImage, KNOWN_MODES, modeArt, sceneImage, seededFraction, type DayTime, type Scene } from './art';
import { CompactNews, FeaturedNews, JoinCard, ModeCard } from './cards';
import { EmptyState, GameButton, LiveDot, LoadError, PixelEdge, RankTag, SectionHead } from './kit';
import { OnlineLine } from './PublicLayout';
import {
  EXTERNAL,
  FALLBACK_ADDRESS,
  FALLBACK_BEDROCK_PORT,
  JOIN_LINK,
  setSocials,
  SOCIAL_ICON,
  useDayTime,
  WRAP,
} from './parts';

/** News on the start page: one big, up to three small. */
const HOME_NEWS = 4;
const TOP_COUNT = 3;
const TEAM_PREVIEW = 8;
const MODE_COLUMNS = 4;
const NUMBER_LOCALE = { de: 'de-DE', en: 'en-GB' } as const;
const PERCENT = 100;

/* Fireflies (night) and pollen (day) over the hero picture. */
const MOTE_COUNT = 18;
const MOTE_TOP_MIN = 34;
const MOTE_TOP_SPREAD = 52;
const MOTE_MAX_DELAY_S = 9;
const MOTE_MIN_TIME_S = 7;
const MOTE_TIME_SPREAD_S = 7;
const MOTE_MAX_DRIFT_PX = 60;
/** Drift goes left or right: the fraction is moved to −½ … ½. */
const HALF = 0.5;
const MOTES = Array.from({ length: MOTE_COUNT }, (_, i) => ({
  key: `mote-${i}`,
  style: {
    left: `${seededFraction(`left-${i}`) * PERCENT}%`,
    top: `${MOTE_TOP_MIN + seededFraction(`top-${i}`) * MOTE_TOP_SPREAD}%`,
    animationDelay: `-${seededFraction(`delay-${i}`) * MOTE_MAX_DELAY_S}s`,
    '--drift-time': `${MOTE_MIN_TIME_S + seededFraction(`time-${i}`) * MOTE_TIME_SPREAD_S}s`,
    '--drift-x': `${(seededFraction(`drift-${i}`) - HALF) * MOTE_MAX_DRIFT_PX}px`,
  } as CSSProperties,
}));

/** Each figure in the hero bobs at its own pace. */
const BOB_STEP_S = 0.45;

function Motes(): ReactElement {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {MOTES.map((m) => (
        <span key={m.key} className="mm-mote" style={m.style} />
      ))}
    </div>
  );
}

function AddressBox(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const address = status.data?.javaAddress ?? FALLBACK_ADDRESS;
  const { copied, failed, copy } = useCopy(address);
  return (
    <div className="w-full max-w-[600px] rounded-[10px] border-2 border-black/60 bg-[#06100c]/70 p-2 text-left shadow-[inset_0_2px_0_rgba(255,255,255,0.08),0_6px_0_rgba(0,0,0,0.4)] backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className="grid min-w-0 flex-1 gap-1.5 px-2.5 py-1.5 sm:px-3">
          <span className="font-pixel text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-bright">
            {t('site.hero.address')}
          </span>
          <span className="select-all truncate font-pixel text-[clamp(1.35rem,5vw,2.15rem)] font-bold leading-none text-white">
            {address}
          </span>
        </div>
        <GameButton
          onClick={copy}
          size="lg"
          className="max-sm:h-12 max-sm:px-4 max-sm:text-[15px]"
          aria-live="polite"
        >
          {copied ? <Check /> : <Copy />}
          <span className="max-[359px]:sr-only">{copied ? t('copy.done') : t('copy.action')}</span>
        </GameButton>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t-2 border-white/10 px-2.5 pb-1 pt-2 text-[14px] sm:px-3">
        <OnlineLine announce />
        {failed ? <span className="text-white/75">{t('copy.manual')}</span> : null}
      </div>
    </div>
  );
}

function EditionHints(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const port = status.data?.bedrockPort ?? FALLBACK_BEDROCK_PORT;
  const hint =
    'inline-flex items-center gap-2 rounded-[4px] bg-black/45 px-2.5 py-1.5 text-[13.5px] font-medium text-white/90 backdrop-blur-sm';
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label={t('site.hero.editions')}>
      <li className={hint}>
        <Monitor className="size-4 text-gold-bright" aria-hidden />
        {t('site.hero.javaShort')}
      </li>
      <li className={hint}>
        <Smartphone className="size-4 text-gold-bright" aria-hidden />
        {t('site.hero.bedrockShort', { port })}
      </li>
    </ul>
  );
}

/** One figure of the hero line-up, with a name tag like above a player in the game. */
function LineupFigure({
  id,
  mode,
  index,
}: {
  readonly id: string;
  readonly mode?: ModeStatus;
  readonly index: number;
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const art = modeArt(id);
  if (!art.figure) return null;
  const look = mode ? modeLook(mode) : null;
  const name = mode ? pick(mode.name) : null;
  const state = ((): string | null => {
    if (!mode || !look) return null;
    if (look === 'open') return t('site.hero.figurePlayers', { count: mode.players });
    return t(`site.modeState.${look}`);
  })();
  const nameStyle: CSSProperties = { color: art.a };
  const bob: CSSProperties = { animationDelay: `-${index * BOB_STEP_S}s` };
  return (
    <li className="w-[30vw] max-w-[190px] shrink-0 sm:-mx-[0.8%] sm:w-[calc(102%/var(--figures))] sm:shrink">
      <Link
        to={`/spielmodi/${id}`}
        className="group relative block rounded-[8px] outline-offset-4"
        aria-label={name ? `${name}${state ? ` – ${state}` : ''}` : undefined}
      >
        {name ? (
          <span className="mm-nameplate absolute left-1/2 top-[2%] z-10 grid -translate-x-1/2 -translate-y-full justify-items-center gap-0.5 whitespace-nowrap rounded-[3px] px-2 py-1 text-center font-pixel leading-none transition-transform group-hover:-translate-y-[calc(100%+6px)]">
            <span className="text-[13px] font-bold sm:text-[15px]" style={nameStyle}>
              {name}
            </span>
            {state ? (
              <span className="text-[11px] font-medium text-white/85 sm:text-[12px]">{state}</span>
            ) : null}
          </span>
        ) : null}
        <span className="mm-bob block" style={bob}>
          <img
            src={art.figure}
            alt=""
            decoding="async"
            className={cn(
              'block w-full drop-shadow-[0_10px_14px_rgba(0,0,0,0.5)] transition-[transform,filter] duration-200 group-hover:-translate-y-1.5 group-hover:scale-[1.04] group-hover:drop-shadow-[0_0_18px_rgba(255,233,166,0.55)]',
              look === 'soon' &&
                'brightness-0 drop-shadow-[0_0_1px_rgba(255,255,255,0.9)] drop-shadow-[0_0_12px_rgba(246,197,68,0.55)] group-hover:drop-shadow-[0_0_18px_rgba(246,197,68,0.8)]',
              look === 'closed' && 'grayscale-[0.6]',
            )}
          />
        </span>
      </Link>
    </li>
  );
}

/** Fewest places in the line-up (so a few modes do not turn into giants). */
const MIN_LINEUP = 7;

/** The modes' figures from the village market, standing on the edge of the hero. Swipe on phones. */
function Lineup(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const modes = status.data?.modes;
  const entries = modes
    ? modes.filter((m) => modeArt(m.id).figure).map((m) => ({ id: m.id, mode: m }))
    : KNOWN_MODES.map((id) => ({ id, mode: undefined }));
  return (
    <ul
      className="mm-scroll-x flex w-full items-end gap-1 px-[8vw] pt-14 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] sm:justify-center sm:overflow-visible sm:px-0 sm:[mask-image:none]"
      aria-label={t('site.hero.lineup')}
      // Auf breiten Schirmen stehen alle in einer Reihe – je mehr Modi, desto schmaler jede Figur.
      style={{ '--figures': Math.max(entries.length, MIN_LINEUP) } as CSSProperties}
    >
      {entries.map((entry, index) => (
        <LineupFigure key={entry.id} id={entry.id} mode={entry.mode} index={index} />
      ))}
    </ul>
  );
}

function Hero(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { resolved } = useTheme();
  const invite = useSite().data?.discordInvite;
  return (
    <section
      className="mm-on-dark relative isolate overflow-hidden bg-band text-white"
      aria-labelledby="hero-title"
    >
      <picture>
        <source media="(max-width: 640px)" srcSet={heroImage(resolved, true)} />
        <img
          src={heroImage(resolved, false)}
          alt={t('site.hero.imageAlt')}
          fetchPriority="high"
          className="mm-settle absolute inset-0 -z-20 size-full object-cover"
        />
      </picture>
      <div className="mm-hero-shade absolute inset-0 -z-10" aria-hidden />
      <Motes />
      <div className="flex min-h-[max(720px,100svh)] flex-col pt-[calc(var(--header-h)+20px)] sm:pt-[calc(var(--header-h)+32px)]">
        <div className={cn(WRAP, 'mm-rise grid justify-items-center gap-5 text-center sm:gap-6')}>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
            <Crest className="size-16 drop-shadow-[0_4px_0_rgba(0,0,0,0.45)] sm:size-[88px]" />
            <h1
              id="hero-title"
              className="mm-wordmark font-pixel text-[clamp(3.3rem,12vw,7.4rem)] font-bold leading-[0.88] tracking-[0.01em]"
            >
              {NETWORK_TITLE}
            </h1>
          </div>
          <p className="font-pixel text-[14px] font-semibold uppercase tracking-[0.22em] text-gold-bright [text-shadow:0_2px_0_rgba(0,0,0,0.6)] sm:text-[16px]">
            {t('site.hero.eyebrow')}
          </p>
          <p className="max-w-[44ch] text-[1.06rem] leading-relaxed text-white/90 [text-shadow:0_2px_14px_rgba(0,0,0,0.7)] sm:text-[1.2rem]">
            {t('site.hero.pitch')}
          </p>
          <AddressBox />
          <div className="flex w-full flex-wrap justify-center gap-3 sm:gap-4">
            <GameButton asChild size="xl" className="max-sm:flex-1">
              <Link to={JOIN_LINK}>
                <Play />
                {t('site.playNow')}
              </Link>
            </GameButton>
            {invite ? (
              <GameButton asChild tone="blue" size="xl" className="max-sm:flex-1">
                <a href={invite} {...EXTERNAL}>
                  <MessagesSquare />
                  Discord
                </a>
              </GameButton>
            ) : (
              <GameButton asChild tone="stone" size="xl" className="max-sm:flex-1">
                <Link to="/spielmodi">
                  <Gamepad2 />
                  {t('nav.modes')}
                </Link>
              </GameButton>
            )}
          </div>
          <EditionHints />
        </div>
        <div className="relative mt-auto pt-6">
          <Lineup />
          <div className="absolute inset-x-0 bottom-0 h-0">
            <PixelEdge className="text-background" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ModesSection(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const modes = status.data?.modes ?? [];
  const gap = modes.length % MODE_COLUMNS;
  return (
    <section className="relative bg-background" aria-labelledby="home-modes">
      <div className={cn(WRAP, 'grid gap-10 pb-20 pt-14 sm:pt-16')}>
        <SectionHead
          id="home-modes"
          eyebrow={t('site.modes.eyebrow')}
          title={t('site.modes.title')}
          text={t('site.modes.text')}
          link={{ to: '/spielmodi', label: t('site.modes.all') }}
        />
        {status.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {['a', 'b', 'c', 'd'].map((k) => (
              <Skeleton key={k} className="h-[300px] rounded-[10px] sm:h-[420px]" />
            ))}
          </div>
        ) : null}
        {status.isError ? <LoadError /> : null}
        {status.isSuccess && !modes.length ? (
          <EmptyState icon={Gamepad2} title={t('site.modes.emptyTitle')} text={t('site.modes.empty')} />
        ) : null}
        {modes.length ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4">
            {modes.map((mode) => (
              <ModeCard key={mode.id} mode={mode} />
            ))}
            {gap ? <JoinCard /> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function NewsSection(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const news = useNews(HOME_NEWS);
  const list = news.data ?? [];
  const [first, ...rest] = list;
  return (
    <section className="relative bg-background-alt" aria-labelledby="home-news">
      <PixelEdge className="text-background-alt" />
      <div className={cn(WRAP, 'grid gap-10 py-16 sm:py-20')}>
        <SectionHead
          id="home-news"
          eyebrow={t('site.news.eyebrow')}
          title={t('site.news.homeTitle')}
          link={list.length ? { to: '/news', label: t('site.news.all') } : undefined}
        />
        {news.isPending ? (
          <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
            <Skeleton className="h-[460px] rounded-[10px]" />
            <div className="grid gap-4">
              <Skeleton className="h-[110px] rounded-[10px]" />
              <Skeleton className="h-[110px] rounded-[10px]" />
              <Skeleton className="h-[110px] rounded-[10px]" />
            </div>
          </div>
        ) : null}
        {news.isSuccess && !first ? (
          <EmptyState icon={Newspaper} title={t('site.news.emptyTitle')} text={t('site.news.empty')} />
        ) : null}
        {news.isError ? <LoadError /> : null}
        {first ? (
          <div className={cn('grid items-stretch gap-5', rest.length && 'lg:grid-cols-[1.45fr_1fr]')}>
            <FeaturedNews item={first} />
            {rest.length ? (
              <div className="grid auto-rows-fr gap-4">
                {rest.map((item) => (
                  <CompactNews key={item.slug} item={item} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Places of the village, in the order of a walk from the market up to the castle. */
const VILLAGE: readonly { readonly scene: Scene; readonly key: string }[] = [
  { scene: 'dorfplatz', key: 'dorfplatz' },
  { scene: 'stand', key: 'stand' },
  { scene: 'biergarten', key: 'biergarten' },
  { scene: 'handwerkergasse', key: 'gasse' },
  { scene: 'schloss', key: 'schloss' },
  { scene: 'karte', key: 'karte' },
];

function DayNightSwitch({
  time,
  onChange,
}: {
  readonly time: DayTime;
  readonly onChange: (time: DayTime) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const options: readonly { readonly value: DayTime; readonly icon: LucideIcon }[] = [
    { value: 'day', icon: Sun },
    { value: 'night', icon: Moon },
  ];
  return (
    <div
      role="group"
      aria-label={t('site.village.timeLabel')}
      className="inline-flex rounded-[6px] border-2 border-black/50 bg-black/55 p-1 backdrop-blur-md"
    >
      {options.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={time === value}
          onClick={() => onChange(value)}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 font-pixel text-[13px] font-semibold uppercase tracking-[0.05em] transition-colors',
            time === value ? 'bg-gold-bright text-[#2a1b00]' : 'text-white/80 hover:text-white',
          )}
        >
          <Icon className="size-4" aria-hidden />
          {t(`site.village.${value}`)}
        </button>
      ))}
    </div>
  );
}

function Village(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const themeTime = useDayTime();
  const [index, setIndex] = useState(0);
  const [chosenTime, setChosenTime] = useState<DayTime | null>(null);
  const time = chosenTime ?? themeTime;
  const current = VILLAGE[index] ?? VILLAGE[0];
  const step = (by: number): void => setIndex((i) => (i + by + VILLAGE.length) % VILLAGE.length);
  if (!current) return <></>;
  return (
    <section className="mm-on-dark relative bg-band text-band-foreground" aria-labelledby="home-village">
      <PixelEdge className="text-band" />
      <div className="mm-noise pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className={cn(WRAP, 'relative grid gap-10 py-16 sm:py-20')}>
        <SectionHead
          id="home-village"
          onDark
          eyebrow={t('site.village.eyebrow')}
          title={t('site.village.title')}
          text={t('site.village.text')}
        />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <figure className="relative overflow-hidden rounded-[10px] border-2 border-black/60 bg-black shadow-[0_6px_0_rgba(0,0,0,0.45)]">
            <img
              key={`${current.scene}-${time}`}
              src={sceneImage(current.scene, time)}
              alt={t(`site.village.places.${current.key}.alt`)}
              loading="lazy"
              decoding="async"
              className="mm-fade aspect-[16/9] w-full object-cover"
            />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
              <span className="rounded-[4px] bg-black/60 px-2 py-1 font-pixel text-[13px] font-semibold tabular text-white backdrop-blur-sm">
                {index + 1} / {VILLAGE.length}
              </span>
              <DayNightSwitch time={time} onChange={setChosenTime} />
            </div>
            <figcaption className="absolute inset-x-0 bottom-0 grid gap-1 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-14 sm:p-6 sm:pt-20">
              <span className="font-pixel text-[clamp(1.4rem,3vw,2.1rem)] font-bold leading-tight text-white">
                {t(`site.village.places.${current.key}.title`)}
              </span>
              <span className="max-w-[60ch] text-[15px] leading-relaxed text-white/85 max-sm:line-clamp-2">
                {t(`site.village.places.${current.key}.text`)}
              </span>
            </figcaption>
            <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2 max-sm:hidden">
              <GameButton
                tone="stone"
                size="icon"
                onClick={() => step(-1)}
                aria-label={t('site.village.previous')}
                className="mm-on-dark pointer-events-auto"
              >
                <ChevronLeft />
              </GameButton>
              <GameButton
                tone="stone"
                size="icon"
                onClick={() => step(1)}
                aria-label={t('site.village.next')}
                className="mm-on-dark pointer-events-auto"
              >
                <ChevronRight />
              </GameButton>
            </div>
          </figure>
          <ul
            className="grid grid-cols-3 gap-2.5 lg:grid-cols-1 lg:gap-2"
            aria-label={t('site.village.places.label')}
          >
            {VILLAGE.map((place, i) => (
              <li key={place.key}>
                <button
                  type="button"
                  aria-pressed={i === index}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'group grid w-full cursor-pointer gap-1.5 rounded-[8px] border-2 p-1.5 text-left transition-colors lg:grid-cols-[96px_minmax(0,1fr)] lg:items-center lg:gap-3',
                    i === index
                      ? 'border-gold-bright bg-white/[0.08]'
                      : 'border-black/40 bg-black/20 hover:border-white/30 hover:bg-white/[0.05]',
                  )}
                >
                  <img
                    src={sceneImage(place.scene, time)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-[16/9] w-full rounded-[4px] object-cover"
                  />
                  <span className="grid gap-0.5 px-0.5 lg:px-0">
                    <span
                      className={cn(
                        'truncate font-pixel text-[13px] font-semibold leading-tight sm:text-[15px]',
                        i === index ? 'text-gold-bright' : 'text-band-foreground',
                      )}
                    >
                      {t(`site.village.places.${place.key}.title`)}
                    </span>
                    <span className="hidden truncate text-[13px] text-band-muted lg:block">
                      {t(`site.village.places.${place.key}.short`)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  live = false,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly live?: boolean;
}): ReactElement {
  return (
    <div className="grid content-start gap-2 rounded-[10px] border-2 border-border bg-card p-3 shadow-card sm:gap-3 sm:p-6">
      <span className="flex items-start gap-2 font-pixel text-[12px] font-semibold uppercase leading-tight tracking-[0.1em] text-gold sm:items-center sm:text-[13px] sm:tracking-[0.14em]">
        <Icon className="size-4 shrink-0 max-sm:hidden" aria-hidden />
        {label}
      </span>
      <span className="flex items-center gap-2 font-pixel text-[clamp(2rem,6vw,3.6rem)] font-bold leading-none sm:gap-3">
        {live ? <LiveDot live className="size-2.5 sm:size-3.5" /> : null}
        <span className="tabular">{value}</span>
      </span>
      <span className="text-[14px] text-muted-foreground max-sm:hidden">{hint}</span>
    </div>
  );
}

/** Medal colours of places 1–3 as block faces (top light, front, side shadow). */
const PODIUM_BLOCKS = [
  { face: '#f6c544', edge: '#a87708', height: 'h-36 sm:h-44' },
  { face: '#cfd8df', edge: '#7c8b96', height: 'h-24 sm:h-32' },
  { face: '#d9904f', edge: '#8a4f1f', height: 'h-16 sm:h-24' },
] as const;

function PodiumColumn({ player }: { readonly player: TopPlayer }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const block = PODIUM_BLOCKS[player.rank - 1] ?? PODIUM_BLOCKS[0];
  const first = player.rank === 1;
  const blockStyle: CSSProperties = {
    backgroundColor: block.face,
    boxShadow: `inset 0 6px 0 rgba(255,255,255,0.45), inset 0 -8px 0 ${block.edge}, 0 6px 0 rgba(0,0,0,0.3)`,
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
              className="absolute -top-7 left-1/2 size-7 -translate-x-1/2 fill-gold-bright text-[#a87708] drop-shadow-[0_2px_0_rgba(0,0,0,0.3)]"
              aria-hidden
            />
          ) : null}
          <PlayerFace
            uuid={player.uuid}
            colour={player.role.colour}
            className={cn(
              'transition-transform group-hover:-translate-y-1',
              first ? 'size-20 sm:size-24' : 'size-16 sm:size-20',
            )}
            faceClassName="rounded-[6px] border-2 border-black/30 shadow-[0_4px_0_rgba(0,0,0,0.25)]"
          />
        </span>
        <span className="max-w-full truncate text-[0.95rem] font-bold group-hover:text-primary sm:text-[1.05rem]">
          {player.name}
        </span>
        {player.role.symbol ? <RankTag role={player.role} className="max-sm:hidden" /> : null}
        <span className="tabular text-[13px] font-semibold text-muted-foreground sm:text-[14px]">
          {time.playtime(player.playMinutes)}
        </span>
      </Link>
      <div
        className={cn(
          'grid w-full place-items-center rounded-t-[6px] border-2 border-black/30',
          block.height,
        )}
        style={blockStyle}
        aria-label={t('site.stats.place', { rank: player.rank })}
      >
        <span className="font-pixel text-[2.4rem] font-bold leading-none text-black/55 sm:text-[3.2rem]">
          {player.rank}
        </span>
      </div>
    </li>
  );
}

function StatsSection(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const status = useNetworkStatus();
  const site = useSite();
  const top = useTopPlayers(TOP_COUNT);
  const number = new Intl.NumberFormat(NUMBER_LOCALE[language]);
  const total = site.data ? number.format(site.data.players) : '–';
  const online = status.data ? number.format(status.data.players) : '–';
  const modes = status.data?.modes ?? [];
  const open = modes.filter(modeJoinable).length;
  const podium = top.data ?? [];
  // Second place stands left of the winner, third right of it.
  const order = [podium[1], podium[0], podium[2]].filter((p): p is TopPlayer => Boolean(p));
  return (
    <section className="relative bg-background" aria-labelledby="home-stats">
      <PixelEdge className="text-background" />
      <div className={cn(WRAP, 'grid gap-10 py-16 sm:py-20')}>
        <SectionHead
          id="home-stats"
          eyebrow={t('site.stats.eyebrow')}
          title={t('site.stats.homeTitle')}
          link={{ to: '/statistiken', label: t('site.stats.toLeaderboard') }}
        />
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <StatTile
            icon={Users}
            label={t('site.stats.total')}
            value={total}
            hint={t('site.stats.totalHint')}
          />
          <StatTile
            icon={Gamepad2}
            label={t('site.stats.online')}
            value={online}
            hint={t('site.server.refresh')}
            live={status.data?.online === true}
          />
          <StatTile
            icon={Play}
            label={t('site.stats.modesOpen')}
            value={status.data ? `${open} / ${modes.length}` : '–'}
            hint={t('site.stats.modesOpenHint')}
          />
        </div>
        <div className="grid gap-6 rounded-[10px] border-2 border-border bg-card p-5 shadow-card sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2.5 font-pixel text-[1.5rem] font-bold">
              <Trophy className="size-6 text-gold" aria-hidden />
              {t('site.stats.topTitle')}
            </h3>
            <Link
              to="/statistiken"
              className="group inline-flex items-center gap-1.5 font-pixel text-[15px] font-semibold uppercase tracking-[0.05em] text-primary"
            >
              {t('site.stats.toLeaderboard')}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
          {top.isPending ? <Skeleton className="h-64 rounded-[8px]" /> : null}
          {top.isError ? <p className="text-muted-foreground">{t('site.loadError')}</p> : null}
          {top.data && !top.data.length ? (
            <p className="text-muted-foreground">{t('site.stats.noneYet')}</p>
          ) : null}
          {order.length ? (
            <ol className="mx-auto grid w-full max-w-[640px] grid-cols-3 items-end gap-3 pt-8 sm:gap-6">
              {order.map((p) => (
                <PodiumColumn key={p.uuid} player={p} />
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TeamMemberTile({
  member,
  group,
}: {
  readonly member: TeamGroup['members'][number];
  readonly group: TeamGroup;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <li>
      <Link
        to={`/spieler/${encodeURIComponent(member.name)}`}
        className="group flex items-center gap-3 rounded-[10px] border-2 border-border bg-card p-3 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-gold/60 hover:shadow-float max-sm:flex-col max-sm:text-center"
      >
        <PlayerFace
          uuid={member.uuid}
          colour={group.role.colour}
          online={member.online}
          className="size-12"
          faceClassName="rounded-[6px] border-2 border-black/20"
        />
        <span className="grid min-w-0 gap-1.5 max-sm:justify-items-center">
          <span className="max-w-full truncate text-[1rem] font-bold leading-tight group-hover:text-primary">
            {member.name}
          </span>
          <RankTag role={group.role} />
        </span>
        <span className="sr-only">{member.online ? t('site.team.online') : t('site.team.offline')}</span>
      </Link>
    </li>
  );
}

function TeamSection(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const team = useTeam();
  const people = (team.data ?? [])
    .flatMap((group) => group.members.map((member) => ({ member, group })))
    .slice(0, TEAM_PREVIEW);
  return (
    <section className="relative bg-background-alt" aria-labelledby="home-team">
      <PixelEdge className="text-background-alt" />
      <div className={cn(WRAP, 'grid gap-10 py-16 sm:py-20')}>
        <SectionHead
          id="home-team"
          eyebrow={t('site.team.eyebrow')}
          title={t('site.team.homeTitle')}
          text={t('site.team.text')}
          link={{ to: '/team', label: t('site.community.teamAll') }}
        />
        {team.isPending ? <Skeleton className="h-40 rounded-[10px]" /> : null}
        {team.isError ? <LoadError /> : null}
        {team.isSuccess && !people.length ? (
          <p className="text-muted-foreground">{t('site.team.soon')}</p>
        ) : null}
        {people.length ? (
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {people.map(({ member, group }) => (
              <TeamMemberTile key={member.uuid} member={member} group={group} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** The big blue invitation to the Discord, with the Morni Party figure waving from the edge. */
function DiscordBand(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const invite = site.data?.discordInvite;
  const socials = setSocials(site.data);
  const figure = modeArt('party').figure;
  return (
    <section className="mm-on-dark relative z-10 bg-[#1d4f8a] text-white" aria-labelledby="discord-band">
      <PixelEdge className="text-[#1d4f8a]" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="mm-rauten absolute inset-0 opacity-[0.08]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#163d6c] via-[#1d4f8a]/80 to-transparent" />
      </div>
      <div
        className={cn(
          WRAP,
          'relative grid items-end gap-8 pt-14 md:grid-cols-[minmax(0,1fr)_300px] md:pt-16',
        )}
      >
        <div className="grid justify-items-start gap-4 pb-14 md:pb-16">
          <span className="rounded-[4px] bg-white px-2 py-1 font-pixel text-[14px] font-bold uppercase tracking-[0.12em] text-[#1d4f8a]">
            {t('site.community.eyebrow')}
          </span>
          <h2
            id="discord-band"
            className="font-pixel text-[clamp(2.2rem,5vw,3.4rem)] font-bold leading-[0.95] text-balance"
          >
            {t('site.community.discordTitle')}
          </h2>
          <p className="max-w-[52ch] text-[1.08rem] leading-relaxed text-white/90">
            {t('site.community.discordText')}
          </p>
          {invite ? (
            <GameButton asChild tone="white" size="lg">
              <a href={invite} {...EXTERNAL}>
                <MessagesSquare />
                {t('site.community.discordJoin')}
              </a>
            </GameButton>
          ) : (
            <p className="rounded-[6px] border-2 border-white/25 bg-black/20 px-4 py-2.5 font-pixel text-[16px] font-semibold">
              {t('site.community.discordSoon')}
            </p>
          )}
          {socials.length ? (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="font-pixel text-[15px] font-semibold uppercase tracking-[0.08em] text-white/80">
                {t('site.community.socialTitle')}
              </span>
              {socials.map(([key, url]) => {
                const Icon = SOCIAL_ICON[key];
                return (
                  <a
                    key={key}
                    href={url}
                    {...EXTERNAL}
                    className="inline-flex h-9 items-center gap-2 rounded-[6px] border-2 border-black/25 bg-white/10 px-3 font-pixel text-[14px] font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    <Icon className="size-4" aria-hidden />
                    {t(`site.social.${key}`)}
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>
        {figure ? (
          <img
            src={figure}
            alt=""
            loading="lazy"
            decoding="async"
            className="mx-auto -mb-6 hidden w-[300px] max-w-none drop-shadow-[0_14px_18px_rgba(0,0,0,0.45)] md:block"
          />
        ) : null}
      </div>
    </section>
  );
}

/** The start page: hero with address and figures, modes, news, the village, numbers, team and Discord. */
export function HomePage(): ReactElement {
  return (
    <>
      <Hero />
      <ModesSection />
      <NewsSection />
      <Village />
      <StatsSection />
      <TeamSection />
      <DiscordBand />
    </>
  );
}
