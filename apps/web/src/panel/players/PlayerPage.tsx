import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  Clock,
  Fingerprint,
  Gamepad2,
  History,
  Languages,
  Save,
  ShieldHalf,
  ShieldAlert,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { mayAssign, type Role } from '@morninet/shared';
import { Button, Card, Kbd, NativeSelect, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { errorCode, useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { useLanguage, usePick } from '~/lib/text';
import { languageName, useTimeText } from '~/lib/time';
import { AreaGate } from '../AreaGate';
import { RoleBadge } from '~/components/role-visuals';
import { useCan, usePanel, useRolesQuery } from '../session';
import { KIND_ICON, KindBadge, PlayerFlags, PresenceText } from './badges';
import { useLiftPunishment } from './lift';
import {
  isLasting,
  MOD_KINDS,
  punishmentState,
  usePlayerQuery,
  useRefreshPlayers,
  type LiftKind,
  type ModKind,
  type PlayerDetail,
  type PlayerView,
  type Punishment,
  type PunishmentState,
} from './model';
import { PlayerFace } from '~/components/player-face';
import { PunishDialog } from './PunishDialog';
import { MorniCraftCard } from './MorniCraftCard';

const OWNER = 'owner';
const NO_ROLE = '';
const STATE_TONE: Readonly<Record<PunishmentState, 'danger' | 'neutral' | 'success' | 'blue'>> = {
  active: 'danger',
  revoked: 'success',
  expired: 'neutral',
  replaced: 'neutral',
  once: 'neutral',
};

function SectionHead({
  icon: Icon,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold">
        <Icon className="size-5 text-gold" aria-hidden />
        {title}
      </h2>
      {children}
    </div>
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
    <div className="flex items-start gap-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-muted text-muted-foreground"
        aria-hidden
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
        <dd className="min-w-0 text-[15px] font-semibold [overflow-wrap:anywhere]">{children}</dd>
      </div>
    </div>
  );
}

function ProfileCard({ player }: { readonly player: PlayerView }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const language = useLanguage();
  return (
    <Card className="grid gap-5 p-5 sm:p-6">
      <SectionHead icon={Fingerprint} title={t('players.profile')} />
      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact icon={CalendarPlus} label={t('players.firstSeen')}>
          {time.date(player.firstSeen)}
        </Fact>
        <Fact icon={CalendarClock} label={t('players.lastSeenLabel')}>
          {player.online ? t('players.onlineNoServer') : time.relative(player.lastSeen)}
          {player.online ? null : (
            <span className="block text-xs font-normal text-muted-foreground">
              {time.date(player.lastSeen)}
            </span>
          )}
        </Fact>
        <Fact icon={Clock} label={t('players.playtime')}>
          {time.playtime(player.playMinutes)}
        </Fact>
        <Fact icon={Languages} label={t('players.language')}>
          {player.language ? languageName(player.language, language) : t('players.languageUnknown')}
        </Fact>
        <Fact icon={Gamepad2} label={t('players.edition')}>
          {player.bedrock ? t('players.editionBedrock') : t('players.editionJava')}
        </Fact>
        <Fact icon={Fingerprint} label={t('players.uuid')}>
          <Kbd className="text-[11.5px]">{player.uuid}</Kbd>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {t('players.uuidHelp')}
          </span>
        </Fact>
      </dl>
    </Card>
  );
}

/** Rank of the player: what counts now, and the own rank to give (only ranks below one's own). */
function RankCard({
  player,
  roles,
  higher,
}: {
  readonly player: PlayerView;
  readonly roles: readonly Role[] | undefined;
  readonly higher: boolean | null;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const me = usePanel();
  const errorText = useErrorText();
  const refresh = useRefreshPlayers();
  const [draft, setDraft] = useState(player.ownRole ?? NO_ROLE);
  const fallback = roles?.find((r) => r.fallback);
  const fromTeam = player.ownRole ? player.role.id !== player.ownRole : player.role.id !== fallback?.id;
  const options = (roles ?? []).filter((r) => !r.fallback);
  const dirty = draft !== (player.ownRole ?? NO_ROLE);
  // Wie /rang im Spiel: Ränge vergibt nur, wer das Recht „Ränge vergeben“ hat (Moderatoren nicht).
  const mayRank = me.role.id === 'owner' || me.role.game.includes('ranks');
  const blocked = higher === false || !mayRank;

  const save = useMutation({
    mutationFn: () =>
      mmApi<PlayerView>(`/api/panel/players/${encodeURIComponent(player.uuid)}/role`, {
        method: 'PUT',
        body: { roleId: draft || null },
      }),
    onSuccess: async (fresh) => {
      const rank = options.find((r) => r.id === draft);
      toast.success(
        rank
          ? t('players.rank.saved', { name: player.name, rank: pick(rank.name) })
          : t('players.rank.savedNone', { name: player.name }),
      );
      setDraft(fresh.ownRole ?? NO_ROLE);
      await refresh();
    },
    onError: (err) => toast.error(errorText(err)),
  });

  return (
    <Card className="grid gap-4 p-5 sm:p-6">
      <SectionHead icon={ShieldHalf} title={t('players.rank.title')} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('players.rank.current')}</span>
        <RoleBadge role={player.role} className="text-[13px]" />
      </div>
      {roles && fromTeam ? (
        <p className="rounded-[12px] border border-blue/25 bg-blue-soft px-3.5 py-2.5 text-sm">
          {t('players.rank.team', { rank: pick(player.role.name) })}
        </p>
      ) : null}
      {roles ? (
        <div className="grid gap-2">
          <label htmlFor="player-rank" className="text-sm font-semibold">
            {t('players.rank.own')}
          </label>
          <div className="flex flex-wrap gap-2">
            <NativeSelect
              id="player-rank"
              className="min-w-0 flex-1 basis-56"
              value={draft}
              disabled={blocked || save.isPending}
              onChange={(e) => setDraft(e.target.value)}
            >
              <option value={NO_ROLE}>
                {t('players.rank.none', { fallback: fallback ? pick(fallback.name) : '' })}
              </option>
              {options.map((r) => (
                <option key={r.id} value={r.id} disabled={!mayAssign(roles, me.role.id, r.id)}>
                  {r.symbol ? `${r.symbol} ` : ''}
                  {pick(r.name)}
                </option>
              ))}
            </NativeSelect>
            <Button onClick={() => save.mutate()} disabled={!dirty || blocked || save.isPending}>
              <Save />
              {save.isPending ? t('settings.saving') : t('players.rank.save')}
            </Button>
          </div>
          <p className="text-[13px] leading-snug text-muted-foreground">
            {!mayRank
              ? t('players.rank.noRight')
              : blocked
                ? t('players.rank.higher', { name: player.name })
                : t('players.rank.help')}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t('players.rank.noRoles')}</p>
      )}
    </Card>
  );
}

function ActionsCard({
  player,
  blocked,
  onPunish,
}: {
  readonly player: PlayerView;
  readonly blocked: boolean;
  readonly onPunish: (kind: ModKind) => void;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const note = ((): string => {
    if (blocked) return t('players.act.higher', { name: player.name });
    return player.online ? t('players.act.help') : t('punish.kickOffline', { name: player.name });
  })();
  return (
    <Card className="grid gap-4 p-5 sm:p-6">
      <SectionHead icon={ShieldAlert} title={t('players.act.title')} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {MOD_KINDS.map((kind) => {
          const Icon = KIND_ICON[kind];
          const offline = kind === 'kick' && !player.online;
          return (
            <Button
              key={kind}
              variant={kind === 'ban' ? 'danger' : 'secondary'}
              className="h-auto flex-col gap-1.5 py-3 [&_svg]:size-5"
              disabled={blocked || offline}
              title={offline ? t('punish.kickOffline', { name: player.name }) : undefined}
              onClick={() => onPunish(kind)}
            >
              <Icon />
              {t(`punish.verbs.${kind}`)}
            </Button>
          );
        })}
      </div>
      <p className="text-[13px] leading-snug text-muted-foreground">{note}</p>
    </Card>
  );
}

function ActiveRow({
  player,
  kind,
  until,
  reason,
  canLift,
}: {
  readonly player: PlayerView;
  readonly kind: LiftKind;
  readonly until: string | null;
  readonly reason: string;
  readonly canLift: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const lift = useLiftPunishment();
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[14px] border border-border bg-muted/40 px-4 py-3">
      <KindBadge kind={kind} />
      <div className="grid min-w-0 flex-1 basis-48 gap-0.5">
        <span className="font-semibold [overflow-wrap:anywhere]">{reason}</span>
        <span className="text-[13px] text-muted-foreground">
          {until
            ? t('players.active.until', { date: time.date(until), rest: time.relative(until) })
            : t('players.history.forever')}
        </span>
      </div>
      {canLift ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={lift.isPending}
          onClick={() => lift.mutate({ uuid: player.uuid, kind, name: player.name })}
        >
          <Undo2 />
          {t('players.active.lift')}
        </Button>
      ) : null}
    </li>
  );
}

function HistoryRow({
  entry,
  active,
}: {
  readonly entry: Punishment;
  readonly active: boolean;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const state = punishmentState(entry, active);
  const lasting = isLasting(entry.kind);
  return (
    <li className="grid gap-1.5 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={entry.kind} />
        {state === 'once' ? null : (
          <Pill tone={STATE_TONE[state]} dot={state === 'active'}>
            {t(`players.history.${state}`)}
          </Pill>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{time.date(entry.createdAt)}</span>
      </div>
      <p className="font-medium [overflow-wrap:anywhere]">{entry.reason}</p>
      <p className="text-[13px] text-muted-foreground">
        {t('players.history.by', { name: entry.byName })}
        {lasting
          ? ` · ${entry.expiresAt ? t('players.history.until', { date: time.date(entry.expiresAt) }) : t('players.history.forever')}`
          : null}
      </p>
      {entry.revokedAt ? (
        <p className="text-[13px] text-success">
          {t('players.history.revokedBy', {
            name: entry.revokedBy ?? '?',
            date: time.date(entry.revokedAt),
          })}
        </p>
      ) : null}
    </li>
  );
}

/** Ids of the ban, mute and jail that count right now: the newest one of each that is neither lifted nor over. */
function activeIds(player: PlayerDetail): ReadonlySet<number> {
  const now = Date.now();
  const current = (kind: LiftKind): Punishment | undefined =>
    player.history.find(
      (p) => p.kind === kind && !p.revokedAt && (!p.expiresAt || new Date(p.expiresAt).getTime() > now),
    );
  const ban = player.banned ? current('ban') : undefined;
  const mute = player.muted ? current('mute') : undefined;
  const jail = player.jailed ? current('jail') : undefined;
  return new Set([ban?.id, mute?.id, jail?.id].filter((n): n is number => n !== undefined));
}

function PlayerProfile({ player }: { readonly player: PlayerDetail }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const me = usePanel();
  const canPunish = useCan('punishments');
  const roles = useRolesQuery(useCan('roles'));
  const [dialog, setDialog] = useState<ModKind | null>(null);
  const mine = roles.data?.find((r) => r.id === me.role.id) ?? me.role;
  const theirs = roles.data?.find((r) => r.id === player.role.id);
  // Like in the game: nobody punishes or ranks someone with the same or a higher rank (except the owner).
  // Without the role list only "the same rank" is known; the server decides the rest.
  const higher: boolean | null = ((): boolean | null => {
    if (me.role.id === OWNER) return true;
    if (theirs) return theirs.position > mine.position;
    return player.role.id === me.role.id ? false : null;
  })();
  const ids = activeIds(player);

  return (
    <>
      <Link
        to="/spieler"
        className="inline-flex items-center gap-1.5 justify-self-start rounded-[10px] text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('players.back')}
      </Link>

      <Card className="relative overflow-hidden p-5 sm:p-7">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-25"
          style={{ background: `linear-gradient(180deg, ${player.role.colour}, transparent)` }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center gap-4 sm:gap-5">
          <PlayerFace
            uuid={player.uuid}
            colour={player.role.colour}
            online={Boolean(player.online)}
            className="size-20 sm:size-24 [&>span:first-child]:rounded-[20px]"
          />
          <div className="grid min-w-0 flex-1 gap-2">
            <h1 className="font-display text-[clamp(1.7rem,3.4vw,2.4rem)] font-semibold leading-tight [overflow-wrap:anywhere]">
              {player.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={player.role} className="text-[13px]" />
              <PlayerFlags player={player} />
            </div>
            <p className="text-sm">
              <PresenceText player={player} relative={time.relative} />
            </p>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid gap-[22px]">
          <ProfileCard player={player} />
          <RankCard
            key={`${player.uuid}:${player.ownRole ?? ''}`}
            player={player}
            roles={roles.data}
            higher={higher}
          />
          {player.mornicraft ? <MorniCraftCard data={player.mornicraft} /> : null}
        </div>
        <div className="grid gap-[22px]">
          {canPunish ? <ActionsCard player={player} blocked={higher === false} onPunish={setDialog} /> : null}
          {player.banned || player.muted || player.jailed ? (
            <Card className="grid gap-4 p-5 sm:p-6">
              <SectionHead icon={ShieldAlert} title={t('players.active.title')} />
              <ul className="grid gap-2">
                {player.banned ? (
                  <ActiveRow
                    player={player}
                    kind="ban"
                    until={player.banned.until}
                    reason={player.banned.reason}
                    canLift={canPunish}
                  />
                ) : null}
                {player.muted ? (
                  <ActiveRow
                    player={player}
                    kind="mute"
                    until={player.muted.until}
                    reason={player.muted.reason}
                    canLift={canPunish}
                  />
                ) : null}
                {player.jailed ? (
                  <ActiveRow
                    player={player}
                    kind="jail"
                    until={player.jailed.until}
                    reason={player.jailed.reason}
                    canLift={canPunish}
                  />
                ) : null}
              </ul>
            </Card>
          ) : null}
          <Card className="grid gap-2 p-5 sm:p-6">
            <SectionHead icon={History} title={t('players.history.title')}>
              {player.history.length ? (
                <span className="text-sm text-muted-foreground">
                  {t('players.history.count', { count: player.history.length })}
                </span>
              ) : null}
            </SectionHead>
            {player.history.length ? (
              <ul className="grid divide-y divide-border">
                {player.history.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} active={ids.has(entry.id)} />
                ))}
              </ul>
            ) : (
              <p className={cn('rounded-[12px] bg-success-soft px-3.5 py-3 text-sm text-success')}>
                {t('players.history.empty')}
              </p>
            )}
          </Card>
        </div>
      </div>

      <PunishDialog
        open={dialog !== null}
        onOpenChange={(open) => setDialog(open ? dialog : null)}
        target={{ name: player.name, online: Boolean(player.online) }}
        kind={dialog ?? 'warn'}
      />
    </>
  );
}

function PlayerLoader(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const { uuid = '' } = useParams();
  const player = usePlayerQuery(uuid);
  if (player.isPending) return <Skeleton className="h-96 rounded-[16px]" />;
  if (player.isError) {
    return (
      <Card className="grid justify-items-start gap-4 p-6">
        <p className="text-muted-foreground">
          {errorCode(player.error) === 'player_unknown' ? t('players.unknown') : errorText(player.error)}
        </p>
        <Button asChild variant="secondary">
          <Link to="/spieler">
            <ArrowLeft />
            {t('players.back')}
          </Link>
        </Button>
      </Card>
    );
  }
  return <PlayerProfile player={player.data} />;
}

/** One player: profile, rank, punishments (hand out, lift) and their history. */
export function PlayerPage(): ReactElement {
  return (
    <AreaGate area="players">
      <PlayerLoader />
    </AreaGate>
  );
}
