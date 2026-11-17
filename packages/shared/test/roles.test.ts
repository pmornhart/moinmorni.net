import { describe, expect, test } from 'vitest';
import {
  alwaysIn,
  DEFAULT_ROLES,
  GAME_RIGHTS,
  mayAssign,
  higherRole,
  mayLiftFor,
  mayPunish,
  mayPunishPlayer,
  punishersOf,
  ROLE_IDS,
  roleSchema,
} from '../src/index.js';

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

describe('Strafen nur nach unten (mayPunishPlayer)', () => {
  /** Wer wen bestrafen darf – Zeile = wer straft, Spalte = wer bestraft wird (Reihenfolge wie ROLE_IDS). */
  const EXPECTED: Readonly<Record<string, readonly string[]>> = {
    owner: ['admin', 'moderator', 'supporter', 'builder', 'media', 'vip', 'player'],
    admin: ['moderator', 'supporter', 'builder', 'media', 'vip', 'player'],
    moderator: ['supporter', 'builder', 'media', 'vip', 'player'],
    supporter: ['builder', 'media', 'vip', 'player'],
    builder: ['media', 'vip', 'player'],
    media: ['vip', 'player'],
    vip: ['player'],
    player: [],
  };

  test.each(ROLE_IDS.flatMap((a) => ROLE_IDS.map((t) => [a, t] as const)))('%s gegen %s', (actor, target) => {
    expect(mayPunishPlayer(role(actor), role(target))).toBe(EXPECTED[actor]?.includes(target) ?? false);
  });

  test('den Owner bestraft niemand – auch kein anderer Owner, auch nicht mit verschobener Position', () => {
    expect(mayPunishPlayer(role('owner'), role('owner'))).toBe(false);
    expect(mayPunishPlayer({ id: 'chef', position: -1 }, role('owner'))).toBe(false);
    // Der Owner straft alle anderen, auch wenn Philip eine Rolle über ihn geschoben hätte.
    expect(mayPunishPlayer(role('owner'), { id: 'chef', position: -1 })).toBe(true);
  });

  test('wer jemanden so bestrafen darf: nur höhere Ränge mit dem Recht', () => {
    const names = (target: string, kind: Parameters<typeof punishersOf>[2]) =>
      punishersOf(DEFAULT_ROLES, role(target), kind).map((r) => r.id);
    expect(names('admin', 'jail')).toEqual(['owner']);
    expect(names('admin', 'mute')).toEqual(['owner']);
    expect(names('owner', 'warn')).toEqual([]);
    expect(names('moderator', 'ban')).toEqual(['owner', 'admin']);
    expect(names('supporter', 'mute')).toEqual(['owner', 'admin', 'moderator']);
    // Supporter verwarnen, aber nicht einsperren.
    expect(names('player', 'jail')).toEqual(['owner', 'admin', 'moderator']);
    expect(names('player', 'warn')).toEqual(['owner', 'admin', 'moderator', 'supporter']);
  });

  test('aufheben wie verhängen – nur der Owner hebt alles auf, auch alte Strafen auf einem Owner', () => {
    expect(mayLiftFor(role('owner'), role('owner'))).toBe(true);
    expect(mayLiftFor(role('admin'), role('owner'))).toBe(false);
    expect(mayLiftFor(role('moderator'), role('admin'))).toBe(false);
    expect(mayLiftFor(role('moderator'), role('supporter'))).toBe(true);
    expect(mayLiftFor(role('admin'), role('admin'))).toBe(false);
  });

  test('der höhere Rang zählt (eigener Rang oder Team-Konto)', () => {
    expect(higherRole(role('moderator'), role('admin')).id).toBe('admin');
    expect(higherRole(role('admin'), role('moderator')).id).toBe('admin');
    expect(higherRole(role('player'), undefined).id).toBe('player');
  });
});
