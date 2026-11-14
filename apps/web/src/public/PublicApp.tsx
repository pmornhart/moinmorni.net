import '~/styles/public.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { HomePage } from './HomePage';
import { InfoPage } from './InfoPage';
import { PublicLayout } from './PublicLayout';

const MAX_RETRIES = 2;
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: MAX_RETRIES, refetchOnWindowFocus: true } },
});

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'regeln', element: <InfoPage page="rules" /> },
      { path: 'team', element: <InfoPage page="team" /> },
      { path: 'impressum', element: <InfoPage page="imprint" /> },
      { path: 'datenschutz', element: <InfoPage page="privacy" /> },
      { path: '*', element: <InfoPage page="notFound" follows={false} /> },
    ],
  },
]);

/** The public website: start page, game modes and the simple pages. */
export function PublicApp(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
