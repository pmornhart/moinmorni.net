/* eslint-disable ts-patterns/no-magic-numbers -- kleine Baupläne für die Prüfung, Koordinaten wie im Spiel */
import { describe, expect, it } from 'vitest';
import { Canvas } from '../src/canvas.js';
import { checkDecorations, checkPlan, describe as lines, type Fund } from '../src/pruefung.js';
import { fitConnections } from '../src/verbindungen.js';
import { roundTree } from '../src/nature.js';
import { checkLobby } from '../src/lobby/pruefen.js';
import { SEASONS } from '../src/lobby/season.js';
import { OFFEN_BAUPLAN, OFFEN_SAISON } from './pruefung-offen.js';

const key = (f: Fund): string => `${f.art} ${f.x} ${f.y} ${f.z} ${f.text}`;
/** Ein kleiner Plan auf der flachen Grundwelt (Gras auf 64). */
const plan = (draw: (c: Canvas) => void): Fund[] => {
  const c = new Canvas();
  draw(c);
  return checkPlan(c);
};
const kinds = (funde: readonly Fund[]): string[] => funde.map((f) => f.art);

describe('Bauplan-Prüfung: was sie findet', () => {
  it('Laterne: hängend ohne Block darüber, unter einer waagerechten Kette, stehend ohne Boden', () => {
    expect(kinds(plan((c) => c.set(0, 70, 0, 'lantern[hanging=true]')))).toContain('ohne-halt');
    const underChain = plan((c) => {
      c.set(-1, 71, 0, 'stone');
      c.set(0, 71, 0, 'iron_chain[axis=x]');
      c.set(1, 71, 0, 'stone');
      c.set(0, 70, 0, 'lantern[hanging=true]');
    });
    expect(lines(underChain).join('\n')).toContain('hängt in der Luft');
    expect(kinds(plan((c) => c.set(0, 66, 0, 'lantern')))).toContain('ohne-halt');
  });

  it('Laterne an Zaun, Kette oder Block: in Ordnung', () => {
    const ok = plan((c) => {
      c.set(0, 65, 0, 'oak_fence');
      c.set(0, 66, 0, 'lantern');
      c.set(3, 65, 0, 'stone');
      c.set(3, 66, 0, 'stone');
      c.set(3, 67, 0, 'stone');
      c.set(4, 67, 0, 'stone');
      c.set(4, 66, 0, 'iron_chain[axis=y]');
      c.set(4, 65, 0, 'lantern[hanging=true]');
    });
    expect(lines(ok)).toEqual([]);
  });

  it('Topf, Kerze und Teppich in der Luft, Kette ohne Ende, Wasser läuft aus', () => {
    expect(kinds(plan((c) => c.set(0, 67, 0, 'potted_poppy')))).toContain('ohne-halt');
    expect(kinds(plan((c) => c.set(0, 67, 0, 'candle[candles=1,lit=true]')))).toContain('ohne-halt');
    expect(kinds(plan((c) => c.set(0, 67, 0, 'red_carpet')))).toContain('ohne-halt');
    expect(kinds(plan((c) => c.set(0, 70, 0, 'iron_chain[axis=y]')))).toContain('kette');
    expect(kinds(plan((c) => c.set(0, 65, 0, 'water')))).toContain('wasser');
  });

  it('offene Falltür (Fensterladen): liegt an der Wand nur, wenn sie von der Wand weg zeigt', () => {
    const shutter = (facing: string): Fund[] =>
      plan((c) => {
        c.fill(0, 65, 0, 0, 68, 0, 'stone');
        c.set(0, 66, 1, `spruce_trapdoor[facing=${facing},open=true,half=top]`);
      });
    expect(lines(shutter('south'))).toEqual([]);
    expect(lines(shutter('north')).join('\n')).toContain('schwebt vor der Wand');
  });

  it('Tür: ohne Rahmen, ohne Sturz, in eine Wand', () => {
    const door = (c: Canvas, x: number): void => {
      c.set(x, 65, 0, 'spruce_door[facing=north,half=lower]');
      c.set(x, 66, 0, 'spruce_door[facing=north,half=upper]');
    };
    expect(lines(plan((c) => door(c, 0))).join('\n')).toContain('Tür ohne Rahmen');
    const framed = plan((c) => {
      c.fill(-1, 65, 0, 1, 67, 0, 'stone');
      door(c, 0);
    });
    expect(lines(framed)).toEqual([]);
    const blocked = plan((c) => {
      c.fill(-1, 65, 0, 1, 67, 0, 'stone');
      c.fill(-1, 65, 1, 1, 66, 1, 'stone');
      door(c, 0);
    });
    expect(lines(blocked).join('\n')).toContain('Tür führt in eine Wand');
  });

  it('Baum: wächst in ein Haus, steht auf dem Weg; einzelner schwebender Block', () => {
    const intoHouse = plan((c) => {
      c.tagged('haus', () => c.fill(2, 65, -3, 6, 72, 3, 'stone_bricks'));
      roundTree(c, 0, 65, 0, { height: 8, radius: 3, rnd: () => 0.5 });
    });
    expect(lines(intoHouse).join('\n')).toContain('Baum wächst in stone_bricks');
    const onPath = plan((c) => {
      c.set(0, 64, 0, 'gravel');
      roundTree(c, 0, 65, 0, { height: 8, radius: 3, rnd: () => 0.5 });
    });
    expect(lines(onPath).join('\n')).toContain('Baum steht auf gravel');
    expect(kinds(plan((c) => c.set(0, 80, 0, 'stone')))).toContain('schwebt');
  });

  it('nackte Erde: an einer Stufe sichtbar, im verschlossenen Hohlraum nicht', () => {
    const walk = { walkArea: (): boolean => true };
    const step = new Canvas();
    step.set(0, 65, 0, 'dirt');
    step.set(0, 66, 0, 'grass_block');
    expect(lines(checkPlan(step, walk)).join('\n')).toContain(
      'nackte Erde, frei nach north, east, south, west',
    );
    // Hülle aus Stein, innen mit Erde ausgekleidet, ganz innen Luft: von außen sieht niemand die Erde.
    const hollow = new Canvas();
    hollow.fill(-3, 65, -3, 3, 70, 3, 'stone');
    hollow.fill(-2, 66, -2, 2, 69, 2, 'dirt');
    hollow.fill(-1, 67, -1, 1, 68, 1, 'air');
    expect(kinds(checkPlan(hollow, walk))).not.toContain('erde');
    // Ohne Gehbereich prüft sie keine Erde.
    expect(kinds(checkPlan(step))).not.toContain('erde');
  });

  it('Bau in Bau: ein Zaun quer durch ein Haus', () => {
    const funde = plan((c) => {
      c.tagged('haus', () => c.fill(0, 65, 0, 4, 68, 4, 'stone_bricks'));
      c.tagged('zaun', () => c.fill(2, 65, -2, 2, 65, 6, 'oak_fence[north=true,south=true]'));
    });
    expect(lines(funde).join('\n')).toContain('zaun überschreibt stone_bricks von haus');
  });

  it('Zäune: Arme ins Leere fallen weg, Ecken bekommen den fehlenden Arm (fitConnections)', () => {
    const c = new Canvas();
    c.set(0, 65, 0, 'oak_fence[east=true,west=true]');
    c.set(1, 65, 0, 'oak_fence[west=true]');
    c.set(0, 65, 1, 'oak_fence[north=true]');
    expect(kinds(checkPlan(c))).toContain('verbindung');
    fitConnections(c);
    expect(c.get(0, 65, 0)).toBe('oak_fence[north=false,east=true,south=true,west=false]');
    expect(lines(checkPlan(c))).toEqual([]);
  });

  it('Saison-Deko: Kette ohne Halt am Ende, Anzeige in einer Wand', () => {
    const c = new Canvas();
    c.fill(0, 65, 0, 0, 70, 0, 'stone');
    const flag = (x: number): string =>
      `summon block_display ${x} 69.79 0.5 {block_state:{Name:'minecraft:white_wool',id:'minecraft:white_wool'},transformation:{left_rotation:[0f,0f,0.38f,0.92f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[0.42f,0.42f,0.04f]}}`;
    const chain = [1.1, 2, 2.9, 3.8].map(flag);
    expect(lines(checkDecorations(c, chain)).join('\n')).toContain('Ende einer Kette hängt in der Luft');
    const inWall = `summon block_display 0.5 66 0.5 {block_state:{Name:'minecraft:pumpkin',id:'minecraft:pumpkin'},transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[0.6f,0.6f,0.6f]}}`;
    expect(lines(checkDecorations(c, [inWall])).join('\n')).toContain('steckt in stone');
  });
});

describe('Bauplan-Prüfung der ganzen Lobby', () => {
  const { plan: found, seasons } = checkLobby();

  it('Bauplan: keine neuen Funde (nur bekannte in Teilen, an denen gerade andere arbeiten)', () => {
    const known = new Set(OFFEN_BAUPLAN);
    expect(found.filter((f) => !known.has(key(f))).map(key)).toEqual([]);
  });

  it.each(SEASONS)('Saison-Deko „%s“: keine neuen Funde', (season) => {
    const known = new Set(OFFEN_SAISON[season] ?? []);
    expect(seasons[season].filter((f) => !known.has(key(f))).map(key)).toEqual([]);
  });
}, 300_000);
