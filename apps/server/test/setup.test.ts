import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

describe('Ersteinrichtung über MoinMorni', () => {
  let h: Harness;
  afterEach(async () => {
    await h.cleanup();
  });

  const post = (body: unknown): Promise<Response> =>
    fetch(`${h.mmUrl}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  test('Owner-Konto nur mit dem Einrichtungs-Code, danach ist die Einrichtung zu', async () => {
    h = await createHarness({ motorSetup: false });
    await h.mm.start();
    expect(await (await fetch(`${h.mmUrl}/api/setup`)).json()).toEqual({ required: true });
    const codeFile = path.join(h.mmDir, 'setup-code');
    const code = fs.readFileSync(codeFile, 'utf8').trim();
    // Code: drei Vierergruppen ohne verwechselbare Zeichen.
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(fs.statSync(codeFile).mode & 0o777).toBe(0o600);

    const wrong = await post({
      code: 'AAAA-BBBB-CCCC',
      username: 'philip',
      password: OWNER_PASSWORD,
      locale: 'de',
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'setup_code_wrong' });
    const weak = await post({ code, username: 'philip', password: 'kurz', locale: 'de' });
    expect(await weak.json()).toEqual({ error: 'setup_invalid' });

    // Kleinbuchstaben und ohne Bindestriche zählt auch (abgetippt).
    const ok = await post({
      code: code.toLowerCase().replaceAll('-', ' '),
      username: 'philip',
      password: OWNER_PASSWORD,
      locale: 'de',
    });
    expect(ok.status).toBe(200);
    expect(fs.existsSync(codeFile)).toBe(false);
    expect(await (await fetch(`${h.mmUrl}/api/setup`)).json()).toEqual({ required: false });
    const again = await post({ code, username: 'mallory', password: OWNER_PASSWORD, locale: 'de' });
    expect(again.status).toBe(409);

    // Philip ist Owner und kommt ins Panel.
    const { cookie } = await h.login('philip', OWNER_PASSWORD);
    const me = await fetch(`${h.mmUrl}/api/panel/me`, { headers: { cookie } });
    expect(await me.json()).toMatchObject({ username: 'philip', role: { id: 'owner' } });
    // Offene Registrierung im Motor ist aus.
    expect(await h.mm.motor.request('GET', '/api/signup')).toEqual({ enabled: false });
  });

  test('ist der Motor schon eingerichtet, gibt es keinen Code', async () => {
    h = await createHarness();
    await h.mm.start();
    expect(await (await fetch(`${h.mmUrl}/api/setup`)).json()).toEqual({ required: false });
    expect(fs.existsSync(path.join(h.mmDir, 'setup-code'))).toBe(false);
    expect(await h.mm.motor.request('GET', '/api/signup')).toEqual({ enabled: false });
  });
});
