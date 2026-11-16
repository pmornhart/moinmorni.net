import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, RotateCw, UserX, WifiOff } from 'lucide-react';
import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { api, onUnauthorized } from '@/lib/api';
import { Crest } from '~/components/brand';
import { Button } from '~/components/ui';
import { MM_NAMESPACE } from '~/i18n';
import { errorCode, useErrorText } from '~/lib/errors';
import { MmApiError } from '~/lib/mm-api';
import { AuthFrame } from './AuthFrame';
import { LoginPage } from './LoginPage';
import { PanelShell } from './PanelShell';
import { PANEL_ME_KEY, PanelContext, usePanelMeQuery, useSetupQuery } from './session';

const HTTP_UNAUTHORIZED = 401;

/** Signs out at the motor and starts the panel afresh (no data of the last person stays in memory). */
export function useLogout(): { readonly logout: () => void; readonly busy: boolean } {
  const out = useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSettled: () => window.location.assign('/panel'),
  });
  return { logout: () => out.mutate(), busy: out.isPending };
}

function Splash(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  return (
    <div className="band grid min-h-dvh place-items-center" role="status">
      <div className="grid justify-items-center gap-4">
        <Crest className="size-14 animate-pulse" />
        <p className="text-sm text-band-muted">{t('gate.loading')}</p>
      </div>
    </div>
  );
}

function NotInTeam(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const { logout, busy } = useLogout();
  return (
    <AuthFrame>
      <div className="grid gap-4">
        <span className="grid size-12 place-items-center rounded-[14px] bg-gold-soft text-gold" aria-hidden>
          <UserX className="size-6" />
        </span>
        <h1 className="font-display text-[2rem] font-semibold leading-tight">{t('notInTeam.title')}</h1>
        <p className="text-muted-foreground">{t('notInTeam.text')}</p>
        <Button variant="secondary" size="lg" onClick={logout} disabled={busy}>
          <LogOut />
          {t('notInTeam.logout')}
        </Button>
      </div>
    </AuthFrame>
  );
}

function GateError({ error, retry }: { readonly error: unknown; readonly retry: () => void }): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  return (
    <AuthFrame>
      <div className="grid gap-4">
        <span
          className="grid size-12 place-items-center rounded-[14px] bg-warning-soft text-warning"
          aria-hidden
        >
          <WifiOff className="size-6" />
        </span>
        <h1 className="font-display text-[2rem] font-semibold leading-tight">{t('gate.errorTitle')}</h1>
        <p className="text-muted-foreground">{errorText(error)}</p>
        <Button size="lg" onClick={retry}>
          <RotateCw />
          {t('gate.retry')}
        </Button>
      </div>
    </AuthFrame>
  );
}

/**
 * The door to the panel: first setup (owner account), then sign-in, then the check that the account has a
 * MoinMorni role. Only then the panel with its menu.
 */
export function PanelGate(): ReactElement {
  const queryClient = useQueryClient();
  const setup = useSetupQuery();
  const me = usePanelMeQuery();

  // The motor answered "not signed in" somewhere (e.g. a server page): ask again who is signed in. Not while
  // nobody is signed in – a wrong password on the sign-in page also answers 401.
  useEffect(
    () =>
      onUnauthorized(() => {
        if (queryClient.getQueryData(PANEL_ME_KEY))
          void queryClient.invalidateQueries({ queryKey: PANEL_ME_KEY });
      }),
    [queryClient],
  );

  if (setup.data?.required) return <Navigate to="/einrichtung" replace />;
  if (setup.isPending || me.isPending) return <Splash />;
  if (me.isError) {
    const status = me.error instanceof MmApiError ? me.error.status : 0;
    if (status === HTTP_UNAUTHORIZED) return <LoginPage />;
    if (errorCode(me.error) === 'not_in_team') return <NotInTeam />;
    return <GateError error={me.error} retry={() => void me.refetch()} />;
  }
  return (
    <PanelContext.Provider value={me.data}>
      <PanelShell />
    </PanelContext.Provider>
  );
}
