import { ArrowRight, Award, Info } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { JAIL_BADGE, roleBadgeLook, type BadgeLook } from '@moinmorni/shared';
import { Pill, Skeleton } from '~/components/ui';
import { PixelBadge } from '~/components/pixel-badge';
import { MM_NAMESPACE } from '~/i18n';
import { useLanguage } from '~/lib/text';
import { useRolesQuery, type SettingsEntry } from '../../session';
import { ExtraCard, Notice } from './parts';

/** Grey of the jail line without the pack ("[⛓ Gefängnis]" in the game). */
const JAIL_PLAIN_COLOUR = '#aaaaaa';

/** One line: the badge players with the pack see, and what everyone else sees (like in the game's chat). */
function BadgeRow({
  look,
  plain,
  colour,
}: {
  readonly look: BadgeLook;
  readonly plain: string;
  readonly colour: string;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 py-1.5">
      <span className="flex min-w-0 justify-end">
        <PixelBadge look={look} />
      </span>
      <ArrowRight className="size-3.5 text-[#6b7a72]" aria-label={t('badgesCard.without')} />
      <span className="truncate font-mono text-[13px] font-medium" style={{ color: colour }}>
        {plain}
      </span>
    </li>
  );
}

/**
 * Settings → Rang-Abzeichen: all badges as players see them in the game, drawn from the roles (name, symbol, colour)
 * with the same pixels the pack has – and next to each what players without the pack see.
 */
export function BadgesCard({ entry }: { readonly entry: SettingsEntry }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const language = useLanguage();
  const roles = useRolesQuery();
  const on = entry.values['enabled'] !== false;
  const jail: BadgeLook = {
    text: JAIL_BADGE.name[language],
    symbol: JAIL_BADGE.symbol,
    colour: JAIL_BADGE.colour,
  };
  return (
    <ExtraCard
      icon={Award}
      title={t('badgesCard.title')}
      text={t('badgesCard.text')}
      aside={
        <Pill tone={on ? 'success' : 'neutral'} dot>
          {on ? t('badgesCard.on') : t('badgesCard.off')}
        </Pill>
      }
    >
      <div className="grid gap-2">
        <p className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 px-4 text-xs font-semibold text-muted-foreground">
          <span className="text-right">{t('badgesCard.with')}</span>
          <span className="w-3.5" aria-hidden />
          <span>{t('badgesCard.without')}</span>
        </p>
        <div className="rounded-[14px] bg-[#16201b] px-4 py-2.5 dark:bg-black/50 dark:ring-1 dark:ring-white/10">
          {roles.isPending ? (
            <Skeleton className="h-40 w-full bg-white/10" />
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {(roles.data ?? []).map((role) => (
                <BadgeRow
                  key={role.id}
                  look={roleBadgeLook(role, language)}
                  plain={`${role.symbol ? `${role.symbol} ` : ''}${role.name[language]}`}
                  colour={role.colour}
                />
              ))}
              <BadgeRow
                look={jail}
                plain={`[${JAIL_BADGE.symbol} ${JAIL_BADGE.name[language]}]`}
                colour={JAIL_PLAIN_COLOUR}
              />
            </ul>
          )}
        </div>
      </div>
      <Notice tone="blue" icon={Info} title={t('badgesCard.whereTitle')}>
        <p>{t('badgesCard.where')}</p>
        <p>
          {t('badgesCard.fromRoles')}{' '}
          <Link to="/rollen" className="font-semibold text-primary underline-offset-2 hover:underline">
            {t('badgesCard.editRoles')}
          </Link>
        </p>
      </Notice>
    </ExtraCard>
  );
}
