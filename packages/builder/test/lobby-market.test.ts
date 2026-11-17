/* eslint-disable ts-patterns/no-magic-numbers -- positions in the lobby as the build has them */
import { SPORT_LOOKS } from '../src/lobby/sportstand.js';
import { describe, expect, it } from 'vitest';
import { GROUND } from '../src/nature.js';
import { pairs, range } from '../src/range.js';
import { LAUNCHPADS } from '../src/lobby/features.js';
import { MODES, modeIcon } from '../src/lobby/common.js';
import { buildLobby } from '../src/lobby/dorfplatz.js';
import { LOBBY_SPAWN_VIEW } from '../src/lobby/features.js';
import { collisionOf, spotKey, walkReport } from '../src/lobby/walk.js';
import { MARKET_ARCH_Z, RING_MODES, SCHLOSSMARKT } from '../src/lobby/schlossmarkt.js';

// Figur eines Modus im Bau: "summon mannequin 20.5 65 -30.5 {Tags:['mm_npc','mm_skin_x','mm_mode_npc','mm_mode_duels'],…"
// passt nicht: Schilder ("summon text_display …"). https://regex101.com/?flavor=javascript&regex=%5Esummon%20mannequin%20(%5B-%5Cd.%5D%2B)%20(%5B-%5Cd.%5D%2B)%20(%5B-%5Cd.%5D%2B)%20.*'mm_mode_(%5Ba-z%5D%2B)'&testString=summon%20mannequin%2020.5%2065%20-30.5%20%7BTags%3A%5B'mm_npc'%2C'mm_mode_npc'%2C'mm_mode_duels'%5D%7D
const MODE_FIGURE = /^summon mannequin ([-\d.]+) ([-\d.]+) ([-\d.]+) .*'mm_mode_([a-z]+)'/;

describe('Dorfmarkt und Schlossmarkt', () => {
  const { canvas } = buildLobby();
  const walk = walkReport(canvas, LOBBY_SPAWN_VIEW);
  const figures = canvas.extra
    .map((cmd) => MODE_FIGURE.exec(cmd))
    .filter((m): m is RegExpExecArray => m !== null && m[4] !== 'npc')
    .map((m) => ({ mode: m[4]!, x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) }));

  it('jeder Modus hat genau eine Figur zum Anklicken – die ersten sieben am Maibaum, die übrigen am Schlossmarkt', () => {
    // Wintersport und Sommerspiele stehen am Sport-Stand – ihre Figur setzt das Lobby-Plugin je nach Saison
    // (`sportstand.ts`), sie ist nicht im Bauplan.
    const sport: readonly string[] = SPORT_LOOKS;
    expect(figures.map((f) => f.mode).sort()).toEqual(
      MODES.map((m) => m.id)
        .filter((id) => !sport.includes(id))
        .sort(),
    );
    SPORT_LOOKS.forEach((look) => expect(modeIcon(look), look).not.toBe('compass'));
    MODES.filter((m) => !sport.includes(m.id)).forEach((mode, i) => {
      const f = figures.find((x) => x.mode === mode.id)!;
      const near = Math.hypot(f.x, f.z);
      if (i < RING_MODES) expect(near, mode.id).toBeLessThan(20);
      else
        expect(
          SCHLOSSMARKT.some((s) => s.mode === mode.id && Math.abs(s.x + 0.5 - f.x) < 1),
          mode.id,
        ).toBe(true);
      expect(f.y).toBe(GROUND + 1);
      expect(modeIcon(mode.id), mode.id).not.toBe('compass');
    });
  });

  it('Schlossmarkt: ebener Vorplatz (kein Hang-Gras), Launchpads und ihre Flugbahn frei', () => {
    pairs(range(-50, 50), range(-38, -23))
      .filter(([x]) => Math.abs(x) > 5)
      .forEach(([x, z]) => {
        const above = canvas.get(x, GROUND + 1, z);
        expect(above === 'grass_block' || above === 'dirt', `${x} ${z}: ${above}`).toBe(false);
      });
    // Die Launchpads schießen schräg zur Mitte: über den Vorplatz (bis zur Schlosstreppe) darf nichts im Weg stehen.
    LAUNCHPADS.forEach((pad) => {
      const [vx, vy0, vz] = pad.push;
      const flight = range(0, 6).reduce<Array<{ x: number; y: number; z: number; vy: number }>>(
        (acc) => {
          const last = acc[acc.length - 1]!;
          return [
            ...acc,
            { x: last.x + vx, y: last.y + last.vy, z: last.z + vz, vy: (last.vy - 0.08) * 0.98 },
          ];
        },
        [{ x: pad.x + 0.5, y: pad.y + 1, z: pad.z + 0.5, vy: vy0 }],
      );
      flight.slice(1).forEach(({ x, y, z }, t) =>
        [0, 1].forEach((dy) => {
          const b = canvas.get(Math.floor(x), Math.floor(y) + dy, Math.floor(z));
          expect(
            b === undefined || b === 'air',
            `Tick ${t}: ${b} bei ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`,
          ).toBe(true);
        }),
      );
    });
  });

  it('Launchpad-Flug wie im Spiel (Luftreibung, ganzer Körper) bis zur Landung frei – gelandet wird auf der Schlosstreppe', () => {
    const { map, reach } = walk;
    /** Steckt der Körper (0,6 breit, 1,8 hoch, Füße auf y) in einem Block? */
    const hits = (x: number, y: number, z: number): string | undefined =>
      pairs([x - 0.3, x + 0.29], [z - 0.3, z + 0.29])
        .flatMap(([bx, bz]) =>
          range(Math.floor(y), Math.floor(y + 1.8)).map((by) => {
            const block = canvas.get(Math.floor(bx), by, Math.floor(bz)) ?? (by <= GROUND ? 'dirt' : 'air');
            const shape = collisionOf(block);
            const inside = shape && y < by + shape[1] && y + 1.8 > by + shape[0];
            return inside ? `${block} bei ${Math.floor(bx)} ${by} ${Math.floor(bz)}` : undefined;
          }),
        )
        .find((b) => b !== undefined);
    LAUNCHPADS.forEach((pad) => {
      const fly = (
        t: number,
        p: { x: number; y: number; z: number; vx: number; vy: number; vz: number },
      ): typeof p & { t: number } => {
        const next = {
          x: p.x + p.vx,
          y: p.y + p.vy,
          z: p.z + p.vz,
          vx: p.vx * 0.91,
          vy: (p.vy - 0.08) * 0.98,
          vz: p.vz * 0.91,
        };
        const blocked = hits(next.x, next.y, next.z);
        // Fällt der Körper auf etwas, ist er gelandet (darf es nur von oben treffen)
        if (blocked && p.vy < 0 && !hits(next.x, p.y, next.z)) return { ...p, t };
        expect(
          blocked,
          `Flug von ${pad.x}: Tick ${t} ${next.x.toFixed(1)} ${next.y.toFixed(1)} ${next.z.toFixed(1)}`,
        ).toBeUndefined();
        return t > 80 ? { ...next, t } : fly(t + 1, next);
      };
      const [vx, vy, vz] = pad.push;
      const end = fly(1, { x: pad.x + 0.5, y: pad.y + 1, z: pad.z + 0.5, vx, vy, vz });
      const [x, z] = [Math.floor(end.x), Math.floor(end.z)];
      const landing = map
        .column(x, z)
        .filter((s) => s.h <= end.y * 16 + 1)
        .sort((a, b) => b.h - a.h)[0];
      expect(end.t, 'gelandet').toBeLessThan(60);
      expect(z, 'auf der Schlosstreppe').toBeLessThan(-34);
      expect(Math.abs(x), 'auf der Schlosstreppe').toBeLessThanOrEqual(5);
      expect(landing && reach.jumps.get(spotKey(x, z, landing.h)), 'Landeplatz zu Fuß erreichbar').toBe(0);
    });
  });

  it('zwischen den Ständen schwebt kein Brett mehr (Philip), kein Topf steht neben einer Figur', () => {
    const gaps = SCHLOSSMARKT.slice(0, -2).map((s) => s.x + Math.sign(s.x) * 4);
    expect(gaps.sort((a, b) => a - b)).toEqual([-38, -30, -22, 22, 30, 38]);
    gaps.forEach((x) =>
      range(-34, -31).forEach((z) => {
        const knee = canvas.get(x, GROUND + 1, z);
        expect(knee?.includes('trapdoor') ?? false, `${x} ${z}: ${knee}`).toBe(false);
      }),
    );
    // Neben jeder Figur des Schlossmarkts (auf der Theke links und rechts) kein Blumentopf vor dem Gesicht
    SCHLOSSMARKT.forEach((s) =>
      [s.x - 2, s.x + 2].forEach((x) => {
        const goods = canvas.get(x, GROUND + 2, -32);
        expect(goods?.startsWith('potted_') ?? false, `${s.mode} ${x}: ${goods}`).toBe(false);
      }),
    );
  });

  it('auch am Dorfmarkt steht kein Blumentopf direkt neben einer Figur (Waren 2 und 3 liegen neben ihr)', () => {
    // marketStall legt die Waren auf die Fässer bei u = 0, 1, 5, 6 – die Figur steht bei u = 3, neben ihr u = 1 und 5
    MODES.forEach((m) =>
      [m.goods[1], m.goods[2]].forEach((g) =>
        expect(g?.startsWith('potted_') ?? false, `${m.id}: ${g}`).toBe(false),
      ),
    );
  });

  it('Dorfleute, die herumlaufen, stehen frei – nicht in einer Bank, Mauer oder einem Brunnen', () => {
    // "summon mannequin 2.5 65 9.5 {Tags:['mm_lobby',…,'mm_walker','mm_route_dorfplatz'],…" – die Laufenden
    // https://regex101.com/?flavor=javascript&regex=%5Esummon%20mannequin%20(%5B-%5Cd.%5D%2B)%20(%5B-%5Cd.%5D%2B)%20(%5B-%5Cd.%5D%2B)%20.*'mm_walker'&testString=summon%20mannequin%202.5%2065%209.5%20%7BTags%3A%5B'mm_npc'%2C'mm_walker'%5D%7D
    const WALKER = /^summon mannequin ([-\d.]+) ([-\d.]+) ([-\d.]+) .*'mm_walker'/;
    const walkers = canvas.extra
      .map((cmd) => WALKER.exec(cmd))
      .filter((m): m is RegExpExecArray => m !== null);
    expect(walkers.length).toBeGreaterThanOrEqual(13);
    // Pflanzen ohne Kollision darf man durchqueren, sonst muss Luft sein (wie beim Laufen im Lobby-Plugin).
    const open = (b: string | undefined): boolean =>
      b === undefined || b === 'air' || /^(short_grass|fern|poppy|dandelion|\w+_tulip|cornflower)$/.test(b);
    walkers.forEach((m) => {
      const [x, y, z] = [Number(m[1]), Number(m[2]), Number(m[3])];
      // Körper ±0,3 Blöcke: alle vier Ecken frei, darunter fester Boden (kein Wasser)
      pairs([-0.3, 0.3], [-0.3, 0.3]).forEach(([dx, dz]) => {
        const [bx, bz] = [Math.floor(x + dx), Math.floor(z + dz)];
        const at = `${x} ${z}`;
        expect(open(canvas.get(bx, y, bz)), `${at}: ${canvas.get(bx, y, bz)}`).toBe(true);
        expect(open(canvas.get(bx, y + 1, bz)), `${at}: Kopf ${canvas.get(bx, y + 1, bz)}`).toBe(true);
        const ground = canvas.get(bx, y - 1, bz);
        expect(
          ground !== undefined && ground !== 'air' && !ground.startsWith('water'),
          `${at}: ${ground}`,
        ).toBe(true);
      });
    });
  });

  it('Marktbogen hängt Wimpel in den Farben der Stände über die Straße', () => {
    const banners = canvas.find((b) => b.endsWith(']') && b.includes('_wall_banner[facing=south]'));
    const arch = banners.filter(([, , z]) => z === MARKET_ARCH_Z + 1);
    expect(arch.length).toBe(6);
    expect(new Set(arch.map(([, , , b]) => b)).size).toBe(6);
  });
});
