import { Award, CircleCheck, Lock, RefreshCw, ToggleLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BADGE_TILE } from '@moinmorni/shared';
import { PixelTile } from '~/components/pixel-badge';
import { Card, Pill, Skeleton } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useErrorText } from '~/lib/errors';
import { Notice } from '../settings/extras/parts';
import { useAppearance, type RankView } from './model';

/** Discord needs boost level 2 for role icons. */
const ICON_TIER = 2;
/** About as big as Discord shows role icons next to a name (screen pixels). */
const ICON_PIXELS = 20;
const TILE_SIZE = ICON_PIXELS / BADGE_TILE;

/** One role as Discord shows it: icon (the badge tile) or nothing, then the name in the role's colour. */
function RankRow({ rank }: { readonly rank: RankView }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <li className="flex min-w-0 items-center gap-2.5 py-1.5">
      <span className="grid size-5 shrink-0 place-items-center">
        {rank.icon ? (
          <PixelTile look={{ text: rank.name, symbol: rank.symbol, colour: rank.colour }} scale={TILE_SIZE} />
        ) : null}
      </span>
      <span className="min-w-0 truncate text-[14.5px] font-semibold" style={{ color: rank.colour }}>
        {rank.discordName}
      </span>
      {rank.inDiscord ? null : (
        <span className="ml-auto shrink-0 text-xs text-[#8b9690]">{t('discordRanks.notYet')}</span>
      )}
    </li>
  );
}

/**
 * Panel → Discord → Ränge: the ranks the way Discord shows them – colour from the role, and (boost level 2, badges
 * on) the badge as role icon next to the name; otherwise the symbol stays in the name. Changes in the panel reach
 * Discord on their own.
 */
export function RanksCard({ ready }: { readonly ready: boolean }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const look = useAppearance(ready);
  const view = look.data;
  const ranks = view?.ranks ?? null;
  const icons = ranks?.look === 'icons';
  return (
    <Card className="grid gap-5 p-6" data-section="raenge" id="raenge">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Award className="size-5 text-gold" aria-hidden />
            {t('discordRanks.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('discordRanks.text')}</p>
        </div>
        {ranks ? (
          <Pill tone={icons ? 'success' : 'neutral'} dot>
            {icons ? t('discordRanks.modeIcons') : t('discordRanks.modeNames')}
          </Pill>
        ) : null}
      </div>
      {!ready ? <p className="text-sm text-muted-foreground">{t('discordLook.notReady')}</p> : null}
      {ready && look.isPending ? <Skeleton className="h-48" /> : null}
      {look.isError ? <p className="text-sm text-muted-foreground">{errorText(look.error)}</p> : null}
      {ready && view && !ranks ? (
        <p className="text-sm text-muted-foreground">{t('discordLook.noGuild')}</p>
      ) : null}
      {ranks ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid min-w-0 gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('discordRanks.preview')}
            </p>
            <ul
              className="grid min-w-0 rounded-[14px] border border-[#2a3530] bg-[#161c19] px-4 py-2.5"
              aria-label={t('discordRanks.preview')}
            >
              {ranks.roles.map((r) => (
                <RankRow key={r.id} rank={r} />
              ))}
            </ul>
          </div>
          <div className="grid min-w-0 content-start gap-3">
            {icons ? (
              <Notice tone="success" icon={CircleCheck} title={t('discordRanks.iconsTitle')}>
                {t('discordRanks.iconsText')}
              </Notice>
            ) : null}
            {ranks.reason === 'boost' ? (
              <Notice tone="neutral" icon={Lock} title={t('discordRanks.boostTitle')}>
                {t('discordRanks.boostText', { tier: view?.guild?.premiumTier ?? 0, need: ICON_TIER })}
              </Notice>
            ) : null}
            {ranks.reason === 'badges_off' ? (
              <Notice tone="warning" icon={ToggleLeft} title={t('discordRanks.offTitle')}>
                <p>{t('discordRanks.offText')}</p>
                <Link
                  to="/einstellungen/badges"
                  className="font-semibold text-foreground underline underline-offset-2"
                >
                  {t('discordRanks.offLink')}
                </Link>
              </Notice>
            ) : null}
            <Notice tone="blue" icon={RefreshCw} title={t('discordRanks.syncTitle')}>
              <p>{t('discordRanks.syncText')}</p>
              <p>{t('discordRanks.handText')}</p>
            </Notice>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
