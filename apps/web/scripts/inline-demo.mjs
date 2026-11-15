// Packs the website demo (dist-demo/, from `vite build --mode demo`) into one self-contained file,
// dist-demo/index.html: the stylesheet and the single script go inline (fonts are already embedded by Vite), and
// every picture from public/bilder/ that the script names becomes an embedded data address.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'dist-demo');
const pictures = path.join(root, 'public', 'bilder');
const built = path.join(dir, 'demo.html');
const html = fs.readFileSync(built, 'utf8');
const asset = (href) => fs.readFileSync(path.join(dir, href), 'utf8');
const MAX_BYTES = 12 * 1024 * 1024;
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

// A stylesheet tag: '<link rel="stylesheet" crossorigin href="./assets/demo-AbC.css">' → its href.
// https://regex101.com/?flavor=javascript&regex=%3Clink%20rel%3D%22stylesheet%22%5B%5E%3E%5D*href%3D%22(%5B%5E%22%5D%2B)%22%5B%5E%3E%5D*%3E&flags=g&testString=%3Clink%20rel%3D%22stylesheet%22%20crossorigin%20href%3D%22.%2Fassets%2Fdemo-AbC.css%22%3E
const STYLESHEET = /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g;
// A module script tag: '<script type="module" crossorigin src="./assets/demo-AbC.js"></script>' → its src.
// https://regex101.com/?flavor=javascript&regex=%3Cscript%20type%3D%22module%22%5B%5E%3E%5D*src%3D%22(%5B%5E%22%5D%2B)%22%5B%5E%3E%5D*%3E%3C%5C%2Fscript%3E&flags=g&testString=%3Cscript%20type%3D%22module%22%20crossorigin%20src%3D%22.%2Fassets%2Fdemo-AbC.js%22%3E%3C%2Fscript%3E
const MODULE_SCRIPT = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g;
// A picture of the website: "/bilder/hero-tag.webp" → "hero-tag.webp"; "/bilder/../x.webp" does not match.
// https://regex101.com/?flavor=javascript&regex=%5C%2Fbilder%5C%2F(%5Ba-z0-9-%5D%2B%5C.(%3F%3Awebp%7Cpng%7Cjpg%7Csvg))&flags=g&testString=%22%2Fbilder%2Fhero-tag.webp%22%0A%22%2Fbilder%2F..%2Fx.webp%22
const PICTURE = /\/bilder\/([a-z0-9-]+\.(?:webp|png|jpg|svg))/g;

const embedded = new Set();
const embedPictures = (code) =>
  code.replace(PICTURE, (_match, file) => {
    embedded.add(file);
    const data = fs.readFileSync(path.join(pictures, file)).toString('base64');
    return `data:${MIME[path.extname(file)]};base64,${data}`;
  });

// Text inside an inline script must neither close the tag nor open an HTML comment.
const safeScript = (code) => code.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');

const page = html
  .replace(STYLESHEET, (_tag, href) => `<style>${asset(href)}</style>`)
  .replace(
    MODULE_SCRIPT,
    (_tag, src) => `<script type="module">${safeScript(embedPictures(asset(src)))}</script>`,
  );

const out = path.join(dir, 'index.html');
fs.writeFileSync(out, page);
fs.rmSync(built);
fs.rmSync(path.join(dir, 'assets'), { recursive: true, force: true });

const size = Buffer.byteLength(page);
console.log(`${out}: ${(size / 1024 / 1024).toFixed(2)} MB, ${embedded.size} pictures embedded`);
if (size > MAX_BYTES) {
  console.error(`The demo is larger than ${MAX_BYTES / 1024 / 1024} MB.`);
  process.exit(1);
}
