import '~/styles/panel.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactElement, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { setApiBase } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { TooltipProvider } from '@/components/ui/misc';
import { Skeleton } from '~/components/ui';
import { ApplicationDetailPage } from './applications/ApplicationDetailPage';
import { ApplicationsPage } from './applications/ApplicationsPage';
import { DiscordPage } from './discord/DiscordPage';
import { ModesPage } from './ModesPage';
import { NewsEditorPage, NewsPage } from './news/NewsPage';
import { NotFoundPage } from './NotFoundPage';
import { OverviewPage } from './OverviewPage';
import { PanelGate } from './PanelGate';
import { PlayerPage } from './players/PlayerPage';
import { PlayersPage } from './players/PlayersPage';
import { PunishmentsPage } from './players/PunishmentsPage';
import { RolesPage } from './roles/RolesPage';
import { SettingsPage } from './settings/SettingsPage';
import { SetupPage } from './SetupPage';
import { TeamPage } from './team/TeamPage';

/** The motor (MorniHosting) answers under /panel/motor/api/… – sign-in, server pages, live connection. */
setApiBase('/panel/motor');

const TOAST_MS = 3500;

// MorniHosting's server pages load only when someone opens them.
const MotorLayout = lazy(async () => ({ default: (await import('./servers/motor')).MotorLayout }));
const ServerListPage = lazy(async () => ({ default: (await import('./servers/motor')).ServerListPage }));
const MotorServerPage = lazy(async () => ({ default: (await import('./servers/motor')).MotorServerPage }));
// "Mein Konto" shows MorniHosting's account cards – also only when opened.
const AccountPage = lazy(async () => ({ default: (await import('./account/AccountPage')).AccountPage }));

function Lazy({ children }: { readonly children: ReactNode }): ReactElement {
  return <Suspense fallback={<Skeleton className="h-96 rounded-[16px]" />}>{children}</Suspense>;
}

const router = createBrowserRouter(
  [
    { path: 'einrichtung', element: <SetupPage /> },
    {
      element: <PanelGate />,
      children: [
        { index: true, element: <OverviewPage /> },
        { path: 'modi', element: <ModesPage /> },
        { path: 'einstellungen', element: <Navigate to="/einstellungen/network" replace /> },
        { path: 'einstellungen/:areaId', element: <SettingsPage /> },
        { path: 'spieler', element: <PlayersPage /> },
        { path: 'spieler/:uuid', element: <PlayerPage /> },
        { path: 'strafen', element: <PunishmentsPage /> },
        { path: 'bewerbungen', element: <ApplicationsPage /> },
        { path: 'bewerbungen/:id', element: <ApplicationDetailPage /> },
        { path: 'rollen', element: <RolesPage /> },
        { path: 'team', element: <TeamPage /> },
        {
          path: 'konto',
          element: (
            <Lazy>
              <AccountPage />
            </Lazy>
          ),
        },
        { path: 'news', element: <NewsPage /> },
        { path: 'news/:newsId', element: <NewsEditorPage /> },
        { path: 'discord', element: <DiscordPage /> },
        {
          element: (
            <Lazy>
              <MotorLayout />
            </Lazy>
          ),
          children: [
            {
              path: 'server',
              element: (
                <Lazy>
                  <ServerListPage />
                </Lazy>
              ),
            },
            { path: 'servers', element: <Navigate to="/server" replace /> },
            {
              path: 'servers/:serverId/*',
              element: (
                <Lazy>
                  <MotorServerPage />
                </Lazy>
              ),
            },
          ],
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  // MorniHosting's pages link to "/servers/<id>/…"; under this base they land at /panel/servers/<id>/….
  { basename: '/panel' },
);

/** The team panel under /panel. */
export function PanelApp(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster
          position="top-right"
          duration={TOAST_MS}
          toastOptions={{
            classNames: {
              toast:
                '!rounded-[14px] !border !border-border !bg-popover !text-popover-foreground !shadow-float !font-sans',
              description: '!text-muted-foreground',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
