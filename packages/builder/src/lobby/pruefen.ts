/**
 * Die Lobby prüfen: Bauplan mit allen Saison-Dekos durch die Bauplan-Prüfung (`pruefung.ts`). Mit Absicht frei in der
 * Luft steht nur der Parkour (seine Sprünge und das Zielbanner).
 */
import type { Canvas } from '../canvas.js';
import { GROUND } from '../nature.js';
import { checkDecorations, checkPlan, type Fund } from '../pruefung.js';
import { buildLobby } from './dorfplatz.js';
import { PARKOUR } from './features.js';
import { SEASONS, seasonCommands, type Season } from './season.js';

/** Wo man in der Lobby herumläuft: das Dorf mit den Wiesen ringsum und der Schlossberg samt Schloss. */
const WALK = { radius: 125, castle: { x: 45, z1: -170, z2: -80 }, top: GROUND + 40 } as const;
function walkArea(x: number, y: number, z: number): boolean {
  if (y > WALK.top) return false;
  const castle = Math.abs(x) <= WALK.castle.x && z >= WALK.castle.z1 && z <= WALK.castle.z2;
  return castle || Math.hypot(x, z) <= WALK.radius;
}

/** Parkour-Sprünge (und das Banner auf dem Ziel) schweben mit Absicht. */
function parkourSpot(x: number, y: number, z: number): boolean {
  return PARKOUR.blocks.some((b) => b.x === x && b.z === z && (b.y === y || b.y + 1 === y));
}

export interface LobbyCheck {
  /** Funde im Bauplan (Blöcke, Bäume, Figuren). */
  readonly plan: readonly Fund[];
  /** Funde je Saison-Deko. */
  readonly seasons: Readonly<Record<Season, readonly Fund[]>>;
}

/** Prüft einen fertigen Bauplan der Lobby samt aller Saison-Dekos. */
export function checkLobbyCanvas(canvas: Canvas): LobbyCheck {
  const plan = checkPlan(canvas, { floatingAllowed: parkourSpot, walkArea });
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
