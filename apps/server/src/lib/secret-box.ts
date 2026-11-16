import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Kleine Geheimnisse (Bot-Token, Client-Secret von Discord) verschlüsselt ablegen – derselbe Weg wie im Motor
 * (MorniHosting `lib/crypto.ts`): AES-256-GCM mit einem Schlüssel, der aus MM_SECRET abgeleitet ist. Ohne MM_SECRET
 * lässt sich nichts öffnen; wer nur die Datenbank hat, sieht nur Zeichensalat.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION_PREFIX = 'v1:';
const CIPHER = 'aes-256-gcm';

export interface SecretBox {
  readonly seal: (plain: string) => string;
  /** null = kaputt oder mit einem anderen MM_SECRET versiegelt. */
  readonly open: (sealed: string) => string | null;
}

export function createSecretBox(secret: string): SecretBox {
  const key = Buffer.from(hkdfSync('sha256', secret, 'moinmorni', 'secret-box', KEY_BYTES));
  return {
    seal: (plain) => {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(CIPHER, key, iv, { authTagLength: TAG_BYTES });
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return VERSION_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    },
    open: (sealed) => {
      if (!sealed.startsWith(VERSION_PREFIX)) return null;
      const raw = Buffer.from(sealed.slice(VERSION_PREFIX.length), 'base64');
      try {
        const decipher = createDecipheriv(CIPHER, key, raw.subarray(0, IV_BYTES), {
          authTagLength: TAG_BYTES,
        });
        decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
        return Buffer.concat([
          decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        return null;
      }
    },
  };
}
