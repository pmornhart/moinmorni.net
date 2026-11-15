import '~/styles/public.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { createBrowserRouter, createHashRouter, RouterProvider, type RouteObject } from 'react-router';
import { ApplyPage } from './ApplyPage';
import { HelpPage } from './HelpPage';
import { HomePage } from './HomePage';
import { InfoPage } from './InfoPage';
import { ModePage, ModesListPage } from './ModePages';
import { NewsArticlePage, NewsListPage } from './NewsPages';
import { PlayerProfilePage, StatsPage } from './PlayerPages';
import { PublicLayout } from './PublicLayout';
import { RulesPage } from './RulesPage';
import { IS_DEMO } from './site-mode';
import { TeamPage } from './TeamPage';

const MAX_RETRIES = 2;

/** One cache for the website; the demo asks it to reload after a pretend sign-in. */
export const siteQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: MAX_RETRIES, refetchOnWindowFocus: true } },
});

const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'news', element: <NewsListPage /> },
      { path: 'news/:slug', element: <NewsArticlePage /> },
      { path: 'spielmodi', element: <ModesListPage /> },
      { path: 'spielmodi/:id', element: <ModePage /> },
      { path: 'mornicraft/bewerben', element: <ApplyPage /> },
      { path: 'statistiken', element: <StatsPage /> },
      { path: 'spieler/:name', element: <PlayerProfilePage /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'regeln', element: <RulesPage /> },
      { path: 'hilfe', element: <HelpPage /> },
      { path: 'impressum', element: <InfoPage page="imprint" /> },
      { path: 'datenschutz', element: <InfoPage page="privacy" /> },
      { path: '*', element: <InfoPage page="notFound" follows={false} /> },
    ],
  },
];

// The demo is one file without a server behind it: its addresses live after the "#".
const router = IS_DEMO ? createHashRouter(routes) : createBrowserRouter(routes);

/** The public website: start page, news, game modes, statistics, team, rules and help. */
export function PublicApp(): ReactElement {
  return (
    <QueryClientProvider client={siteQueryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
