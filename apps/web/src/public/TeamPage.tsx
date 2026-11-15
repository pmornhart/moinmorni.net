import { LifeBuoy, Users } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PlayerFace } from '~/components/player-face';
import { Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { cn } from '~/lib/cn';
import { useTeam, type TeamGroup } from '~/lib/site';
import { usePick } from '~/lib/text';
import { EmptyState, GameButton, LoadError, Panel, RankBlock } from './kit';
import { PageHero } from './page-hero';
import { WRAP } from './parts';

const SKELETONS = ['a', 'b'];

function RankGroup({ group }: { readonly group: TeamGroup }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  const online = group.members.filter((m) => m.online).length;
  const colour: CSSProperties = { color: group.role.colour };
  return (
    <section className="grid content-start gap-4 max-sm:w-full" aria-labelledby={`rank-${group.role.id}`}>
      <div className="flex items-center gap-3">
        <RankBlock role={group.role} className="size-11 text-xl" />
        <div className="grid gap-1">
          <h2
            id={`rank-${group.role.id}`}
            className="inline-flex justify-self-start rounded-[4px] border-2 border-black/30 bg-[#0d1512] px-2.5 py-1 font-pixel text-[1.45rem] font-bold uppercase leading-none tracking-[0.04em]"
            style={colour}
          >
            {pick(group.role.name)}
          </h2>
          <span className="text-[13.5px] text-muted-foreground">
            {t('site.team.count', { count: group.members.length })}
            {online ? ` · ${t('site.team.onlineCount', { count: online })}` : ''}
          </span>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
        {group.members.map((m) => (
          <li key={m.uuid} className="sm:w-[180px]">
            <Link
              to={`/spieler/${encodeURIComponent(m.name)}`}
              className="group grid justify-items-center gap-3 rounded-[10px] border-2 border-border bg-card px-3 pb-5 pt-6 text-center shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-gold/60 hover:shadow-float"
            >
              <PlayerFace
                uuid={m.uuid}
                colour={group.role.colour}
                online={m.online}
                className="size-20"
                faceClassName="rounded-[8px] border-2 border-black/25 shadow-[0_4px_0_rgba(0,0,0,0.2)]"
                dotClassName="size-5 border-[3px]"
              />
              <span className="max-w-full truncate text-[1.05rem] font-bold leading-tight group-hover:text-primary">
                {m.name}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 font-pixel text-[13px] font-semibold uppercase tracking-[0.08em]',
                  m.online ? 'text-success' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn('size-2', m.online ? 'bg-success' : 'bg-muted-foreground/40')}
                  aria-hidden
                />
                {m.online ? t('site.team.online') : t('site.team.offline')}
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
      <PageHero
        eyebrow={t('site.team.eyebrow')}
        title={t('site.team.title')}
        text={t('site.team.text')}
        scene="biergarten"
      />
      <div className={cn(WRAP, 'grid gap-12 py-14 sm:py-16')}>
        {team.isPending ? (
          <div className="grid gap-4">
            {SKELETONS.map((k) => (
              <Skeleton key={k} className="h-48 rounded-[10px]" />
            ))}
          </div>
        ) : null}
        {team.isError ? <LoadError /> : null}
        {team.isSuccess && !groups.length ? (
          <EmptyState icon={Users} title={t('site.team.emptyTitle')} text={t('site.team.soon')} />
        ) : null}
        {groups.length ? (
          <div className="flex flex-wrap gap-x-12 gap-y-12">
            {groups.map((group) => (
              <RankGroup key={group.role.id} group={group} />
            ))}
          </div>
        ) : null}
        <Panel className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <LifeBuoy className="mt-0.5 size-6 shrink-0 text-gold" aria-hidden />
            <p className="max-w-[60ch] text-[15px] text-muted-foreground">{t('site.team.helpText')}</p>
          </div>
          <GameButton asChild tone="stone">
            <Link to="/hilfe#team-hilfe">{t('site.team.helpLink')}</Link>
          </GameButton>
        </Panel>
      </div>
    </>
  );
}
