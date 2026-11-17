import { describe, expect, test } from 'vitest';
import { CHANGE_KINDS, countOfVersion, versionFromCount } from '../src/changelog.js';

/** Update 188 auf dem Branch = v1.8.8 (wie mm_version in update.sh). */
const UPDATE_188 = 188;
const UPDATE_9 = 9;
const UPDATE_10 = 10;
const UPDATE_1234 = 1234;

describe('Versionsnummern für „Was ist neu“', () => {
  test('eine Ziffer pro Stelle, wie mm_version', () => {
    expect(versionFromCount(UPDATE_188)).toBe('v1.8.8');
    expect(versionFromCount(UPDATE_9)).toBe('v0.0.9');
    expect(versionFromCount(UPDATE_10)).toBe('v0.1.0');
    expect(versionFromCount(UPDATE_1234)).toBe('v12.3.4');
  });

  test('zurück zur Zahl – auch aus der gebauten Version mit Commit, sonst null', () => {
    expect(countOfVersion('v1.8.8')).toBe(UPDATE_188);
    expect(countOfVersion('v1.8.8-0-g6d4f7e0')).toBe(UPDATE_188);
    expect(countOfVersion(versionFromCount(UPDATE_1234))).toBe(UPDATE_1234);
    expect(countOfVersion('dev')).toBeNull();
    expect(countOfVersion('1.8.8')).toBeNull();
    expect(countOfVersion('v1.18.8')).toBeNull();
  });

  test('Reihenfolge der Arten: Neu, Verbessert, Behoben, Entfernt, Weitere', () => {
    expect(CHANGE_KINDS).toEqual(['new', 'improved', 'fixed', 'removed', 'other']);
  });
});
