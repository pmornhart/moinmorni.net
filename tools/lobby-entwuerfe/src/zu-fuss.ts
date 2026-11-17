/**
 * Bericht „zu Fuß erreichbar“ für die echte Lobby: `tsx src/zu-fuss.ts [mindestgröße]`.
 * Zeigt jeden Raum und Platz, den die Bauten melden (erreicht? wie oft springen?), und alle Böden, die man vom
 * Ankunftspunkt aus nicht erreicht – Deko (Dächer, Baumkronen, Markisen …) zusammengefasst, Böden einzeln.
 */
import {
  buildLobby,
  DECOR_REASONS,
  LOBBY_SPAWN_VIEW,
  ON_PURPOSE,
  walkReport,
  type FloorKind,
  type LostFloor,
  type PlaceResult,
} from '@moinmorni/builder';

type DecorKind = Exclude<FloorKind, 'boden'>;
/** Deko statt Boden (Dach, Laub, Markise …) – als Typ-Prüfung, damit `DECOR_REASONS` den Schlüssel kennt. */
const isDecor = (l: LostFloor): l is LostFloor & { readonly kind: DecorKind } => l.kind !== 'boden';

const DEFAULT_MIN = 4;
/** Höhen im Bericht sind Sechzehntel-Blöcke. */
const SIXTEENTHS = 16;
const minSize = Number(process.argv[2] ?? DEFAULT_MIN);
const { canvas } = buildLobby();
const report = walkReport(canvas, LOBBY_SPAWN_VIEW, minSize);

/** Wie man hinkommt. */
function how(p: PlaceResult): string {
  if (!p.reached) return 'NICHT ERREICHBAR';
  return p.jumps === 0 ? 'zu Fuß' : `zu Fuß, ${p.jumps}× springen`;
}

/** ✓ erreicht, – gewollt nicht, ✗ fehlt. */
function mark(name: string, reached: boolean): string {
  if (reached) return '✓';
  return ON_PURPOSE[name] ? '–' : '✗';
}

console.log(`Ankunft: ${report.start.x} ${report.start.h / SIXTEENTHS} ${report.start.z}\n`);
console.log('Räume und Plätze:');
report.places.forEach((p) => {
  const why = ON_PURPOSE[p.name];
  const note = !p.reached && why ? ` (gewollt: ${why})` : '';
  console.log(`  ${mark(p.name, p.reached)} ${p.name}: ${how(p)}${note}`);
});
const floors = report.lost.filter((l) => l.kind === 'boden');
console.log(`\nBöden ab ${minSize} Spalten, die man nicht erreicht: ${floors.length}`);
floors.forEach((l) =>
  console.log(
    `  ${mark(l.name, false)} ${l.name}: ${l.size} Spalten, Füße auf ${l.y}, x ${l.x1}…${l.x2}, z ${l.z1}…${l.z2}`,
  ),
);
const decor = report.lost.filter(isDecor);
const byKind = decor.reduce((m, l) => m.set(l.kind, (m.get(l.kind) ?? 0) + 1), new Map<DecorKind, number>());
console.log('\nUnerreichbar, aber Deko:');
[...byKind].forEach(([kind, n]) => console.log(`  ${n}× ${DECOR_REASONS[kind]}`));
