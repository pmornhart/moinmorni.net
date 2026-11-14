import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactElement } from 'react';
import { ForcePasswordDialog, meQuery } from '@/embed';
import { MotorSession } from '../motor-session';
import { refreshPanelMe } from '../session';

/** As soon as the motor knows the own password, MoinMorni asks again who is signed in – then the window goes. */
function ClearWhenDone(): null {
  const queryClient = useQueryClient();
  const me = useQuery(meQuery);
  const done = me.data ? !me.data.user.mustChangePassword : false;
  useEffect(() => {
    if (done) refreshPanelMe(queryClient);
  }, [done, queryClient]);
  return null;
}

/**
 * Signed in with a start password (new account or reset): MorniHosting's window asks for an own password on top of
 * every panel page and cannot be closed – only "sign out" leads away. Mounted only while MoinMorni says so, because
 * the motor's texts are big.
 */
export function ForcePassword(): ReactElement {
  return (
    <MotorSession quiet>
      <ForcePasswordDialog />
      <ClearWhenDone />
    </MotorSession>
  );
}
