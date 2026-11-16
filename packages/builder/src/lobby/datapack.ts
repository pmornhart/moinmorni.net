/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: layer heights and the arrival point as the world needs them */
/**
 * Die Lobby als Datenpaket: Der Server spielt es auf den Lobby-Server und ruft die Funktionen nacheinander auf
 * (`prepare` = nur „geladen?“, `clean` → `part/000` … → `finish`). So baut sich die Lobby beim Einrichten selbst – ohne
 * RCON von außen.
 * Gleicher Bauplan = gleiche `version`; ändert sich der Plan, baut der Server neu.
 */
import crypto from 'node:crypto';
import { BUILD_PLACEHOLDER, BUILD_TAG_PREFIX, LOBBY_TAG } from '../village.js';
import { buildLobby, LOBBY } from './dorfplatz.js';
import { SEASONS, seasonCommands } from './season.js';

export const LOBBY_NAMESPACE = 'morninet_lobby';
export const LOBBY_PACK_DIR = 'morninet-lobby';
/** Kleines Paket, das immer an bleibt: je Saison eine Funktion (Deko an/aus), läuft nur auf Abruf. */
export const SEASON_NAMESPACE = 'morninet_season';
export const SEASON_PACK_DIR = 'morninet-lobby-season';
/** Bereich der Deko um die Mitte (Dorf, Gassen, Oberdorf). */
export const SEASON_RADIUS = 120;
/** So viele Befehle pro Funktion (ein Aufruf läuft in einem Tick; Minecraft erlaubt bis 65 536). */
const PART_SIZE = 3000;
const CHUNK = 16;
const FORCELOAD_SPAN = 12;
/** Beim Bauen 4×4 Stücke pro Befehl – jeder Befehl braucht so nur einen Augenblick. */
const LOAD_SPAN = 4;
const RADIUS = 216;
const SLICE = 128;
const TOP = 320;
const DATA_PACK_FORMAT = 48;
const DATA_PACK_FORMAT_MAX = 999;
const VERSION_LENGTH = 16;
const PART_DIGITS = 3;
/** Ankunftspunkt: am Dorfplatz, Blick zum Schloss. */
export const LOBBY_SPAWN = { x: 9, y: 65, z: 12 } as const;
/** Weltgrenze etwas innerhalb des Bergkranzes. */
const BORDER = 400;

export interface LobbyPack {
  readonly version: string;
  /** Pfade im Datenpaket-Ordner → Inhalt. */
  readonly files: Readonly<Record<string, string>>;
  readonly parts: number;
  /**
   * Welt-Stücke festhalten bzw. loslassen – einzeln aufrufen, nicht als Funktion: `forceload` lädt (und erzeugt)
   * die Stücke sofort, alles auf einmal ließe den Server minutenlang hängen.
   */
  readonly load: readonly string[];
  readonly unload: readonly string[];
  /** Saison-Paket (eigener Ordner, bleibt an): Pfade → Inhalt. */
  readonly seasonFiles: Readonly<Record<string, string>>;
  /** Stücke des Deko-Bereichs festhalten bzw. loslassen (für das Umschalten der Saison). */
  readonly seasonLoad: readonly string[];
  readonly seasonUnload: readonly string[];
}

/** forceload-Befehle in Stücken (Minecraft erlaubt höchstens 256 Chunks pro Befehl). */
export function forceloadCommands(
  cx: number,
  cz: number,
  action: 'add' | 'remove',
  radius = RADIUS,
  span = FORCELOAD_SPAN,
): string[] {
  const from = (v: number): number => Math.floor((v - radius) / CHUNK);
  const to = (v: number): number => Math.floor((v + radius) / CHUNK);
  const steps = (v: number): number[] =>
    Array.from({ length: to(v) - from(v) + 1 }, (_, i) => from(v) + i).filter((_, i) => i % span === 0);
  return steps(cx).flatMap((x) =>
    steps(cz).map((z) => {
      const x2 = Math.min(to(cx), x + span - 1);
      const z2 = Math.min(to(cz), z + span - 1);
      return `forceload ${action} ${x * CHUNK} ${z * CHUNK} ${x2 * CHUNK} ${z2 * CHUNK}`;
    }),
  );
}

/** Fläche auf die flache Grundwelt zurücksetzen (Stein, Erde, Gras auf 64, darüber Luft). */
export function clearCommands(cx: number, cz: number, radius = RADIUS): string[] {
  const chunks = (v: number): number[] => {
    const a = Math.floor((v - radius) / CHUNK);
    const b = Math.floor((v + radius) / CHUNK);
    return Array.from({ length: b - a + 1 }, (_, i) => (a + i) * CHUNK);
  };
  const end = CHUNK - 1;
  return chunks(cx).flatMap((x) =>
    chunks(cz).flatMap((z) => [
      `fill ${x} 48 ${z} ${x + end} 60 ${z + end} stone strict`,
      `fill ${x} 61 ${z} ${x + end} 63 ${z + end} dirt strict`,
      `fill ${x} 64 ${z} ${x + end} 64 ${z + end} grass_block strict`,
      `fill ${x} 65 ${z} ${x + end} ${64 + SLICE} ${z + end} air strict`,
      `fill ${x} ${65 + SLICE} ${z} ${x + end} ${64 + 2 * SLICE} ${z + end} air strict`,
      `fill ${x} ${65 + 2 * SLICE} ${z} ${x + end} ${TOP} ${z + end} air strict`,
    ]),
  );
}

/** Spielregeln der Lobby (Namen ab Minecraft 1.21.11, mit Paper 26.3 geprüft). */
const LOBBY_RULES: Readonly<Record<string, string>> = {
  advance_time: 'false',
  advance_weather: 'false',
  spawn_mobs: 'false',
  spawn_monsters: 'false',
  spawn_phantoms: 'false',
  respawn_radius: '0',
  fall_damage: 'false',
  fire_damage: 'false',
  drowning_damage: 'false',
  mob_griefing: 'false',
  fire_spread_radius_around_player: '0',
  spread_vines: 'false',
  random_tick_speed: '0',
};

/**
 * `summon TYP x y z {…}` → nur, wenn dort noch kein Wesen dieser Art steht. So darf morni.net ein Stück noch einmal
 * aufrufen, wenn der Server bei der ersten Antwort zu langsam war (Figuren erscheinen nicht doppelt).
 * Beispiel: `summon mannequin 1.5 65 2.5 {…}` → `execute positioned 1.5 65 2.5 unless entity
 * @e[type=mannequin,distance=..0.3] run summon mannequin ~ ~ ~ {…}`
 * Muster prüfen: https://regex101.com/?regex=%5Esummon%20(%5CS%2B)%20(%5CS%2B)%20(%5CS%2B)%20(%5CS%2B)(.*)%24
 */
const SUMMON = /^summon (\S+) (\S+) (\S+) (\S+)(.*)$/;
const SAME_SPOT = '..0.3';
export function summonOnce(line: string): string {
  const m = SUMMON.exec(line);
  if (!m) return line;
  const [, type, x, y, z, rest] = m;
  return `execute positioned ${x} ${y} ${z} unless entity @e[type=${type},distance=${SAME_SPOT}] run summon ${type} ~ ~ ~${rest}`;
}

let cached: LobbyPack | null = null;

/** Das Datenpaket der Lobby (einmal berechnet, dauert ein paar Sekunden). */
export function lobbyPack(): LobbyPack {
  if (cached) return cached;
  const { cx, cz } = LOBBY;
  const { canvas } = buildLobby();
  const body = [...clearCommands(cx, cz), ...canvas.commands().map(summonOnce)];
  const parts = Array.from({ length: Math.ceil(body.length / PART_SIZE) }, (_, i) =>
    body.slice(i * PART_SIZE, (i + 1) * PART_SIZE),
  );
  // `prepare` ändert nichts – morni.net ruft es so lange, bis das Paket geladen ist. Aufgeräumt wird erst in `clean`,
  // wenn alle Stücke geladen sind (sonst blieben alte Figuren in nicht geladenen Stücken stehen).
  const prepare = ['# morni.net: Lobby-Datenpaket ist geladen'];
  const clean = [`kill @e[type=!player,x=${cx},y=64,z=${cz},distance=..320]`];
  const finish = [
    `kill @e[type=item,x=${cx},y=64,z=${cz},distance=..320]`,
    `setworldspawn ${LOBBY_SPAWN.x} ${LOBBY_SPAWN.y} ${LOBBY_SPAWN.z}`,
    ...Object.entries(LOBBY_RULES).map(([rule, value]) => `gamerule ${rule} ${value}`),
    'time set 6000',
    'weather clear',
    'difficulty peaceful',
    `worldborder center ${cx} ${cz}`,
    `worldborder set ${BORDER}`,
  ];
  const meta = {
    pack: {
      description: 'morni.net – Lobby (baut sich beim Einrichten selbst)',
      pack_format: DATA_PACK_FORMAT,
      supported_formats: { min_inclusive: DATA_PACK_FORMAT, max_inclusive: DATA_PACK_FORMAT_MAX },
      min_format: DATA_PACK_FORMAT,
      max_format: DATA_PACK_FORMAT_MAX,
    },
  };
  const fn = (name: string): string => `data/${LOBBY_NAMESPACE}/function/${name}.mcfunction`;
  const files: Record<string, string> = {
    'pack.mcmeta': `${JSON.stringify(meta, null, 2)}\n`,
    [fn('prepare')]: `${prepare.join('\n')}\n`,
    [fn('clean')]: `${clean.join('\n')}\n`,
    [fn('finish')]: `${finish.join('\n')}\n`,
    ...Object.fromEntries(parts.map((p, i) => [fn(partName(i)), `${p.join('\n')}\n`])),
  };
  const seasonFiles: Record<string, string> = {
    'pack.mcmeta': `${JSON.stringify({ ...meta, pack: { ...meta.pack, description: 'morni.net – Saison-Deko der Lobby' } }, null, 2)}\n`,
    ...Object.fromEntries(
      SEASONS.map((season) => [
        `data/${SEASON_NAMESPACE}/function/${season}.mcfunction`,
        `${seasonCommands(season).join('\n')}\n`,
      ]),
    ),
  };
  const hash = crypto.createHash('sha256');
  Object.keys(files)
    .sort()
    .forEach((k) => hash.update(k).update(files[k] ?? ''));
  Object.keys(seasonFiles)
    .sort()
    .forEach((k) => hash.update(`season/${k}`).update(seasonFiles[k] ?? ''));
  const version = hash.digest('hex').slice(0, VERSION_LENGTH);
  // Erst jetzt die echte Version in die Tags der Wesen (der Platzhalter ging in die Prüfsumme ein, nicht die Version).
  const build = `${BUILD_TAG_PREFIX}${version}`;
  const stamped = Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, v.replaceAll(BUILD_PLACEHOLDER, build)]),
  );
  // Zum Schluss: alles, was noch aus einem älteren Bau geladen ist, weg (den Rest räumt das Lobby-Plugin beim Laden).
  stamped[fn('finish')] += `kill @e[tag=${LOBBY_TAG},tag=!${build}]\n`;
  cached = {
    version,
    files: stamped,
    parts: parts.length,
    load: forceloadCommands(cx, cz, 'add', RADIUS, LOAD_SPAN),
    unload: forceloadCommands(cx, cz, 'remove'),
    seasonFiles,
    seasonLoad: forceloadCommands(cx, cz, 'add', SEASON_RADIUS, LOAD_SPAN),
    seasonUnload: forceloadCommands(cx, cz, 'remove', SEASON_RADIUS),
  };
  return cached;
}

/** Name der Bau-Funktion Nummer i, z. B. `part/007`. */
export function partName(i: number): string {
  return `part/${String(i).padStart(PART_DIGITS, '0')}`;
}
