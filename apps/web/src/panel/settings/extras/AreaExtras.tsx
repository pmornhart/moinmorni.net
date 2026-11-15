import { Lock } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useCan, type SettingsEntry } from '../../session';
import { ApplicationsCard } from './ApplicationsCard';
import { BuildCard } from './BuildCard';
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
  mornicraft: MorniCraftExtras,
  build: () => <BuildCard />,
};

/** Cards some settings areas show above their settings (updates, applications, saved builds). */
export function AreaExtras({ entry }: { readonly entry: SettingsEntry }): ReactElement | null {
  const Extra = EXTRAS[entry.area.id];
  return Extra ? <Extra entry={entry} /> : null;
}
