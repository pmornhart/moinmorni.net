/* eslint-disable ts-patterns/no-magic-numbers -- Koordinaten wie im Spiel */
import { describe, expect, it } from 'vitest';
import { buildLobby } from '../src/lobby/dorfplatz.js';
import { lobbyPack, SEASON_NAMESPACE } from '../src/lobby/datapack.js';
import { MODES } from '../src/lobby/common.js';
import { SCHLOSSMARKT } from '../src/lobby/schlossmarkt.js';
import { seasonPlan, SEASONS } from '../src/lobby/season.js';
import {
  inSportZone,
  SPORT_LOOKS,
  SPORT_STAND,
  sportPlan,
  sportShowCommands,
} from '../src/lobby/sportstand.js';
import { STALLS } from '../src/lobby/weihnachtsmarkt.js';
import { LOBBY_TAG } from '../src/village.js';

/** Wintersport und Sommerspiele teilen sich einen Stand am Schlossmarkt (Skihütte ↔ Bootshaus). */
describe('Sport-Stand', () => {
  const { canvas } = buildLobby();
  const plan = sportPlan(canvas);
  const [sx, sy, sz] = SPORT_STAND.sentinel;

  it('steht auf dem Platz von Wintersport, die Sommerspiele haben keinen eigenen Stand', () => {
    const slot = SCHLOSSMARKT.find((s) => s.mode === 'wintersport');
    expect(slot).toBeDefined();
    expect(SCHLOSSMARKT.some((s) => s.mode === 'sommerspiele')).toBe(false);
    expect(inSportZone(slot?.x ?? 0, 66, (slot?.z ?? 0) - 2)).toBe(true);
    expect(MODES.find((m) => m.id === 'sommerspiele')?.icon).toBe('sunflower');
    // Weihnachtsmarkt, Wiesn, Halloween hängen keinen Schmuck an den Sport-Stand
    expect(STALLS.some((s) => s.x === slot?.x && !s.ring)).toBe(false);
  });

  it('im Bauplan die Skihütte (Merker Packeis), Umbau setzt Sandstein und stellt genau zurück', () => {
    expect(canvas.get(sx, sy, sz)).toBe(SPORT_STAND.blocks.wintersport);
    expect(plan.blocks.get(sx, sy, sz)).toBe(SPORT_STAND.blocks.sommerspiele);
    expect(plan.restore.get(sx, sy, sz)).toBe(SPORT_STAND.blocks.wintersport);
    // Jede geänderte Stelle liegt im Stand und kommt genau so zurück, wie sie im Bauplan steht
    plan.blocks.each((x, y, z) => {
      expect(inSportZone(x, y, z), `${x} ${y} ${z}`).toBe(true);
      expect(plan.restore.get(x, y, z)).toBe(canvas.get(x, y, z) ?? 'air');
    });
    expect(plan.on.length).toBeGreaterThan(10);
    expect(plan.off.length).toBeGreaterThan(10);
  });

  it('keine Saison setzt Blöcke in den Stand', () => {
    SEASONS.forEach((season) => {
      const own = seasonPlan(season, canvas);
      own?.blocks.each((x, y, z) => expect(inSportZone(x, y, z), `${season} ${x} ${y} ${z}`).toBe(false));
    });
  });

  it('Figur, Schild und Deko je Modus: eigene Tags, keine Lobby-Tags, vorher wird aufgeräumt', () => {
    SPORT_LOOKS.forEach((look) => {
      const cmds = sportShowCommands(look);
      expect(cmds[0]).toMatch(/^kill @e\[tag=mm_sport,/);
      const figures = cmds.filter((c) => c.startsWith('summon mannequin'));
      expect(figures).toHaveLength(1);
      expect(figures[0]).toContain(`'mm_mode_${look}'`);
      expect(figures[0]).toContain('mm_sport_figure');
      cmds.slice(1).forEach((c) => {
        expect(c).toContain(`'mm_sport_${look}'`);
        expect(c).not.toContain(`'${LOBBY_TAG}'`);
      });
    });
  });

  it('die Funktionen liegen im Saison-Paket (das immer an bleibt)', () => {
    const files = lobbyPack().seasonFiles;
    const fn = (name: string): string | undefined =>
      files[`data/${SEASON_NAMESPACE}/function/${name}.mcfunction`];
    expect(fn(SPORT_STAND.functions.on)).toContain('sandstone');
    expect(fn(SPORT_STAND.functions.off)).toContain('packed_ice');
    expect(fn(SPORT_STAND.functions.show.wintersport)).toContain("'mm_mode_wintersport'");
    expect(fn(SPORT_STAND.functions.show.sommerspiele)).toContain("'mm_mode_sommerspiele'");
  });
}, 300_000);
