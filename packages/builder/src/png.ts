/**
 * Bilder und Archive ohne Zusatzpakete: PNG (RGBA, 8 Bit) nach https://www.w3.org/TR/png/ und ZIP (ungepackt) nach
 * https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT – für Skins, das Texturpaket der Lobby und Lagepläne.
 */
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RGBA = 4;
const BIT_DEPTH = 8;
const COLOUR_TYPE_RGBA = 6;
const HEADER_SIZE = 13;
const BYTE = 255;
const BITS = 8;

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  return Buffer.concat([u32(data.length), body, u32(zlib.crc32(body))]);
}

/** Bild als RGBA-Puffer (Breite × Höhe × 4), anfangs ganz durchsichtig. */
export class Picture {
  readonly data: Buffer;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = Buffer.alloc(width * height * RGBA);
  }

  /** Farbe als 0xRRGGBB; `alpha` 0 … 255. */
  set(x: number, y: number, rgb: number, alpha = BYTE): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * RGBA;
    this.data[i] = (rgb >> (BITS * 2)) & BYTE;
    this.data[i + 1] = (rgb >> BITS) & BYTE;
    this.data[i + 2] = rgb & BYTE;
    this.data[i + 3] = alpha;
  }

  png(): Buffer {
    const header = Buffer.alloc(HEADER_SIZE);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, RGBA);
    header[8] = BIT_DEPTH;
    header[9] = COLOUR_TYPE_RGBA;
    const stride = this.width * RGBA;
    const rows = Array.from({ length: this.height }, (_, y) =>
      Buffer.concat([Buffer.from([0]), this.data.subarray(y * stride, (y + 1) * stride)]),
    );
    return Buffer.concat([
      SIGNATURE,
      chunk('IHDR', header),
      chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

function le(n: number, bytes: 2 | 4): Buffer {
  const b = Buffer.alloc(bytes);
  if (bytes === 2) b.writeUInt16LE(n);
  else b.writeUInt32LE(n >>> 0);
  return b;
}

/** Dateien als ZIP (ungepackt). Festes Datum, damit gleiche Dateien immer dieselben Bytes (und SHA-1) ergeben. */
export function zipOf(entries: readonly ZipEntry[]): Buffer {
  const DOS_YEAR = 1980;
  const YEAR = 2026;
  const stamp = Buffer.concat([le(0, 2), le(((YEAR - DOS_YEAR) << 9) | (1 << 5) | 1, 2)]);
  const VERSION = 20;
  const UTF8_FLAG = 0x0800;
  const parts = entries.reduce<{ locals: Buffer[]; centrals: Buffer[]; offset: number }>(
    (acc, entry) => {
      const name = Buffer.from(entry.name, 'utf8');
      const sizes = Buffer.concat([
        le(zlib.crc32(entry.data), 4),
        le(entry.data.length, 4),
        le(entry.data.length, 4),
        le(name.length, 2),
        le(0, 2),
      ]);
      const local = Buffer.concat([
        le(0x04034b50, 4),
        le(VERSION, 2),
        le(UTF8_FLAG, 2),
        le(0, 2),
        stamp,
        sizes,
        name,
        entry.data,
      ]);
      const central = Buffer.concat([
        le(0x02014b50, 4),
        le(VERSION, 2),
        le(VERSION, 2),
        le(UTF8_FLAG, 2),
        le(0, 2),
        stamp,
        sizes,
        le(0, 2),
        le(0, 2),
        le(0, 2),
        le(0, 4),
        le(acc.offset, 4),
        name,
      ]);
      return {
        locals: [...acc.locals, local],
        centrals: [...acc.centrals, central],
        offset: acc.offset + local.length,
      };
    },
    { locals: [], centrals: [], offset: 0 },
  );
  const directory = Buffer.concat(parts.centrals);
  const end = Buffer.concat([
    le(0x06054b50, 4),
    le(0, 2),
    le(0, 2),
    le(entries.length, 2),
    le(entries.length, 2),
    le(directory.length, 4),
    le(parts.offset, 4),
    le(0, 2),
  ]);
  return Buffer.concat([...parts.locals, directory, end]);
}
