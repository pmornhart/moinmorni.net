import { useQuery } from '@tanstack/react-query';
import { Info, MessageCircle, MonitorCog, ShieldHalf, Swords } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { DISCORD_RIGHTS, GAME_RIGHTS, PANEL_AREAS, type Role } from '@moinmorni/shared';
import { Card, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useErrorText } from '~/lib/errors';
import { mmApi } from '~/lib/mm-api';
import { usePick } from '~/lib/text';
import { PageHead } from './PanelShell';
import { RoleSymbol } from './role-visuals';

function Rights({
  icon: Icon,
  title,
  items,
  all,
  textKey,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly items: readonly string[];
  /** Every possible entry: a role with all of them shows one chip instead of a long list. */
  readonly all: readonly string[];
  readonly textKey: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const everything = all.every((entry) => items.includes(entry));
  return (
    <div className="grid content-start gap-2">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </p>
      {everything ? (
        <p className="justify-self-start rounded-full bg-gold-soft px-2.5 py-0.5 text-[13px] font-semibold text-gold">
          {t('roles.everything', { count: all.length })}
        </p>
      ) : null}
      {!everything && items.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[13px] font-medium"
            >
              {t(`${textKey}.${item}`, { defaultValue: item })}
            </li>
          ))}
        </ul>
      ) : null}
      {items.length ? null : <p className="text-sm text-muted-foreground">{t('roles.none')}</p>}
    </div>
  );
}

function RoleCard({ role, rank }: { readonly role: Role; readonly rank: number }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const pick = usePick();
  return (
    <Card className="grid gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3.5">
        <RoleSymbol role={role} />
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="font-display text-xl font-semibold leading-tight">{pick(role.name)}</h2>
          <p className="text-xs text-muted-foreground">{t('roles.rank', { n: rank })}</p>
        </div>
        {role.fallback ? <Pill tone="blue">{t('roles.fallback')}</Pill> : null}
        <span
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#16201b] px-3 py-1.5 font-mono text-[13px]"
          style={{ color: role.colour }}
          aria-hidden
        >
          {role.symbol ? `${role.symbol} ` : ''}
          {pick(role.name)}
          <span className="text-[#c9d3cb]">» {t('roles.chatSample')}</span>
        </span>
      </div>
      <div className="grid gap-5 border-t border-border pt-4 md:grid-cols-3">
        <Rights
          icon={MonitorCog}
          title={t('roles.panel')}
          items={role.panel}
          all={PANEL_AREAS}
          textKey="roles.areas"
        />
        <Rights
          icon={Swords}
          title={t('roles.game')}
          items={role.game}
          all={GAME_RIGHTS}
          textKey="roles.gameRights"
        />
        <Rights
          icon={MessageCircle}
          title={t('roles.discord')}
          items={role.discord}
          all={DISCORD_RIGHTS}
          textKey="roles.discordRights"
        />
      </div>
    </Card>
  );
}

/** The role template (read only for now): symbol, colour and what each role may do in panel, game and Discord. */
export function RolesPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const roles = useQuery({ queryKey: ['panel', 'roles'], queryFn: () => mmApi<Role[]>('/api/panel/roles') });
  return (
    <>
      <PageHead icon={ShieldHalf} title={t('roles.title')} text={t('roles.text')} />
      <p className="flex items-start gap-2.5 rounded-[14px] border border-gold/30 bg-gold-soft px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
        {t('roles.editLater')}
      </p>
      {roles.isPending ? <Skeleton className="h-96 rounded-[16px]" /> : null}
      {roles.isError ? <Card className="p-6 text-muted-foreground">{errorText(roles.error)}</Card> : null}
      <div className="grid gap-[22px]">
        {(roles.data ?? []).map((role, i) => (
          <RoleCard key={role.id} role={role} rank={i + 1} />
        ))}
      </div>
    </>
  );
}
