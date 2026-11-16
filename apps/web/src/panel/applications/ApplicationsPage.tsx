import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Globe,
  Inbox,
  MessagesSquare,
  NotebookPen,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, Card, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useErrorText } from '~/lib/errors';
import { usePick } from '~/lib/text';
import { useTimeText } from '~/lib/time';
import { AreaGate } from '../AreaGate';
import { PageHead } from '../PanelShell';
import { FilterChip } from '../settings/extras/parts';
import {
  ALL,
  MORNICRAFT,
  STATUSES,
  useApplicationList,
  type ApplicationFilter,
  type ApplicationStatus,
  type ApplicationSummary,
  type PositionView,
} from './model';
import { ApplicantHead, PositionBadge, StatusPill, VoteTally } from './parts';

const SKELETON_ROWS = ['a', 'b', 'c'];
const TEAM_APPLY_PAGE = '/team/bewerben';
const MORNICRAFT_PAGE = '/mornicraft/bewerben';
const SETTINGS_PATH = '/einstellungen/team-apply';

function Meta({
  icon: Icon,
  children,
}: {
  readonly icon: LucideIcon;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}

function Row({
  app,
  positions,
}: {
  readonly app: ApplicationSummary;
  readonly positions: readonly PositionView[];
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  return (
    <li>
      <Link
        to={`/bewerbungen/${app.id}`}
        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 px-4 py-4 transition-colors hover:bg-muted/50 sm:px-5"
      >
        <ApplicantHead app={app} />
        <span className="grid min-w-0 gap-1.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0 text-[15px] font-bold [overflow-wrap:anywhere]">
              {app.minecraftName}
            </span>
            <PositionBadge app={app} positions={positions} />
            <StatusPill status={app.status} />
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {app.discordName ? <Meta icon={MessagesSquare}>{app.discordName}</Meta> : null}
            <Meta icon={app.via === 'website' ? Globe : MessagesSquare}>
              {t(`applications.via.${app.via}`)}
            </Meta>
            <span title={time.date(app.createdAt)}>
              <Meta icon={CalendarDays}>{time.relative(app.createdAt)}</Meta>
            </span>
            {app.notes ? (
              <Meta icon={NotebookPen}>{t('applications.notesCount', { count: app.notes })}</Meta>
            ) : null}
            <VoteTally votes={app.votes} />
          </span>
        </span>
        <ChevronRight
          className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  );
}

/** "Wir suchen …": which positions are open right now. */
function OpenPositions({ positions }: { readonly positions: readonly PositionView[] }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const open = positions.filter((p) => p.open);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold">
          {open.length
            ? t('applications.openPositions', { list: open.map((p) => pick(p.role.name)).join(', ') })
            : t('applications.noOpenPositions')}
        </p>
        <p className="text-[13px] text-muted-foreground">{t('applications.openPositionsHint')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link to={SETTINGS_PATH}>
            <Settings2 />
            {t('applications.positionsSettings')}
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a href={TEAM_APPLY_PAGE} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            {t('applications.publicPage')}
          </a>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={MORNICRAFT_PAGE} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            {t('applications.mornicraftPage')}
          </a>
        </Button>
      </div>
    </Card>
  );
}

function ApplicationList(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const pick = usePick();
  const [filter, setFilter] = useState<ApplicationFilter>({ position: ALL, status: 'pending' });
  const list = useApplicationList(filter);
  const positions = list.data?.positions ?? [];
  const rows = list.data?.applications ?? [];
  const pending = list.data?.pending;
  const statusChoices: readonly (ApplicationStatus | 'all')[] = [...STATUSES, ALL];
  const setStatus = (status: ApplicationStatus | 'all'): void => setFilter((f) => ({ ...f, status }));
  const setPosition = (position: string): void => setFilter((f) => ({ ...f, position }));

  return (
    <>
      {list.data ? <OpenPositions positions={positions} /> : null}
      <Card className="grid gap-4 p-4 sm:p-5">
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('applications.filterPosition')}>
            <FilterChip active={filter.position === ALL} onClick={() => setPosition(ALL)}>
              {t('applications.allPositions')}
            </FilterChip>
            {positions.map((p) => (
              <FilterChip key={p.id} active={filter.position === p.id} onClick={() => setPosition(p.id)}>
                {`${p.role.symbol ? `${p.role.symbol} ` : ''}${pick(p.role.name)}`}
              </FilterChip>
            ))}
            <FilterChip
              active={filter.position === MORNICRAFT}
              onClick={() => setPosition(MORNICRAFT)}
              count={pending?.mornicraft}
            >
              MorniCraft
            </FilterChip>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('applications.filterStatus')}>
            {statusChoices.map((s) => (
              <FilterChip
                key={s}
                active={filter.status === s}
                onClick={() => setStatus(s)}
                count={s === 'pending' && pending ? pending.team + pending.mornicraft : undefined}
              >
                {t(`applications.status.${s}`)}
              </FilterChip>
            ))}
          </div>
        </div>
        {list.isError ? <p className="text-muted-foreground">{errorText(list.error)}</p> : null}
        {list.isPending ? (
          <div className="grid divide-y divide-border overflow-hidden rounded-[14px] border border-border">
            {SKELETON_ROWS.map((row) => (
              <div key={row} className="flex items-center gap-3.5 px-5 py-4">
                <Skeleton className="size-11" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {list.isSuccess && !rows.length ? (
          <div className="grid justify-items-center gap-2 rounded-[14px] border border-dashed border-border px-6 py-10 text-center">
            <span
              className="grid size-11 place-items-center rounded-[13px] bg-muted text-muted-foreground"
              aria-hidden
            >
              <Inbox className="size-5" />
            </span>
            <p className="font-semibold">{t(`applications.empty.${filter.status}`)}</p>
          </div>
        ) : null}
        {rows.length ? (
          <ul className="grid divide-y divide-border overflow-hidden rounded-[14px] border border-border">
            {rows.map((app) => (
              <Row key={app.id} app={app} positions={positions} />
            ))}
          </ul>
        ) : null}
      </Card>
      {pending && pending.team + pending.mornicraft > 0 && filter.status !== 'pending' ? (
        <p className="text-sm text-muted-foreground">
          <Pill tone="gold">{pending.team + pending.mornicraft}</Pill> {t('applications.stillOpen')}
        </p>
      ) : null}
    </>
  );
}

/** Panel → Bewerbungen: team positions and MorniCraft together – /panel/bewerbungen. */
export function ApplicationsPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <AreaGate area="players">
      <PageHead icon={ClipboardList} title={t('applications.title')} text={t('applications.text')} />
      <ApplicationList />
    </AreaGate>
  );
}
