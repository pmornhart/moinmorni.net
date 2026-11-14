import { ChevronRight, Clock, Search, UsersRound } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, Card, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useDebounced } from '~/lib/debounce';
import { useErrorText } from '~/lib/errors';
import { useTimeText } from '~/lib/time';
import { AreaGate } from '../AreaGate';
import { PageHead } from '../PanelShell';
import { RoleBadge } from '../role-visuals';
import { PlayerFlags, PresenceText } from './badges';
import { usePlayersQuery, type PlayerView } from './model';
import { PlayerFace } from './PlayerFace';

const SEARCH_DELAY_MS = 300;
const PAGE = 50;
const MAX = 100;
/** Longest search the API takes. */
const QUERY_MAX = 32;
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'];

function PlayerRow({ player }: { readonly player: PlayerView }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  return (
    <li>
      <Link
        to={`/spieler/${player.uuid}`}
        aria-label={t('players.open', { name: player.name })}
        className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 sm:px-5"
      >
        <PlayerFace uuid={player.uuid} colour={player.role.colour} online={Boolean(player.online)} />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0 truncate text-[15px] font-bold">{player.name}</span>
            <RoleBadge role={player.role} />
            <PlayerFlags player={player} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
            <PresenceText player={player} relative={time.relative} />
            <span className="inline-flex items-center gap-1 text-muted-foreground sm:hidden">
              <Clock className="size-3.5" aria-hidden />
              {time.playtime(player.playMinutes)}
            </span>
          </div>
        </div>
        <div className="hidden shrink-0 justify-items-end gap-0.5 text-right sm:grid">
          <span className="text-xs text-muted-foreground">{t('players.playtime')}</span>
          <span className="tabular text-sm font-semibold">{time.playtime(player.playMinutes)}</span>
        </div>
        <ChevronRight
          className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function PlayerList(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const id = useId();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(query.trim(), SEARCH_DELAY_MS);
  const players = usePlayersQuery(q, limit);
  const list = players.data?.players ?? [];
  const full = list.length >= limit;

  return (
    <>
      <PageHead icon={UsersRound} title={t('players.title')} text={t('players.text')}>
        {players.data ? (
          <Pill tone={players.data.online ? 'success' : 'neutral'} dot className="text-[13px]">
            {t('players.onlineNow', { count: players.data.online })}
          </Pill>
        ) : null}
      </PageHead>

      <div className="grid gap-2">
        <div className="relative">
          <label htmlFor={id} className="sr-only">
            {t('players.searchLabel')}
          </label>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id={id}
            type="search"
            autoComplete="off"
            maxLength={QUERY_MAX}
            placeholder={t('players.search')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            className="h-12 w-full rounded-[14px] border border-input bg-card pl-11 pr-4 text-[15px] shadow-card transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20"
          />
        </div>
        <p className="px-1 text-[13px] text-muted-foreground">{t('players.searchHint')}</p>
      </div>

      {players.isError ? <Card className="p-6 text-muted-foreground">{errorText(players.error)}</Card> : null}
      {players.isPending ? (
        <Card className="grid divide-y divide-border">
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="flex items-center gap-3.5 px-5 py-3.5">
              <Skeleton className="size-11" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      {players.data && !list.length ? (
        <Card className="grid justify-items-center gap-3 px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-[14px] bg-gold-soft text-gold" aria-hidden>
            <UsersRound className="size-6" />
          </span>
          <p className="max-w-[46ch] text-muted-foreground">
            {q ? t('players.noMatch', { q }) : t('players.empty')}
          </p>
        </Card>
      ) : null}

      {list.length ? (
        <Card className={cn('overflow-hidden transition-opacity', players.isPlaceholderData && 'opacity-60')}>
          <ul className="grid divide-y divide-border">
            {list.map((player) => (
              <PlayerRow key={player.uuid} player={player} />
            ))}
          </ul>
        </Card>
      ) : null}

      {full ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-sm text-muted-foreground">{t('players.limitHint', { count: limit })}</p>
          {limit < MAX ? (
            <Button variant="secondary" size="sm" onClick={() => setLimit(MAX)}>
              {t('players.more')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Everyone who has been on the network: search, rank, online state, play time, bans and mutes. */
export function PlayersPage(): ReactElement {
  return (
    <AreaGate area="players">
      <PlayerList />
    </AreaGate>
  );
}
