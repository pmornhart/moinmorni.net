#!/usr/bin/env node
// Browser-Test der Auswahlliste im Stil der Seite (apps/web/src/components/select.tsx): Maus, Tastatur, Formular-Wert,
// gesperrte Einträge, Farben hell/dunkel, Handy. Startet einen Vite-Server mit der echten Komponente und dem echten
// Panel-Stil und prüft mit Chromium.
//   node tools/panel-test/auswahl-test.mjs
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
const FIXTURE = path.join(WEB, 'src', '__auswahl-test.tsx');
const FIXTURE_SOURCE = `
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '~/styles/panel.css';
import { Select } from '~/components/select';

function App() {
  const [rank, setRank] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [sent, setSent] = useState('–');
  return (
    <main style={{ padding: 24, display: 'grid', gap: 28, maxWidth: 460 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="rang">Eigener Rang</label>
        <Select
          id="rang"
          value={rank}
          onChange={(e) => {
            setRank(e.target.value);
            setLog((l) => [...l, e.target.value]);
          }}
        >
          <option value="">Kein eigener Rang (Spieler)</option>
          <option value="owner" disabled title="Diesen Rang darfst du nicht vergeben">♛ Owner</option>
          <option value="admin">✦ Admin</option>
          <option value="moderator">⚔ Moderator</option>
          <option value="vip">★ VIP</option>
        </Select>
        <output id="rang-wert">{rank}</output>
        <output id="rang-log">{log.join('|')}</output>
      </div>
      <form
        id="formular"
        style={{ display: 'grid', gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          setSent(JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))));
        }}
      >
        <label htmlFor="einheit">Einheit</label>
        <Select id="einheit" name="einheit" defaultValue="hours">
          <optgroup label="Kurz">
            <option value="minutes">Minuten</option>
            <option value="hours">Stunden</option>
          </optgroup>
          <optgroup label="Lang">
            <option value="days">Tage</option>
            <option value="weeks">Wochen</option>
          </optgroup>
        </Select>
        <label htmlFor="leer">Leer erlaubt</label>
        <Select id="leer" name="leer" defaultValue="x">
          <option value="">Nichts</option>
          <option value="x">Etwas</option>
        </Select>
        <button type="submit">Senden</button>
        <output id="gesendet">{sent}</output>
      </form>
      <button id="daneben" type="button">Daneben</button>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
`;
const PAGE = '/auswahl-test';
const PAGE_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>Auswahl</title></head>
<body><div id="root"></div><script type="module" src="/src/__auswahl-test.tsx"></script></body></html>`;

/** Wie in apps/web/vite.config.ts: die Bilder der MorniHosting-Demo gibt es hier nicht. */
const DEMO_IMAGES = 'virtual:demo-images';

function fixture() {
  return {
    name: 'auswahl-test',
    resolveId: (id) => {
      if (id === DEMO_IMAGES) return `\0${DEMO_IMAGES}`;
      return id === '/src/__auswahl-test.tsx' || id === FIXTURE ? FIXTURE : undefined;
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
      { find: '@/i18n', replacement: path.join(WEB, 'src/i18n/index.ts') },
      { find: /^@\//, replacement: `${path.resolve(WEB, '../../vendor/mornihosting/apps/web/src')}/` },
    ],
  },
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
await server.listen();
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}${PAGE}`;

/** Radix bewegt den Fokus in der Liste einen Augenblick nach dem Tastendruck – wie ein Mensch kurz warten. */
const STEP_MS = 60;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
};

/** Kontrast nach WCAG aus zwei "rgb(…)"-Farben. */
function contrast(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // React meldet Fehler im Umgang mit Formularfeldern (z. B. „changing an uncontrolled input“) als Konsolen-Fehler.
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  await page.goto(url);
  const rang = page.locator('#rang');
  await rang.waitFor();
  const listbox = page.getByRole('listbox');
  const press = async (key) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(STEP_MS);
  };
  const value = () => page.locator('#rang-wert').textContent();
  const hidden = () => page.locator('#rang').locator('xpath=..').locator('select').first().inputValue();

  // ---------- Maus ----------
  check(
    'Feld ist eine Auswahl (combobox) mit Namen aus dem Label',
    (await page.getByRole('combobox', { name: 'Eigener Rang' }).count()) === 1,
  );
  await rang.click();
  await listbox.waitFor();
  check('Klick öffnet die Liste (listbox)', await listbox.isVisible());
  check('Liste trägt den Namen des Felds', (await listbox.getAttribute('aria-label')) === 'Eigener Rang');
  check('fünf Einträge (option)', (await page.getByRole('option').count()) === 5);
  const owner = page.getByRole('option', { name: /Owner/ });
  check(
    'gesperrter Eintrag ist als gesperrt markiert',
    (await owner.getAttribute('aria-disabled')) === 'true',
  );
  check('gesperrter Eintrag hat ein Schloss', (await owner.locator('svg').count()) === 1);
  await owner.click({ force: true });
  check('Klick auf gesperrten Eintrag ändert nichts', (await value()) === '' && (await listbox.isVisible()));
  await page.getByRole('option', { name: /Moderator/ }).click();
  await listbox.waitFor({ state: 'hidden' });
  check('Klick wählt und schließt', (await value()) === 'moderator');
  check(
    'onChange bekommt event.target.value',
    (await page.locator('#rang-log').textContent()) === 'moderator',
  );
  check('Feld zeigt die Wahl', ((await rang.textContent()) ?? '').includes('Moderator'));
  check('verstecktes <select> trägt den Wert', (await hidden()) === 'moderator');
  await rang.click();
  await listbox.waitFor();
  const chosen = page.getByRole('option', { name: /Moderator/ });
  check(
    'gewählter Eintrag mit Häkchen',
    (await chosen.getAttribute('data-state')) === 'checked' && (await chosen.locator('svg').count()) === 1,
  );
  await page.mouse.click(900, 700);
  await listbox.waitFor({ state: 'hidden' });
  check('Klick daneben schließt, Wert bleibt', (await value()) === 'moderator');
  check('Fokus kommt zurück aufs Feld', await rang.evaluate((el) => el === document.activeElement));

  // ---------- Tastatur ----------
  await press('ArrowDown');
  await listbox.waitFor();
  check('Pfeil runter öffnet', await listbox.isVisible());
  check('gewählter Eintrag hat den Fokus', await chosen.evaluate((el) => el === document.activeElement));
  await press('ArrowDown');
  await press('Enter');
  await listbox.waitFor({ state: 'hidden' });
  check('Pfeil + Enter wählt den nächsten (VIP)', (await value()) === 'vip');
  check('nach Enter Fokus auf dem Feld', await rang.evaluate((el) => el === document.activeElement));
  await press('ArrowUp');
  await listbox.waitFor();
  await press('Home');
  await press('Escape');
  await listbox.waitFor({ state: 'hidden' });
  check('Esc schließt ohne Änderung', (await value()) === 'vip');
  check('nach Esc Fokus auf dem Feld', await rang.evaluate((el) => el === document.activeElement));
  await page.keyboard.type('a');
  await page.waitForTimeout(STEP_MS);
  check('Tippen springt (geschlossen): „a“ → Admin', (await value()) === 'admin');
  await press('Enter');
  await listbox.waitFor();
  await page.keyboard.type('m');
  await page.waitForTimeout(STEP_MS);
  await press('Enter');
  await listbox.waitFor({ state: 'hidden' });
  check('Tippen springt (offen): „m“ → Moderator', (await value()) === 'moderator');
  await press('ArrowDown');
  await listbox.waitFor();
  await press('Home');
  await press('Enter');
  await listbox.waitFor({ state: 'hidden' });
  check('leerer Wert („Kein eigener Rang“) wählbar', (await value()) === '' && (await hidden()) === '');
  await press('ArrowDown');
  await listbox.waitFor();
  await press('ArrowUp');
  const firstFocused = await page
    .getByRole('option')
    .first()
    .evaluate((el) => el === document.activeElement);
  await press('ArrowDown');
  const skipped = await page
    .getByRole('option', { name: /Admin/ })
    .evaluate((el) => el === document.activeElement);
  check('Pfeiltasten überspringen gesperrte Einträge', firstFocused && skipped);
  await press('Escape');

  // ---------- Formular ----------
  const sent = () => page.locator('#gesendet').textContent();
  await page.click('#formular button[type=submit]');
  check(
    'Formular liest die Werte über name (FormData)',
    (await sent()) === '{"einheit":"hours","leer":"x"}',
    await sent(),
  );
  await page.locator('#einheit').click();
  await listbox.waitFor();
  check(
    'Gruppen mit Überschrift (optgroup)',
    (await page.getByRole('group').count()) === 2 && (await listbox.textContent()).includes('Lang'),
  );
  await page.getByRole('option', { name: 'Tage' }).click();
  await page.locator('#leer').click();
  await page.getByRole('option', { name: 'Nichts' }).click();
  await page.click('#formular button[type=submit]');
  check(
    'Formular bekommt die neue Wahl, auch leer',
    (await sent()) === '{"einheit":"days","leer":""}',
    await sent(),
  );

  // ---------- Farben ----------
  const colours = async (dark) => {
    await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark);
    await rang.click();
    await listbox.waitFor();
    const result = await page.evaluate(() => {
      const list = document.querySelector('[role=listbox]');
      const options = [...document.querySelectorAll('[role=option]')];
      const free = options.find(
        (o) => !o.hasAttribute('data-disabled') && !o.hasAttribute('data-highlighted'),
      );
      const locked = options.find((o) => o.hasAttribute('data-disabled'));
      return {
        bg: getComputedStyle(list).backgroundColor,
        text: getComputedStyle(free).color,
        freeOpacity: getComputedStyle(free).opacity,
        lockedOpacity: getComputedStyle(locked).opacity,
        page: getComputedStyle(document.body).backgroundColor,
      };
    });
    await page.keyboard.press('Escape');
    await listbox.waitFor({ state: 'hidden' });
    return result;
  };
  const light = await colours(false);
  const dark = await colours(true);
  check(
    'hell: Liste gut lesbar (Kontrast ≥ 7)',
    contrast(light.text, light.bg) >= 7,
    `${light.text} auf ${light.bg}`,
  );
  check(
    'dunkel: Liste gut lesbar (Kontrast ≥ 7)',
    contrast(dark.text, dark.bg) >= 7,
    `${dark.text} auf ${dark.bg}`,
  );
  check('dunkel: Liste ist eine dunkle Karte, nicht weiß', contrast(dark.bg, 'rgb(0,0,0)') < 2, dark.bg);
  check(
    'gesperrt sieht anders aus als wählbar',
    Number(light.lockedOpacity) < 0.7 && Number(light.freeOpacity) === 1,
  );
  check('keine Fehler oder Warnungen auf der Seite', errors.length === 0, errors.join(' | '));
  await page.close();

  // ---------- Handy ----------
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await phone.goto(url);
  await phone.locator('#rang').tap();
  const list = phone.getByRole('listbox');
  await list.waitFor();
  const box = await list.boundingBox();
  check('Handy: Tippen öffnet', await list.isVisible());
  check(
    'Handy: Liste passt auf den Bildschirm',
    box !== null && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844,
    JSON.stringify(box),
  );
  await phone.getByRole('option', { name: /VIP/ }).tap();
  await list.waitFor({ state: 'hidden' });
  check('Handy: Tippen wählt', (await phone.locator('#rang-wert').textContent()) === 'vip');
  await phone.close();
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} grün`);
process.exit(failed ? 1 : 0);
