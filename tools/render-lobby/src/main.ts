/* eslint-disable ts-patterns/no-magic-numbers -- render tool */
/**
 * Bilder der Lobby für die Webseite: Szene exportieren, Render-Seite im Browser (Playwright + WebGL) öffnen, alle
 * Aufnahmen aus `shots.ts` rendern und als PNG/WebP/JPEG speichern.
 *
 *   npx tsx tools/render-lobby/src/main.ts --out <ordner> [--only name1,name2] [--reuse] [--ss 2] [--preview]
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { exportScene } from './scene.js';
import { SHOTS } from './shots.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.resolve(HERE, '..');
const CACHE = path.join(TOOL, 'out');
const THREE_DIR = process.env.THREE_DIR ?? '/home/user/mm-cache/node/node_modules/three';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.bin': 'application/octet-stream',
};

/** TypeScript der Seite ohne Bündeln in JavaScript übersetzen (esbuild kommt mit tsx mit). */
async function transpilePage(): Promise<void> {
  const req = createRequire(createRequire(import.meta.url).resolve('tsx'));
  const esbuild = req('esbuild') as { transform: (s: string, o: object) => Promise<{ code: string }> };
  const src = fs.readFileSync(path.join(HERE, 'page', 'render.ts'), 'utf8');
  const { code } = await esbuild.transform(src, { loader: 'ts', format: 'esm', target: 'es2022' });
  fs.writeFileSync(path.join(CACHE, 'render.js'), code);
  fs.writeFileSync(
    path.join(CACHE, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:none}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head>
<body><script type="module" src="render.js"></script></body></html>`,
  );
}

function serve(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    const file = url.startsWith('/three/')
      ? path.join(THREE_DIR, path.normalize(url.slice('/three/'.length)))
      : path.join(CACHE, path.normalize(url === '/' ? 'index.html' : url.slice(1)));
    const root = url.startsWith('/three/') ? THREE_DIR : CACHE;
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Das Wenige, was hier von Playwright gebraucht wird (Playwright ist global installiert, ohne Typen im Repo). */
interface Page {
  setDefaultTimeout(ms: number): void;
  on(event: 'console', f: (m: { type(): string; text(): string }) => void): void;
  on(event: 'pageerror', f: (e: Error) => void): void;
  goto(url: string): Promise<unknown>;
  waitForFunction(js: string, arg: unknown, opts: { timeout: number; polling: number }): Promise<unknown>;
  evaluate<R, A>(f: string | ((a: A) => R), arg?: A): Promise<R>;
}
interface Playwright {
  chromium: { launch(o: { args: string[] }): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> };
}

async function main(): Promise<void> {
  const out = path.resolve(arg('out') ?? path.join(TOOL, 'out', 'bilder'));
  const only = arg('only')?.split(',');
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  if (!process.argv.includes('--reuse') || !fs.existsSync(path.join(CACHE, 'scene.json'))) exportScene(CACHE);
  await transpilePage();
  const server = await serve();
  const port = (server.address() as { port: number }).port;
  const { chromium } = createRequire(import.meta.url)('playwright') as Playwright;
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  page.on('console', (m) =>
    m.type() === 'error' || m.type() === 'warning' ? console.log('Seite:', m.text()) : undefined,
  );
  page.on('pageerror', (e) => console.log('Seitenfehler:', e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction('window.ready || window.failed', undefined, { timeout: 0, polling: 500 });
  const failed = await page.evaluate('window.failed');
  if (failed) throw new Error(String(failed));
  console.log(
    'Render-Seite bereit:',
    JSON.stringify(await page.evaluate('({ ...window.sceneInfo, npcs: undefined })')),
  );
  const ss = arg('ss');
  const shots = SHOTS.filter((s) => !only || only.some((o) => s.name.includes(o)));
  await shots.reduce(async (before, shot) => {
    await before;
    const small = process.argv.includes('--preview');
    const spec = {
      ...shot,
      ...(ss ? { ss: Number(ss) } : {}),
      ...(small
        ? {
            ss: 1,
            width: shot.width / 2,
            height: shot.height / 2,
            outputs: [[shot.width / 2, shot.height / 2, 'png']],
          }
        : {}),
    };
    const res = (await page.evaluate(
      (s) => (window as unknown as { renderShot: (x: unknown) => unknown }).renderShot(s),
      spec,
    )) as Record<string, string>;
    Object.entries(res)
      .filter(([k]) => k !== 'ms' && !k.endsWith('.quality'))
      .forEach(([k, dataUrl]) => {
        const file = path.join(out, small ? `${shot.name}.png` : `${shot.name}-${k}`);
        fs.writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
      });
    const tuned = Object.entries(res)
      .filter(([k]) => k.endsWith('.quality'))
      .map(([k, v]) => ` (${k.replace('.quality', '')}: Qualität ${v})`)
      .join('');
    console.log(`${shot.name}: ${(Number(res.ms) / 1000).toFixed(1)} s${tuned}`);
  }, Promise.resolve());
  await browser.close();
  server.close();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
