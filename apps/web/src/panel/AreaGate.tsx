import { Lock } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PanelArea } from '@moinmorni/shared';
import { Card } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { useCan } from './session';

/** Shows a page only to people whose role has its panel area (the menu hides it anyway). */
export function AreaGate({
  area,
  children,
}: {
  readonly area: PanelArea;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  if (useCan(area)) return <>{children}</>;
  return (
    <Card className="flex items-start gap-3 p-6 text-muted-foreground">
      <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
      {t('panel.forbidden')}
    </Card>
  );
}
