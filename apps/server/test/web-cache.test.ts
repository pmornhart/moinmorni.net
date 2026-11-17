import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createHarness, type Harness } from './harness.js';

describe('Webseite: Zwischenspeichern im Browser', () => {
  let h: Harness;
  let web: string;
  beforeAll(async () => {
    web = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-web-'));
    fs.mkdirSync(path.join(web, 'assets'));
    fs.mkdirSync(path.join(web, 'bilder'));
    fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>MoinMorni</title>');
    fs.writeFileSync(path.join(web, 'assets', 'app-1a2b3c.js'), 'console.log(1)');
    fs.writeFileSync(path.join(web, 'bilder', 'dorfplatz-tag.webp'), 'RIFF');
    fs.writeFileSync(path.join(web, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    h = await createHarness({ webDir: web, env: { MM_DOMAIN: 'moinmorni.example' } });
  }, 60_000);
  afterAll(async () => {
    await h.cleanup();
    fs.rmSync(web, { recursive: true, force: true });
  });
  const cacheOf = async (url: string): Promise<string | undefined> => {
    const res = await h.mm.app.inject({ method: 'GET', url });
    expect(res.statusCode, url).toBe(200);
    return res.headers['cache-control']?.toString();
  };

  test('Bausteine mit Prüfsumme im Namen für immer, Bilder fragen jedes Mal nach (nach einem Update gleich die neuen), die Seite selbst immer frisch', async () => {
    expect(await cacheOf('/assets/app-1a2b3c.js')).toContain('immutable');
    expect(await cacheOf('/bilder/dorfplatz-tag.webp')).toBe('public, no-cache');
    expect(await cacheOf('/index.html')).toBe('no-cache');
  });

  test('HEAD wie GET, unbekannte Seiten mit 404, bekannte mit 200 (beides die Webseite)', async () => {
    const status = async (method: 'GET' | 'HEAD', url: string): Promise<number> =>
      (await h.mm.app.inject({ method, url })).statusCode;
    for (const url of [
      '/',
      '/spielmodi',
      '/spielmodi/duels',
      '/spieler/Anna',
      '/hilfe?x=1',
      '/team/bewerben',
      '/panel/spieler',
    ]) {
      expect(await status('GET', url), url).toBe(200);
      expect(await status('HEAD', url), `HEAD ${url}`).toBe(200);
    }
    for (const url of ['/gibts-nicht', '/hilfe/a/b', '/wp-admin', '/news/a/b']) {
      const res = await h.mm.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.body, url).toContain('<title>MoinMorni</title>');
      expect(await status('HEAD', url), `HEAD ${url}`).toBe(404);
    }
    // Die API bleibt bei JSON.
    expect((await h.mm.app.inject({ method: 'GET', url: '/api/gibts-nicht' })).json()).toEqual({
      error: 'not_found',
    });
  });

  test('robots.txt, sitemap.xml und favicon.ico statt der Startseite', async () => {
    const robots = await h.mm.app.inject({ method: 'GET', url: '/robots.txt' });
    expect(robots.statusCode).toBe(200);
    expect(robots.headers['content-type']).toContain('text/plain');
    expect(robots.body).toContain('Disallow: /panel');
    expect(robots.body).toContain('Disallow: /api/');
    expect(robots.body).toContain('Sitemap: https://moinmorni.example/sitemap.xml');
    expect((await h.mm.app.inject({ method: 'HEAD', url: '/robots.txt' })).statusCode).toBe(200);

    const map = await h.mm.app.inject({ method: 'GET', url: '/sitemap.xml' });
    expect(map.statusCode).toBe(200);
    expect(map.headers['content-type']).toContain('application/xml');
    for (const p of ['/', '/statistiken', '/team', '/regeln', '/hilfe', '/befehle', '/spielmodi/duels']) {
      expect(map.body).toContain(`<loc>https://moinmorni.example${p}</loc>`);
    }
    expect(map.body).not.toContain('/panel');

    const icon = await h.mm.app.inject({ method: 'GET', url: '/favicon.ico' });
    expect(icon.statusCode).toBe(301);
    expect(icon.headers.location).toBe('/favicon.svg');
    expect((await h.mm.app.inject({ method: 'GET', url: '/favicon.svg' })).statusCode).toBe(200);
  });
});
