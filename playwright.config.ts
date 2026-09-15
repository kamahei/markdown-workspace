import { defineConfig } from '@playwright/test';

/**
 * Extensions only load in a persistent context, so tests launch their own
 * browser rather than using Playwright's default fixtures.
 * See tests/e2e/fixtures.ts.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
