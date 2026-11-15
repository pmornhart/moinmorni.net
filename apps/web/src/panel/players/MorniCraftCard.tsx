import { Home, Pickaxe, Shield, Skull } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Kbd, Pill } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useTimeText } from '~/lib/time';
import type { McPlace, MorniCraftPlayer } from './model';

/** "world · 120 / 64 / -40" */
const placeText = (p: McPlace): string => `${p.world} · ${p.x} / ${p.y} / ${p.z}`;

/** What MorniCraft reports about a player: homes, clan, graves, online/AFK – read-only. */
export function MorniCraftCard({ data }: { readonly data: MorniCraftPlayer }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const time = useTimeText();
  const presence = data.online ? (data.afk ? 'afk' : 'online') : 'offline';
  return (
    <Card className="grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold">
          <Pickaxe className="size-5 text-gold" aria-hidden />
          {t('players.mornicraft.title')}
        </h2>
        <Pill tone={presence === 'online' ? 'success' : presence === 'afk' ? 'blue' : 'neutral'}>
          {t(`players.mornicraft.${presence}`)}
        </Pill>
      </div>
      <p className="text-sm text-muted-foreground">{t('players.mornicraft.text')}</p>

      <section className="grid gap-2" aria-label={t('players.mornicraft.clan')}>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="size-4 text-muted-foreground" aria-hidden />
          {t('players.mornicraft.clan')}
        </h3>
        {data.clan ? (
          <p className="flex flex-wrap items-center gap-2 text-[15px]">
            <span className="font-semibold" style={{ color: data.clan.colour }}>
              [{data.clan.tag}]
            </span>
            <span className="font-semibold">{data.clan.name}</span>
            <span className="text-sm text-muted-foreground">
              {t('players.mornicraft.members', { count: data.clan.members })}
            </span>
            {data.clan.leader ? <Pill tone="neutral">{t('players.mornicraft.leader')}</Pill> : null}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('players.mornicraft.noClan')}</p>
        )}
      </section>

      <section className="grid gap-2" aria-label={t('players.mornicraft.homes')}>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Home className="size-4 text-muted-foreground" aria-hidden />
          {t('players.mornicraft.homes')}
        </h3>
        {data.homes.length ? (
          <ul className="grid gap-1.5">
            {data.homes.map((h) => (
              <li key={h.name} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold [overflow-wrap:anywhere]">{h.name}</span>
                <Kbd className="text-[11.5px]">{placeText(h)}</Kbd>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('players.mornicraft.noHomes')}</p>
        )}
      </section>

      <section className="grid gap-2" aria-label={t('players.mornicraft.graves')}>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Skull className="size-4 text-muted-foreground" aria-hidden />
          {t('players.mornicraft.graves')}
        </h3>
        {data.graves.length ? (
          <ul className="grid gap-1.5">
            {data.graves.map((g) => (
              <li
                key={`${g.world}:${g.x}:${g.y}:${g.z}`}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {time.relative(new Date(g.since).toISOString())} ·{' '}
                  {t('players.mornicraft.items', { count: g.items })}
                </span>
                <Kbd className="text-[11.5px]">{placeText(g)}</Kbd>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('players.mornicraft.noGraves')}</p>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        {t('players.mornicraft.updated', { time: time.relative(data.updatedAt) })}
      </p>
    </Card>
  );
}
