import {
  ArrowRight,
  Check,
  Copy,
  Gamepad2,
  MessagesSquare,
  Monitor,
  Newspaper,
  Play,
  Smartphone,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { NetworkStatus } from '@moinmorni/shared';
import { useCopy } from '~/components/controls';
import { PlayerFace } from '~/components/player-face';
import { RoleBadge } from '~/components/role-visuals';
import { Button, Card, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useNews, useSite, useTeam, useTopPlayers, type TeamGroup } from '~/lib/site';
import { useNetworkStatus } from '~/lib/status';
import { useLanguage } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { AlpineScene } from './AlpineScene';
import { CompactNews, FeaturedNews, ModeTile } from './cards';
import { EXTERNAL, SectionHead, setSocials, SOCIAL_ICON, WRAP } from './parts';
import { FALLBACK_ADDRESS, FALLBACK_BEDROCK_PORT, JOIN_LINK } from './PublicLayout';

/** News on the start page: one big, up to three small. */
const HOME_NEWS = 4;
const TOP_COUNT = 3;
const TEAM_PREVIEW = 6;
const NUMBER_LOCALE = { de: 'de-DE', en: 'en-GB' } as const;

function LiveCount({
  status,
  failed,
}: {
  readonly status?: NetworkStatus;
  readonly failed: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const online = status?.online === true;
  const label = ((): string => {
    if (failed) return t('site.hero.statusError');
    if (!status) return t('site.hero.statusLoading');
    return online ? t('site.hero.online', { count: status.players }) : t('site.hero.offline');
  })();
  return (
    <p
      className="inline-flex items-center gap-2.5 rounded-full border border-band-line bg-black/20 py-1.5 pl-3 pr-4 text-sm font-semibold text-band-foreground backdrop-blur-sm"
      role="status"
      aria-live="polite"
      title={t('site.server.refresh')}
    >
      <span
        className={cn('size-2.5 rounded-full', online ? 'mm-pulse bg-emerald-400' : 'bg-band-muted/50')}
        aria-hidden
      />
      <span className="tabular">{label}</span>
    </p>
  );
}

function AddressBox({ status }: { readonly status?: NetworkStatus }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const address = status?.javaAddress ?? FALLBACK_ADDRESS;
  const port = status?.bedrockPort ?? FALLBACK_BEDROCK_PORT;
  const { copied, failed, copy } = useCopy(address);
  return (
    <div className="grid gap-3 rounded-[20px] border border-white/15 bg-[rgba(6,20,14,0.45)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset] backdrop-blur-md sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{t('site.hero.address')}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 select-all font-mono text-[1.65rem] font-medium leading-none tracking-[-0.01em] text-band-foreground [overflow-wrap:anywhere] sm:text-[2rem]">
          {address}
        </span>
        <Button variant="gold" onClick={copy} className="min-w-[8.5rem]" aria-live="polite">
          {copied ? <Check /> : <Copy />}
          {copied ? t('copy.done') : t('copy.action')}
        </Button>
      </div>
      {failed ? <p className="text-[13px] text-band-muted">{t('copy.manual')}</p> : null}
      <div className="grid gap-2 border-t border-white/10 pt-3 text-[13px] text-band-muted sm:grid-cols-2">
        <span className="flex items-start gap-2">
          <Monitor className="mt-0.5 size-4 shrink-0 text-band-foreground/80" aria-hidden />
          <span>
            <strong className="font-semibold text-band-foreground">{t('site.hero.java')}</strong>{' '}
            {t('site.hero.javaHint')}
          </span>
        </span>
        <span className="flex items-start gap-2">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-band-foreground/80" aria-hidden />
          <span>
            <strong className="font-semibold text-band-foreground">{t('site.hero.bedrock')}</strong>{' '}
            {t('site.hero.bedrockHint')}{' '}
            <span className="rounded-[6px] bg-white/10 px-1.5 py-0.5 font-mono text-band-foreground">
              {port}
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

function Hero(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const site = useSite();
  const invite = site.data?.discordInvite;
  return (
    <section className="mm-hero relative isolate overflow-hidden">
      <div className="absolute inset-x-0 bottom-0 h-[300px] sm:h-[400px] lg:h-[660px]">
        <AlpineScene />
      </div>
      <div className="mm-hero-veil absolute inset-0" aria-hidden />
      <div
        className={cn(
          WRAP,
          'relative grid content-start pb-[250px] pt-10 sm:pb-[330px] sm:pt-14 lg:min-h-[640px] lg:pb-24 lg:pt-20',
        )}
      >
        <div className="mm-rise grid max-w-[560px] justify-items-start gap-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{t('site.hero.eyebrow')}</p>
          <h1 className="font-display text-[clamp(2.7rem,8vw,4.8rem)] font-semibold leading-[0.98] tracking-[-0.02em] text-band-foreground text-balance [text-shadow:0_2px_24px_rgba(0,0,0,0.35)]">
            {t('site.hero.title')}
          </h1>
          <p className="max-w-[44ch] text-lg leading-relaxed text-band-foreground/85 [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]">
            {t('site.hero.pitch')}
          </p>
          <div className="w-full">
            <AddressBox status={status.data} />
          </div>
          <LiveCount status={status.data} failed={status.isError} />
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="gold" size="lg" className="rounded-full px-7">
              <Link to={JOIN_LINK}>
                <Play />
                {t('site.playNow')}
              </Link>
            </Button>
            {invite ? (
              <Button
                asChild
                variant="band"
                size="lg"
                className="rounded-full border-white/20 bg-black/25 px-7 backdrop-blur-sm"
              >
                <a href={invite} {...EXTERNAL}>
                  <MessagesSquare />
                  Discord
                </a>
              </Button>
            ) : null}
          </div>
        </div>
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
    <section className={cn(WRAP, 'grid gap-8 py-16 sm:py-20')} aria-labelledby="home-news">
      <SectionHead
        id="home-news"
        eyebrow={t('site.news.eyebrow')}
        title={t('site.news.homeTitle')}
        link={list.length ? { to: '/news', label: t('site.news.all') } : undefined}
      />
      {news.isPending ? (
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-[420px] rounded-[18px]" />
          <div className="grid gap-4">
            <Skeleton className="h-[120px] rounded-[16px]" />
            <Skeleton className="h-[120px] rounded-[16px]" />
            <Skeleton className="h-[120px] rounded-[16px]" />
          </div>
        </div>
      ) : null}
      {news.isSuccess && !first ? (
        <Card className="flex items-center gap-4 p-6 text-muted-foreground">
          <Newspaper className="size-6 shrink-0 text-gold" aria-hidden />
          {t('site.news.empty')}
        </Card>
      ) : null}
      {news.isError ? <Card className="p-6 text-muted-foreground">{t('site.loadError')}</Card> : null}
      {first ? (
        <div className={cn('grid items-start gap-5', rest.length && 'lg:grid-cols-[1.35fr_1fr]')}>
          <FeaturedNews item={first} />
          {rest.length ? (
            <div className="grid gap-4">
              {rest.map((item) => (
                <CompactNews key={item.slug} item={item} />
              ))}
              <Button asChild variant="secondary" className="justify-self-start">
                <Link to="/news">
                  {t('site.news.all')}
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ModesSection(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const status = useNetworkStatus();
  const modes = status.data?.modes ?? [];
  return (
    <section
      className="border-y border-border bg-secondary/60 dark:bg-white/[0.015]"
      aria-labelledby="home-modes"
    >
      <div className={cn(WRAP, 'grid gap-8 py-16 sm:py-20')}>
        <SectionHead
          id="home-modes"
          eyebrow={t('site.modes.eyebrow')}
          title={t('site.modes.title')}
          text={t('site.modes.text')}
          link={{ to: '/spielmodi', label: t('site.modes.all') }}
        />
        {status.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {['a', 'b', 'c'].map((k) => (
              <Skeleton key={k} className="h-56 rounded-[16px]" />
            ))}
          </div>
        ) : null}
        {status.isSuccess && !modes.length ? (
          <p className="text-muted-foreground">{t('site.modes.empty')}</p>
        ) : null}
        {status.isError ? <Card className="p-6 text-muted-foreground">{t('site.loadError')}</Card> : null}
        {modes.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modes.map((mode, index) => (
              <ModeTile key={mode.id} mode={mode} index={index} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function BigNumber({
  icon: Icon,
  label,
  value,
  live = false,
  children,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly value: string;
  readonly live?: boolean;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div className="grid content-start gap-2 rounded-[18px] border border-band-line bg-white/[0.04] p-5 sm:p-6">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gold">
        <Icon className="size-4" aria-hidden />
        {label}
      </span>
      <span className="flex items-center gap-3 font-display text-[clamp(2.4rem,6vw,3.4rem)] font-semibold leading-none text-band-foreground">
        {live ? <span className="mm-pulse size-3 rounded-full bg-emerald-400" aria-hidden /> : null}
        <span className="tabular">{value}</span>
      </span>
      {children}
    </div>
  );
}

function StatsStrip(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const status = useNetworkStatus();
  const site = useSite();
  const top = useTopPlayers(TOP_COUNT);
  const time = useTimeText();
  const number = new Intl.NumberFormat(NUMBER_LOCALE[language]);
  const total = site.data ? number.format(site.data.players) : '–';
  const online = status.data ? number.format(status.data.players) : '–';
  return (
    <section className="band relative" aria-labelledby="home-stats">
      <div className={cn(WRAP, 'grid gap-6 py-14 sm:py-16')}>
        <h2 id="home-stats" className="sr-only">
          {t('site.stats.title')}
        </h2>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.7fr]">
          <BigNumber icon={Users} label={t('site.stats.total')} value={total}>
            <span className="text-sm text-band-muted">{t('site.stats.totalHint')}</span>
          </BigNumber>
          <BigNumber
            icon={Gamepad2}
            label={t('site.stats.online')}
            value={online}
            live={status.data?.online === true}
          >
            <span className="text-sm text-band-muted">{t('site.server.refresh')}</span>
          </BigNumber>
          <div className="grid content-start gap-3 rounded-[18px] border border-band-line bg-white/[0.04] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gold">
                <Trophy className="size-4" aria-hidden />
                {t('site.stats.topTitle')}
              </span>
              <Link
                to="/statistiken"
                className="group inline-flex items-center gap-1 text-sm font-bold text-band-foreground hover:underline"
              >
                {t('site.stats.toLeaderboard')}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
            {top.isPending ? <Skeleton className="h-36 rounded-[12px] bg-white/10" /> : null}
            {top.data && !top.data.length ? (
              <p className="text-sm text-band-muted">{t('site.stats.noneYet')}</p>
            ) : null}
            <ol className="grid gap-1.5">
              {top.data?.map((p) => (
                <li key={p.uuid}>
                  <Link
                    to={`/spieler/${encodeURIComponent(p.name)}`}
                    className="flex items-center gap-3 rounded-[12px] px-2 py-1.5 transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="w-6 text-center font-display text-lg font-semibold text-gold">
                      {p.rank}
                    </span>
                    <PlayerFace uuid={p.uuid} colour={p.role.colour} className="size-10" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-bold text-band-foreground">{p.name}</span>
                      <RoleBadge role={p.role} onBand />
                    </span>
                    <span className="tabular shrink-0 text-sm font-semibold text-band-muted">
                      {time.playtime(p.playMinutes)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamPreview({ groups }: { readonly groups: readonly TeamGroup[] }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const people = groups.flatMap((g) => g.members.map((m) => ({ ...m, role: g.role }))).slice(0, TEAM_PREVIEW);
  if (!people.length) return <p className="text-sm text-muted-foreground">{t('site.team.soon')}</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {people.map((m) => (
        <li key={m.uuid}>
          <Link
            to={`/spieler/${encodeURIComponent(m.name)}`}
            className="flex items-center gap-2.5 rounded-[12px] p-1.5 transition-colors hover:bg-muted/70"
          >
            <PlayerFace uuid={m.uuid} colour={m.role.colour} online={m.online} className="size-9" />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate text-sm font-bold">{m.name}</span>
              <RoleBadge role={m.role} className="text-[11px]" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CommunityCard({
  icon: Icon,
  tone,
  title,
  text,
  children,
}: {
  readonly icon: LucideIcon;
  readonly tone: string;
  readonly title: string;
  readonly text: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card className="grid content-start gap-4 p-6">
      <span className={cn('grid size-12 place-items-center rounded-[14px]', tone)} aria-hidden>
        <Icon className="size-6" />
      </span>
      <div className="grid gap-1.5">
        <h3 className="font-display text-[1.35rem] font-semibold">{title}</h3>
        <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">{text}</p>
      </div>
      {children}
    </Card>
  );
}

function Community(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const site = useSite();
  const team = useTeam();
  const invite = site.data?.discordInvite;
  const socials = setSocials(site.data);
  return (
    <section className={cn(WRAP, 'grid gap-8 py-16 sm:py-20')} aria-labelledby="home-community">
      <SectionHead
        id="home-community"
        eyebrow={t('site.community.eyebrow')}
        title={t('site.community.title')}
      />
      <div className={cn('grid gap-4 md:grid-cols-2', socials.length && 'lg:grid-cols-3')}>
        <CommunityCard
          icon={MessagesSquare}
          tone="bg-blue-soft text-blue"
          title={t('site.community.discordTitle')}
          text={t('site.community.discordText')}
        >
          {invite ? (
            <Button asChild className="justify-self-start">
              <a href={invite} {...EXTERNAL}>
                <MessagesSquare />
                {t('site.community.discordJoin')}
              </a>
            </Button>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">{t('site.community.discordSoon')}</p>
          )}
        </CommunityCard>
        <CommunityCard
          icon={Users}
          tone="bg-accent text-primary"
          title={t('site.community.teamTitle')}
          text={t('site.community.teamText')}
        >
          {team.isPending ? <Skeleton className="h-24" /> : <TeamPreview groups={team.data ?? []} />}
          <Link
            to="/team"
            className="group inline-flex items-center gap-1.5 justify-self-start text-sm font-bold text-primary hover:underline"
          >
            {t('site.community.teamAll')}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </CommunityCard>
        {socials.length ? (
          <CommunityCard
            icon={Play}
            tone="bg-gold-soft text-gold"
            title={t('site.community.socialTitle')}
            text={t('site.community.socialText')}
          >
            <ul className="grid gap-2">
              {socials.map(([key, url]) => {
                const Icon = SOCIAL_ICON[key];
                return (
                  <li key={key}>
                    <Button asChild variant="secondary" className="w-full justify-start">
                      <a href={url} {...EXTERNAL}>
                        <Icon />
                        {t(`site.social.${key}`)}
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CommunityCard>
        ) : null}
      </div>
    </section>
  );
}

/** The start page: picture with address, news, game modes, numbers and community. */
export function HomePage(): ReactElement {
  return (
    <>
      <Hero />
      <NewsSection />
      <ModesSection />
      <StatsStrip />
      <Community />
    </>
  );
}
