/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { wwwTarget } from '../src/public/www.js';
import { createHarness, type Harness } from './harness.js';

describe('www.<Domain> → https://<Domain>', () => {
  test('nur genau www.<Domain> (ohne Groß/Klein, Port oder Punkt am Ende), gleicher Pfad und gleiche Abfrage', () => {
    expect(wwwTarget('moinmorni.net', 'www.moinmorni.net', '/news/wiesn?x=1&y=2')).toBe(
      'https://moinmorni.net/news/wiesn?x=1&y=2',
    );
    expect(wwwTarget('moinmorni.net', 'WWW.MoinMorni.NET', '/')).toBe('https://moinmorni.net/');
    expect(wwwTarget('MoinMorni.net', 'www.moinmorni.net.', '/panel')).toBe('https://moinmorni.net/panel');
    // Die Domain selbst, andere Namen und fremde www-Namen bleiben, wo sie sind (kein offener Umleiter).
    expect(wwwTarget('moinmorni.net', 'moinmorni.net', '/')).toBeNull();
    expect(wwwTarget('moinmorni.net', 'www.example.com', '/')).toBeNull();
    expect(wwwTarget('moinmorni.net', 'www.moinmorni.net.example.com', '/')).toBeNull();
    expect(wwwTarget('moinmorni.net', 'shop.www.moinmorni.net', '/')).toBeNull();
    expect(wwwTarget('moinmorni.net', 'wwwmoinmorni.net', '/')).toBeNull();
    expect(wwwTarget('moinmorni.net', undefined, '/')).toBeNull();
    expect(wwwTarget('', 'www.', '/')).toBeNull();
    // Das Ziel ist immer die eigene Domain – auch bei einer ganzen Adresse oder „//“ in der Anfrage.
    expect(wwwTarget('moinmorni.net', 'www.moinmorni.net', 'http://evil.example/steal?x=1')).toBe(
      'https://moinmorni.net/steal?x=1',
    );
    expect(wwwTarget('moinmorni.net', 'www.moinmorni.net', '//evil.example/x')).toBe(
      'https://moinmorni.net//evil.example/x',
    );
    expect(new URL(wwwTarget('moinmorni.net', 'www.moinmorni.net', '//evil.example/x') ?? '').host).toBe(
      'moinmorni.net',
    );
  });

  describe('im echten MoinMorni (mit Motor)', () => {
    let h: Harness;
    let web: string;
    beforeAll(async () => {
      web = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-web-'));
      fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>MoinMorni</title>');
      h = await createHarness({ webDir: web, env: { MM_DOMAIN: 'moinmorni.net' } });
    }, 60_000);
    afterAll(async () => {
      await h.cleanup();
      fs.rmSync(web, { recursive: true, force: true });
    });

    test('Webseite, API und Panel unter www.<Domain> leiten mit 301 um, die Domain selbst nicht', async () => {
      const page = await h.mm.app.inject({
        method: 'GET',
        url: '/spielmodi?modus=duels',
        headers: { host: 'www.MoinMorni.net:8080' },
      });
      expect(page.statusCode).toBe(301);
      expect(page.headers['location']).toBe('https://moinmorni.net/spielmodi?modus=duels');
      const api = await h.mm.app.inject({
        method: 'GET',
        url: '/api/status',
        headers: { host: 'www.moinmorni.net' },
      });
      expect(api.statusCode).toBe(301);
      expect(api.headers['location']).toBe('https://moinmorni.net/api/status');
      const motor = await h.mm.app.inject({
        method: 'GET',
        url: '/panel/motor/api/auth/me',
        headers: { host: 'www.moinmorni.net' },
      });
      expect(motor.headers['location']).toBe('https://moinmorni.net/panel/motor/api/auth/me');
      const own = await h.mm.app.inject({ method: 'GET', url: '/', headers: { host: 'moinmorni.net' } });
      expect(own.statusCode).toBe(200);
      const other = await h.mm.app.inject({ method: 'GET', url: '/', headers: { host: 'www.example.com' } });
      expect(other.statusCode).toBe(200);
      expect(other.headers['location']).toBeUndefined();
    });
  });
});
