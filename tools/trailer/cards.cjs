#!/usr/bin/env node
// Titel-Karten für Trailer als durchsichtige PNGs (1920×1080) im Stil der Webseite.
//   node cards.cjs <karten.json> <ordner>
// karten.json: [{"file":"intro.png","kind":"intro","title":"Duels","kicker":"Spielmodus","text":"…"},
//               {"file":"lt1.png","kind":"lower","title":"Klassisch","text":"…"},
//               {"file":"ende.png","kind":"end","title":"moinmorni.net","text":"…","note":"…"}]
const fs = require('fs');
const path = require('path');
// Playwright liegt global; NODE_PATH (z. B. für mineflayer gesetzt) verdeckt es sonst.
const { chromium } = (() => {
  try { return require('playwright'); } catch {
    const root = require('child_process').execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
})();
const FONTS = process.env.MM_FONTS || path.join(process.env.HOME, 'mm-cache/trailer/fonts');
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 1.5 28.5 5.6V15c0 7.6-5.3 12.9-12.5 15.5C8.8 27.9 3.5 22.6 3.5 15V5.6Z" fill="#0f2a20"/><path d="M16 3.4 26.6 6.9V15c0 6.5-4.4 11.1-10.6 13.4C9.8 26.1 5.4 21.5 5.4 15V6.9Z" fill="#059669"/><path d="M8 23V11h1.5v1.5h1V11H12v4h1V8h1.5v1.5h.75V8h1.5v1.5h.75V8H19v7h1v-4h1.5v1.5h1V11H24v12Z" fill="#e7bb4d"/><path d="M14.2 23v-3.4a1.8 1.8 0 0 1 3.6 0V23Z" fill="#0f2a20"/></svg>`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const font = (name, file) =>
  `@font-face{font-family:'${name}';src:url(data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, file)).toString('base64')}) format('truetype')}`;
const CSS = `${font('Jersey', 'Jersey10.ttf')}${font('RubikM', 'Rubik-Medium.ttf')}${font('RubikX', 'Rubik-ExtraBold.ttf')}
*{margin:0;box-sizing:border-box} html,body{width:1920px;height:1080px;background:transparent;overflow:hidden}
.px{font-family:'Jersey';letter-spacing:2px;line-height:.9} .t{font-family:'RubikM'} .x{font-family:'RubikX'}
.shadow{text-shadow:0 6px 0 rgba(0,0,0,.35),0 10px 40px rgba(0,0,0,.55)}`;

function html(c) {
  if (c.kind === 'intro') return `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%,rgba(3,22,13,.72) 0%,rgba(3,22,13,.55) 45%,rgba(3,22,13,0) 80%)"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff;text-align:center">
    <div style="width:150px;height:150px;filter:drop-shadow(0 10px 30px rgba(0,0,0,.6))">${LOGO}</div>
    <div class="x" style="font-size:30px;letter-spacing:10px;color:#f6c544;text-transform:uppercase">${esc(c.kicker || 'MoinMorni')}</div>
    <div class="px shadow" style="font-size:${c.size || 230}px">${esc(c.title)}</div>
    <div class="t shadow" style="font-size:42px;max-width:1650px;color:#eaf7ef">${esc(c.text)}</div>
  </div>`;
  if (c.kind === 'lower') return `<div style="position:absolute;left:0;bottom:0;width:1400px;height:330px;background:linear-gradient(90deg,rgba(2,18,10,.78) 0%,rgba(2,18,10,.55) 45%,rgba(2,18,10,0) 100%)"></div>
  <div style="position:absolute;left:96px;bottom:92px;display:flex;gap:30px;align-items:stretch">
    <div style="width:10px;background:linear-gradient(#f6c544,#c98a0b);border-radius:2px"></div>
    <div style="display:flex;flex-direction:column;gap:12px;color:#fff">
      <div class="px shadow" style="font-size:96px">${esc(c.title)}</div>
      ${c.text ? `<div class="t shadow" style="font-size:38px;color:#f3d27a;max-width:1250px">${esc(c.text)}</div>` : ''}
    </div></div>`;
  return `<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,22,13,.55),rgba(3,22,13,.86))"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;color:#fff;text-align:center">
    <div style="width:170px;height:170px;filter:drop-shadow(0 10px 30px rgba(0,0,0,.6))">${LOGO}</div>
    <div class="px shadow" style="font-size:170px">${esc(c.title || 'moinmorni.net')}</div>
    <div class="x" style="font-size:40px;color:#f6c544;letter-spacing:3px">${esc(c.text || 'Java & Bedrock · kostenlos')}</div>
    ${c.note ? `<div class="t" style="margin-top:26px;font-size:36px;padding:18px 40px;border-radius:999px;background:#0d8a4e;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.4)">${esc(c.note)}</div>` : ''}
  </div>`;
}

(async () => {
  const [file, dir] = process.argv.slice(2);
  const cards = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const c of cards) {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style><body>${html(c)}</body>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(dir, c.file), omitBackground: true });
  }
  await browser.close();
  console.log(`${cards.length} Karten`);
})();
