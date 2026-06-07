import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/global-setup.js',
  workers: 1,
  use: { baseURL: 'http://localhost:3001' },
  webServer: {
    command: 'node --env-file=.env.test index.js',
    url: 'http://localhost:3001/login',
    reuseExistingServer: false,
  },
});
