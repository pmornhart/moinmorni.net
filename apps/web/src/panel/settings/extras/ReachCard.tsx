import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkView } from '@mornihosting/shared';
import { NETWORK_TITLE } from '@morninet/shared';
import { api, meQuery, NetbirdAutomationCard } from '@/embed';
import { Card } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { MotorSession } from '../../motor-session';

/** The motor's networks: morni.net's own one has the proxy players join. */
const motorNetworksQuery = {
  queryKey: ['motor-networks'],
  queryFn: () => api<NetworkView[]>('/api/networks'),
} as const;

/**
 * NetBird: connect it, the website on the domain itself, the network's proxy on the domain itself (players type only
 * the domain) and "Hausanschluss verstecken" – MorniHosting's card, embedded. The motor sets all of it up in NetBird
 * under the name "morni.net" (MH_BRAND), so a MorniHosting in the same NetBird account keeps its own things.
 */
function MotorNetbird(): ReactElement {
  const networks = useQuery(motorNetworksQuery);
  const proxy = networks.data?.find((n) => n.name === NETWORK_TITLE)?.proxy.serverId;
  return (
    <NetbirdAutomationCard
      // The website (and the panel) on the domain itself; NetBird forwards HTTPS to morni.net's port here.
      panelDomain=""
      panelName=""
      suggestedDomainServer={proxy}
    />
  );
}

/** Settings → Erreichbarkeit: only the owner – the one who is admin in the motor – may change NetBird. */
export function ReachCard(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const me = useQuery(meQuery);
  if (me.data && !me.data.user.isAdmin) {
    return (
      <Card className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('reach.ownerOnly')}
      </Card>
    );
  }
  return (
    <MotorSession>
      <MotorNetbird />
    </MotorSession>
  );
}
