/* eslint-disable ts-patterns/no-magic-numbers -- a building plan: layer heights and the arrival point as the world needs them */
/**
 * Die Lobby als Datenpaket: Der Server spielt es auf den Lobby-Server und ruft die Funktionen nacheinander auf
 * (`prepare` = nur „geladen?“, `clean` → `part/000` … → `finish`). So baut sich die Lobby beim Einrichten selbst – ohne
 * RCON von außen.
 * Gleicher Bauplan = gleiche `version`; ändert sich der Plan, baut der Server neu.
 */
import crypto from 'node:crypto';
import { toLobbyDisplays } from './moebel.js';
import { kugelAsItem } from '../schmuck.js';
import { BUILD_PLACEHOLDER, BUILD_TAG_PREFIX, LOBBY_TAG } from '../village.js';
import { biomeCommands } from '../shapes.js';
import { buildLobby, LOBBY } from './dorfplatz.js';
import { SEASONS, seasonCommands, seasonPlans, type Season } from './season.js';
import { withoutHitbox, withViewRange } from './deko.js';
import { newDekoModels, type DekoModels } from './buendel.js';
import { SPORT_LOOKS, SPORT_STAND, sportPlan, sportShowCommands } from './sportstand.js';

export const LOBBY_NAMESPACE = 'moinmorni_lobby';
export const LOBBY_PACK_DIR = 'moinmorni-lobby';
/** Kleines Paket, das immer an bleibt: je Saison eine Funktion (Deko an/aus), läuft nur auf Abruf. */
export const SEASON_NAMESPACE = 'moinmorni_season';
export const SEASON_PACK_DIR = 'moinmorni-lobby-season';
/** Bereich der Deko um die Mitte: der Winter legt Schnee bis an die Berge (so weit wie der Bau). */
export const SEASON_RADIUS = 216;
/** Merker in der Welt: Liegt gerade Winter-Schnee? Dann räumt jede andere Saison ihn zuerst weg. */
export const SEASON_STORAGE = 'moinmorni:season';
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
  /**
   * Befehle je Saison, einzeln nacheinander (wie die Bau-Stücke): Winter = Merker setzen, Schnee und Bauten in
   * Stücken, dann die Deko; jede andere Saison = ihre Deko, dann – falls Winter lag – die alten Blöcke zurück.
   */
  readonly seasonSteps: Readonly<Record<Season, readonly string[]>>;
  /** Stücke des Deko-Bereichs festhalten bzw. loslassen (für das Umschalten der Saison). */
  readonly seasonLoad: readonly string[];
  readonly seasonUnload: readonly string[];
  /** Gebündelte Deko-Modelle fürs Netzwerk-Paket (buendel.ts). */
  readonly deko?: DekoModels;
  /** Andere Welten mit demselben Selbstbau (Wartungs-Lobby): eigener Namensraum und Ordner der Funktionen. */
  readonly namespace?: string;
  readonly packDir?: string;
  /** Prüfpunkte für „alles geladen?“ so weit draußen (Standard: die Lobby). */
  readonly edge?: number;
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

/**
 * Welt der Lobby: leer (Philip, 18.11.: hinter dem Bergkranz soll nichts zu sehen sein). Den Boden baut der Bauplan
 * selbst (`clearCommands`: Stein, Erde, Gras im ganzen Gelände) – außerhalb bleibt Leere. Gilt nur für neue Welten;
 * bestehende räumt das Lobby-Plugin einmal leer (`LobbyVoid.java`).
 */
export const LOBBY_GENERATOR = {
  layers: [{ block: 'minecraft:air', height: 1 }],
  biome: 'minecraft:the_void',
  features: false,
  lakes: false,
  structure_overrides: [],
} as const;

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

/**
 * Biom der Lobby: Wald. Die Farbe von Gras, Blumen-Grün und Laub hängt am Biom – die Lobby liegt in einer normal
 * erzeugten Welt, deren Biom an der Stelle zufällig ist (bei Philip „bewaldete Tafelberge“: fahles, bräunliches Gras).
 * Im Wald ist Gras saftig grün (#79C05A), Laub kräftig (#59AE30), Wasser normal blau.
 */
export const LOBBY_BIOME = 'minecraft:forest';
/** Höhenbereich, in dem das Biom gesetzt wird (vom Grund bis über die Berggipfel). */
const BIOME_FROM = 48;
const BIOME_TO = 303;

/** Spielregeln der Lobby (Namen ab Minecraft 1.21.11, mit Paper 26.3 geprüft). */
export const LOBBY_RULES: Readonly<Record<string, string>> = {
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
 * `summon TYP x y z {…}` → nur, wenn dort noch kein Wesen dieser Art steht. So darf MoinMorni ein Stück noch einmal
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
  const biome = biomeCommands(
    cx - RADIUS,
    BIOME_FROM,
    cz - RADIUS,
    cx + RADIUS,
    BIOME_TO,
    cz + RADIUS,
    LOBBY_BIOME,
  );
  // Anzeige-Wesen ohne Hitbox (F3+B), siehe deko.ts
  // Möbel und Brunnen-Ersatz als Item-Anzeigen (moebel.ts); der Bauplan selbst behält die Platzhalter.
  const moebel = toLobbyDisplays(canvas);
  const body = [
    ...clearCommands(cx, cz),
    ...biome,
    ...canvas.commands().map(withoutHitbox).map(summonOnce),
    ...moebel.commands,
  ];
  moebel.restore();
  const parts = Array.from({ length: Math.ceil(body.length / PART_SIZE) }, (_, i) =>
    body.slice(i * PART_SIZE, (i + 1) * PART_SIZE),
  );
  // `prepare` ändert nichts – MoinMorni ruft es so lange, bis das Paket geladen ist. Aufgeräumt wird erst in `clean`,
  // wenn alle Stücke geladen sind (sonst blieben alte Figuren in nicht geladenen Stücken stehen).
  const prepare = ['# MoinMorni: Lobby-Datenpaket ist geladen'];
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
      description: 'MoinMorni – Lobby (baut sich beim Einrichten selbst)',
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
  const chunks = (list: readonly string[]): string[][] =>
    Array.from({ length: Math.ceil(list.length / PART_SIZE) }, (_, i) =>
      list.slice(i * PART_SIZE, (i + 1) * PART_SIZE),
    );
  // Saisons mit Bauten (Winter, Wiesn …): Stücke zum Setzen und zum Zurückstellen
  const built = Object.entries(seasonPlans(canvas)).map(([season, plan]) => ({
    season: season as Season,
    on: chunks(plan.on),
    off: chunks(plan.off),
  }));
  const seasonFn = (name: string): string => `data/${SEASON_NAMESPACE}/function/${name}.mcfunction`;
  const seasonFiles: Record<string, string> = {
    'pack.mcmeta': `${JSON.stringify({ ...meta, pack: { ...meta.pack, description: 'MoinMorni – Saison-Deko der Lobby' } }, null, 2)}\n`,
    ...Object.fromEntries(
      SEASONS.map((season) => [
        seasonFn(season),
        `${seasonCommands(season, canvas).map(withoutHitbox).join('\n')}\n`,
      ]),
    ),
    ...Object.fromEntries(
      built.flatMap(({ season, on, off }) => [
        ...on.map((p, i) => [seasonFn(seasonPart(season, 'on', i)), `${p.join('\n')}\n`] as const),
        ...off.map((p, i) => [seasonFn(seasonPart(season, 'off', i)), `${p.join('\n')}\n`] as const),
      ]),
    ),
  };
  // Sport-Stand (Skihütte ↔ Bootshaus): Umbau in einer Funktion je Richtung (ein Tick), Figur und Deko je Modus.
  // Das Lobby-Plugin ruft sie selbst auf, wenn der Stand wechseln soll (`LobbySportStand.java`).
  const sport = sportPlan(canvas);
  const one = (list: readonly string[]): string => `${list.join('\n')}\n`;
  seasonFiles[seasonFn(SPORT_STAND.functions.on)] = one(sport.on);
  seasonFiles[seasonFn(SPORT_STAND.functions.off)] = one(sport.off);
  SPORT_LOOKS.forEach((look) => {
    seasonFiles[seasonFn(SPORT_STAND.functions.show[look])] = one(
      // Ohne summonOnce: vorher räumt die Funktion alle Wesen des Stands ab, und manche Teile liegen dicht beieinander
      sportShowCommands(look).map(withoutHitbox),
    );
  });
  const seasonSteps = seasonStepsFor(
    Object.fromEntries(built.map(({ season, on, off }) => [season, { on: on.length, off: off.length }])),
  );
  // Christbaumkugeln und Ostereier: aus Block-Anzeigen werden Item-Anzeigen mit unserem Namen (schmuck.ts).
  // Danach kleine Teile nur so weit zeichnen, wie man sie sieht (deko.ts, `withViewRange`).
  // Bündeln (buendel.ts) ist aus: im echten Client lila-schwarze Würfel (Philip, 18.11.).
  const deko = newDekoModels();
  const asItems = (text: string): string => text.split('\n').map(kugelAsItem).map(withViewRange).join('\n');
  [files, seasonFiles].forEach((map) =>
    Object.keys(map).forEach((k) => {
      map[k] = asItems(map[k] ?? '');
    }),
  );
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
    seasonSteps,
    seasonLoad: forceloadCommands(cx, cz, 'add', SEASON_RADIUS, LOAD_SPAN),
    seasonUnload: forceloadCommands(cx, cz, 'remove', SEASON_RADIUS),
    deko,
  };
  return cached;
}

/** Name der Bau-Funktion Nummer i, z. B. `part/007`. */
export function partName(i: number): string {
  return `part/${String(i).padStart(PART_DIGITS, '0')}`;
}

/** Name eines Stücks einer Saison, z. B. `winter/on_003` (Schnee setzen) oder `wiesn/off_000` (alte Blöcke zurück). */
export function seasonPart(season: Season, way: 'on' | 'off', i: number): string {
  return `${season}/${way}_${String(i).padStart(PART_DIGITS, '0')}`;
}

/** Name eines Winter-Stücks (wie `seasonPart('winter', …)`). */
export function winterPart(way: 'on' | 'off', i: number): string {
  return seasonPart('winter', way, i);
}

/**
 * Welt sofort und vollständig speichern (Blöcke und Merker). Ohne `flush` schreibt Minecraft die Stücke nach und nach –
 * stürzt der Server kurz danach ab, passen Merker und Blöcke nicht mehr zusammen (im echten Test mit `kill -9`
 * gesehen: Merker weg, aber Schnee in einem Teil der Lobby).
 */
export const SAVE_NOW = 'save-all flush';

/** Stücke einer Saison mit Bauten: wie viele zum Setzen und wie viele zum Zurückstellen. */
export interface SeasonParts {
  readonly on: number;
  readonly off: number;
}

/**
 * Schritte je Saison. Jede Saison mit Bauten hat einen Merker in der Welt (`moinmorni:season {winter:1b}` usw.):
 * erst räumen die anderen Saisons ihre Bauten weg (nur die, deren Merker liegt), speichern, dann sind ihre Merker weg
 * und es wird noch einmal gespeichert; dann setzt die gewählte Saison ihren Merker (gleich gespeichert), ihre Bauten
 * in Stücken, ihre Deko, und alles wird gespeichert. So liegt der Merker nach einem Absturz immer, solange noch
 * Bauten der Saison stehen könnten.
 */
export function seasonStepsFor(
  parts: Partial<Record<Season, SeasonParts>>,
): Record<Season, readonly string[]> {
  const fnCall = (name: string): string => `function ${SEASON_NAMESPACE}:${name}`;
  const lies = (s: Season): string => `execute if data storage ${SEASON_STORAGE} {${s}:1b} run`;
  const count = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
  const withBlocks = SEASONS.filter((s) => parts[s] !== undefined);
  const stepsOf = (target: Season): string[] => {
    const others = withBlocks.filter((s) => s !== target);
    const own = parts[target];
    const away = others.flatMap((s) =>
      count(parts[s]?.off ?? 0).map((i) => `${lies(s)} ${fnCall(seasonPart(s, 'off', i))}`),
    );
    const forget = others.map((s) => `data remove storage ${SEASON_STORAGE} ${s}`);
    const build = own
      ? [
          `data modify storage ${SEASON_STORAGE} ${target} set value 1b`,
          SAVE_NOW,
          ...count(own.on).map((i) => fnCall(seasonPart(target, 'on', i))),
        ]
      : [];
    return [
      ...away,
      ...(others.length > 0 ? [SAVE_NOW, ...forget, SAVE_NOW] : []),
      ...build,
      fnCall(target),
      SAVE_NOW,
    ];
  };
  return {
    none: stepsOf('none'),
    wiesn: stepsOf('wiesn'),
    winter: stepsOf('winter'),
    easter: stepsOf('easter'),
    halloween: stepsOf('halloween'),
  };
}
