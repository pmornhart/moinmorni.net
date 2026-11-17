import { defineConfig } from 'vitest/config';

// Viele Tests bauen die ganze Lobby (Hunderttausende Blöcke); auf einem ausgelasteten Rechner dauert das Minuten.
export default defineConfig({
  test: { testTimeout: 300_000, hookTimeout: 300_000 },
});
