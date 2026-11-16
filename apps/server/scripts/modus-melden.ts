/**
 * Ein Spielmodus „auf Zuruf“ zum Testen der Lobby: verbindet sich mit der hub.json eines Modus-Servers wie das
 * Netzwerk-Plugin und meldet einen Zustand (z. B. Wintersport „closed“ = Sommerpause). Bleibt verbunden, bis man
 * es beendet – so gilt der Modus als wach.
 *   tsx scripts/modus-melden.ts <hub.json> <modus> <zustand> [spieler]
 */
import fs from 'node:fs';
import type { ServerKind } from '../src/hub/protocol.js';
import { connectPlugin } from '../test/fake-plugin.js';

const REPEAT_MS = 10_000;
/** node + Skript stehen vor den eigenen Angaben. */
const ARGS_FROM = 2;

async function main(): Promise<void> {
  const [file = 'hub.json', mode = 'wintersport', state = 'closed', players = '0'] =
    process.argv.slice(ARGS_FROM);
  const hub = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    url: string;
    server: string;
    kind: ServerKind;
    key: string;
  };
  const plugin = await connectPlugin(hub.url, hub.server, hub.kind, hub.key);
  const report = (): void => plugin.send({ t: 'mode-state', mode, state, players: Number(players) });
  report();
  setInterval(report, REPEAT_MS);
  console.log(`${hub.server}: meldet ${mode} = ${state}`);
  await plugin.closed;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
