/**
 * Skins der Lobby-Figuren signieren lassen: lädt jeden eigenen Skin (`packages/builder/src/cast.ts`) einmal bei
 * MineSkin hoch (https://docs.mineskin.org, ohne Schlüssel, nicht öffentlich gelistet) und schreibt die von Mojang
 * signierten Skin-Daten nach `packages/builder/src/cast-textures.ts`. Damit sehen alle Spieler die Trachten – ohne
 * Texturpaket und (über Geyser) auch auf Bedrock. Nur neu hochladen, was sich geändert hat:
 *   tsx src/sign-skins.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CAST,
  CAST_TEXTURES,
  PENDING_CAST,
  castSkinPng,
  skinHash,
  type SignedSkin,
} from '@moinmorni/builder';

const API = 'https://api.mineskin.org/v2/generate';
const USER_AGENT = 'MoinMorni-Lobby/0.1 (+https://github.com/pmornhart/moinmorni.net)';
const TARGET = path.resolve(import.meta.dirname, '../../../packages/builder/src/cast-textures.ts');
const FALLBACK_WAIT_MS = 7000;
const RETRY_LIMIT = 3;

interface Answer {
  readonly success: boolean;
  readonly skin?: {
    readonly uuid: string;
    readonly texture: { readonly data: { value: string; signature: string } };
  };
  readonly rateLimit?: {
    readonly next?: { readonly relative?: number };
    readonly delay?: { readonly millis?: number };
  };
  readonly errors?: ReadonlyArray<{ code: string; message: string }>;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function upload(id: string, png: Buffer, attempt = 1): Promise<{ signed: SignedSkin; waitMs: number }> {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), `${id}.png`);
  form.append('variant', 'classic');
  form.append('visibility', 'unlisted');
  form.append('name', `moinmorni-${id}`);
  const res = await fetch(API, { method: 'POST', body: form, headers: { 'User-Agent': USER_AGENT } });
  const answer = (await res.json()) as Answer;
  const waitMs = Math.max(answer.rateLimit?.next?.relative ?? 0, answer.rateLimit?.delay?.millis ?? 0, 0);
  if (!answer.success || !answer.skin) {
    if (attempt >= RETRY_LIMIT) throw new Error(`${id}: ${JSON.stringify(answer.errors)}`);
    await wait(waitMs || FALLBACK_WAIT_MS);
    return upload(id, png, attempt + 1);
  }
  const { value, signature } = answer.skin.texture.data;
  return { signed: { hash: skinHash(png), value, signature, mineskin: answer.skin.uuid }, waitMs };
}

async function main(): Promise<void> {
  // Neue Figuren (PENDING_CAST) gleich mit: Sobald sie signiert sind, tragen sie ihre eigene Tracht.
  const ids = Object.keys({ ...CAST, ...PENDING_CAST }).sort();
  const result: Record<string, SignedSkin> = { ...CAST_TEXTURES };
  await ids.reduce(async (prev, id) => {
    await prev;
    const png = castSkinPng(id);
    if (result[id]?.hash === skinHash(png)) return;
    const { signed, waitMs } = await upload(id, png);
    result[id] = signed;
    console.log(`signiert: ${id}`);
    await wait(waitMs || FALLBACK_WAIT_MS);
  }, Promise.resolve());
  const body = Object.keys(result)
    .filter((id) => ids.includes(id))
    .sort()
    .map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(result[id])},`)
    .join('\n');
  fs.writeFileSync(
    TARGET,
    `/**\n * Von Mojang signierte Skin-Daten der Lobby-Figuren (erzeugt mit tools/lobby-entwuerfe/src/sign-skins.ts über\n * MineSkin). Öffentliche Daten: Adresse des Skins auf textures.minecraft.net + Signatur, keine Geheimnisse.\n * \`hash\` = SHA-256 des Skin-Bilds – passt er nicht mehr, wurde die Tracht geändert und muss neu signiert werden.\n */\nimport type { SignedSkin } from './cast.js';\n\nexport const CAST_TEXTURES: Readonly<Record<string, SignedSkin>> = {\n${body}\n};\n`,
  );
  console.log('geschrieben:', TARGET);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
