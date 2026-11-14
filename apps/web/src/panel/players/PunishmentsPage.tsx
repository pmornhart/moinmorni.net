import { Gavel, Plus, Search, Sparkles, Undo2 } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, Card, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useErrorText } from '~/lib/errors';
import { useTimeText } from '~/lib/time';
import { AreaGate } from '../AreaGate';
import { PageHead } from '../PanelShell';
import { useCan } from '../session';
import { KindBadge } from './badges';
import { useLiftPunishment } from './lift';
import {
  isLasting,
  PUNISH_KINDS,
  punishmentState,
  usePunishmentsQuery,
  type PunishKind,
  type PunishmentRow,
  type PunishmentState,
} from './model';
import { PunishDialog } from './PunishDialog';

const SKELETON_ROWS = ['a', 'b', 'c', 'd'];
const STATE_TONE: Readonly<Record<PunishmentState, 'danger' | 'neutral' | 'success'>> = {
  active: 'danger',
  revoked: 'success',
  expired: 'neutral',
  replaced: 'neutral',
  once: 'neutral',
};

type KindFilter = PunishKind | 'all';

function Chip({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: string;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-secondary text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function PunishmentItem({ row }: { readonly row: PunishmentRow }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const canSeePlayers = useCan('players');
  const lift = useLiftPunishment();
  const state = punishmentState(row, row.active);
  const lasting = isLasting(row.kind);
  const liftKind = isLasting(row.kind) ? row.kind : null;
  const name = canSeePlayers ? (
    <Link to={`/spieler/${row.playerUuid}`} className="font-bold underline-offset-4 hover:underline">
      {row.playerName}
    </Link>
  ) : (
    <span className="font-bold">{row.playerName}</span>
  );
  return (
    <li className="grid gap-2.5 px-4 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:px-5">
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <KindBadge kind={row.kind} />
        <span className="text-xs text-muted-foreground sm:hidden">{time.relative(row.createdAt)}</span>
      </div>
      <div className="grid min-w-0 gap-0.5">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]">
          {name}
          <span className="text-muted-foreground">·</span>
          <span>{row.reason}</span>
        </p>
        <p className="text-[13px] text-muted-foreground">
          {t('players.history.by', { name: row.byName })} · {time.date(row.createdAt)}
          {lasting
            ? ` · ${row.expiresAt ? t('players.history.until', { date: time.date(row.expiresAt) }) : t('players.history.forever')}`
            : null}
        </p>
        {row.revokedAt ? (
          <p className="text-[13px] text-success">
            {t('players.history.revokedBy', { name: row.revokedBy ?? '?', date: time.date(row.revokedAt) })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {state === 'once' ? null : (
          <Pill tone={STATE_TONE[state]} dot={state === 'active'}>
            {t(`players.history.${state}`)}
          </Pill>
        )}
        {state === 'active' && liftKind ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={lift.isPending}
            onClick={() => lift.mutate({ uuid: row.playerUuid, kind: liftKind, name: row.playerName })}
          >
            <Undo2 />
            {t('players.active.lift')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function Punishments(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const id = useId();
  const list = usePunishmentsQuery();
  const [query, setQuery] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [kind, setKind] = useState<KindFilter>('all');
  const [dialog, setDialog] = useState(false);
  const rows = list.data ?? [];
  const words = query.trim().toLowerCase();
  const isActive = (row: PunishmentRow): boolean => punishmentState(row, row.active) === 'active';
  const shown = rows.filter(
    (row) =>
      (!onlyActive || isActive(row)) &&
      (kind === 'all' || row.kind === kind) &&
      (!words || row.playerName.toLowerCase().includes(words)),
  );
  // Prison comes with the lobby; its chip only shows once there is a prison sentence.
  const kinds = PUNISH_KINDS;
  const activeCount = rows.filter(isActive).length;
  const filtered = onlyActive || kind !== 'all' || Boolean(words);
  const reset = (): void => {
    setQuery('');
    setOnlyActive(false);
    setKind('all');
  };

  return (
    <>
      <PageHead icon={Gavel} title={t('punishments.title')} text={t('punishments.text')}>
        <Button onClick={() => setDialog(true)}>
          <Plus />
          {t('punishments.new')}
        </Button>
      </PageHead>

      <Card className="grid gap-3.5 p-4 sm:p-5">
        <div className="relative">
          <label htmlFor={id} className="sr-only">
            {t('punishments.searchLabel')}
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id={id}
            type="search"
            autoComplete="off"
            placeholder={t('punishments.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-[12px] border border-input bg-background/60 pl-10 pr-4 text-[15px] transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20 dark:bg-white/[0.03]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('punishments.stateLabel')}>
            <Chip active={!onlyActive} onClick={() => setOnlyActive(false)}>
              {t('punishments.all')}
            </Chip>
            <Chip active={onlyActive} onClick={() => setOnlyActive(true)}>
              {t('punishments.onlyActive', { count: activeCount })}
            </Chip>
          </div>
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('punishments.kindLabel')}>
            <Chip active={kind === 'all'} onClick={() => setKind('all')}>
              {t('punishments.kindAll')}
            </Chip>
            {kinds.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {t(`punish.kinds.${k}`)}
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      {list.isError ? <Card className="p-6 text-muted-foreground">{errorText(list.error)}</Card> : null}
      {list.isPending ? (
        <Card className="grid divide-y divide-border">
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-6 w-24 rounded-full" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      {list.isSuccess && !rows.length ? (
        <Card className="grid justify-items-center gap-3 px-6 py-14 text-center">
          <span
            className="grid size-14 place-items-center rounded-[16px] bg-success-soft text-success"
            aria-hidden
          >
            <Sparkles className="size-7" />
          </span>
          <h2 className="font-display text-2xl font-semibold">{t('punishments.emptyTitle')}</h2>
          <p className="max-w-[48ch] text-muted-foreground">{t('punishments.empty')}</p>
        </Card>
      ) : null}

      {rows.length && !shown.length ? (
        <Card className="grid justify-items-center gap-3 px-6 py-10 text-center">
          <p className="text-muted-foreground">{t('punishments.noMatch')}</p>
          <Button variant="secondary" size="sm" onClick={reset}>
            {t('punishments.reset')}
          </Button>
        </Card>
      ) : null}

      {shown.length ? (
        <div className="grid gap-2">
          <p className="px-1 text-[13px] text-muted-foreground">
            {filtered
              ? t('punishments.count', { count: shown.length, total: rows.length })
              : t('punishments.latest', { count: rows.length })}
          </p>
          <Card className="overflow-hidden">
            <ul className="grid divide-y divide-border">
              {shown.map((row) => (
                <PunishmentItem key={row.id} row={row} />
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      <PunishDialog open={dialog} onOpenChange={setDialog} target={null} />
    </>
  );
}

/** The latest punishments in the whole network: filter, search, lift – and hand out new ones. */
export function PunishmentsPage(): ReactElement {
  return (
    <AreaGate area="punishments">
      <Punishments />
    </AreaGate>
  );
}
