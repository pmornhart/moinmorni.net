/**
 * Zod (checks in the shared packages and in the embedded server pages) tries once with `new Function` whether it may
 * build faster checks. The page's security rules (Content-Security-Policy: scripts only from our own files) forbid
 * that on purpose – the probe fails quietly, but the browser reports a violation on every page. "jitless" skips the
 * probe; the checks work exactly the same. Zod keeps its settings on globalThis, so this reaches every copy of Zod in
 * the bundle – it has to run before the first check (imported first in main.tsx).
 */
interface ZodGlobal {
  __zod_globalConfig?: Record<string, unknown>;
}

const holder = globalThis as ZodGlobal;
holder.__zod_globalConfig = { ...holder.__zod_globalConfig, jitless: true };
