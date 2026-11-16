/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, it } from 'vitest';
import { NETWORK_AREA, patchSchemaFor, textValid, timeOf } from '../src/index.js';

describe('Wartung im Einstellungs-Katalog', () => {
  it('Uhrzeit „Wartung bis“: wie man sie schreibt, leer geht immer', () => {
    expect(timeOf('22:30')).toBe('22:30');
    expect(timeOf('7.05')).toBe('07:05');
    expect(timeOf(' 9:00 ')).toBe('09:00');
    expect(timeOf('25:00')).toBeNull();
    expect(timeOf('22:3')).toBeNull();
    expect(timeOf('22 Uhr')).toBeNull();
    const def = { maxLength: 5, format: 'time' as const };
    expect(textValid(def, '')).toBe(true);
    expect(textValid(def, '23:59')).toBe(true);
    expect(textValid(def, 'bald')).toBe(false);
    expect(textValid({ maxLength: 5 }, 'bald')).toBe(true);
  });

  it('Wartung: an/aus, Text und Grund, bis, Wartungs-Lobby, automatisch zurück – alle auch als Spielbefehl', () => {
    const section = NETWORK_AREA.sections.find((s) => s.id === 'maintenance');
    const keys = section?.settings.map((s) => s.key);
    expect(keys).toEqual([
      'maintenance',
      'maintenanceMessage',
      'maintenanceUntil',
      'maintenanceLobby',
      'maintenanceReturn',
    ]);
    section?.settings.forEach((s) => expect(s.command, s.key).toMatch(/^\/wartung/));
    const schema = patchSchemaFor(NETWORK_AREA);
    expect(schema.safeParse({ maintenanceUntil: '22:30' }).success).toBe(true);
    expect(schema.safeParse({ maintenanceUntil: '99:99' }).success).toBe(false);
  });
});
