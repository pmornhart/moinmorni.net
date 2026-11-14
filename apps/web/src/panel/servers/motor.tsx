import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Server, Users } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useRoutes, type RouteObject } from 'react-router';
import type { MeResponse } from '@mornihosting/shared';
import { meQuery, serverRoutes, ServerIcon, SessionProvider, StatePill } from '@/embed';
import { useLiveSync, useServers } from '@/features/servers/live';
import { Button, Card, Skeleton } from '~/components/ui';
import { loadMotorTexts, MM_NAMESPACE } from '~/i18n';
import { useErrorText } from '~/lib/errors';
import { useLanguage } from '~/lib/text';
import { useTheme } from '~/lib/theme';
import { PageHead } from '../PanelShell';

/**
 * The motor's part of the panel: MorniHosting's own server pages, embedded. They need MorniHosting's texts,
 * its session (`/panel/motor/api/auth/me`) and the live connection for console and numbers.
 */
export function MotorLayout(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const theme = useTheme();
  const language = useLanguage();
  const texts = useQuery({
    queryKey: ['motor-texts'],
    queryFn: async () => {
      await loadMotorTexts();
      return true;
    },
    staleTime: Infinity,
  });
  const me = useQuery(meQuery);
  useLiveSync();
  // MorniHosting applies the user's theme and language from its session; hand it MoinMorni's current choice.
  const session = useMemo<MeResponse | null>(
    () => (me.data ? { ...me.data, user: { ...me.data.user, theme: theme.choice, locale: language } } : null),
    [me.data, theme.choice, language],
  );
  if (texts.isPending || me.isPending) return <Skeleton className="h-96 rounded-[16px]" />;
  if (!session) return <Card className="p-6 text-muted-foreground">{t('servers.motorSignedOut')}</Card>;
  return (
    <SessionProvider me={session}>
      <Outlet />
    </SessionProvider>
  );
}

/** All servers of the motor, each a link to its embedded page. */
export function ServerListPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const errorText = useErrorText();
  const servers = useServers();
  const list = servers.data ?? [];
  return (
    <>
      <PageHead icon={Server} title={t('servers.title')} text={t('servers.text')} />
      {servers.isPending ? <Skeleton className="h-48 rounded-[16px]" /> : null}
      {servers.isError ? <Card className="p-6 text-muted-foreground">{errorText(servers.error)}</Card> : null}
      {servers.isSuccess && !list.length ? (
        <Card className="p-6 text-muted-foreground">{t('servers.empty')}</Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((server) => (
          <Link
            key={server.id}
            to={`/servers/${server.id}`}
            className="group grid gap-4 rounded-[16px] border border-border bg-card p-5 shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-float"
          >
            <div className="flex items-start gap-3.5">
              <ServerIcon
                id={server.id}
                software={server.software}
                hasIcon={server.hasIcon}
                className="size-12"
              />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate font-display text-lg font-semibold">{server.name}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {server.software} · {server.version}
                </span>
              </div>
              <StatePill state={server.live.state} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
              <span className="truncate font-mono text-[13px]">{server.address}</span>
              <span className="tabular inline-flex shrink-0 items-center gap-1.5">
                <Users className="size-4" aria-hidden />
                {t('servers.players', { online: server.live.playersOnline, max: server.live.playersMax })}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

/** MorniHosting's server page with all its tabs, matched below /servers/<id>. */
const SERVER_PAGE: RouteObject[] = serverRoutes.map(({ path: _path, ...route }) => route);

export function MotorServerPage(): ReactElement {
  const { t } = useTranslation(MM_NAMESPACE);
  const page = useRoutes(SERVER_PAGE);
  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to="/server">
            <ArrowLeft />
            {t('servers.back')}
          </Link>
        </Button>
      </div>
      {page}
    </>
  );
}
