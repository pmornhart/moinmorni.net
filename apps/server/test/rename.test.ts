import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { adoptOldDatabase, isOurNetwork, OLD_ID, OLD_TITLE, renamedServer } from '../src/lib/rename.js';

describe('Umbenennung in morni.net', () => {
  const dirs: string[] = [];
  const tmp = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-umzug-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  test('Datenbank unter dem früheren Namen wird übernommen, samt WAL; Reste der neuen fliegen raus', () => {
    const dir = tmp();
    const file = path.join(dir, 'morninet.db');
    const old = path.join(dir, `${OLD_ID}.db`);
    fs.writeFileSync(old, 'alt');
    fs.writeFileSync(`${old}-wal`, 'alt-wal');
    fs.writeFileSync(file, 'veraltet');
    fs.writeFileSync(`${file}-shm`, 'veraltet-shm');

    expect(adoptOldDatabase(file)).toBe(true);

    expect(fs.readFileSync(file, 'utf8')).toBe('alt');
    expect(fs.readFileSync(`${file}-wal`, 'utf8')).toBe('alt-wal');
    expect(fs.existsSync(`${file}-shm`)).toBe(false);
    expect(fs.readdirSync(dir).sort()).toEqual(['morninet.db', 'morninet.db-wal']);
    expect(adoptOldDatabase(file)).toBe(false);
  });

  test('ohne alte Datenbank bleibt alles, wie es ist', () => {
    const dir = tmp();
    const file = path.join(dir, 'morninet.db');
    fs.writeFileSync(file, 'neu');
    expect(adoptOldDatabase(file)).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('neu');
  });

  test('Netzwerk und Server-Namen im Motor', () => {
    expect(isOurNetwork({ name: 'morni.net' })).toBe(true);
    expect(isOurNetwork({ name: OLD_TITLE })).toBe(true);
    expect(isOurNetwork({ name: 'Freunde' })).toBe(false);
    expect(renamedServer(`${OLD_TITLE} Lobby`)).toBe('morni.net Lobby');
    expect(renamedServer(`${OLD_TITLE} Morni Party`)).toBe('morni.net Morni Party');
    expect(renamedServer('morni.net Lobby')).toBeNull();
    expect(renamedServer(`${OLD_TITLE}SMP`)).toBeNull();
  });
});
