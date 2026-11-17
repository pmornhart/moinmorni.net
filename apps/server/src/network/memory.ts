import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { MODE_MEMORY_MB, type Mode } from '@moinmorni/shared';
import type { MotorClient } from '../motor/client.js';
import {
  BUILD_MEMBER,
  BUILD_MEMORY_MB,
  LOBBY_MEMBER,
  LOBBY_MEMORY_MB,
  MODE_DEFAULT_MEMORY_MB,
} from './provision.js';

/**
 * Arbeitsspeicher der Netzwerk-Server: Früher bekam jeder Modus 3 GB (MorniSMP 8, MorniCraft 6, Bau-Server 3, Lobby
 * 4) – mit allen Modi passte das nicht mehr gleichzeitig in den Container. Ältere Installationen bekommen die neuen Werte einmal, aber nur
 * Server, die noch genau den alten Standard haben (im Panel nie geändert). Laufende Server übernehmen ihn beim
 * nächsten Neustart (den stellt das Netzwerk an, sobald niemand drauf ist).
 * Zweiter Schritt (17.11., Sommerspiele dazu): Wintersport teilt sich das Jahr mit den Sommerspielen und bekommt 1 GB
 * statt 1,5 – wieder nur, wo noch der alte Standard steht.
 */

const MARKER = 'memory-plan-2';
const MARKER_SPORT = 'memory-plan-3';
/** Zweiter Schritt: Modus → alter Standard (der neue steht in `MODE_MEMORY_MB`). */
const OLD_SPORT_MB: Readonly<Record<string, number>> = { wintersport: 1536 };
const OLD_DEFAULT_MB = 3072;
const OLD_MODE_MB: Readonly<Record<string, number>> = { mirni: 8192, mornicraft: 6144 };
const OLD_BUILD_MB = 3072;
const OLD_LOBBY_MB = 4096;

interface Member {
  readonly serverId: string;
  readonly member: string;
}

/** Alter und neuer Standard eines Netzwerk-Servers (undefined = der Proxy, der bleibt wie er ist). */
function plan(member: string, modes: readonly Mode[]): { old: number; now: number } | undefined {
  if (member === BUILD_MEMBER) return { old: OLD_BUILD_MB, now: BUILD_MEMORY_MB };
  if (member === LOBBY_MEMBER) return { old: OLD_LOBBY_MB, now: LOBBY_MEMORY_MB };
  const mode = modes.find((m) => m.server === member);
  if (!mode) return undefined;
  return {
    old: OLD_MODE_MB[mode.id] ?? OLD_DEFAULT_MB,
    now: MODE_MEMORY_MB[mode.id] ?? MODE_DEFAULT_MEMORY_MB,
  };
}

/** Einmal: Server mit dem alten Standard auf den neuen setzen. Gibt die geänderten Server zurück. */
export async function retuneMemory(
  motor: Pick<MotorClient, 'request'>,
  dataDir: string,
  members: readonly Member[],
  modes: readonly Mode[],
  log: FastifyBaseLogger,
): Promise<Member[]> {
  const marker = path.join(dataDir, MARKER);
  const markerSport = path.join(dataDir, MARKER_SPORT);
  const first = !fs.existsSync(marker);
  const second = !fs.existsSync(markerSport);
  if (!first && !second) return [];
  const list = await motor.request<Array<{ readonly id: string; readonly memoryMb: number }>>(
    'GET',
    '/api/servers',
  );
  const memoryOf = new Map(list.map((s) => [s.id, s.memoryMb]));
  const changes = members.flatMap((m) => {
    const p = first ? plan(m.member, modes) : undefined;
    if (p && p.old !== p.now && memoryOf.get(m.serverId) === p.old) return [{ ...m, memoryMb: p.now }];
    const mode = second ? modes.find((md) => md.server === m.member) : undefined;
    const old = mode ? OLD_SPORT_MB[mode.id] : undefined;
    const now = mode ? (MODE_MEMORY_MB[mode.id] ?? MODE_DEFAULT_MEMORY_MB) : undefined;
    return old && now && old !== now && memoryOf.get(m.serverId) === old ? [{ ...m, memoryMb: now }] : [];
  });
  await changes.reduce(async (prev, c) => {
    await prev;
    await motor.request('PATCH', `/api/servers/${c.serverId}`, { memoryMb: c.memoryMb });
    log.info(
      { server: c.member, memoryMb: c.memoryMb },
      'Netzwerk: Arbeitsspeicher an den neuen Standard angepasst',
    );
  }, Promise.resolve());
  const stamp = `${new Date().toISOString()}\n`;
  if (first) fs.writeFileSync(marker, stamp);
  if (second) fs.writeFileSync(markerSport, stamp);
  return changes.map(({ serverId, member }) => ({ serverId, member }));
}
