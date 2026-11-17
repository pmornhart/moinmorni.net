import { describe, expect, it } from 'vitest';
import { NETWORK_COMMANDS, networkCommand } from '../src/commands.js';

describe('Befehle: ein Name je Befehl', () => {
  it('hat deutsche Hauptnamen – die englischen gehen als Alias weiter', () => {
    const renamed: Record<string, string> = {
      fliegen: 'fly',
      sprachchat: 'voice',
      verwarnen: 'warn',
      stumm: 'mute',
      entstummen: 'unmute',
      sprachstumm: 'voicemute',
      sprachfrei: 'voiceunmute',
      entbannen: 'unban',
      jnr: 'jumpandrun',
    };
    for (const [main, old] of Object.entries(renamed)) {
      const c = NETWORK_COMMANDS.find((x) => x.name === main);
      expect(c?.aliases, main).toContain(old);
    }
  });

  it('nimmt keinen Namen doppelt (Hauptname oder Alias)', () => {
    const all = NETWORK_COMMANDS.flatMap((c) => [c.name, ...c.aliases]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('zeigt auf der deutschen Befehle-Seite den Hauptnamen', () => {
    for (const c of NETWORK_COMMANDS) {
      if (c.where === 'proxy') continue;
      for (const l of c.lines) expect(l.syntax.de.startsWith(`/${c.name}`), l.syntax.de).toBe(true);
    }
    expect(networkCommand('sprachchat').usage.de.startsWith('/sprachchat')).toBe(true);
  });
});
