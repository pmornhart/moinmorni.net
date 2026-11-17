/**
 * Bauplan-Prüfung der Lobby auf der Kommandozeile: `npx tsx tools/lobby-entwuerfe/src/pruefen.ts [art …]`.
 * Listet jeden Fund mit Koordinaten (Bauplan und alle Saison-Dekos), am Ende die Zahl je Art.
 */
import { checkLobby, countByKind, describe } from '@moinmorni/builder';

/** node + Skript stehen vor den eigenen Angaben. */
const ARGS_FROM = 2;

function main(): void {
  const only = new Set(process.argv.slice(ARGS_FROM));
  const { plan, seasons } = checkLobby();
  const show = (title: string, funde: Parameters<typeof describe>[0]): void => {
    const shown = funde.filter((f) => only.size === 0 || only.has(f.art));
    console.log(`\n== ${title}: ${funde.length} Funde ${JSON.stringify(countByKind(funde))}`);
    describe(shown).forEach((line) => console.log(line));
  };
  show('Bauplan', plan);
  Object.entries(seasons).forEach(([season, funde]) => show(`Saison ${season}`, funde));
}

main();
