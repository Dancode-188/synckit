import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for multi-tab testing
 *
 * This config supports multi-tab scenarios for testing leader election,
 * network partitions, cross-tab synchronization, and integration tests.
 */
export default defineConfig({
  testDir: './src/__tests__',
  testMatch: ['**/{chaos,integration}/*.test.ts'],
  testIgnore: [
    '**/integration/sync.test.ts',
    '**/integration/richtext-character-id.test.ts',
    '**/integration/multi-tab-basic.test.ts',
    '**/integration/cross-feature.test.ts',
    '**/integration/selection-sharing.test.ts',
  ],

  // Run tests in parallel
  fullyParallel: false, // Chaos tests should run sequentially to avoid port conflicts

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Use all available workers
  workers: 1, // Chaos tests need sequential execution

  // Reporter to use
  reporter: 'html',

  // Shared settings for all tests
  use: {
    // Base URL for the test harness (will be started by webServer)
    baseURL: 'http://localhost:5173',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Configure which projects to run
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Run the dev server before starting tests
  webServer: {
    command: 'cd ../examples/react-example && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
