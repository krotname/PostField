import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', workers: 1, timeout: 30_000,
  reporter: 'list', outputDir: 'output/playwright',
  webServer: { command: 'node e2e/server.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
