import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { MotorClient } from '../motor/client.js';
import type { Stores } from '../panel/stores.js';
import { BUILD_MEMBER } from './provision.js';

/**
 * Immer online (Philip, 16.11.: „die Server müssen online bleiben und nur in Ruhezustand, dass sie wenig bis gar keine
 * RAM verbrauchen“): Statt leere Modi ganz anzuhalten, laufen alle Server weiter – im Motor mit „Arbeitsspeicher im
 * Leerlauf freigeben“ (kleiner Start, Java gibt ungenutzten Speicher zurück, Minecraft hält die leere Welt an).
 * „Schlafen, wenn leer“ bleibt als Schalter je Modus (und für den Bau-Server), ist aber standardmäßig aus.
 *
 * Ältere Installationen werden je einmal umgestellt (Marker im Datenordner wie bei `memory.ts`); was danach im Panel
 * eingestellt wird, bleibt.
 */

const SLEEP_MARKER = 'always-on-1';
const IDLE_MARKER = 'idle-memory-1';

interface Member {
  readonly serverId: string;
  readonly member: string;
}

const marked = (dataDir: string, name: string): boolean => fs.existsSync(path.join(dataDir, name));
const mark = (dataDir: string, name: string): void =>
  fs.writeFileSync(path.join(dataDir, name), `${new Date().toISOString()}\n`);

/**
 * Einmal: „Schlafen, wenn leer“ für alle Modi und den Bau-Server aus. Gibt die Server zurück, die bisher schlafen
 * durften – wer davon gerade schläft, startet wieder, sobald er in den Arbeitsspeicher passt (`sleep.keepOnline`).
 */
export function sleepOffOnce(stores: Stores, dataDir: string, log: FastifyBaseLogger): string[] {
  if (marked(dataDir, SLEEP_MARKER)) return [];
  const modes = stores.modes().filter((m) => m.sleepWhenEmpty);
  modes.forEach((m) => stores.patchMode(m.id, { sleepWhenEmpty: false }, 'system'));
  const build = stores.settings('build')['sleepWhenEmpty'] === true;
  if (build) stores.patchSettings('build', { sleepWhenEmpty: false }, 'system');
  const servers = [...modes.flatMap((m) => (m.server ? [m.server] : [])), ...(build ? [BUILD_MEMBER] : [])];
  if (servers.length)
    log.info({ servers }, 'Netzwerk: Modi bleiben jetzt immer online (Schlafen, wenn leer: aus)');
  mark(dataDir, SLEEP_MARKER);
  return servers;
}

/**
 * Einmal: „Arbeitsspeicher im Leerlauf freigeben“ für alle Server des Netzwerks einschalten (neue bekommen es schon
 * beim Anlegen). Gilt ab dem nächsten Start – die geänderten kommen zurück, damit das Netzwerk sie neu startet, sobald
 * niemand drauf ist. Kennt der Motor die Einstellung noch nicht (ältere Fassung), bleibt es für den nächsten Start.
 */
export async function idleMemoryOnce(
  motor: Pick<MotorClient, 'request'>,
  dataDir: string,
  members: readonly Member[],
  log: FastifyBaseLogger,
): Promise<Member[]> {
  if (marked(dataDir, IDLE_MARKER)) return [];
  const list = await motor.request<Array<{ readonly id: string; readonly releaseIdleMemory?: boolean }>>(
    'GET',
    '/api/servers',
  );
  const flagOf = new Map(list.map((s) => [s.id, s.releaseIdleMemory]));
  const ours = members.filter((m) => flagOf.has(m.serverId));
  if (ours.some((m) => flagOf.get(m.serverId) === undefined)) return [];
  const changes = ours.filter((m) => flagOf.get(m.serverId) === false);
  await changes.reduce(async (prev, c) => {
    await prev;
    await motor.request('PATCH', `/api/servers/${c.serverId}`, { releaseIdleMemory: true });
    log.info({ server: c.member }, 'Netzwerk: Arbeitsspeicher im Leerlauf freigeben – an');
  }, Promise.resolve());
  mark(dataDir, IDLE_MARKER);
  return changes.map(({ serverId, member }) => ({ serverId, member }));
}
