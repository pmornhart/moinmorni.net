/**
 * Die Wartungs-Lobby als Datenpaket – gebaut wie die Lobby (`lobby/datapack.ts`): MoinMorni spielt es auf den Server
 * „wartung“ und ruft die Funktionen nacheinander auf (`prepare` → `clean` → `part/000` … → `finish`). Gleicher Plan =
 * gleiche `version`; ändert sich der Plan, baut der Server neu.
 */
import { newDekoModels } from '../lobby/buendel.js';
import crypto from 'node:crypto';
import { BUILD_PLACEHOLDER, BUILD_TAG_PREFIX, LOBBY_TAG } from '../lobby-tags.js';
import {
  clearCommands,
  forceloadCommands,
  LOBBY_RULES,
  partName,
  summonOnce,
  type LobbyPack,
} from '../lobby/datapack.js';
import { buildWartung, WARTUNG_BORDER, WARTUNG_POINTS, WARTUNG_RADIUS } from './werkstatt.js';

export const WARTUNG_NAMESPACE = 'moinmorni_wartung';
export const WARTUNG_PACK_DIR = 'moinmorni-wartung';
/** So viele Befehle pro Funktion (ein Aufruf läuft in einem Tick). */
const PART_SIZE = 3000;
/** Beim Bauen 4 × 4 Stücke pro forceload-Befehl. */
const LOAD_SPAN = 4;
/** Prüfpunkte „geladen?“ – innerhalb der festgehaltenen Fläche. */
const EDGE = 64;
const DATA_PACK_FORMAT = 48;
const DATA_PACK_FORMAT_MAX = 999;
const VERSION_LENGTH = 16;
const ENTITY_REACH = 120;
const MIDDAY = 6000;
const JSON_INDENT = 2;
/** Tiere, die Minecraft beim Erzeugen einer Welt mit Wiese setzt. */
const PASTURE_ANIMALS = [
  'sheep',
  'cow',
  'pig',
  'chicken',
  'rabbit',
  'horse',
  'donkey',
  'llama',
  'goat',
] as const;

let cached: LobbyPack | null = null;

/** Das Datenpaket der Wartungs-Lobby (einmal berechnet). */
export function wartungPack(): LobbyPack {
  if (cached) return cached;
  const { canvas } = buildWartung();
  const body = [...clearCommands(0, 0, WARTUNG_RADIUS), ...canvas.commands().map(summonOnce)];
  const parts = Array.from({ length: Math.ceil(body.length / PART_SIZE) }, (_, i) =>
    body.slice(i * PART_SIZE, (i + 1) * PART_SIZE),
  );
  const { spawn } = WARTUNG_POINTS;
  const prepare = ['# MoinMorni: Datenpaket der Wartungs-Lobby ist geladen'];
  const clean = [`kill @e[type=!player,x=0,y=64,z=0,distance=..${ENTITY_REACH}]`];
  const finish = [
    `kill @e[type=item,x=0,y=64,z=0,distance=..${ENTITY_REACH}]`,
    // Beim Erzeugen der flachen Welt entstehen Tiere – die Alm bleibt ohne (danach spawnt nichts mehr).
    ...PASTURE_ANIMALS.map((type) => `kill @e[type=${type}]`),
    // Ohne Blickrichtung: 26.x will dort zwei Werte, ältere einen – die Blickrichtung setzt das Plugin beim Ankommen.
    `setworldspawn ${Math.floor(spawn.x)} ${spawn.y} ${Math.floor(spawn.z)}`,
    ...Object.entries(LOBBY_RULES).map(([rule, value]) => `gamerule ${rule} ${value}`),
    `time set ${MIDDAY}`,
    'weather clear',
    'difficulty peaceful',
    'worldborder center 0 0',
    `worldborder set ${WARTUNG_BORDER}`,
  ];
  const meta = {
    pack: {
      description: 'MoinMorni – Wartungs-Lobby (baut sich beim Einrichten selbst)',
      pack_format: DATA_PACK_FORMAT,
      supported_formats: { min_inclusive: DATA_PACK_FORMAT, max_inclusive: DATA_PACK_FORMAT_MAX },
      min_format: DATA_PACK_FORMAT,
      max_format: DATA_PACK_FORMAT_MAX,
    },
  };
  const fn = (name: string): string => `data/${WARTUNG_NAMESPACE}/function/${name}.mcfunction`;
  const files: Record<string, string> = {
    'pack.mcmeta': `${JSON.stringify(meta, null, JSON_INDENT)}\n`,
    [fn('prepare')]: `${prepare.join('\n')}\n`,
    [fn('clean')]: `${clean.join('\n')}\n`,
    [fn('finish')]: `${finish.join('\n')}\n`,
    ...Object.fromEntries(parts.map((part, i) => [fn(partName(i)), `${part.join('\n')}\n`])),
  };
  const hash = crypto.createHash('sha256');
  Object.keys(files)
    .sort()
    .forEach((k) => hash.update(k).update(files[k] ?? ''));
  const version = hash.digest('hex').slice(0, VERSION_LENGTH);
  const build = `${BUILD_TAG_PREFIX}${version}`;
  const stamped = Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, v.replaceAll(BUILD_PLACEHOLDER, build)]),
  );
  stamped[fn('finish')] += `kill @e[tag=${LOBBY_TAG},tag=!${build}]\n`;
  cached = {
    version,
    files: stamped,
    parts: parts.length,
    load: forceloadCommands(0, 0, 'add', WARTUNG_RADIUS, LOAD_SPAN),
    unload: forceloadCommands(0, 0, 'remove', WARTUNG_RADIUS),
    seasonFiles: {},
    // Die Wartungs-Lobby hat keine Saison-Deko.
    seasonSteps: { none: [], wiesn: [], winter: [], easter: [], halloween: [] },
    seasonLoad: [],
    seasonUnload: [],
    deko: newDekoModels(),
    namespace: WARTUNG_NAMESPACE,
    packDir: WARTUNG_PACK_DIR,
    edge: EDGE,
  };
  return cached;
}
