import { defineConfig } from 'vitest/config';

// Tests mit dem echten Motor brauchen unter Last (alle Dateien parallel) mehr als die üblichen 5 s.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
