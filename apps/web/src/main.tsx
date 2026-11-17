import './lib/zod-jitless';
import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './lib/theme';

/**
 * Two apps in one page: the public website and the panel under /panel. Each loads only its own code and styles,
 * so visitors of the start page never download the panel (and the embedded server pages).
 */
const PANEL = '/panel';
const path = window.location.pathname;
const inPanel = path === PANEL || path.startsWith(`${PANEL}/`);

async function loadApp(): Promise<ComponentType> {
  if (inPanel) return (await import('./panel/PanelApp')).PanelApp;
  return (await import('./public/PublicApp')).PublicApp;
}

void (async () => {
  const App = await loadApp();
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
})();
