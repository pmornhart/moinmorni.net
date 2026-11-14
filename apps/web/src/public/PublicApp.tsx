import '~/styles/public.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { HelpPage } from './HelpPage';
import { HomePage } from './HomePage';
import { InfoPage } from './InfoPage';
import { ModePage, ModesListPage } from './ModePages';
import { NewsArticlePage, NewsListPage } from './NewsPages';
import { PlayerProfilePage, StatsPage } from './PlayerPages';
import { PublicLayout } from './PublicLayout';
import { RulesPage } from './RulesPage';
import { TeamPage } from './TeamPage';

const MAX_RETRIES = 2;
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: MAX_RETRIES, refetchOnWindowFocus: true } },
});

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'news', element: <NewsListPage /> },
      { path: 'news/:slug', element: <NewsArticlePage /> },
      { path: 'spielmodi', element: <ModesListPage /> },
      { path: 'spielmodi/:id', element: <ModePage /> },
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
]);

/** The public website: start page, news, game modes, statistics, team, rules and help. */
export function PublicApp(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
