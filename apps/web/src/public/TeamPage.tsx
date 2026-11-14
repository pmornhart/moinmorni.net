import { LifeBuoy, Users } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PlayerFace } from '~/components/player-face';
import { RoleSymbol } from '~/components/role-visuals';
import { Button, Card, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useTeam, type TeamGroup } from '~/lib/site';
import { usePick } from '~/lib/text';
import { EmptyState, PageBand, WRAP } from './parts';

const SKELETONS = ['a', 'b'];

function RankGroup({ group }: { readonly group: TeamGroup }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const online = group.members.filter((m) => m.online).length;
  // Like the game chat: the rank's colour on a dark chip, so light colours (VIP yellow) stay readable.
  const chip: CSSProperties = { color: group.role.colour };
  return (
    <section className="grid gap-4" aria-labelledby={`rank-${group.role.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <RoleSymbol role={group.role} className="size-10 rounded-[12px] text-lg" />
        <h2
          id={`rank-${group.role.id}`}
          className="inline-flex items-center gap-2 rounded-full bg-[#16201b] px-3.5 py-1 font-display text-xl font-semibold dark:bg-black/50 dark:ring-1 dark:ring-white/10"
          style={chip}
        >
          {pick(group.role.name)}
        </h2>
        <span className="text-sm text-muted-foreground">
          {t('site.team.count', { count: group.members.length })}
          {online ? ` · ${t('site.team.onlineCount', { count: online })}` : ''}
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {group.members.map((m) => (
          <li key={m.uuid}>
            <Link
              to={`/spieler/${encodeURIComponent(m.name)}`}
              className="group flex items-center gap-3.5 rounded-[16px] border border-border bg-card p-3.5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-float"
            >
              <PlayerFace uuid={m.uuid} colour={group.role.colour} online={m.online} className="size-14" />
              <span className="grid min-w-0 gap-1">
                <span className="truncate text-[1.05rem] font-bold group-hover:text-primary">{m.name}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[13px] font-semibold',
                    m.online ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn('size-2 rounded-full', m.online ? 'bg-success' : 'bg-muted-foreground/40')}
                    aria-hidden
                  />
                  {m.online ? t('site.team.online') : t('site.team.offline')}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The team, grouped by rank, with a green dot for everyone online. */
export function TeamPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const team = useTeam();
  const groups = team.data ?? [];
  return (
    <>
      <PageBand
        eyebrow={t('site.team.eyebrow')}
        title={t('site.team.title')}
        text={t('site.team.text')}
        icon={Users}
      />
      <div className={cn(WRAP, 'grid gap-12 py-12 sm:py-16')}>
        {team.isPending ? (
          <div className="grid gap-4">
            {SKELETONS.map((k) => (
              <Skeleton key={k} className="h-36 rounded-[16px]" />
            ))}
          </div>
        ) : null}
        {team.isError ? <Card className="p-6 text-muted-foreground">{t('site.loadError')}</Card> : null}
        {team.isSuccess && !groups.length ? (
          <EmptyState icon={Users} title={t('site.team.emptyTitle')} text={t('site.team.soon')} />
        ) : null}
        {groups.map((group) => (
          <RankGroup key={group.role.id} group={group} />
        ))}
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <LifeBuoy className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
            <p className="max-w-[60ch] text-[15px] text-muted-foreground">{t('site.team.helpText')}</p>
          </div>
          <Button asChild variant="secondary">
            <Link to="/hilfe#team-hilfe">{t('site.team.helpLink')}</Link>
          </Button>
        </Card>
      </div>
    </>
  );
}
