import crypto from 'node:crypto';
import { z } from 'zod';

/**
 * Hub-Protokoll (docs/hub-protokoll.md): Schlüssel pro Server, Handschlag mit zwei Zufallswerten, danach jeder
 * Rahmen mit Zähler und HMAC. Die gleiche Rechnung steckt im Java-Plugin (`HubCrypto`).
 */

export const PROTOCOL_VERSION = 1;
const NONCE_BYTES = 16;
const SERVER_NAME_MAX = 32;
// Server-Name wie in Velocity: "lobby", "morni-party"; nicht "Lobby" oder "a b".
// https://regex101.com/?flavor=javascript&regex=%5E%5Ba-z0-9%5D%5Ba-z0-9_-%5D*%24&testString=morni-party
const SERVER_NAME = /^[a-z0-9][a-z0-9_-]*$/;
// 32 Hex-Zeichen (16 Bytes) – Zufallswert im Handschlag.
// https://regex101.com/?flavor=javascript&regex=%5E%5B0-9a-f%5D%7B32%7D%24&testString=0123456789abcdef0123456789abcdef
const NONCE = /^[0-9a-f]{32}$/;
// 64 Hex-Zeichen – ein HMAC-SHA256.
// https://regex101.com/?flavor=javascript&regex=%5E%5B0-9a-f%5D%7B64%7D%24&testString=00
const MAC = /^[0-9a-f]{64}$/;

export const SERVER_KINDS = ['proxy', 'backend'] as const;
export type ServerKind = (typeof SERVER_KINDS)[number];

const hmac = (key: string | Buffer, text: string): string =>
  crypto.createHmac('sha256', key).update(text, 'utf8').digest('hex');

/** Geheimnis des Hubs, abgeleitet aus MM_SECRET (das selbst nie direkt benutzt wird). */
export const hubSecretOf = (secret: string): Buffer =>
  crypto.createHmac('sha256', secret).update('moinmorni-hub').digest();

/** Schlüssel eines Servers – steht in dessen hub.json. */
export const serverKeyOf = (hubSecret: Buffer, server: string): string => hmac(hubSecret, `server|${server}`);

export const newNonce = (): string => crypto.randomBytes(NONCE_BYTES).toString('hex');

export const authProof = (
  serverKey: string,
  hubNonce: string,
  pluginNonce: string,
  server: string,
  kind: ServerKind,
): string => hmac(serverKey, `auth|${hubNonce}|${pluginNonce}|${server}|${kind}`);

export const sessionKeyOf = (serverKey: string, hubNonce: string, pluginNonce: string): string =>
  hmac(serverKey, `session|${hubNonce}|${pluginNonce}`);

export const frameMac = (sessionKey: string, seq: number, body: string): string =>
  hmac(sessionKey, `${seq}.${body}`);

/** Gleiche Länge vorausgesetzt (beide Hex-HMACs) – Vergleich in fester Zeit. */
export const sameMac = (a: string, b: string): boolean =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const authSchema = z.object({
  t: z.literal('auth'),
  v: z.literal(PROTOCOL_VERSION),
  server: z.string().max(SERVER_NAME_MAX).regex(SERVER_NAME),
  kind: z.enum(SERVER_KINDS),
  nonce: z.string().regex(NONCE),
  proof: z.string().regex(MAC),
});

export const frameSchema = z.object({
  s: z.number().int().positive(),
  b: z.string(),
  h: z.string().regex(MAC),
});

/** Gemeinsam: ein Rahmen aus Zähler + Nachricht. */
export function seal(sessionKey: string, seq: number, body: unknown): string {
  const b = JSON.stringify(body);
  return JSON.stringify({ s: seq, b, h: frameMac(sessionKey, seq, b) });
}

/** Binär-Rahmen (Sprache): 8 Byte Zähler, 32 Byte HMAC über Zähler + Inhalt, dann der Inhalt. */
const SEQ_BYTES = 8;
const MAC_BYTES = 32;
export const BINARY_HEADER = SEQ_BYTES + MAC_BYTES;

const seqBytes = (seq: number): Buffer => {
  const b = Buffer.alloc(SEQ_BYTES);
  b.writeBigUInt64BE(BigInt(seq));
  return b;
};

export const binaryMac = (sessionKey: string, seq: number, payload: Buffer): Buffer =>
  crypto.createHmac('sha256', sessionKey).update(seqBytes(seq)).update(payload).digest();

export function sealBinary(sessionKey: string, seq: number, payload: Buffer): Buffer {
  return Buffer.concat([seqBytes(seq), binaryMac(sessionKey, seq, payload), payload]);
}

/** Prüft einen Binär-Rahmen; null = falsch (Zähler oder Signatur). */
export function openBinary(sessionKey: string, expectedSeq: number, frame: Buffer): Buffer | null {
  if (frame.length < BINARY_HEADER) return null;
  const seq = Number(frame.readBigUInt64BE(0));
  if (seq !== expectedSeq) return null;
  const payload = frame.subarray(BINARY_HEADER);
  const mac = frame.subarray(SEQ_BYTES, BINARY_HEADER);
  return crypto.timingSafeEqual(mac, binaryMac(sessionKey, seq, payload)) ? payload : null;
}
