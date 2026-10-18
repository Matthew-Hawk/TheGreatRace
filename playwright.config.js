import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4191',
    channel: process.env.CI ? undefined : 'msedge',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      process.env.PAGES_BROWSER_TEST === '1'
        ? 'node browser-tests/pages-server.js'
        : 'node browser-tests/server.js',
    url: 'http://127.0.0.1:4191',
    reuseExistingServer: false,
  },
});
