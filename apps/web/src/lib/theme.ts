import { useSyncExternalStore } from 'react';

/** Light, dark or like the device. Stored per browser; the class "dark" on <html> switches the colours. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'mm-theme';
const BAND_LIGHT = '#0f2a20';
const BAND_DARK = '#08130e';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function isChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

function stored(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isChoice(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

const state: { choice: ThemeChoice } = { choice: stored() };

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice !== 'system') return choice;
  return media.matches ? 'dark' : 'light';
}

function paint(): void {
  const mode = resolve(state.choice);
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'dark' ? BAND_DARK : BAND_LIGHT);
  listeners.forEach((l) => l());
}

media.addEventListener('change', () => {
  if (state.choice === 'system') paint();
});
// Embedded MorniHosting pages set the class themselves – usually with morni.net's choice, but right after some
// account changes with the theme stored in their session. morni.net's switch decides: put it back if it differs.
new MutationObserver(() => {
  const dark = document.documentElement.classList.contains('dark');
  if (dark !== (resolve(state.choice) === 'dark')) paint();
  else listeners.forEach((l) => l());
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class'],
});

export function setTheme(choice: ThemeChoice): void {
  state.choice = choice;
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Without storage the choice still applies to this visit.
  }
  paint();
}

export function themeChoice(): ThemeChoice {
  return state.choice;
}

paint();

export interface ThemeState {
  readonly choice: ThemeChoice;
  readonly resolved: ResolvedTheme;
  readonly toggle: () => void;
}

/** The current theme; `toggle` switches between light and dark (leaving "like the device"). */
export function useTheme(): ThemeState {
  const resolved = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    (): ResolvedTheme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  );
  const choice = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state.choice,
  );
  return { choice, resolved, toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark') };
}
