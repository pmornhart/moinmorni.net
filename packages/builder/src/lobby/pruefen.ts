/**
 * Die Lobby prüfen: Bauplan mit allen Saison-Dekos durch die Bauplan-Prüfung (`pruefung.ts`) – bei Saisons mit Bauten
 * (Winter, Wiesn …) auch ihre Blöcke, so wie sie über dem Bauplan stehen. Mit Absicht frei in der Luft steht nur der
 * Bogen aus bunten Blöcken über dem Startplatz des Jump and Run (die Sprünge selbst zeigt das Lobby-Plugin, sie stehen
 * nicht im Bauplan).
 */
import { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { checkDecorations, checkPlan, worldOf, type Fund, type World } from '../pruefung.js';
import { buildLobby } from './dorfplatz.js';
import { JUMP_AND_RUN } from './jumpandrun.js';
import { SEASONS, seasonCommands, seasonPlan, type Season } from './season.js';
import { SPORT_LOOKS, sportEntities, sportPlan, type SportLook } from './sportstand.js';

/** Wo man in der Lobby herumläuft: das Dorf mit den Wiesen ringsum und der Schlossberg samt Schloss. */
const WALK = { radius: 125, castle: { x: 45, z1: -170, z2: -80 }, top: GROUND + 40 } as const;
function walkArea(x: number, y: number, z: number): boolean {
  if (y > WALK.top) return false;
  const castle = Math.abs(x) <= WALK.castle.x && z >= WALK.castle.z1 && z <= WALK.castle.z2;
  return castle || Math.hypot(x, z) <= WALK.radius;
}

/** Bogen über dem Startplatz des Jump and Run: ab 10 Blöcke über dem Boden, höchstens 4 Blöcke neben der Mitte. */
const JUMP_HINT = { above: 10, radius: 4 } as const;
function jumpHint(x: number, y: number, z: number): boolean {
  const { start } = JUMP_AND_RUN;
  return y >= start.y + JUMP_HINT.above && Math.hypot(x - start.x, z - start.z) <= JUMP_HINT.radius;
}

export interface LobbyCheck {
  /** Funde im Bauplan (Blöcke, Bäume, Figuren). */
  readonly plan: readonly Fund[];
  /** Funde je Saison-Deko. */
  readonly seasons: Readonly<Record<Season, readonly Fund[]>>;
  /** Funde je Look des Sport-Stands (Skihütte bzw. Bootshaus samt Figur und Deko). */
  readonly sport: Readonly<Record<SportLook, readonly Fund[]>>;
}

/**
 * Die Welt, in der die Deko einer Saison steht: Saisons mit Bauten setzen auch Blöcke (Winter: Schnee, Christbaum,
 * Buden, Krippe; Wiesn: Karussell, Riesenrad, Festzelt-Eingang …) – ihre Anzeigen hängen und stehen daran.
 */
function seasonWorld(canvas: Canvas, season: Season): World {
  const base = worldOf(canvas);
  const plan = seasonPlan(season, canvas);
  if (!plan) return base;
  return (x, y, z) => plan.blocks.get(x, y, z) ?? base(x, y, z);
}

/** Bauplan der Lobby mit den Blöcken einer Saison darüber (Herkunft der Blöcke bleibt). */
function withSeason(canvas: Canvas, blocks: Canvas): Canvas {
  const merged = new Canvas();
  canvas.each((x, y, z, b) => {
    const origin = canvas.originAt(x, y, z);
    if (origin) merged.tagged(origin, () => merged.set(x, y, z, b));
    else merged.set(x, y, z, b);
  });
  // Ein Saison-Block behält seine Herkunft (Eierbaum: Baum), sonst die der Stelle (Blüten an einem Baum bleiben Baum)
  blocks.each((x, y, z, b) => {
    const origin = blocks.originAt(x, y, z) || canvas.originAt(x, y, z);
    if (origin) merged.tagged(origin, () => merged.set(x, y, z, b));
    else merged.set(x, y, z, b);
  });
  return merged;
}

const fundKey = (f: Fund): string => `${f.art} ${f.x} ${f.y} ${f.z} ${f.text}`;

/** Prüft einen fertigen Bauplan der Lobby samt aller Saison-Dekos. */
export function checkLobbyCanvas(canvas: Canvas): LobbyCheck {
  const opts = { floatingAllowed: jumpHint, walkArea };
  const plan = checkPlan(canvas, opts);
  const known = new Set(plan.map(fundKey));
  /** Was die Blöcke einer Saison (Schnee, Karussell, Riesenrad …) an neuen Funden bringen. */
  const built = (s: Season): Fund[] => {
    const own = seasonPlan(s, canvas);
    return own ? checkPlan(withSeason(canvas, own.blocks), opts).filter((f) => !known.has(fundKey(f))) : [];
  };
  const seasons = SEASONS.reduce(
    (all, s) => ({
      ...all,
      [s]: [...built(s), ...checkDecorations(canvas, seasonCommands(s, canvas), seasonWorld(canvas, s))],
    }),
    {} as Partial<Record<Season, readonly Fund[]>>,
  ) as Readonly<Record<Season, readonly Fund[]>>;
  // Sport-Stand: Skihütte steht im Bauplan, das Bootshaus kommt darüber; je Look Figur, Schild und Deko
  const summer = sportPlan(canvas);
  const sport = SPORT_LOOKS.reduce(
    (all, look) => {
      const world = look === 'sommerspiele' ? withSeason(canvas, summer.blocks) : canvas;
      const withFigure = new Canvas();
      world.each((x, y, z, b) => {
        const origin = world.originAt(x, y, z);
        if (origin) withFigure.tagged(origin, () => withFigure.set(x, y, z, b));
        else withFigure.set(x, y, z, b);
      });
      const entities = sportEntities(look);
      withFigure.extra.push(...entities.filter((e) => e.includes('mannequin')));
      const blocks = checkPlan(withFigure, opts).filter((f) => !known.has(fundKey(f)));
      return { ...all, [look]: [...blocks, ...checkDecorations(world, entities, worldOf(world))] };
    },
    {} as Partial<Record<SportLook, readonly Fund[]>>,
  ) as Readonly<Record<SportLook, readonly Fund[]>>;
  return { plan, seasons, sport };
}

/** Baut die Lobby und prüft sie. */
export function checkLobby(): LobbyCheck {
  return checkLobbyCanvas(buildLobby().canvas);
}
