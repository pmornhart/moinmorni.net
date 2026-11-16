import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * morni.net's web app: the public website (/) and the panel (/panel). The panel embeds MorniHosting's server pages
 * straight from the submodule (vendor/mornihosting/apps/web/src), which import their own code as "@/…". morni.net's
 * own code therefore uses "~/…".
 */

const BACKEND = process.env['MM_DEV_BACKEND'] ?? 'http://127.0.0.1:8080';
const DEV_PORT = 5180;
const CHUNK_WARNING_KB = 1500;
const here = import.meta.dirname;
const src = path.resolve(here, 'src');
const vendorSrc = path.resolve(here, '../../vendor/mornihosting/apps/web/src');
const DEMO_IMAGES = 'virtual:demo-images';
const RESOLVED_DEMO_IMAGES = `\0${DEMO_IMAGES}`;
/** The website demo is one self-contained file: fonts go inline (pictures: scripts/inline-demo.mjs). */
const DEMO_MODE = 'demo';
const DEMO_INLINE_BYTES = 100_000_000;

/**
 * Libraries shared by morni.net and the embedded MorniHosting pages: exactly one copy each, otherwise React hooks,
 * contexts (query client, router, translations, toasts, tooltips) would split in two.
 */
const SHARED_LIBRARIES = [
  'react',
  'react-dom',
  'react-router',
  '@tanstack/react-query',
  'i18next',
  'react-i18next',
  'sonner',
  'radix-ui',
  'lucide-react',
  'clsx',
  'tailwind-merge',
  '@simplewebauthn/browser',
];

/**
 * Libraries in their own files: they rarely change, so after an update the browser keeps them cached. First match
 * wins.
 */
const VENDOR_CHUNKS: readonly (readonly [string, RegExp])[] = [
  // "node_modules/react-dom/client.js" → react; "node_modules/react-router/dist/index.js" does not match.
  // https://regex101.com/?flavor=javascript&regex=node_modules%5C%2F(react%7Creact-dom%7Cscheduler)%5C%2F&testString=node_modules%2Freact-dom%2Fclient.js%0Anode_modules%2Freact-router%2Fdist%2Findex.js
  ['react', /node_modules\/(react|react-dom|scheduler)\//],
  // "node_modules/react-router/dist/index.js" → router; "node_modules/react/index.js" does not match.
  // https://regex101.com/?flavor=javascript&regex=node_modules%5C%2Freact-router%5C%2F&testString=node_modules%2Freact-router%2Fdist%2Findex.js%0Anode_modules%2Freact%2Findex.js
  ['router', /node_modules\/react-router\//],
  // "node_modules/@tanstack/query-core/build/index.js" → query; "node_modules/zod/index.js" does not match.
  // https://regex101.com/?flavor=javascript&regex=node_modules%5C%2F%40tanstack%5C%2F&testString=node_modules%2F%40tanstack%2Fquery-core%2Fbuild%2Findex.js%0Anode_modules%2Fzod%2Findex.js
  ['query', /node_modules\/@tanstack\//],
  // "node_modules/i18next/dist/esm/i18next.js" → i18n; "node_modules/sonner/dist/index.mjs" does not match.
  // https://regex101.com/?flavor=javascript&regex=node_modules%5C%2F(react-)%3Fi18next&testString=node_modules%2Fi18next%2Fdist%2Fesm%2Fi18next.js%0Anode_modules%2Fsonner%2Fdist%2Findex.mjs
  ['i18n', /node_modules\/(react-)?i18next/],
];

function vendorChunk(id: string): string | undefined {
  return VENDOR_CHUNKS.find(([, pattern]) => pattern.test(id))?.[0];
}

/** MorniHosting's demo build embeds pictures through this module; outside its demo it is empty. */
function noDemoImages(): Plugin {
  return {
    name: 'morninet-no-demo-images',
    resolveId: (id) => (id === DEMO_IMAGES ? RESOLVED_DEMO_IMAGES : undefined),
    load: (id) =>
      id === RESOLVED_DEMO_IMAGES
        ? 'export default { logos: {}, gameArt: {}, items: {}, heads: {} };'
        : undefined,
  };
}

export default defineConfig(({ mode, command }) => {
  const demo = mode === DEMO_MODE;
  return {
    plugins: [react(), tailwindcss(), noDemoImages()],
    base: demo ? './' : '/',
    // The demo build embeds the pictures itself; while developing they come from public/ as usual.
    publicDir: demo && command === 'build' ? false : 'public',
    resolve: {
      alias: [
        // The demo's stylesheet holds its own against a host page's styles (src/demo/demo.css).
        // "~/styles/public.css" matches; "~/styles/panel.css" does not.
        // https://regex101.com/?flavor=javascript&regex=%5E~%5C%2Fstyles%5C%2Fpublic%5C.css%24&testString=~%2Fstyles%2Fpublic.css%0A~%2Fstyles%2Fpanel.css
        ...(demo ? [{ find: /^~\/styles\/public\.css$/, replacement: path.join(src, 'demo/demo.css') }] : []),
        // MorniHosting's pages take their texts from morni.net's translation setup (one i18next for both).
        // "@/i18n" matches; "@/i18n/de.json" and "@/lib/api" do not.
        // https://regex101.com/?flavor=javascript&regex=%5E%40%5C%2Fi18n%24&testString=%40%2Fi18n%0A%40%2Fi18n%2Fde.json
        { find: /^@\/i18n$/, replacement: path.join(src, 'i18n/index.ts') },
        // "@/lib/api" → MorniHosting's src/lib/api; "@simplewebauthn/browser" does not match.
        // https://regex101.com/?flavor=javascript&regex=%5E%40%5C%2F&testString=%40%2Flib%2Fapi%0A%40simplewebauthn%2Fbrowser
        { find: /^@\//, replacement: `${vendorSrc}/` },
        // "~/lib/api" → morni.net's src/lib/api; "~foo" does not match.
        // https://regex101.com/?flavor=javascript&regex=%5E~%5C%2F&testString=~%2Flib%2Fapi%0A~foo
        { find: /^~\//, replacement: `${src}/` },
      ],
      dedupe: SHARED_LIBRARIES,
    },
    server: {
      port: DEV_PORT,
      strictPort: true,
      proxy: {
        '/api': { target: BACKEND, changeOrigin: false },
        '/panel/motor': { target: BACKEND, changeOrigin: false, ws: true },
      },
      fs: { allow: [path.resolve(here, '../..')] },
    },
    build: demo
      ? {
          outDir: 'dist-demo',
          emptyOutDir: true,
          sourcemap: false,
          assetsInlineLimit: DEMO_INLINE_BYTES,
          cssCodeSplit: false,
          chunkSizeWarningLimit: DEMO_INLINE_BYTES,
          rollupOptions: {
            input: path.resolve(here, 'demo.html'),
            output: { inlineDynamicImports: true },
          },
        }
      : {
          outDir: 'dist',
          sourcemap: false,
          chunkSizeWarningLimit: CHUNK_WARNING_KB,
          rollupOptions: { output: { manualChunks: vendorChunk } },
        },
  };
});
