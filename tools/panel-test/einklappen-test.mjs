#!/usr/bin/env node
// Browser-Test des einklappbaren Bausteins (apps/web/src/components/fold-card.tsx): Maus, Tastatur, Screenreader-
// Angaben, gemerkter Zustand nach dem Neuladen, Öffnen von außen (openFold/revealFold), gesperrter Speicher,
// „Bewegung reduzieren“, Handy. Startet einen Vite-Server mit der echten Komponente und prüft mit Chromium.
//   node tools/panel-test/einklappen-test.mjs
// Playwright liegt global (wie bei tools/trailer); NODE_PATH verdeckt es manchmal – dann `npm root -g`.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WEB = path.resolve(import.meta.dirname, '../../apps/web');
const fromWeb = createRequire(path.join(WEB, 'package.json'));
const load = (name) => import(pathToFileURL(fromWeb.resolve(name)).href);
const { createServer } = await load('vite');
const { default: react } = await load('@vitejs/plugin-react');
const { default: tailwindcss } = await load('@tailwindcss/vite');
const requireHere = createRequire(import.meta.url);
const { chromium } = (() => {
  try {
    return requireHere('playwright');
  } catch {
    return requireHere(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
})();

/** Die Testseite liegt nicht auf der Platte: Vite bekommt sie als Datei in apps/web/src (für die Auflösung). */
const FIXTURE = path.join(WEB, 'src', '__einklappen-test.tsx');
const FIXTURE_SOURCE = `
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '~/styles/panel.css';
import { FoldCard, openFold, revealFold } from '~/components/fold-card';

function App() {
  return (
    <main style={{ padding: 24, display: 'grid', gap: 20, maxWidth: 640 }}>
      <FoldCard id="test:eins" title="Abschnitt eins" summary="3 Einstellungen">
        <p id="inhalt-eins">Inhalt eins</p>
        <input id="feld-eins" defaultValue="" />
      </FoldCard>
      <FoldCard id="test:zwei" title="Abschnitt zwei" summary="selten gebraucht" defaultOpen={false}>
        <p id="inhalt-zwei">Inhalt zwei</p>
        <div id="ziel-zwei">Ziel tief drin</div>
      </FoldCard>
      <button id="oeffne-zwei" type="button" onClick={() => revealFold(document.getElementById('ziel-zwei'))}>
        Zeig das Ziel
      </button>
      <button id="oeffne-eins" type="button" onClick={() => openFold('test:eins')}>
        Öffne eins
      </button>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
`;
const PAGE = '/einklappen-test';
const PAGE_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Einklappen</title></head>
<body><div id="root"></div><script type="module" src="/src/__einklappen-test.tsx"></script></body></html>`;

/** Wie in apps/web/vite.config.ts: die Bilder der MorniHosting-Demo gibt es hier nicht. */
const DEMO_IMAGES = 'virtual:demo-images';

function fixture() {
  return {
    name: 'einklappen-test',
    resolveId: (id) => {
      if (id === DEMO_IMAGES) return `\0${DEMO_IMAGES}`;
      return id === '/src/__einklappen-test.tsx' || id === FIXTURE ? FIXTURE : undefined;
    },
    load: (id) => {
      if (id === `\0${DEMO_IMAGES}`)
        return 'export default { logos: {}, gameArt: {}, items: {}, heads: {} };';
      return id === FIXTURE ? FIXTURE_SOURCE : undefined;
    },
    configureServer(server) {
      server.middlewares.use(PAGE, async (_req, res) => {
        res.setHeader('content-type', 'text/html');
        res.end(await server.transformIndexHtml(PAGE, PAGE_HTML));
      });
    },
  };
}

const server = await createServer({
  configFile: false,
  root: WEB,
  logLevel: 'error',
  plugins: [fixture(), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^~\//, replacement: `${path.join(WEB, 'src')}/` },
      { find: /^@\/i18n$/, replacement: path.join(WEB, 'src/i18n/index.ts') },
      { find: /^@\//, replacement: `${path.resolve(WEB, '../../vendor/mornihosting/apps/web/src')}/` },
    ],
  },
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
await server.listen();
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}${PAGE}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
};
/** Zeit für die Animation (200 ms) plus etwas Luft. */
const SETTLE_MS = 350;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  const one = page.getByRole('button', { name: /Abschnitt eins/ });
  const two = page.getByRole('button', { name: /Abschnitt zwei/ });
  await one.waitFor();

  check('Vorgabe offen: aria-expanded=true', (await one.getAttribute('aria-expanded')) === 'true');
  check('Vorgabe zu: aria-expanded=false', (await two.getAttribute('aria-expanded')) === 'false');
  check('Kopf steuert seinen Bereich (aria-controls)', Boolean(await one.getAttribute('aria-controls')));
  check('Offener Inhalt sichtbar', await page.locator('#inhalt-eins').isVisible());
  check('Zugeklappter Inhalt unsichtbar', !(await page.locator('#inhalt-zwei').isVisible()));
  check('Zugeklappt: Zusammenfassung im Kopf', (await two.textContent()).includes('selten gebraucht'));
  check('Offen: keine Zusammenfassung im Kopf', !(await one.textContent()).includes('3 Einstellungen'));
  check(
    'Zugeklappter Inhalt nicht erreichbar (inert)',
    await page.locator('#inhalt-zwei').evaluate((el) => Boolean(el.closest('[inert]'))),
  );

  await page.locator('#feld-eins').fill('bleibt');
  await one.click();
  await page.waitForTimeout(SETTLE_MS);
  check('Klick klappt zu', (await one.getAttribute('aria-expanded')) === 'false');
  check('Zu: Inhalt weg', !(await page.locator('#inhalt-eins').isVisible()));
  check('Zu: Zusammenfassung da', (await one.textContent()).includes('3 Einstellungen'));
  await one.click();
  await page.waitForTimeout(SETTLE_MS);
  check(
    'Eingabe bleibt beim Zu- und Aufklappen',
    (await page.locator('#feld-eins').inputValue()) === 'bleibt',
  );

  await two.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(SETTLE_MS);
  check('Enter klappt auf', (await two.getAttribute('aria-expanded')) === 'true');
  await page.keyboard.press('Space');
  await page.waitForTimeout(SETTLE_MS);
  check('Leertaste klappt zu', (await two.getAttribute('aria-expanded')) === 'false');

  await one.click();
  await page.waitForTimeout(SETTLE_MS);
  await page.reload();
  await one.waitFor();
  check('Nach dem Neuladen gemerkt: eins zu', (await one.getAttribute('aria-expanded')) === 'false');
  check('Nach dem Neuladen gemerkt: zwei zu', (await two.getAttribute('aria-expanded')) === 'false');
  check(
    'Gespeichert unter mm:fold:<id>',
    (await page.evaluate(() => window.localStorage.getItem('mm:fold:test:eins'))) === '0',
  );

  await page.locator('#oeffne-zwei').click();
  await page.waitForTimeout(SETTLE_MS);
  check('revealFold öffnet den Abschnitt um ein Element', await page.locator('#ziel-zwei').isVisible());
  await page.locator('#oeffne-eins').click();
  await page.waitForTimeout(SETTLE_MS);
  check('openFold(id) öffnet', (await one.getAttribute('aria-expanded')) === 'true');

  // Gesperrter Speicher (privates Fenster, blockierte Website-Daten): Vorgaben gelten, Klappen geht trotzdem.
  const blocked = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await blocked.addInitScript(() => {
    const fail = () => {
      throw new Error('blocked');
    };
    Object.defineProperty(window, 'localStorage', { get: fail });
  });
  const bp = await blocked.newPage();
  const blockedErrors = [];
  bp.on('pageerror', (e) => blockedErrors.push(e.message));
  await bp.goto(url);
  const bOne = bp.getByRole('button', { name: /Abschnitt eins/ });
  await bOne.waitFor();
  check('Ohne Speicher: Vorgabe offen', (await bOne.getAttribute('aria-expanded')) === 'true');
  await bOne.click();
  check('Ohne Speicher: klappt trotzdem', (await bOne.getAttribute('aria-expanded')) === 'false');
  check('Ohne Speicher: kein Fehler', blockedErrors.length === 0, blockedErrors.join(' | '));
  await blocked.close();

  // „Bewegung reduzieren“: keine Animation.
  const calm = await browser.newContext({ viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' });
  const cp = await calm.newPage();
  await cp.goto(url);
  await cp.getByRole('button', { name: /Abschnitt eins/ }).waitFor();
  const duration = await cp
    .locator('[role=region]')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  check('Bewegung reduzieren: keine Animation', duration < 0.01, `${duration}s`);
  await calm.close();

  // Handy: Kopf passt in die Breite.
  const phone = await browser.newContext({
    viewport: { width: 375, height: 740 },
    isMobile: true,
    hasTouch: true,
  });
  const pp = await phone.newPage();
  await pp.goto(url);
  await pp.getByRole('button', { name: /Abschnitt zwei/ }).waitFor();
  const overflow = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Handy: nichts ragt über den Rand', overflow <= 0, `${overflow}px`);
  await pp.getByRole('button', { name: /Abschnitt zwei/ }).tap();
  await pp.waitForTimeout(SETTLE_MS);
  check('Handy: Antippen klappt auf', await pp.locator('#inhalt-zwei').isVisible());
  await phone.close();

  check('Keine Fehler auf der Seite', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
process.exit(failed ? 1 : 0);
