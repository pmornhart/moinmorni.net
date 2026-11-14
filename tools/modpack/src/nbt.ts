/**
 * Kleiner NBT-Schreiber und -Leser. NBT ist Minecrafts Binärformat für Spielstände; hier nur die Arten, die die
 * Serverliste (`servers.dat`, ungepackt) braucht. Format: https://minecraft.wiki/w/NBT_format,
 * Serverliste: https://minecraft.wiki/w/Servers.dat_format
 */

export type NbtTag =
  | { readonly kind: 'byte'; readonly value: number }
  | { readonly kind: 'short'; readonly value: number }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'list'; readonly of: NbtKind | 'end'; readonly items: readonly NbtTag[] }
  | { readonly kind: 'compound'; readonly entries: readonly NbtEntry[] };

export type NbtKind = NbtTag['kind'];
export type NbtEntry = readonly [name: string, tag: NbtTag];
export type NbtCompound = Extract<NbtTag, { kind: 'compound' }>;

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;

const TAG_ID: Readonly<Record<NbtKind | 'end', number>> = {
  end: TAG_END,
  byte: TAG_BYTE,
  short: TAG_SHORT,
  int: TAG_INT,
  string: TAG_STRING,
  list: TAG_LIST,
  compound: TAG_COMPOUND,
};

const KIND_OF_ID: ReadonlyMap<number, NbtKind | 'end'> = new Map(
  Object.entries(TAG_ID).map(([kind, id]) => [id, kind as NbtKind | 'end']),
);

const BYTE_SIZE = 1;
const SHORT_SIZE = 2;
const INT_SIZE = 4;
const MAX_STRING_BYTES = 0xffff;

// Javas „modified UTF-8“: wie UTF-8, aber das Nullzeichen braucht zwei Bytes und Zeichen außerhalb der
// Grundebene (z. B. Emojis) werden als zwei Hälften mit je drei Bytes gespeichert.
const ONE_BYTE_MAX = 0x7f;
const TWO_BYTE_MAX = 0x7ff;
const SIX_BITS = 6;
const TWELVE_BITS = 12;
const LOW_SIX = 0x3f;
const CONTINUATION = 0x80;
const LEAD_TWO = 0xc0;
const LEAD_THREE = 0xe0;
const LEAD_TWO_BITS = 0x1f;
const LEAD_THREE_BITS = 0x0f;
const TOP_BIT = 0x80;
const TOP_THREE_BITS = 0xe0;

function unitBytes(unit: number): number[] {
  if (unit !== 0 && unit <= ONE_BYTE_MAX) return [unit];
  if (unit <= TWO_BYTE_MAX) return [LEAD_TWO | (unit >> SIX_BITS), CONTINUATION | (unit & LOW_SIX)];
  return [
    LEAD_THREE | (unit >> TWELVE_BITS),
    CONTINUATION | ((unit >> SIX_BITS) & LOW_SIX),
    CONTINUATION | (unit & LOW_SIX),
  ];
}

export function modifiedUtf8(text: string): Buffer {
  const units = Array.from({ length: text.length }, (_, i) => text.charCodeAt(i));
  return Buffer.from(units.flatMap(unitBytes));
}

interface DecodeState {
  readonly units: readonly number[];
  readonly value: number;
  readonly left: number;
}

function decodeByte(state: DecodeState, byte: number): DecodeState {
  if (state.left > 0) {
    const value = (state.value << SIX_BITS) | (byte & LOW_SIX);
    const left = state.left - 1;
    return left === 0
      ? { units: [...state.units, value], value: 0, left }
      : { units: state.units, value, left };
  }
  if ((byte & TOP_BIT) === 0) return { units: [...state.units, byte], value: 0, left: 0 };
  if ((byte & TOP_THREE_BITS) === LEAD_TWO)
    return { units: state.units, value: byte & LEAD_TWO_BITS, left: 1 };
  return { units: state.units, value: byte & LEAD_THREE_BITS, left: SHORT_SIZE };
}

export function fromModifiedUtf8(bytes: Buffer): string {
  const state = [...bytes].reduce<DecodeState>(decodeByte, { units: [], value: 0, left: 0 });
  if (state.left !== 0) throw new Error('NBT: Text endet mitten in einem Zeichen');
  return String.fromCharCode(...state.units);
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(SHORT_SIZE);
  b.writeUInt16BE(n);
  return b;
}

function i32(n: number): Buffer {
  const b = Buffer.alloc(INT_SIZE);
  b.writeInt32BE(n);
  return b;
}

function text(value: string): Buffer {
  const bytes = modifiedUtf8(value);
  if (bytes.length > MAX_STRING_BYTES) throw new Error(`NBT: Text zu lang (${bytes.length} Bytes)`);
  return Buffer.concat([u16(bytes.length), bytes]);
}

type Writers = { readonly [K in NbtKind]: (tag: Extract<NbtTag, { kind: K }>) => Buffer };

const WRITERS: Writers = {
  byte: (tag) => {
    const b = Buffer.alloc(BYTE_SIZE);
    b.writeInt8(tag.value);
    return b;
  },
  short: (tag) => {
    const b = Buffer.alloc(SHORT_SIZE);
    b.writeInt16BE(tag.value);
    return b;
  },
  int: (tag) => i32(tag.value),
  string: (tag) => text(tag.value),
  list: (tag) => {
    const stranger = tag.items.find((item) => item.kind !== tag.of);
    if (stranger) throw new Error(`NBT: Liste vom Typ ${tag.of} enthält ${stranger.kind}`);
    return Buffer.concat([Buffer.from([TAG_ID[tag.of]]), i32(tag.items.length), ...tag.items.map(payload)]);
  },
  compound: (tag) =>
    Buffer.concat([...tag.entries.map(([name, t]) => named(name, t)), Buffer.from([TAG_END])]),
};

function payload(tag: NbtTag): Buffer {
  return (WRITERS[tag.kind] as (t: NbtTag) => Buffer)(tag);
}

function named(name: string, tag: NbtTag): Buffer {
  return Buffer.concat([Buffer.from([TAG_ID[tag.kind]]), text(name), payload(tag)]);
}

/** Ganze NBT-Datei (ungepackt): ein benanntes Compound als Wurzel. */
export function writeNbt(root: NbtCompound, name = ''): Buffer {
  return named(name, root);
}

/** Liest Stück für Stück aus einem Puffer und meldet, wenn die Datei zu früh endet. */
class Cursor {
  offset = 0;

  constructor(readonly buf: Buffer) {}

  take(size: number): Buffer {
    if (this.offset + size > this.buf.length) throw new Error('NBT: Datei endet zu früh');
    const part = this.buf.subarray(this.offset, this.offset + size);
    this.offset += size;
    return part;
  }

  id(): number {
    return this.take(BYTE_SIZE).readUInt8();
  }

  text(): string {
    return fromModifiedUtf8(this.take(this.take(SHORT_SIZE).readUInt16BE()));
  }
}

function kindOf(id: number): NbtKind | 'end' {
  const kind = KIND_OF_ID.get(id);
  if (kind === undefined) throw new Error(`NBT: unbekannte Art ${id}`);
  return kind;
}

type Readers = { readonly [K in NbtKind]: (cursor: Cursor) => Extract<NbtTag, { kind: K }> };

const READERS: Readers = {
  byte: (c) => ({ kind: 'byte', value: c.take(BYTE_SIZE).readInt8() }),
  short: (c) => ({ kind: 'short', value: c.take(SHORT_SIZE).readInt16BE() }),
  int: (c) => ({ kind: 'int', value: c.take(INT_SIZE).readInt32BE() }),
  string: (c) => ({ kind: 'string', value: c.text() }),
  list: (c) => {
    const of = kindOf(c.id());
    const count = c.take(INT_SIZE).readInt32BE();
    if (count > 0 && of === 'end') throw new Error('NBT: Liste ohne Art mit Einträgen');
    const items = Array.from({ length: Math.max(count, 0) }, () => readPayload(c, of as NbtKind));
    return { kind: 'list', of, items };
  },
  compound: (c) => ({ kind: 'compound', entries: readEntries(c) }),
};

function readPayload(cursor: Cursor, kind: NbtKind): NbtTag {
  return (READERS[kind] as (c: Cursor) => NbtTag)(cursor);
}

function readEntries(cursor: Cursor): NbtEntry[] {
  const kind = kindOf(cursor.id());
  if (kind === 'end') return [];
  const name = cursor.text();
  const entry: NbtEntry = [name, readPayload(cursor, kind)];
  return [entry, ...readEntries(cursor)];
}

/** Liest eine ungepackte NBT-Datei. Wirft, wenn sie kaputt ist oder hinten etwas übrig bleibt. */
export function readNbt(buf: Buffer): { readonly name: string; readonly root: NbtCompound } {
  const cursor = new Cursor(buf);
  if (kindOf(cursor.id()) !== 'compound') throw new Error('NBT: Wurzel ist kein Compound');
  const name = cursor.text();
  const root = READERS.compound(cursor);
  if (cursor.offset !== buf.length) throw new Error(`NBT: ${buf.length - cursor.offset} Bytes übrig`);
  return { name, root };
}

export interface ServerEntry {
  readonly name: string;
  readonly ip: string;
}

/** `servers.dat`: die Serverliste im Mehrspieler-Menü, gleiche Reihenfolge der Felder wie Minecraft selbst. */
export function serversDat(servers: readonly ServerEntry[]): Buffer {
  const items: NbtCompound[] = servers.map((server) => ({
    kind: 'compound',
    entries: [
      ['name', { kind: 'string', value: server.name }],
      ['ip', { kind: 'string', value: server.ip }],
    ],
  }));
  return writeNbt({ kind: 'compound', entries: [['servers', { kind: 'list', of: 'compound', items }]] });
}
