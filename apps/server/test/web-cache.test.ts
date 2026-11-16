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
    h = await createHarness({ webDir: web });
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

  test('Bausteine mit Prüfsumme im Namen für immer, Bilder einen Tag, die Seite selbst immer frisch', async () => {
    expect(await cacheOf('/assets/app-1a2b3c.js')).toContain('immutable');
    expect(await cacheOf('/bilder/dorfplatz-tag.webp')).toBe('public, max-age=86400, stale-while-revalidate=604800');
    expect(await cacheOf('/index.html')).toBe('no-cache');
  });
});
