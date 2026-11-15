/** Minecraft names like the server takes them (apps/server/src/mornicraft/applications.ts). */

// Java: 3–16 letters, digits, underscore ("Lena_Baut"); Bedrock players (through Geyser) with a dot in front
// (".Lena"). "Lena Baut" (space) or "Le" (too short) do not fit.
// https://regex101.com/?flavor=javascript&regex=%5E%5C.%3F%5Ba-zA-Z0-9_%5D%7B3%2C16%7D%24&testString=.Lena_Baut%0ALena%20Baut
const MINECRAFT_NAME = /^\.?[a-zA-Z0-9_]{3,16}$/;
const BEDROCK_MARK = '.';
/** 16 characters plus the dot of Bedrock names. */
export const MINECRAFT_NAME_MAX = 17;

export function validMinecraftName(name: string): boolean {
  return MINECRAFT_NAME.test(name.trim());
}

/** Bedrock players (phone, console, Windows) join through Geyser and get a dot in front of their name. */
export function isBedrockName(name: string): boolean {
  return name.startsWith(BEDROCK_MARK);
}

/** Red frame for a field the person still has to fix (fields set aria-invalid). */
export const INVALID_FIELD = 'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20';
