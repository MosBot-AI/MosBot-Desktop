import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/perf/**/*.test.ts'],
    reporters: ['default'],
    testTimeout: 3_900_000,
    hookTimeout: 3_900_000,
  },
});
