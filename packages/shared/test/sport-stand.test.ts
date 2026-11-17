/* eslint-disable ts-patterns/no-magic-numbers -- months */
import { describe, expect, test } from 'vitest';
import {
  inSeason,
  modePause,
  modesNow,
  monthIn,
  sportModeByMonth,
  sportReplacedBy,
  sportStand,
} from '../src/index.js';

/** Wintersport und Sommerspiele teilen sich einen Stand am Schlossmarkt: es steht dort, wer gerade Saison hat. */
describe('Sport-Stand', () => {
  const open = { hasServer: true, pause: null };
  test('Kalender: Dezember bis März Wintersport, April bis November Sommerspiele – immer genau einer', () => {
    const winter = [12, 1, 2, 3];
    Array.from({ length: 12 }, (_, i) => i + 1).forEach((month) =>
      expect(sportModeByMonth(month)).toBe(winter.includes(month) ? 'wintersport' : 'sommerspiele'),
    );
    expect(inSeason(1, 12, 3)).toBe(true);
    expect(inSeason(4, 12, 3)).toBe(false);
    expect(inSeason(11, 4, 11)).toBe(true);
  });

  test('wer Saison-Pause meldet, steht nicht da; fest eingestellt geht vor', () => {
    const summerBreak = { hasServer: true, pause: 'summer' as const };
    const winterBreak = { hasServer: true, pause: 'winter' as const };
    expect(sportStand('auto', { wintersport: summerBreak, sommerspiele: open }, 1)).toBe('sommerspiele');
    expect(sportStand('auto', { wintersport: open, sommerspiele: winterBreak }, 7)).toBe('wintersport');
    // Beide offen (Wintersport „das ganze Jahr“) oder beide zu: der Kalender
    expect(sportStand('auto', { wintersport: open, sommerspiele: open }, 7)).toBe('sommerspiele');
    expect(sportStand('auto', { wintersport: summerBreak, sommerspiele: winterBreak }, 2)).toBe(
      'wintersport',
    );
    expect(sportStand('wintersport', { wintersport: summerBreak, sommerspiele: open }, 7)).toBe(
      'wintersport',
    );
    expect(sportStand('sommerspiele', { wintersport: open, sommerspiele: winterBreak }, 1)).toBe(
      'sommerspiele',
    );
  });

  test('ohne Server (noch kein Release) steht der andere da', () => {
    const none = { hasServer: false, pause: null };
    expect(sportStand('auto', { wintersport: open, sommerspiele: none }, 7)).toBe('wintersport');
    expect(sportStand('auto', { wintersport: none, sommerspiele: open }, 1)).toBe('sommerspiele');
    expect(sportStand('auto', { wintersport: open, sommerspiele: undefined }, 7)).toBe('wintersport');
  });

  test('Winterpause der Sommerspiele, Sommerpause von Wintersport, sonst geschlossen', () => {
    const at = (id: string) => ({ id, state: 'on' as const, server: id, awake: true, phase: 'closed' });
    expect(modePause(at('wintersport'))).toBe('summer');
    expect(modePause(at('sommerspiele'))).toBe('winter');
    expect(modePause(at('duels'))).toBe('closed');
  });

  test('Monat in der Zeitzone des Netzwerks (Silvester in Berlin ist schon Januar)', () => {
    expect(monthIn('Europe/Berlin', Date.UTC(2026, 11, 31, 23, 30))).toBe(1);
    expect(monthIn('UTC', Date.UTC(2026, 11, 31, 23, 30))).toBe(12);
  });

  test('ein Platz für beide: der andere Sport-Modus ist ersetzt, alle anderen Modi bleiben', () => {
    expect(sportReplacedBy('wintersport', 'sommerspiele')).toBe('sommerspiele');
    expect(sportReplacedBy('sommerspiele', 'wintersport')).toBe('wintersport');
    expect(sportReplacedBy('sommerspiele', 'sommerspiele')).toBeNull();
    expect(sportReplacedBy('duels', 'sommerspiele')).toBeNull();
    // Nichts bekannt (ältere Antwort ohne `sport`): alle zeigen
    expect(sportReplacedBy('wintersport', undefined)).toBeNull();
    const all = [{ id: 'duels' }, { id: 'wintersport' }, { id: 'angelkoenig' }, { id: 'sommerspiele' }];
    expect(modesNow(all, 'sommerspiele').map((m) => m.id)).toEqual(['duels', 'angelkoenig', 'sommerspiele']);
    expect(modesNow(all, 'wintersport').map((m) => m.id)).toEqual(['duels', 'wintersport', 'angelkoenig']);
    expect(modesNow(all, null)).toHaveLength(all.length);
  });
});
