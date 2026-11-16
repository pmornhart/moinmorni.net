/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODES,
  MODE_SETTING_AREAS,
  DEFAULT_ROLES,
  SETTING_AREAS,
  areaById,
  defaultsFor,
  mayAssign,
  modeSchema,
  patchSchemaFor,
  modeAreaOf,
  onStep,
  roleSchema,
  settingsOf,
} from '../src/index.js';

// Pfad wie im Netzwerk-Plugin geprüft: nur a-z 0-9 . _ -, keine leeren Teile.
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-z0-9_-%5D%2B(%5C.%5Ba-z0-9_-%5D%2B)*%24&testString=ankauf.stufen.1.prozent
const CONFIG_PATH = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/;
// Plugin-Name aus der plugin.yml: "MorniDuels".
// https://regex101.com/?flavor=javascript&regex=%5E%5BA-Za-z0-9_-%5D%7B1%2C64%7D%24&testString=MorniSMP
const PLUGIN_NAME = /^[A-Za-z0-9_-]{1,64}$/;
// Platzhalter im Befehl ohne Leerzeichen: "<sekunden>", "<zufall|fest>".
// https://regex101.com/?flavor=javascript&regex=%3C%5B%5E%3E%5D*%5Cs%5B%5E%3E%5D*%3E&testString=%3Cticks%20(20)%3E
const SPACE_IN_PLACEHOLDER = /<[^>]*\s[^>]*>/;

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

describe('Einstellungen der Spielmodi', () => {
  test('jeder Spielmodus hat einen Bereich, jede Einstellung einen Pfad, einen Befehl und Texte', () => {
    const modes = DEFAULT_MODES.filter((m) => m.id !== 'mornicraft').map((m) => m.id);
    expect(MODE_SETTING_AREAS.map((a) => a.mode?.id).sort()).toEqual([...modes].sort());
    MODE_SETTING_AREAS.forEach((area) => {
      expect(modeAreaOf(area.mode?.id ?? '')).toBe(area);
      expect(area.panel).toBe('modes');
      expect(area.mode?.plugin).toMatch(PLUGIN_NAME);
      const defs = settingsOf(area);
      const root = defs[0]?.command?.split(' ')[0] ?? '';
      defs.forEach((d) => {
        expect(d.config?.path, `${area.id}.${d.key}`).toMatch(CONFIG_PATH);
        expect(d.label.de && d.label.en && d.help.de && d.help.en).toBeTruthy();
        expect(d.command?.startsWith(`${root} `), d.key).toBe(true);
        expect(d.command, d.key).not.toMatch(SPACE_IN_PLACEHOLDER);
        if (d.config?.member) expect(d.type).toBe('boolean');
        if (d.type === 'number') {
          expect(d.default).toBeGreaterThanOrEqual(d.min);
          expect(d.default).toBeLessThanOrEqual(d.max);
          expect(onStep(d.default, d.step)).toBe(true);
        }
      });
      // Ohne den Wert am Ende: kein Befehl doppelt, kein Pfad doppelt (außer Auswahl-Listen).
      const words = defs.map((d) => (d.command ?? '').split(' ').slice(0, -1).join(' '));
      expect(new Set(words).size).toBe(words.length);
      const paths = defs.filter((d) => !d.config?.member).map((d) => d.config?.path);
      expect(new Set(paths).size).toBe(paths.length);
    });
    // Befehls-Wurzeln eindeutig über alle Modi.
    const roots = MODE_SETTING_AREAS.map((a) => settingsOf(a)[0]?.command?.split(' ')[0]);
    expect(new Set(roots).size).toBe(roots.length);
  });

  test('Kommazahlen nur auf dem Raster, ganze Zahlen ohne Schrittweite', () => {
    const party = patchSchemaFor(areaById('party')!);
    expect(party.safeParse({ miniFactor: 0.3 }).success).toBe(true);
    expect(party.safeParse({ miniFactor: 0.35 }).success).toBe(false);
    expect(party.safeParse({ tables: 2.5 }).success).toBe(false);
    expect(party.safeParse({ miniKuhglocke: false }).success).toBe(true);
    const smp = patchSchemaFor(areaById('smp')!);
    expect(smp.safeParse({ priceBamboo: 0.05, auctionFee: 2.5 }).success).toBe(true);
    expect(smp.safeParse({ priceBamboo: 0.055 }).success).toBe(false);
    expect(onStep(0.1 + 0.2, 0.1)).toBe(true);
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
