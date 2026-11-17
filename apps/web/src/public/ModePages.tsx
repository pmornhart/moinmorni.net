import {
  ArrowLeft,
  Check,
  ClipboardList,
  Copy,
  Gamepad2,
  LogIn,
  Medal,
  MessagesSquare,
  Moon,
  MousePointerClick,
  Snowflake,
  Sun,
  Terminal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { sportReplacedBy, type ModeStatus } from '@moinmorni/shared';
import { useCopy } from '~/components/controls';
import { Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { findMode, useModeBoards, useModeTop, useSite } from '~/lib/site';
import { PlayerFace } from '~/components/player-face';
import {
  modeJoinable,
  modeLook,
  shownModes,
  useModeLook,
  useNetworkStatus,
  type ModeLook,
} from '~/lib/status';
import { useLanguage, usePick } from '~/lib/text';
import { modeArt } from './art';
import { guideSyntax, MODE_GUIDES } from './mode-guides';
import { MODE_PARAM, PLACE_COLOURS, useStatText } from './stat-format';
import { JoinCard, ModeCard, ModeFigure, modeStyle } from './cards';
import {
  Chip,
  Cmd,
  EmptyState,
  GameButton,
  LoadError,
  ModeStateChip,
  Panel,
  PixelEdge,
  Segments,
  WhitelistChip,
} from './kit';
import { PageHero } from './page-hero';
import { ClothesGallery } from './clothes-gallery';
import { FishGallery } from './fish-gallery';
import { APPLY_PAGE, EXTERNAL, FALLBACK_ADDRESS, WRAP } from './parts';

const SKELETONS = ['a', 'b', 'c', 'd'];
const MODE_COLUMNS = 4;
/** Applications (website and Discord) exist for MorniCraft. */
const APPLY_MODE = 'mornicraft';
const HOW_ID = 'so-gehts';

function CopyChip({ value }: { readonly value: string }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { copied, copy } = useCopy(value);
  return (
    <button
      type="button"
      onClick={copy}
      title={t('copy.action')}
      className="mt-1.5 inline-flex max-w-full cursor-pointer items-center gap-2 rounded-[6px] border-2 border-black/30 bg-[#101814] px-3 py-1.5 font-pixel text-[15px] font-semibold text-[#e8f3ec] shadow-[0_3px_0_rgba(0,0,0,0.3)] transition-colors hover:border-gold-bright/70"
      aria-live="polite"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="size-4 shrink-0 text-[#3ddc84]" aria-hidden />
      ) : (
        <Copy className="size-4 shrink-0 opacity-70" aria-hidden />
      )}
      <span className="sr-only">{copied ? t('copy.done') : t('copy.action')}</span>
    </button>
  );
}

/** A numbered step with a pixel block for the number. */
export function Step({
  n,
  title,
  icon: Icon,
  children,
}: {
  readonly n: number;
  readonly title: string;
  readonly icon?: LucideIcon;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
      <span
        className="row-span-2 grid size-10 place-items-center rounded-[6px] border-2 border-black/25 bg-gold-bright font-pixel text-[1.25rem] font-bold text-[#2a1b00] shadow-[inset_0_3px_0_rgba(255,255,255,0.45),inset_0_-3px_0_rgba(0,0,0,0.15)]"
        aria-hidden
      >
        {n}
      </span>
      <span className="flex items-center gap-2 pt-1.5 font-semibold leading-snug">
        {Icon ? <Icon className="size-4 shrink-0 text-gold" aria-hidden /> : null}
        {title}
      </span>
      {children ? <div className="text-[15px] leading-relaxed text-muted-foreground">{children}</div> : null}
    </li>
  );
}

/** All game modes as character-select cards, then how to get in. */
export function ModesListPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  // Winter Games and Summer Games share one place: only the one that is on right now.
  const modes = shownModes(status.data);
  const address = status.data?.javaAddress ?? FALLBACK_ADDRESS;
  return (
    <>
      <PageHero
        eyebrow={t('site.modes.eyebrow')}
        title={t('site.modes.pageTitle')}
        text={t('site.modes.text')}
        scene="marktstaende"
      />
      <div className={cn(WRAP, 'grid gap-12 py-14 sm:py-16')}>
        {status.isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SKELETONS.map((k) => (
              <Skeleton key={k} className="h-[440px] rounded-[10px]" />
            ))}
          </div>
        ) : null}
        {status.isError ? <LoadError /> : null}
        {status.isSuccess && !modes.length ? (
          <EmptyState icon={Gamepad2} title={t('site.modes.emptyTitle')} text={t('site.modes.empty')} />
        ) : null}
        {modes.length ? (
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {modes.map((mode) => (
              <ModeCard key={mode.id} mode={mode} full headingLevel="h2" />
            ))}
            {modes.length % MODE_COLUMNS ? <JoinCard /> : null}
          </div>
        ) : null}
        <Panel className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] lg:items-center">
          <div className="grid gap-2">
            <h2 className="font-pixel text-[1.9rem] font-bold leading-tight">{t('site.mode.howTitle')}</h2>
            <p className="text-muted-foreground">{t('site.modes.howText')}</p>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            <Step n={1} title={t('site.mode.step1')} icon={Copy}>
              <CopyChip value={address} />
            </Step>
            <Step n={2} title={t('site.modes.stepFigure')} icon={MousePointerClick}>
              {t('site.mode.step2Text')}
            </Step>
            <Step n={3} title={t('site.mode.step3')} icon={Terminal}>
              <Cmd className="mt-1.5">/server duels</Cmd>
            </Step>
          </ol>
        </Panel>
      </div>
    </>
  );
}

/**
 * Winter Games and Summer Games share one place in the network: out of its season a sports mode is replaced by the
 * other one. Its page stays (statistics!) with a friendly note when it comes back and a link to the one that is on.
 */
function ReplacedHint({
  mode,
  onArt = false,
}: {
  readonly mode: ModeStatus;
  readonly onArt?: boolean;
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const status = useNetworkStatus();
  const look = useModeLook(mode);
  const other = status.data?.modes.find((m) => m.id === sportReplacedBy(mode.id, status.data?.sport));
  if (!other || (look !== 'backInWinter' && look !== 'backInSummer')) return null;
  const Icon = look === 'backInWinter' ? Snowflake : Sun;
  const names = { name: pick(mode.name), other: pick(other.name) };
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[8px] border-2 px-4 py-3 text-[15px]',
        onArt
          ? 'max-w-[620px] border-white/25 bg-black/35 text-white backdrop-blur-sm'
          : 'border-blue/25 bg-blue-soft text-blue',
      )}
    >
      <p className="flex min-w-0 flex-1 basis-[260px] items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t(`site.mode.replaced.${look}`, names)}</span>
      </p>
      <GameButton asChild size="sm" tone="gold">
        <Link to={`/spielmodi/${other.id}`}>
          {other.id === 'wintersport' ? <Snowflake /> : <Sun />}
          {t('site.mode.replaced.link', names)}
        </Link>
      </GameButton>
    </div>
  );
}

function HowToGetThere({ mode }: { readonly mode: ModeStatus }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const status = useNetworkStatus();
  const site = useSite();
  const address = status.data?.javaAddress ?? FALLBACK_ADDRESS;
  const invite = site.data?.discordInvite;
  const command = `/server ${mode.server ?? mode.id}`;
  const look = useModeLook(mode);
  const applies = mode.id === APPLY_MODE;
  return (
    <Panel id={HOW_ID} className="grid scroll-mt-28 content-start gap-6 border-gold/40 p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className="grid size-11 place-items-center rounded-[6px] border-2 border-black/20 bg-gold-soft text-gold"
          aria-hidden
        >
          <LogIn className="size-5" />
        </span>
        <h2 className="font-pixel text-[1.7rem] font-bold leading-tight">{t('site.mode.howTitle')}</h2>
      </div>
      {modeJoinable(mode) ? null : (
        <p className="rounded-[6px] border-2 border-border bg-muted px-4 py-3 text-[15px] font-semibold text-muted-foreground">
          {t(`site.mode.notNow.${mode.state}`)}
        </p>
      )}
      <ol className={cn('grid gap-5', (look === 'backInWinter' || look === 'backInSummer') && 'hidden')}>
        <Step n={1} title={t('site.mode.step1')}>
          <CopyChip value={address} />
        </Step>
        <Step n={2} title={t('site.mode.step2', { name: pick(mode.name) })}>
          {t('site.mode.step2Text')}
        </Step>
        <Step n={3} title={t('site.mode.step3')}>
          <CopyChip value={command} />
        </Step>
      </ol>
      <ReplacedHint mode={mode} />
      {look === 'pause' ? (
        <p className="flex items-start gap-2.5 rounded-[6px] border-2 border-gold/35 bg-gold-soft px-4 py-3 text-[15px] text-gold-strong">
          <Sun className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('site.mode.pauseText')}
        </p>
      ) : null}
      {look === 'winterPause' ? (
        <p className="flex items-start gap-2.5 rounded-[6px] border-2 border-blue/25 bg-blue-soft px-4 py-3 text-[15px] text-blue">
          <Snowflake className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('site.mode.winterPauseText')}
        </p>
      ) : null}
      {look === 'asleep' ? (
        <p className="flex items-start gap-2.5 rounded-[6px] border-2 border-blue/25 bg-blue-soft px-4 py-3 text-[15px] text-blue">
          <Moon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('site.mode.asleepText')}
        </p>
      ) : null}
      {mode.access === 'whitelist' ? (
        <div className="grid gap-3 rounded-[6px] border-2 border-gold/35 bg-gold-soft px-4 py-4 text-[15px] text-gold-strong">
          <p>{t(applies ? 'site.mode.whitelistApply' : 'site.mode.whitelistText')}</p>
          <div className="flex flex-wrap gap-3">
            {applies ? (
              <GameButton asChild size="sm">
                <Link to={APPLY_PAGE}>
                  <ClipboardList />
                  {t('site.mode.apply')}
                </Link>
              </GameButton>
            ) : null}
            {invite ? (
              <GameButton asChild tone="blue" size="sm">
                <a href={invite} {...EXTERNAL}>
                  <MessagesSquare />
                  Discord
                </a>
              </GameButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function LivePanel({ mode }: { readonly mode: ModeStatus }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const look = useModeLook(mode);
  const art = modeArt(mode.id);
  // Replaced by the other sports mode right now: no live numbers (nobody is there until its season).
  const joinable = modeJoinable(mode) && look !== 'backInWinter' && look !== 'backInSummer';
  return (
    <Panel className="grid content-start overflow-hidden">
      <div className="mm-mode-bg relative h-56 overflow-hidden lg:hidden" style={modeStyle(mode.id)}>
        <div className="mm-noise absolute inset-0 opacity-60 mix-blend-overlay" aria-hidden />
        <ModeFigure id={mode.id} look={look} className="h-[96%]" />
      </div>
      <div className="relative grid gap-6 p-6 sm:p-7">
        <PixelEdge className="text-card lg:hidden" />
        <div className="grid gap-2">
          <h2 className="font-pixel text-[1.7rem] font-bold leading-tight">
            {t('site.mode.about', { name: pick(mode.name) })}
          </h2>
          <p className="text-[1.08rem] leading-relaxed text-pretty">{pick(mode.description)}</p>
          <LookLine mode={mode} look={look} />
        </div>
        {joinable ? (
          <div className="grid gap-4 rounded-[8px] border-2 border-border bg-background-alt p-4">
            <dl className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <dt className="font-pixel text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t('site.mode.playersNow')}
                </dt>
                <dd className="tabular font-pixel text-[2.6rem] font-bold leading-none">{mode.players}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="font-pixel text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t('site.mode.playersMax')}
                </dt>
                <dd className="tabular font-pixel text-[2.6rem] font-bold leading-none">{mode.maxPlayers}</dd>
              </div>
            </dl>
            <Segments share={mode.maxPlayers ? mode.players / mode.maxPlayers : 0} colour={art.a} />
          </div>
        ) : null}
        <ModeTopThree mode={mode} />
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
          <Terminal className="size-4" aria-hidden />
          {t('site.mode.lobbyBack')} <Cmd>/lobby</Cmd>
        </p>
      </div>
    </Panel>
  );
}

/** Below the description: open, asleep, closed … – a mode only for invited players says so (MorniCraft). */
function LookLine({ mode, look }: { readonly mode: ModeStatus; readonly look: ModeLook }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const status = useNetworkStatus();
  const invite = mode.access === 'whitelist' && (look === 'open' || look === 'asleep');
  const other = status.data?.modes.find((m) => m.id === sportReplacedBy(mode.id, status.data?.sport));
  if (!invite)
    return (
      <p className="text-[15px] text-muted-foreground">
        {t(`site.modeLookText.${look}`, { other: other ? pick(other.name) : '' })}
      </p>
    );
  const applies = mode.id === APPLY_MODE;
  return (
    <p className="text-[15px] text-muted-foreground">
      {t(applies ? 'site.modeLookText.inviteApply' : 'site.modeLookText.invite')}{' '}
      {applies ? (
        <Link to={APPLY_PAGE} className="font-semibold text-primary underline-offset-4 hover:underline">
          {t('site.mode.apply')}
        </Link>
      ) : null}
    </p>
  );
}

const TOP_THREE = 3;

/** The best three of this mode in its most important value, with a link to the whole leaderboard. */
function ModeTopThree({ mode }: { readonly mode: ModeStatus }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const stat = useStatText();
  const boards = useModeBoards();
  const key = boards.data?.find((b) => b.mode === mode.id)?.keys[0];
  const top = useModeTop(mode.id, key?.key ?? '', key?.order ?? 'desc');
  const entries = (top.data ?? []).slice(0, TOP_THREE);
  if (!key || !entries.length) return null;
  return (
    <div className="grid gap-3 rounded-[8px] border-2 border-border bg-background-alt p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-pixel text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Medal className="size-4 text-gold" aria-hidden />
          {t('site.mode.topTitle', { value: stat.label(key.key, mode.id) })}
        </h3>
        <Link
          to={`/statistiken?${MODE_PARAM}=${encodeURIComponent(mode.id)}`}
          className="font-pixel text-[13px] font-semibold uppercase tracking-[0.08em] text-primary hover:underline"
        >
          {t('site.mode.topAll')}
        </Link>
      </div>
      <ol className="grid gap-2">
        {entries.map((e) => {
          const colour = PLACE_COLOURS[e.rank - 1] ?? PLACE_COLOURS[0];
          return (
            <li key={e.uuid}>
              <Link to={`/spieler/${encodeURIComponent(e.name)}`} className="group flex items-center gap-3">
                <span
                  className="tabular grid size-7 shrink-0 place-items-center rounded-[5px] font-pixel text-[15px] font-bold text-black/60"
                  style={{ backgroundColor: colour.face, boxShadow: `inset 0 -3px 0 ${colour.edge}` }}
                >
                  {e.rank}
                </span>
                <PlayerFace
                  uuid={e.uuid}
                  colour={e.role.colour}
                  className="size-8 shrink-0"
                  faceClassName="rounded-[4px] border-2 border-black/20"
                />
                <span className="min-w-0 flex-1 truncate font-bold group-hover:text-primary">{e.name}</span>
                <span className="tabular shrink-0 font-pixel text-[15px] font-semibold">
                  {stat.value(key.key, e.value, mode.id)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** How the mode is played: three numbered tips on its colours and the most important commands. */
function ModeGuidePanel({ mode }: { readonly mode: ModeStatus }): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const guide = MODE_GUIDES[mode.id];
  if (!guide) return null;
  const tips = Array.from({ length: guide.tips }, (_, i) => t(`site.guide.${mode.id}.tip${i + 1}`));
  return (
    <Panel
      className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8"
      style={modeStyle(mode.id)}
    >
      <div className="grid content-start gap-5">
        <h2 className="flex items-center gap-3 font-pixel text-[1.7rem] font-bold leading-tight">
          <span
            className="mm-mode-bg grid size-11 place-items-center rounded-[6px] border-2 border-black/20 text-white"
            aria-hidden
          >
            <Gamepad2 className="size-5" />
          </span>
          {t('site.guide.title')}
        </h2>
        <ol className="grid gap-5">
          {tips.map((tip, i) => (
            <Step key={`tip-${i + 1}`} n={i + 1} title={tip} />
          ))}
        </ol>
      </div>
      <div className="grid content-start gap-3 rounded-[8px] border-2 border-border bg-background-alt p-4 sm:p-5">
        <h3 className="flex items-center gap-2 font-pixel text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Terminal className="size-4 text-gold" aria-hidden />
          {t('site.guide.commands')}
        </h3>
        <dl className="grid gap-3">
          {guide.commands.map((c) => (
            <div key={c.key} className="grid gap-1">
              <dt>
                <Cmd>{guideSyntax(c, language)}</Cmd>
              </dt>
              <dd className="text-[15px] leading-snug text-muted-foreground">
                {t(`site.guide.${mode.id}.cmd.${c.key}`)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

function OtherModes({ modes }: { readonly modes: readonly ModeStatus[] }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const sport = useNetworkStatus().data?.sport;
  return (
    <section className="relative bg-background-alt" aria-labelledby="other-modes">
      <PixelEdge className="text-background-alt" />
      <div className={cn(WRAP, 'grid gap-6 py-14')}>
        <h2 id="other-modes" className="font-pixel text-[2rem] font-bold">
          {t('site.mode.others')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((m) => (
            <li key={m.id}>
              <Link
                to={`/spielmodi/${m.id}`}
                className="mm-mode-card group grid grid-cols-[88px_minmax(0,1fr)] overflow-hidden rounded-[10px] border-2 bg-card"
                style={modeStyle(m.id)}
              >
                <span className="mm-mode-bg relative h-[88px] overflow-hidden">
                  <ModeFigure id={m.id} look={modeLook(m, sport)} className="bottom-[-30%] h-[150%]" />
                </span>
                <span className="grid content-center gap-1.5 px-4 py-3">
                  <span className="truncate font-pixel text-[1.3rem] font-bold leading-none group-hover:text-primary">
                    {pick(m.name)}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <ModeStateChip mode={m} className="px-1.5 py-0.5 text-[11px]" />
                    {modeJoinable(m) ? (
                      <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
                        <Users className="size-3.5" aria-hidden />
                        <span className="tabular">{m.players}</span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** One game mode: big header with its figure, live numbers, how to get there and the other modes. */
export function ModePage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { id = '' } = useParams();
  const pick = usePick();
  const status = useNetworkStatus();
  const modes = status.data?.modes ?? [];
  const mode = findMode(modes, id);

  if (status.isPending) {
    return (
      <div className={cn(WRAP, 'grid gap-5 pb-14 pt-[calc(var(--header-h)+40px)]')}>
        <Skeleton className="h-14 w-1/2" />
        <Skeleton className="h-72 rounded-[10px]" />
      </div>
    );
  }
  if (!mode) {
    return (
      <div className={cn(WRAP, 'grid max-w-[880px] gap-6 pb-16 pt-[calc(var(--header-h)+40px)]')}>
        <EmptyState
          icon={Gamepad2}
          title={t('site.mode.missingTitle')}
          text={status.isError ? t('site.loadError') : t('site.mode.missingText')}
        >
          <GameButton asChild tone="stone">
            <Link to="/spielmodi">
              <ArrowLeft />
              {t('site.mode.back')}
            </Link>
          </GameButton>
        </EmptyState>
      </div>
    );
  }
  const art = modeArt(mode.id);
  // Winter Games and Summer Games share one place: the other modes as everywhere – only the sports mode that is on.
  const others = shownModes(status.data).filter((m) => m.id !== mode.id);
  const joinable = modeJoinable(mode);
  const scrollToHow = (): void => document.getElementById(HOW_ID)?.scrollIntoView({ behavior: 'smooth' });
  return (
    <>
      <PageHero
        eyebrow={t('site.mode.eyebrow')}
        title={pick(mode.name)}
        text={pick(mode.description)}
        scene={art.scene}
        figure={mode.id}
        tint={art.a}
      >
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <ModeStateChip mode={mode} onArt />
          {mode.access === 'whitelist' ? <WhitelistChip onArt /> : null}
          {joinable && !sportReplacedBy(mode.id, status.data?.sport) ? (
            <Chip tone="glass" icon={Users}>
              {t('mode.players', { players: mode.players, max: mode.maxPlayers })}
            </Chip>
          ) : null}
        </div>
        <ReplacedHint mode={mode} onArt />
        <div className="flex flex-wrap gap-3 pt-2">
          <GameButton size="lg" tone={joinable ? 'gold' : 'stone'} onClick={scrollToHow}>
            <LogIn />
            {t('site.mode.howTitle')}
          </GameButton>
          {mode.id === APPLY_MODE ? (
            <GameButton asChild size="lg" tone="emerald">
              <Link to={APPLY_PAGE}>
                <ClipboardList />
                {t('site.mode.apply')}
              </Link>
            </GameButton>
          ) : null}
        </div>
      </PageHero>
      <div
        className={cn(
          WRAP,
          'grid items-start gap-6 py-12 sm:py-14 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]',
        )}
      >
        <LivePanel mode={mode} />
        <HowToGetThere mode={mode} />
        <div className="lg:col-span-2">
          <ModeGuidePanel mode={mode} />
        </div>
        {mode.id === 'angelkoenig' ? (
          <div className="lg:col-span-2">
            <FishGallery />
          </div>
        ) : null}
        {mode.id === 'angelkoenig' ? (
          <div className="lg:col-span-2">
            <ClothesGallery />
          </div>
        ) : null}
      </div>
      {others.length ? <OtherModes modes={others} /> : null}
    </>
  );
}
