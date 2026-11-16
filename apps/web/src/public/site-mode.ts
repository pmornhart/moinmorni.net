/**
 * The demo build (`pnpm --filter @morninet/web build:demo`) runs the website without a server: its answers come
 * from src/demo, links stay inside the one file (hash addresses), and there is no panel behind it. Vite replaces
 * the mode at build time, so the normal build drops every demo branch.
 */
export const IS_DEMO = import.meta.env.MODE === 'demo';
