import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../i18n';
import '../lib/theme';
import { PublicApp, siteQueryClient } from '../public/PublicApp';
import { demoSignIn, installDemoBackend } from './backend';

/**
 * The website as a single file to click through: the pretend server answers, the real website runs on top. Only
 * the public website is in here – no panel.
 */

const LOGIN_LINK = '/api/public/apply/login';
const NOTE_MS = 3200;
/** Space between the toast and the note below it (px). */
const NOTE_GAP = 10;
const EDGE_GAP = 12;

installDemoBackend();

/** A small pill at the bottom; styles inline, so no host page can restyle it. */
function makeNote(): HTMLDivElement {
  const note = document.createElement('div');
  note.setAttribute('role', 'note');
  note.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:calc(12px + env(safe-area-inset-bottom, 0px))',
    'transform:translateX(-50%)',
    'z-index:90',
    'max-width:calc(100vw - 32px)',
    'padding:8px 14px',
    'border-radius:6px',
    'border:2px solid rgba(0,0,0,.45)',
    'background:#0b1d15',
    'color:#f6f1e2',
    "font:600 13px/1.4 'Rubik',system-ui,sans-serif",
    'box-shadow:0 4px 0 rgba(0,0,0,.35)',
    'text-align:center',
  ].join(';');
  return note;
}

/** The texts follow the language chosen on the page. */
const german = (): boolean => document.documentElement.lang !== 'en';

const banner = makeNote();
const label = document.createElement('span');
label.textContent = german()
  ? 'Demo der Webseite · alle Namen und Zahlen sind ausgedacht · nichts wird gespeichert'
  : 'Website demo · all names and numbers are made up · nothing is saved';
const close = document.createElement('button');
close.type = 'button';
close.textContent = '×';
close.setAttribute('aria-label', german() ? 'Hinweis schließen' : 'Close note');
close.style.cssText =
  'margin-left:10px;border:0;background:none;color:inherit;font:inherit;font-size:16px;line-height:1;cursor:pointer;padding:0 2px';
close.addEventListener('click', () => banner.remove());
banner.append(label, close);
document.body.append(banner);

const toast = makeNote();
toast.style.background = '#1d4f8a';
const toastTimer: { id?: number } = {};

function say(text: string): void {
  toast.textContent = text;
  // Above the demo note while it is still there.
  const below = banner.isConnected ? banner.offsetHeight + NOTE_GAP : 0;
  toast.style.bottom = `calc(${EDGE_GAP + below}px + env(safe-area-inset-bottom, 0px))`;
  document.body.append(toast);
  window.clearTimeout(toastTimer.id);
  toastTimer.id = window.setTimeout(() => toast.remove(), NOTE_MS);
}

/**
 * Links that would leave the one file: the Discord sign-in signs in on the spot, links to other sites only say
 * where they would lead.
 */
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(target instanceof HTMLAnchorElement)) return;
  const href = target.getAttribute('href') ?? '';
  if (href.startsWith(LOGIN_LINK)) {
    event.preventDefault();
    demoSignIn();
    void siteQueryClient.invalidateQueries();
    say(german() ? 'Demo: mit Discord angemeldet als „lena.baut“' : 'Demo: signed in with Discord as “lena.baut”');
    return;
  }
  if (target.target === '_blank') {
    event.preventDefault();
    say(
      german()
        ? `In der Demo bleibt dieser Link zu: ${target.href}`
        : `This link stays closed in the demo: ${target.href}`,
    );
  }
});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PublicApp />
    </StrictMode>,
  );
}
