import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './reports',
  testMatch: '**/*.spec.ts',
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
