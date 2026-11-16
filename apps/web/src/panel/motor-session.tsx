import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@mornihosting/shared';
import { meQuery, SessionProvider } from '@/embed';
import { useLiveSync } from '@/features/servers/live';
import { Card, Skeleton } from '~/components/ui';
import { loadMotorTexts, MM_NAMESPACE } from '~/i18n';
import { useLanguage } from '~/lib/text';
import { useTheme } from '~/lib/theme';

/** MorniHosting's texts (about 200 KB per language) – loaded once, the first time a motor part shows. */
function useMotorTexts(): UseQueryResult<boolean> {
  return useQuery({
    queryKey: ['motor-texts'],
    queryFn: async () => {
      await loadMotorTexts();
      return true;
    },
    staleTime: Infinity,
  });
}

/** The motor's live connection (console, numbers, status) – only where server pages show. */
function LiveSync(): null {
  useLiveSync();
  return null;
}

/**
 * Everything MorniHosting's own parts need: its texts and its session (`/panel/motor/api/auth/me`), handed over with
 * morni.net's theme and language. Used by the embedded server pages, the account page and the window that asks for
 * an own password. `quiet` shows nothing while loading (for the password window on top of any page); a session that
 * ends there (signed out in that window) starts the panel afresh.
 */
export function MotorSession({
  children,
  live = false,
  quiet = false,
}: {
  readonly children: ReactNode;
  /** Open the live connection (server pages). */
  readonly live?: boolean;
  readonly quiet?: boolean;
}): ReactElement | null {
  const { t } = useTranslation(MM_NAMESPACE);
  const theme = useTheme();
  const language = useLanguage();
  const texts = useMotorTexts();
  const me = useQuery(meQuery);
  // MorniHosting applies the user's theme and language from its session; hand it morni.net's current choice.
  const session = useMemo<MeResponse | null>(
    () => (me.data ? { ...me.data, user: { ...me.data.user, theme: theme.choice, locale: language } } : null),
    [me.data, theme.choice, language],
  );
  const signedOut = me.data === null;
  useEffect(() => {
    if (quiet && signedOut) window.location.assign('/panel');
  }, [quiet, signedOut]);
  if (texts.isPending || me.isPending) return quiet ? null : <Skeleton className="h-96 rounded-[16px]" />;
  if (!session)
    return quiet ? null : <Card className="p-6 text-muted-foreground">{t('servers.motorSignedOut')}</Card>;
  return (
    <SessionProvider me={session}>
      {live ? <LiveSync /> : null}
      {children}
    </SessionProvider>
  );
}
