import type { Canvas } from '../canvas.js';
import { BRUNNEN_ERSATZ } from '../brunnen.js';
import { moebelCommand, moebelOf, moebelKey, VERSTECKT_KEY, type MoebelStueck } from '../furniture.js';
import { lobbyTags } from '../lobby-tags.js';

/**
 * Möbel und Brunnen-Ersatz beim Bauen der Lobby in Item-Anzeigen umwandeln (siehe `furniture.ts`, „ein Paket fürs
 * ganze Netzwerk“): Die Bauten setzen Platzhalter-Blöcke (Mangrove-Stufe, Birken-Halbstufe, braune Kerze,
 * Tuffziegel-Mauer, Endstab). Daraus wird hier
 *
 * - ein Möbelstück: unsichtbarer Block (`barrier`, bei Krügen nichts) und eine Anzeige mit dem eigenen Modell; ohne
 *   Paket zeigt die Anzeige die gewohnte Stufe/Halbstufe;
 * - ein Ersatzteil der Brunnen: unsichtbarer Block (Mauer: `barrier`, hält das Wasser im Becken; Fontäne: Licht wie
 *   der Endstab) und eine Anzeige, die nur ohne Paket zu sehen ist (mit Paket steht dort das Brunnen-Modell).
 *
 * Die Bauplan-Prüfung und die Tests sehen weiter die Platzhalter; umgewandelt wird nur für die Befehle. `restore`
 * stellt den Bauplan danach wieder her (die Saison-Pläne lesen ihn noch).
 */

export const MOEBEL_TAG = 'mm_moebel';
/** Licht, das der Endstab hatte (die Fontäne leuchtet ohne Paket wie vorher). */
const FONTAENE_LICHT = 'light[level=14]';

const ERSATZ_WALL = BRUNNEN_ERSATZ.rand;
const ERSATZ_ROD = BRUNNEN_ERSATZ.fontaene.split('[')[0] ?? 'end_rod';

/** Was aus einem Block wird – oder null (normaler Block). */
export function lobbyDisplayOf(block: string): MoebelStueck | null {
  const moebel = moebelOf(block);
  if (moebel) return moebel;
  const id = block.split('[')[0] ?? block;
  if (id === ERSATZ_WALL)
    return { name: 'ersatz', item: ERSATZ_WALL, turn: 0, block: 'barrier', key: VERSTECKT_KEY };
  if (id === ERSATZ_ROD)
    return { name: 'ersatz', item: ERSATZ_ROD, turn: 0, block: 'air', key: VERSTECKT_KEY };
  return null;
}

/** `custom_model_data`-Text der Anzeige: Möbel → eigenes Modell, Ersatz → „mit Paket unsichtbar“. */
export const displayKey = (s: MoebelStueck): string => s.key ?? moebelKey(s.name);

export interface LobbyDisplays {
  readonly commands: readonly string[];
  /** Wie viele Anzeigen (für Protokoll und Tests). */
  readonly count: number;
  /** Platzhalter-Blöcke wieder in den Bauplan setzen. */
  readonly restore: () => void;
}

/** Platzhalter im Bauplan durch unsichtbare Blöcke ersetzen und die Befehle für die Anzeigen liefern. */
export function toLobbyDisplays(c: Canvas): LobbyDisplays {
  const found = c.find((b) => lobbyDisplayOf(b) !== null);
  const tags = lobbyTags([MOEBEL_TAG]);
  const commands = found.map(([x, y, z, block]) => {
    const s = lobbyDisplayOf(block) as MoebelStueck;
    c.set(x, y, z, s.name === 'ersatz' && s.item === ERSATZ_ROD ? FONTAENE_LICHT : s.block);
    return moebelCommand(x, y, z, s, tags);
  });
  return {
    commands,
    count: commands.length,
    restore: () => found.forEach(([x, y, z, block]) => c.set(x, y, z, block)),
  };
}
