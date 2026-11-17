/**
 * Die Lobby prüfen: Bauplan mit allen Saison-Dekos durch die Bauplan-Prüfung (`pruefung.ts`). Mit Absicht frei in der
 * Luft steht nur der Bogen aus bunten Blöcken über dem Startplatz des Jump and Run (die Sprünge selbst zeigt das
 * Lobby-Plugin, sie stehen nicht im Bauplan).
 */
import type { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { checkDecorations, checkPlan, type Fund } from '../pruefung.js';
import { buildLobby } from './dorfplatz.js';
import { JUMP_AND_RUN } from './jumpandrun.js';
import { SEASONS, seasonCommands, type Season } from './season.js';

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
}

/** Prüft einen fertigen Bauplan der Lobby samt aller Saison-Dekos. */
export function checkLobbyCanvas(canvas: Canvas): LobbyCheck {
  const plan = checkPlan(canvas, { floatingAllowed: jumpHint, walkArea });
  const seasons = SEASONS.reduce(
    (all, s) => ({ ...all, [s]: checkDecorations(canvas, seasonCommands(s)) }),
    {} as Partial<Record<Season, readonly Fund[]>>,
  ) as Readonly<Record<Season, readonly Fund[]>>;
  return { plan, seasons };
}

/** Baut die Lobby und prüft sie. */
export function checkLobby(): LobbyCheck {
  return checkLobbyCanvas(buildLobby().canvas);
}
