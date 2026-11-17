import type { FastifyBaseLogger } from 'fastify';
import {
  LOBBY_NAMESPACE,
  LOBBY_PACK_DIR,
  lobbyPack,
  MOEBEL_PACK_ID,
  partName,
  SEASON_PACK_DIR,
  SEASONS,
  type LobbyPack,
  type Season,
} from '@moinmorni/builder';
import { INTERIM_LOBBY_PACKS } from '../lib/rename.js';
import { MotorError, type MotorClient } from '../motor/client.js';
import { readServerFile, removeServerFiles, writeServerFile } from '../motor/files.js';

/**
 * Die Lobby baut sich selbst: Der Bauplan (`packages/builder/src/lobby/`) kommt als Datenpaket auf den Lobby-Server,
 * MoinMorni ruft die Bau-Funktionen über den Motor nacheinander auf und merkt sich die gebaute Version. Ändert sich
 * der Plan (Update), wird neu gebaut. Dazu stellt es die server.properties der Lobby ein (Abenteuermodus, friedlich).
 */

const STAMP_FILE = 'plugins/moinmorni/lobby-world.version';
/** Version, die gerade gebaut wird – das Lobby-Plugin entfernt Wesen aus anderen Bauten, sobald sie geladen werden. */
const TARGET_FILE = 'plugins/moinmorni/lobby-world.target';
const PROPERTIES_FILE = 'server.properties';
const DEFAULT_LEVEL = 'world';
const PACK_ID = `file/${LOBBY_PACK_DIR}`;
const RUNNING = 'running';
const SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTE_MS = SECONDS_PER_MINUTE * SECOND_MS;
/** Antwort des Servers, wenn es eine Funktion (ein Stück des Datenpakets) nicht gibt. */
const UNKNOWN_FUNCTION = 'Unknown function';
/** Welt speichern (Blöcke und Merker der Saison), ohne auf das Schreiben zu warten. */
const SAVE_WORLD = 'save-all';
const SETTLE_SECONDS = 5;
const GAP_MS = 300;
const READY_MINUTES = 15;
const LOAD_MINUTES = 5;
const POLL_SECONDS = 3;
/** Wie oft ein Befehl versucht wird, wenn der Server zu langsam antwortet, und die Pause dazwischen. */
const COMMAND_TRIES = 5;
const RETRY_SECONDS = 5;
const COMMAND_FAILED = 'command_failed';
const LOG_COMMAND_CHARS = 60;
const DEFAULTS = {
  settleMs: SETTLE_SECONDS * SECOND_MS,
  gapMs: GAP_MS,
  readyTimeoutMs: READY_MINUTES * MINUTE_MS,
  loadTimeoutMs: LOAD_MINUTES * MINUTE_MS,
  pollMs: POLL_SECONDS * SECOND_MS,
  commandTries: COMMAND_TRIES,
  retryMs: RETRY_SECONDS * SECOND_MS,
} as const;
/** Ecken (so weit draußen, wie gebaut wird) und Mitte: sind sie geladen, ist es der Rest auch. */
const EDGE = 200;
/** Die Saison-Deko reicht bis an die Berge (Winter-Schnee bis ±223). */
const SEASON_EDGE = 220;
const probesAt = (edge: number): readonly (readonly [number, number])[] => [
  [0, 0],
  [-edge, -edge],
  [edge, -edge],
  [-edge, edge],
  [edge, edge],
];
const PROBES = probesAt(EDGE);
/** Für die Saison-Deko: Ecken innerhalb ihres (kleineren) Bereichs. */
const SEASON_PROBES = probesAt(SEASON_EDGE);
const FIRST_NON_ASCII = 0x7f;
const HEX = 16;
const UNICODE_DIGITS = 4;
/** `\uXXXX`: Rückstrich + „u“ vor den Ziffern, Rückstrich + Zeichen bei `\:`. */
const ESCAPE_PREFIX = 2;

export interface LobbyWorldOptions {
  /** Aktuelle Saison-Deko (Panel: Lobby → Saison-Deko). */
  readonly season?: () => Season;
  /** Möbel-Paket, das die Lobby anbieten soll. */
  readonly packOffer?: () => PackOffer;
  /** Bauplan (Tests: ein kleiner). */
  readonly pack?: () => LobbyPack;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly settleMs?: number;
  readonly gapMs?: number;
  readonly readyTimeoutMs?: number;
  readonly loadTimeoutMs?: number;
  readonly pollMs?: number;
  readonly commandTries?: number;
  readonly retryMs?: number;
}

export type BuildResult = 'built' | 'current' | 'not_running' | 'failed';

export interface LobbyWorld {
  /** server.properties der Lobby einstellen; true = etwas geändert (gilt nach dem nächsten Start). */
  readonly configure: (serverId: string) => Promise<boolean>;
  /** Welt bauen, wenn der Bauplan neuer ist als die gebaute Welt. */
  readonly build: (serverId: string) => Promise<BuildResult>;
  /** Saison-Deko umschalten (alte weg, neue hin). */
  readonly applySeason: (serverId: string) => Promise<boolean>;
}

/** Saison aus den Einstellungen, unbekannte Werte = keine Deko. */
export function seasonOf(value: unknown): Season {
  return SEASONS.find((s) => s === value) ?? 'none';
}

/** Text für server.properties: Rückstriche verdoppeln, alles außer ASCII als \uXXXX (Minecraft liest Latin-1). */
function escapeValue(value: string): string {
  return [...value.replaceAll('\\', '\\\\')]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code <= FIRST_NON_ASCII) return ch;
      // Zeichen außerhalb der Grundebene als zwei UTF-16-Hälften, wie Java sie erwartet.
      return [...Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i))]
        .map((c) => `\\u${c.toString(HEX).padStart(UNICODE_DIGITS, '0')}`)
        .join('');
    })
    .join('');
}

/** Wert aus einer server.properties-Zeile lesen (Java schreibt `\:` und `\=`, Umlaute als `\uXXXX`). */
function unescapeValue(raw: string): string {
  const chars = [...raw];
  const out: string[] = [];
  const step = (i: number): void => {
    if (i >= chars.length) return;
    const ch = chars[i] ?? '';
    if (ch !== '\\' || i + 1 >= chars.length) {
      out.push(ch);
      step(i + 1);
      return;
    }
    const next = chars[i + 1] ?? '';
    if (next === 'u') {
      out.push(
        String.fromCharCode(
          parseInt(chars.slice(i + ESCAPE_PREFIX, i + ESCAPE_PREFIX + UNICODE_DIGITS).join(''), HEX),
        ),
      );
      step(i + ESCAPE_PREFIX + UNICODE_DIGITS);
      return;
    }
    out.push(next);
    step(i + ESCAPE_PREFIX);
  };
  step(0);
  return out.join('');
}

interface PropertyLine {
  readonly key: string;
  readonly value: string;
}

function parseLine(line: string): PropertyLine | null {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) return null;
  const cut = [trimmed.indexOf('='), trimmed.indexOf(':')].filter((i) => i >= 0);
  if (cut.length === 0) return { key: trimmed, value: '' };
  const at = Math.min(...cut);
  return { key: trimmed.slice(0, at).trim(), value: unescapeValue(trimmed.slice(at + 1).trim()) };
}

/** Nur die genannten Schlüssel setzen; alles andere (auch Kommentare) bleibt, wie es ist. */
export function patchProperties(
  text: string,
  values: Readonly<Record<string, string>>,
): { text: string; changed: boolean } {
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n'); // eslint-disable-line ts-patterns/require-regex-example -- drops one trailing newline: "a=1\n" → "a=1"
  const seen = new Set<string>();
  const updated = lines.map((line) => {
    const parsed = parseLine(line);
    if (!parsed || !Object.hasOwn(values, parsed.key)) return line;
    seen.add(parsed.key);
    const want = values[parsed.key] ?? '';
    return parsed.value === want ? line : `${parsed.key}=${escapeValue(want)}`;
  });
  const added = Object.entries(values)
    .filter(([key]) => !seen.has(key))
    .map(([key, value]) => `${key}=${escapeValue(value)}`);
  const changed = added.length > 0 || updated.some((l, i) => l !== lines[i]);
  return { text: `${[...updated, ...added].join('\n')}\n`, changed };
}

/** Möbel-Paket, das die Lobby anbietet (`lobby/packs.ts`); ohne Adresse (keine Domain) bietet sie keins an. */
export interface PackOffer {
  readonly url: string | null;
  readonly sha1: string;
  readonly required: boolean;
}

const PACK_PROMPT = {
  text: 'Echte Möbel und Blasmusik in der Lobby – dafür unser Paket. / Real furniture and a brass band in the lobby – needs our pack.',
  color: 'gold',
};

/**
 * Was die Lobby in ihrer server.properties braucht. Die Figuren brauchen kein Paket (von Mojang signierte Skins); das
 * Möbel-Paket bietet sie an, wenn es eine öffentliche Adresse gibt – mit fester Kennung, damit der Proxy es beim
 * Verlassen der Lobby wieder entfernt.
 */
export function lobbyProperties(offer?: PackOffer): Record<string, string> {
  const pack = offer?.url
    ? {
        'resource-pack': offer.url,
        'resource-pack-sha1': offer.sha1,
        'resource-pack-id': MOEBEL_PACK_ID,
        'require-resource-pack': String(offer.required),
        'resource-pack-prompt': JSON.stringify(PACK_PROMPT),
      }
    : {
        'resource-pack': '',
        'resource-pack-sha1': '',
        'resource-pack-id': '',
        'require-resource-pack': 'false',
        'resource-pack-prompt': '',
      };
  return {
    gamemode: 'adventure',
    // Minecraft ab 26.x legt neue Server mit eingeschalteter Whitelist an – wer hinein darf, entscheidet der Hub.
    'white-list': 'false',
    'enforce-whitelist': 'false',
    'force-gamemode': 'true',
    difficulty: 'peaceful',
    pvp: 'false',
    'spawn-protection': '0',
    'allow-nether': 'false',
    'generate-structures': 'false',
    // Der Selbstbau schickt viele Befehle über RCON – ohne das stünde bei jedem Team-Mitglied mit OP
    // „[Rcon: 16 Chunks … werden nun dauerhaft geladen]“ im Chat.
    'broadcast-rcon-to-ops': 'false',
    'broadcast-console-to-ops': 'false',
    ...pack,
  };
}

function readProperty(text: string, key: string): string | null {
  return (
    text
      .split('\n')
      .map(parseLine)
      .find((p) => p?.key === key)?.value ?? null
  );
}

export function createLobbyWorld(
  motor: MotorClient,
  log: FastifyBaseLogger,
  options: LobbyWorldOptions = {},
): LobbyWorld {
  const opts = { ...DEFAULTS, ...options };
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const plan = options.pack ?? lobbyPack;
  const busy = new Set<string>();

  const readFile = (serverId: string, file: string): Promise<string | null> =>
    readServerFile(motor, serverId, file);
  const writeFile = (serverId: string, file: string, content: string): Promise<void> =>
    writeServerFile(motor, serverId, file, content);
  /**
   * Ein Befehl über den Motor. Antwortet der Server zu langsam (gleich nach dem Start ist er beschäftigt), kommt
   * „command_failed“ – dann kurz warten und noch einmal; die Bau-Befehle dürfen doppelt laufen (`summonOnce`).
   */
  const run = async (serverId: string, command: string, tries = opts.commandTries): Promise<string> => {
    try {
      const r = await motor.request<{ answer?: string }>('POST', `/api/servers/${serverId}/command`, {
        command,
      });
      return r.answer ?? '';
    } catch (err) {
      if (!(err instanceof MotorError) || err.code !== COMMAND_FAILED || tries <= 1) throw err;
      log.warn(
        { command: command.slice(0, LOG_COMMAND_CHARS) },
        'Lobby: Server antwortet langsam – gleich noch einmal',
      );
      await sleep(opts.retryMs);
      return run(serverId, command, tries - 1);
    }
  };
  const state = async (serverId: string): Promise<string> => {
    const s = await motor.request<{ live?: { state?: string } }>('GET', `/api/servers/${serverId}`);
    return s.live?.state ?? 'unknown';
  };
  /** Wiederholen, bis `done` passt oder die Zeit um ist. */
  const until = async (check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> => {
    const end = Date.now() + timeoutMs;
    const loop = async (): Promise<boolean> => {
      if (await check()) return true;
      if (Date.now() >= end) return false;
      await sleep(opts.pollMs);
      return loop();
    };
    return loop();
  };

  const build = async (serverId: string): Promise<BuildResult> => {
    const pack = plan();
    if ((await readFile(serverId, STAMP_FILE))?.trim() === pack.version) return 'current';
    if (!(await until(async () => (await state(serverId)) === RUNNING, opts.readyTimeoutMs))) {
      log.warn({ serverId }, 'Lobby: Server läuft nicht – Welt wird beim nächsten Start gebaut');
      return 'not_running';
    }
    const properties = (await readFile(serverId, PROPERTIES_FILE)) ?? '';
    const level = readProperty(properties, 'level-name') || DEFAULT_LEVEL;
    log.info({ version: pack.version, parts: pack.parts }, 'Lobby: Welt wird gebaut');
    // Rückbenennung: Datenpakete unter dem Zwischen-Namen weg (sonst blieben sie für immer in der Welt liegen).
    await removeServerFiles(
      motor,
      serverId,
      INTERIM_LOBBY_PACKS.map((dir) => `${level}/datapacks/${dir}`),
    );
    await Object.entries(pack.files).reduce(async (prev, [file, content]) => {
      await prev;
      await writeFile(serverId, `${level}/datapacks/${LOBBY_PACK_DIR}/${file}`, content);
    }, Promise.resolve());
    await Object.entries(pack.seasonFiles).reduce(async (prev, [file, content]) => {
      await prev;
      await writeFile(serverId, `${level}/datapacks/${SEASON_PACK_DIR}/${file}`, content);
    }, Promise.resolve());
    await writeFile(serverId, TARGET_FILE, `${pack.version}\n`);
    // Paper kennt „reload“ selbst (lädt Plugins neu) – darum immer mit „minecraft:“.
    await run(serverId, 'minecraft:reload');
    await sleep(opts.settleMs);
    await run(serverId, `minecraft:datapack enable "${PACK_ID}"`);
    const ready = await until(
      async () =>
        !(await run(serverId, `minecraft:function ${LOBBY_NAMESPACE}:prepare`)).includes(UNKNOWN_FUNCTION),
      opts.loadTimeoutMs,
    );
    if (!ready) {
      log.error('Lobby: Datenpaket wurde nicht geladen');
      return 'failed';
    }
    await pack.load.reduce(async (prev, command) => {
      await prev;
      await run(serverId, `minecraft:${command}`);
    }, Promise.resolve());
    const loaded = await until(async () => {
      const answers = await PROBES.reduce<Promise<string[]>>(async (acc, [x, z]) => {
        const list = await acc;
        return [...list, await run(serverId, `minecraft:execute if loaded ${x} 64 ${z}`)];
      }, Promise.resolve([]));
      return answers.every((a) => !a.includes('failed'));
    }, opts.loadTimeoutMs);
    if (!loaded) log.warn('Lobby: nicht alle Stücke der Welt geladen – baue trotzdem');
    // Erst jetzt aufräumen: alle Stücke sind geladen, alte Figuren und Schilder verschwinden wirklich.
    await run(serverId, `minecraft:function ${LOBBY_NAMESPACE}:clean`);
    // Ein Stück, das der Server nicht laden konnte (z. B. ein Block, den es in dieser Minecraft-Version nicht mehr
    // gibt), meldet „Unknown function“ – es fehlt dann in der Welt. Das soll im Protokoll auffallen.
    const missing = await Array.from({ length: pack.parts }, (_, i) => i).reduce<Promise<string[]>>(
      async (prev, i) => {
        const list = await prev;
        const answer = await run(serverId, `minecraft:function ${LOBBY_NAMESPACE}:${partName(i)}`);
        await sleep(opts.gapMs);
        return answer.includes(UNKNOWN_FUNCTION) ? [...list, partName(i)] : list;
      },
      Promise.resolve([]),
    );
    if (missing.length > 0)
      log.error(
        { parts: missing },
        'Lobby: Teile der Welt ließen sich nicht laden (Fehler im Server-Protokoll: „Failed to load function“)',
      );
    await run(serverId, `minecraft:function ${LOBBY_NAMESPACE}:finish`);
    await pack.unload.reduce(async (prev, command) => {
      await prev;
      await run(serverId, `minecraft:${command}`);
    }, Promise.resolve());
    // Fertig: das Paket nicht bei jedem Start laden (es wird nur zum Bauen gebraucht).
    await run(serverId, `minecraft:datapack disable "${PACK_ID}"`);
    await writeFile(serverId, STAMP_FILE, `${pack.version}\n`);
    log.info({ version: pack.version }, 'Lobby: Welt fertig gebaut');
    await season(serverId, pack);
    return 'built';
  };

  /** Probe-Punkte geladen? (Ecken + Mitte) */
  const allLoaded = async (serverId: string, probes = PROBES): Promise<boolean> => {
    const answers = await probes.reduce<Promise<string[]>>(async (acc, [x, z]) => {
      const list = await acc;
      return [...list, await run(serverId, `minecraft:execute if loaded ${x} 64 ${z}`)];
    }, Promise.resolve([]));
    return answers.every((a) => !a.includes('failed'));
  };
  const runAll = (serverId: string, commands: readonly string[]): Promise<void> =>
    commands.reduce(async (prev, command) => {
      await prev;
      await run(serverId, `minecraft:${command}`);
    }, Promise.resolve());

  /**
   * Deko der eingestellten Saison setzen: Bereich festhalten, die Schritte der Saison nacheinander (Winter: Schnee in
   * Stücken; jede andere Saison räumt liegenden Winter-Schnee weg), wieder loslassen.
   */
  const season = async (serverId: string, pack: LobbyPack): Promise<void> => {
    const current = options.season?.() ?? 'none';
    await runAll(serverId, pack.seasonLoad);
    await until(() => allLoaded(serverId, SEASON_PROBES), opts.loadTimeoutMs);
    const steps = pack.seasonSteps[current];
    const missing = await steps.reduce<Promise<string[]>>(async (prev, step) => {
      const list = await prev;
      const answer = await run(serverId, `minecraft:${step}`);
      await sleep(opts.gapMs);
      return answer.includes(UNKNOWN_FUNCTION) ? [...list, step] : list;
    }, Promise.resolve([]));
    if (missing.length > 0)
      log.error({ steps: missing }, 'Lobby: Teile der Saison-Deko ließen sich nicht laden');
    // Gleich speichern: Der Merker „Winter liegt“ steht sonst bis zum nächsten Autosave nur im Arbeitsspeicher – stürzt
    // der Server vorher ab, wüsste die nächste Saison nichts vom Schnee (oder räumte ihn ein zweites Mal weg).
    await run(serverId, `minecraft:${SAVE_WORLD}`);
    await runAll(serverId, pack.seasonUnload);
    log.info({ season: current }, 'Lobby: Saison-Deko gesetzt');
  };

  return {
    configure: async (serverId) => {
      const current = (await readFile(serverId, PROPERTIES_FILE)) ?? '';
      const next = patchProperties(current, lobbyProperties(options.packOffer?.()));
      if (!next.changed) return false;
      await writeFile(serverId, PROPERTIES_FILE, next.text);
      return true;
    },
    applySeason: async (serverId) => {
      if (busy.has(serverId)) return false;
      busy.add(serverId);
      try {
        if ((await state(serverId)) !== RUNNING) return false;
        await season(serverId, plan());
        return true;
      } catch (err) {
        log.error({ err }, 'Lobby: Saison-Deko ließ sich nicht setzen');
        return false;
      } finally {
        busy.delete(serverId);
      }
    },
    build: async (serverId) => {
      if (busy.has(serverId)) return 'current';
      busy.add(serverId);
      try {
        return await build(serverId);
      } catch (err) {
        log.error({ err }, 'Lobby: Bau fehlgeschlagen – nächster Versuch beim nächsten Start');
        return 'failed';
      } finally {
        busy.delete(serverId);
      }
    },
  };
}
