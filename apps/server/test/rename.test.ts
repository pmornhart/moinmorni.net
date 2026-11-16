import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { adoptInterimDatabase, INTERIM_ID, INTERIM_TITLE, renamedServer } from '../src/lib/rename.js';
import { isOurNetwork } from '../src/public/status.js';
import { createHarness, OWNER_PASSWORD, type Harness } from './harness.js';

describe('Rückbenennung: Name wieder MoinMorni', () => {
  const dirs: string[] = [];
  const tmp = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-rueckweg-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  test('Datenbank unter dem Zwischen-Namen wird übernommen, samt WAL; Reste fliegen raus', () => {
    const dir = tmp();
    const file = path.join(dir, 'moinmorni.db');
    const interim = path.join(dir, `${INTERIM_ID}.db`);
    fs.writeFileSync(interim, 'zwischen');
    fs.writeFileSync(`${interim}-wal`, 'zwischen-wal');
    fs.writeFileSync(file, 'veraltet');
    fs.writeFileSync(`${file}-shm`, 'veraltet-shm');

    expect(adoptInterimDatabase(file)).toBe(true);

    expect(fs.readFileSync(file, 'utf8')).toBe('zwischen');
    expect(fs.readFileSync(`${file}-wal`, 'utf8')).toBe('zwischen-wal');
    expect(fs.existsSync(`${file}-shm`)).toBe(false);
    expect(fs.readdirSync(dir).sort()).toEqual(['moinmorni.db', 'moinmorni.db-wal']);
    expect(adoptInterimDatabase(file)).toBe(false);
  });

  test('ohne Datenbank unter dem Zwischen-Namen bleibt alles, wie es ist', () => {
    const dir = tmp();
    const file = path.join(dir, 'moinmorni.db');
    fs.writeFileSync(file, 'daten');
    expect(adoptInterimDatabase(file)).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('daten');
  });

  test('Netzwerk und Server-Namen im Motor', () => {
    expect(isOurNetwork({ name: 'MoinMorni' })).toBe(true);
    expect(isOurNetwork({ name: INTERIM_TITLE })).toBe(true);
    expect(isOurNetwork({ name: 'Freunde' })).toBe(false);
    expect(renamedServer(`${INTERIM_TITLE} Lobby`, 'MoinMorni')).toBe('MoinMorni Lobby');
    expect(renamedServer(`${INTERIM_TITLE} Morni Party`, 'MoinMorni')).toBe('MoinMorni Morni Party');
    expect(renamedServer('MoinMorni Lobby', 'MoinMorni')).toBeNull();
    expect(renamedServer(`${INTERIM_TITLE}SMP`, 'MoinMorni')).toBeNull();
  });
});

describe('Rückbenennung mit echtem Motor', () => {
  let h: Harness | undefined;
  afterEach(async () => {
    await h?.cleanup();
    h = undefined;
  });

  /** So lag die Datenbank im Zwischenstand: unter dem Zwischen-Namen. */
  const asInterim = (dir: string) => (): void =>
    ['', '-wal', '-shm']
      .filter((part) => fs.existsSync(path.join(dir, `moinmorni.db${part}`)))
      .forEach((part) =>
        fs.renameSync(path.join(dir, `moinmorni.db${part}`), path.join(dir, `${INTERIM_ID}.db${part}`)),
      );

  test('Einrichtungs-Code und Owner-Konto aus dem Zwischenstand gelten nach dem Update weiter', async () => {
    h = await createHarness({ motorSetup: false });
    await h.mm.start();
    const code = fs.readFileSync(path.join(h.mmDir, 'setup-code'), 'utf8').trim();

    // Update vom Zwischenstand: MoinMorni startet mit der Datenbank unter dem Zwischen-Namen.
    await h.restart(asInterim(h.mmDir));
    expect(fs.existsSync(path.join(h.mmDir, `${INTERIM_ID}.db`))).toBe(false);
    expect(fs.existsSync(path.join(h.mmDir, 'moinmorni.db'))).toBe(true);
    expect(await (await fetch(`${h.mmUrl}/api/setup`)).json()).toEqual({ required: true });
    const setup = await fetch(`${h.mmUrl}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, username: 'philip', password: OWNER_PASSWORD, locale: 'de' }),
    });
    expect(setup.status).toBe(200);

    // Owner-Konto angelegt, dann noch einmal wie ein Update vom Zwischenstand: Rolle und Anmeldung bleiben.
    await h.restart(asInterim(h.mmDir));
    const { cookie } = await h.login('philip', OWNER_PASSWORD);
    const me = await fetch(`${h.mmUrl}/api/panel/me`, { headers: { cookie } });
    expect(await me.json()).toMatchObject({ username: 'philip', role: { id: 'owner' } });
  });
});
