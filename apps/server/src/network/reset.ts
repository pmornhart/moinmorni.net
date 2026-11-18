import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ResetWhat } from '@moinmorni/shared';
import type { Db } from '../db/index.js';
import { modePlayers, modeStats } from '../db/schema.js';
import type { MotorClient } from '../motor/client.js';
import { removeServerFiles } from '../motor/files.js';

/**
 * Server zurücksetzen (Panel → Server → Zurücksetzen, nur Owner): was gelöscht wird und wie.
 *
 * - **Welt:** jeder Ordner im Server, in dem eine `level.dat` liegt (Paper 26 legt Nether, End und die Welten der Modi
 *   unter `world/dimensions/…`, ältere daneben als `world_nether` …), dazu die Bau-Merker (`bau.yml`, `welt.yml` der
 *   Modi; `lobby-world.version`/`.target` und `winter-biome.txt` der Lobby) – so baut sich alles beim Start neu.
 * - **Spielstand:** in jeder Welt `playerdata`, `stats`, `advancements`; in den Ordnern der Modus-Plugins die
 *   Spielerdaten und Bestenlisten (Namen aus den Modus-Repos, siehe {@link PROGRESS_NAMES}); im Netzwerk-Plugin der
 *   Lobby `jumpandrun.yml`, der Wartungs-Lobby `wartung-parkour.yml`; in der Datenbank `mode_stats`/`mode_players`
 *   dieses Modus.
 *
 * Nie: Konfigurationen (`config.yml`), Ränge, Strafen, Einstellungen, Team. Alles Gelöschte landet 7 Tage im
 * Papierkorb des Motors; vorher legt der Motor eine Sicherung an.
 */

/** Spielerdaten und Bestenlisten der Modus-Plugins (aus den Repos gelesen). */
export const PROGRESS_NAMES: ReadonlySet<string> = new Set([
  'spieler',
  'geister',
  'rangliste.yml',
  'bestenliste.yml',
  'mornismp.db',
  'mornismp.db-wal',
  'mornismp.db-shm',
  // MorniCraft
  'players',
  'clans.yml',
  'graves.yml',
  'jail.yml',
]);
/** Bau-Merker der Modi: fehlen sie, baut der Modus beim Start neu. */
export const BUILD_MARKERS: ReadonlySet<string> = new Set(['bau.yml', 'welt.yml']);
const VANILLA_PROGRESS: readonly string[] = ['playerdata', 'stats', 'advancements'];
/** Im Netzwerk-Plugin (plugins/moinmorni). */
const NETWORK_DIR = 'plugins/moinmorni';
const NETWORK_WORLD = ['lobby-world.version', 'lobby-world.target', 'winter-biome.txt'];
const NETWORK_PROGRESS = ['jumpandrun.yml', 'wartung-parkour.yml'];
/** Nur einfache Namen – kein „..“, kein Schrägstrich: "world_nether" passt, ".." und "a/b" nicht. */
// https://regex101.com/?flavor=javascript&regex=%5E(%3F!%5C.%5C.%3F%24)%5BA-Za-z0-9_.%20-%5D%7B1%2C100%7D%24&testString=world_nether
const SAFE_NAME = /^(?!\.\.?$)[A-Za-z0-9_. -]{1,100}$/;

const POLL_MS = 1000;
const BACKUP_MAX_MS = 30 * 60 * POLL_MS;
const entriesSchema = z.array(z.object({ name: z.string(), type: z.enum(['file', 'dir']) }));
type Entry = z.infer<typeof entriesSchema>[number];

export const wipesWorld = (what: ResetWhat): boolean => what !== 'progress';
export const wipesProgress = (what: ResetWhat): boolean => what !== 'world';

/** Rein: welche Pfade gelöscht werden, aus dem, was im Server liegt. */
export function resetPaths(input: {
  readonly what: ResetWhat;
  /** Ordner im Server mit `level.dat`. */
  readonly worlds: readonly string[];
  /** Je Plugin-Ordner (Name) die Einträge darin. */
  readonly plugins: ReadonlyArray<{ readonly dir: string; readonly entries: readonly string[] }>;
}): string[] {
  const safe = (n: string): boolean => SAFE_NAME.test(n);
  const worlds = input.worlds.filter(safe);
  const out: string[] = [];
  if (wipesWorld(input.what)) out.push(...worlds);
  else if (wipesProgress(input.what))
    worlds.forEach((w) => VANILLA_PROGRESS.forEach((v) => out.push(`${w}/${v}`)));
  input.plugins
    .filter((p) => safe(p.dir))
    .forEach((p) => {
      const base = `plugins/${p.dir}`;
      const isNetwork = base === NETWORK_DIR;
      p.entries.filter(safe).forEach((e) => {
        const progress = isNetwork ? NETWORK_PROGRESS.includes(e) : PROGRESS_NAMES.has(e);
        const world = isNetwork ? NETWORK_WORLD.includes(e) : BUILD_MARKERS.has(e);
        if ((progress && wipesProgress(input.what)) || (world && wipesWorld(input.what)))
          out.push(`${base}/${e}`);
      });
    });
  return out;
}

async function list(motor: Pick<MotorClient, 'request'>, serverId: string, dir: string): Promise<Entry[]> {
  try {
    const r = await motor.request<unknown>(
      'GET',
      `/api/servers/${encodeURIComponent(serverId)}/files?path=${encodeURIComponent(dir)}`,
    );
    const parsed = entriesSchema.safeParse(r);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Löscht (in den Papierkorb des Motors), was zurückgesetzt wird; der Server ist dabei aus. Zurück: Zahl der Pfade. */
export async function wipeServer(
  motor: Pick<MotorClient, 'request'>,
  serverId: string,
  what: ResetWhat,
): Promise<number> {
  const root = await list(motor, serverId, '');
  const dirs = root.filter((e) => e.type === 'dir' && SAFE_NAME.test(e.name));
  const worlds = (
    await Promise.all(
      dirs.map(async (d) =>
        (await list(motor, serverId, d.name)).some((e) => e.name === 'level.dat') ? d.name : null,
      ),
    )
  ).filter((w): w is string => w !== null);
  const pluginDirs = dirs.some((d) => d.name === 'plugins')
    ? (await list(motor, serverId, 'plugins')).filter((e) => e.type === 'dir')
    : [];
  const plugins = await Promise.all(
    pluginDirs.map(async (p) => ({
      dir: p.name,
      entries: (await list(motor, serverId, `plugins/${p.name}`)).map((e) => e.name),
    })),
  );
  const paths = resetPaths({ what, worlds, plugins });
  if (!paths.length) return 0;
  await removeServerFiles(motor, serverId, paths);
  return paths.length;
}

/** Spielstand des Modus in der Datenbank (Statistik, Bestenlisten, Panel-Karte). Andere Bereiche (`_musik`) bleiben. */
export function wipeStats(db: Db, statsId: string): void {
  if (!statsId || statsId.startsWith('_')) return;
  db.delete(modeStats).where(eq(modeStats.mode, statsId)).run();
  db.delete(modePlayers)
    .where(and(eq(modePlayers.mode, statsId)))
    .run();
}

const backupSchema = z.object({ id: z.union([z.string(), z.number()]), status: z.string() });
const listSchema = z.object({ backups: z.array(backupSchema) });

/** Sicherung über den Motor anlegen und warten, bis sie fertig ist. */
export async function backupServer(
  motor: Pick<MotorClient, 'request'>,
  serverId: string,
  options: { readonly pause?: (ms: number) => Promise<void>; readonly maxMs?: number } = {},
): Promise<void> {
  const pause = options.pause ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxMs = options.maxMs ?? BACKUP_MAX_MS;
  const id = encodeURIComponent(serverId);
  const started = backupSchema.parse(await motor.request<unknown>('POST', `/api/servers/${id}/backups`));
  const poll = async (waited: number): Promise<void> => {
    const all = listSchema.parse(await motor.request<unknown>('GET', `/api/servers/${id}/backups`));
    const me = all.backups.find((b) => String(b.id) === String(started.id));
    if (me?.status === 'done') return;
    if (!me || me.status === 'failed') throw new Error('backup_failed');
    if (waited >= maxMs) throw new Error('backup_timeout');
    await pause(POLL_MS);
    return poll(waited + POLL_MS);
  };
  return poll(0);
}
