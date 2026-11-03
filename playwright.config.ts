import { defineConfig } from '@playwright/test';

/**
 * Electron end-to-end tests run against the packaged build produced by
 * `pnpm package` (output: `out/MosBot-darwin-<arch>/MosBot.app`). They never
 * talk to a mock server: M0a only exercises the offline design slice.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  outputDir: 'test-results/e2e',
});
