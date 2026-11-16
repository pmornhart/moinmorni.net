import { Info, Lock, RotateCw } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useCan, type SettingsEntry } from '../../session';
import { ApplicationsCard } from './ApplicationsCard';
import { BuildCard } from './BuildCard';
import { Notice } from './parts';
import { ReachCard } from './ReachCard';
import { UpdatesCard } from './UpdatesCard';
import { WhitelistCard } from './WhitelistCard';

/** MorniCraft: applications and whitelist belong to the area "Spieler" (the settings to "Modi"). */
function MorniCraftExtras({ entry }: { readonly entry: SettingsEntry }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const canSeePlayers = useCan('players');
  if (!canSeePlayers) {
    return (
      <Card className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('applicationsCard.noAccess')}
      </Card>
    );
  }
  return (
    <>
      <ApplicationsCard open={entry.values['applicationsOpen'] === true} />
      <WhitelistCard />
    </>
  );
}

const EXTRAS: Readonly<Record<string, (props: { readonly entry: SettingsEntry }) => ReactElement>> = {
  updates: () => <UpdatesCard />,
  reach: () => <ReachCard />,
  mornicraft: MorniCraftExtras,
  build: () => <BuildCard />,
};

/**
 * Game modes (Duels, Morni Party …): their settings go into the mode's own config file and apply after its next
 * restart – morni.net restarts it by itself as soon as nobody is playing. Says so, and whether a restart is still due.
 */
function ModeRestartNotice({ pending }: { readonly pending: boolean }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return pending ? (
    <Notice tone="warning" icon={RotateCw} title={t('modeSettings.pendingTitle')}>
      {t('modeSettings.pendingText')}
    </Notice>
  ) : (
    <Notice tone="blue" icon={Info} title={t('modeSettings.title')}>
      {t('modeSettings.text')}
    </Notice>
  );
}

/**
 * Cards some settings areas show above their settings (updates, applications, saved builds, mode restarts, NetBird for
 * the reachability).
 */
export function AreaExtras({ entry }: { readonly entry: SettingsEntry }): ReactElement | null {
  const Extra = EXTRAS[entry.area.id];
  if (!entry.area.mode) return Extra ? <Extra entry={entry} /> : null;
  return (
    <>
      <ModeRestartNotice pending={entry.restartPending === true} />
      {Extra ? <Extra entry={entry} /> : null}
    </>
  );
}
