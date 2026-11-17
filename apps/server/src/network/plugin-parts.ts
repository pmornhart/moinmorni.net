import crypto from 'node:crypto';

/**
 * Das Netzwerk-Plugin ist eine Jar für Velocity (Proxy) und Paper (Spielserver). Fast jedes Update ändert etwas an den
 * Paper-Teilen (Lobby, Jump and Run …) – der Proxy braucht davon nichts. Damit er nicht bei jedem Update mit allen
 * Spielern neu startet (Philip: „ganz zuletzt, nur wenn wirklich nötig, der Proxy“), zählt für ihn nur ein Fingerabdruck
 * der Teile, die Velocity lädt: alles außer `de/moinmorni/network/paper/`, der Modus-Schnittstelle `de/moinmorni/api/`
 * (ein Bukkit-Dienst) und der `plugin.yml` von Paper. Gleicher Fingerabdruck = neue Jar liegt schon da (gilt beim
 * nächsten Neustart des Proxys), aber kein Neustart deswegen.
 *
 * Gelesen wird nur das Inhaltsverzeichnis der Jar (ZIP): Name, CRC-32 und Größe jedes Eintrags – ohne Entpacken.
 */

/** Teile, die nur Paper lädt. */
const PAPER_ONLY: readonly string[] = ['de/moinmorni/network/paper/', 'de/moinmorni/api/', 'plugin.yml'];
/** Ändert sich mit jedem Bau (Zeitstempel, Maven-Angaben) und sagt nichts über den Code. */
const NOISE: readonly string[] = ['META-INF/maven/', 'META-INF/MANIFEST.MF'];

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_MIN_BYTES = 22;
/** Kommentar am Ende der ZIP-Datei: höchstens 65 535 Bytes. */
const ZIP_COMMENT_MAX_BYTES = 65_535;
const EOCD_SEARCH_BYTES = EOCD_MIN_BYTES + ZIP_COMMENT_MAX_BYTES;
const EOCD_ENTRIES = 10;
const EOCD_CENTRAL_OFFSET = 16;
const CENTRAL_HEADER_BYTES = 46;
const CENTRAL_CRC = 16;
const CENTRAL_SIZE = 24;
const CENTRAL_NAME_LENGTH = 28;
const CENTRAL_EXTRA_LENGTH = 30;
const CENTRAL_COMMENT_LENGTH = 32;

interface Entry {
  readonly name: string;
  readonly crc: number;
  readonly size: number;
}

/** Einträge aus dem Inhaltsverzeichnis; null = keine (lesbare) ZIP-Datei. */
function entriesOf(bytes: Uint8Array): Entry[] | null {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < EOCD_MIN_BYTES) return null;
  const from = Math.max(0, buf.length - EOCD_SEARCH_BYTES);
  const eocd = [...Array(buf.length - EOCD_MIN_BYTES - from + 1).keys()]
    .map((i) => buf.length - EOCD_MIN_BYTES - i)
    .find((at) => buf.readUInt32LE(at) === EOCD_SIGNATURE);
  if (eocd === undefined) return null;
  const count = buf.readUInt16LE(eocd + EOCD_ENTRIES);
  const read = (at: number, left: number, acc: Entry[]): Entry[] | null => {
    if (left === 0) return acc;
    if (at + CENTRAL_HEADER_BYTES > buf.length || buf.readUInt32LE(at) !== CENTRAL_SIGNATURE) return null;
    const nameLength = buf.readUInt16LE(at + CENTRAL_NAME_LENGTH);
    const next =
      at +
      CENTRAL_HEADER_BYTES +
      nameLength +
      buf.readUInt16LE(at + CENTRAL_EXTRA_LENGTH) +
      buf.readUInt16LE(at + CENTRAL_COMMENT_LENGTH);
    if (next > buf.length) return null;
    acc.push({
      name: buf.toString('utf8', at + CENTRAL_HEADER_BYTES, at + CENTRAL_HEADER_BYTES + nameLength),
      crc: buf.readUInt32LE(at + CENTRAL_CRC),
      size: buf.readUInt32LE(at + CENTRAL_SIZE),
    });
    return read(next, left - 1, acc);
  };
  // Viele tausend Einträge hat die Jar nie; eine Schleife über Rekursion bleibt hier flach genug.
  return read(buf.readUInt32LE(eocd + EOCD_CENTRAL_OFFSET), count, []);
}

/**
 * Fingerabdruck der Teile, die Velocity lädt. null = Jar nicht lesbar (dann lieber neu starten).
 */
export function proxyFingerprint(jar: Uint8Array): string | null {
  const entries = entriesOf(jar);
  if (!entries) return null;
  const lines = entries
    .filter((e) => !e.name.endsWith('/'))
    .filter((e) => ![...PAPER_ONLY, ...NOISE].some((p) => e.name === p || e.name.startsWith(p)))
    .map((e) => `${e.name}\u0000${e.crc}\u0000${e.size}`)
    .sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}
