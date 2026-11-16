import { describe, expect, test } from 'vitest';
import { alwaysIn, DEFAULT_ROLES, GAME_RIGHTS, mayAssign, mayPunish, ROLE_IDS, roleSchema } from '../src/index.js';

const role = (id: string) => {
  const found = DEFAULT_ROLES.find((r) => r.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('Rollen-Vorlage: Supporter, Spielmodi verwalten, immer hinein', () => {
  test('Supporter steht zwischen Moderator und Builder und passt zum Schema', () => {
    expect(ROLE_IDS.slice(ROLE_IDS.indexOf('moderator'), ROLE_IDS.indexOf('builder') + 1)).toEqual([
      'moderator',
      'supporter',
      'builder',
    ]);
    expect(DEFAULT_ROLES.map((r) => r.id)).toEqual([...ROLE_IDS]);
    DEFAULT_ROLES.forEach((r, i) => expect(r.position).toBe(i));
    expect(roleSchema.safeParse(role('supporter')).success).toBe(true);
  });

  test('Supporter hilft: verwarnen, stumm, hinreisen, zuschauen, ansehen – kein Bann, kein Gefängnis, kein Kick', () => {
    const supporter = role('supporter');
    expect(supporter).toMatchObject({ symbol: '✚', panel: ['overview', 'players', 'punishments'] });
    expect(supporter.game).toEqual(
      expect.arrayContaining(['warn', 'mute', 'teleport', 'spectate', 'inspect', 'voice-mute']),
    );
    ['ban', 'jail', 'kick', 'ranks', 'modes-admin', 'admin', 'creative'].forEach((r) =>
      expect(supporter.game).not.toContain(r),
    );
    // Weniger als der Moderator: alles, was er im Spiel darf, darf auch der Moderator.
    expect(supporter.game.every((r) => role('moderator').game.includes(r))).toBe(true);
    expect(supporter.discord).toEqual(['tickets', 'team-area', 'links']);
    // Die Strafen-Seite sieht er, aber jede Strafe prüft das eigene Recht wie im Spiel.
    expect(['warn', 'mute', 'voice'].every((k) => mayPunish(supporter, k as 'warn'))).toBe(true);
    expect(['ban', 'jail', 'kick'].some((k) => mayPunish(supporter, k as 'ban'))).toBe(false);
  });

  test('wer wen vergeben darf, ist mit dem Supporter gleich geblieben', () => {
    expect(mayAssign(DEFAULT_ROLES, 'admin', 'supporter')).toBe(true);
    expect(mayAssign(DEFAULT_ROLES, 'moderator', 'supporter')).toBe(true);
    expect(mayAssign(DEFAULT_ROLES, 'supporter', 'moderator')).toBe(false);
    expect(mayAssign(DEFAULT_ROLES, 'builder', 'supporter')).toBe(false);
    expect(mayAssign(DEFAULT_ROLES, 'moderator', 'builder')).toBe(true);
  });

  test('„Spielmodi verwalten“ haben Owner und Admin, „Alles“ nur der Owner', () => {
    expect(GAME_RIGHTS).toContain('modes-admin');
    expect(DEFAULT_ROLES.filter((r) => r.game.includes('modes-admin')).map((r) => r.id)).toEqual([
      'owner',
      'admin',
    ]);
    expect(DEFAULT_ROLES.filter((r) => r.game.includes('admin')).map((r) => r.id)).toEqual(['owner']);
  });

  test('immer hinein (Wartung, nur auf Einladung): das ganze Team, nicht VIP und Spieler', () => {
    expect(DEFAULT_ROLES.filter(alwaysIn).map((r) => r.id)).toEqual([
      'owner',
      'admin',
      'moderator',
      'supporter',
      'builder',
      'media',
    ]);
  });
});
