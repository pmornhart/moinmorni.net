/**
 * Ersatz-Proxy zum Testen der Lobby ohne Velocity: meldet dem Hub die genannten Spieler als „auf der Lobby“ (wie
 * Velocity es tut) und schreibt jede Nachricht, die der Hub an den Proxy schickt (`msg`, `connect`, `kick` …), als
 * JSON-Zeile auf die Ausgabe – so sieht ein Test, was ein Klick auf eine Figur auslöst.
 *   tsx scripts/proxy-lauschen.ts <hub.json des Proxys> <spieler> […]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { ServerKind } from '../src/hub/protocol.js';
import { connectPlugin } from '../test/fake-plugin.js';

const REPEAT_MS = 2_000;
/** node + Skript stehen vor den eigenen Angaben. */
const ARGS_FROM = 2;
const UUID_VERSION_3 = 0x30;
const UUID_VARIANT = 0x80;
const LOW_NIBBLE = 0x0f;
const LOW_SIX = 0x3f;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;
/** Wo in den 32 Hex-Zeichen die Bindestriche stehen (8-4-4-4-12). */
const DASHES = [8, 12, 16, 20] as const;
/** So oft je Meldung nachsehen, ob der Hub etwas geschickt hat. */
const LOOKS_PER_REPORT = 4;

/** UUID, die ein Offline-Server einem Namen gibt (wie Minecraft: MD5 von „OfflinePlayer:<name>“, Version 3). */
function offlineUuid(name: string): string {
  const b = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  b[VERSION_BYTE] = ((b[VERSION_BYTE] ?? 0) & LOW_NIBBLE) | UUID_VERSION_3;
  b[VARIANT_BYTE] = ((b[VARIANT_BYTE] ?? 0) & LOW_SIX) | UUID_VARIANT;
  const h = b.toString('hex');
  return [0, ...DASHES].map((from, i) => h.slice(from, DASHES[i])).join('-');
}

async function main(): Promise<void> {
  const [file = 'hub.json', ...names] = process.argv.slice(ARGS_FROM);
  const hub = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    url: string;
    server: string;
    kind: ServerKind;
    key: string;
  };
  const proxy = await connectPlugin(hub.url, hub.server, hub.kind, hub.key);
  const players = names.map((name) => ({ uuid: offlineUuid(name), name, server: 'lobby', bedrock: false }));
  const report = (): void => proxy.send({ t: 'online', players });
  report();
  setInterval(report, REPEAT_MS);
  const seen = new Set<unknown>();
  setInterval(() => {
    proxy.received
      .filter((m) => !seen.has(m))
      .forEach((m) => {
        seen.add(m);
        if (m.t !== 'lobby' && m.t !== 'profile') console.log(JSON.stringify(m));
      });
  }, REPEAT_MS / LOOKS_PER_REPORT);
  await proxy.closed;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
