import { defineConfig } from 'tsup';

// Gemeinsame Typen und Kataloge (TypeScript-Quellen) gehören ins Bündel; alles andere kommt aus node_modules.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  noExternal: ['@moinmorni/shared', '@moinmorni/builder'],
  banner: {
    js: "import { createRequire as __mmCreateRequire } from 'node:module'; const require = __mmCreateRequire(import.meta.url);",
  },
});
