/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODES,
  DEFAULT_ROLES,
  SETTING_AREAS,
  areaById,
  defaultsFor,
  mayAssign,
  modeSchema,
  patchSchemaFor,
  roleSchema,
  settingsOf,
} from '../src/index.js';

describe('Einstellungs-Katalog', () => {
  test('jede Einstellung hat einen gültigen Standardwert, Texte auf Deutsch und Englisch und einen eindeutigen Schlüssel', () => {
    SETTING_AREAS.forEach((area) => {
      const defs = settingsOf(area);
      expect(new Set(defs.map((d) => d.key)).size).toBe(defs.length);
      expect(patchSchemaFor(area).safeParse(defaultsFor(area)).success).toBe(true);
      defs.forEach((d) => {
        expect(d.label.de && d.label.en && d.help.de && d.help.en).toBeTruthy();
        expect(d.command?.startsWith('/') ?? true).toBe(true);
      });
    });
  });

  test('MorniCraft: jede Einstellung auch per Befehl, jeder Befehl eindeutig', () => {
    const area = areaById('mornicraft')!;
    const defs = settingsOf(area).filter((d) => d.key !== 'acceptMessage');
    expect(defs.length).toBeGreaterThan(40);
    defs.forEach((d) => expect(d.command?.startsWith('/mornicraft ')).toBe(true));
    // Ohne den Wert am Ende: zwei Einstellungen dürfen nicht dieselben Wörter haben.
    const words = defs.map((d) => (d.command ?? '').split(' ').slice(0, -1).join(' '));
    expect(new Set(words).size).toBe(words.length);
    expect(area.sections.map((s) => s.id)).toEqual(
      expect.arrayContaining(['teleports', 'limits', 'clans', 'dragon', 'dragon-attacks', 'world']),
    );
  });

  test('Änderungen werden geprüft: Grenzen, Auswahl, unbekannte Schlüssel', () => {
    const chat = patchSchemaFor(areaById('chat')!);
    expect(chat.safeParse({ slowMode: 5 }).success).toBe(true);
    expect(chat.safeParse({ slowMode: 600 }).success).toBe(false);
    expect(chat.safeParse({ gibtsnicht: true }).success).toBe(false);
    const lobby = patchSchemaFor(areaById('lobby')!);
    expect(lobby.safeParse({ season: 'wiesn' }).success).toBe(true);
    expect(lobby.safeParse({ season: 'sommer' }).success).toBe(false);
  });
});

describe('Rollen und Modi', () => {
  test('Vorlage und Modi passen zu ihren Schemas', () => {
    DEFAULT_ROLES.forEach((r) => expect(roleSchema.safeParse(r).success).toBe(true));
    DEFAULT_MODES.forEach((m) => expect(modeSchema.safeParse(m).success).toBe(true));
    expect(DEFAULT_ROLES.filter((r) => r.fallback).map((r) => r.id)).toEqual(['player']);
  });

  test('niemand vergibt Ränge über dem eigenen; Owner, Admin und VIP vergibt nur der Owner', () => {
    expect(mayAssign(DEFAULT_ROLES, 'owner', 'admin')).toBe(true);
    expect(mayAssign(DEFAULT_ROLES, 'admin', 'admin')).toBe(false);
    expect(mayAssign(DEFAULT_ROLES, 'admin', 'owner')).toBe(false);
    expect(mayAssign(DEFAULT_ROLES, 'admin', 'moderator')).toBe(true);
    expect(mayAssign(DEFAULT_ROLES, 'admin', 'vip')).toBe(false); // VIP vergibt nur der Owner
    expect(mayAssign(DEFAULT_ROLES, 'owner', 'vip')).toBe(true);
    expect(mayAssign(DEFAULT_ROLES, 'moderator', 'vip')).toBe(false);
    expect(mayAssign(DEFAULT_ROLES, 'moderator', 'media')).toBe(true);
    expect(mayAssign(DEFAULT_ROLES, 'moderator', 'moderator')).toBe(false);
    expect(mayAssign(DEFAULT_ROLES, 'vip', 'player')).toBe(true);
  });
});
