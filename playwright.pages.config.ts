import { defineConfig, devices } from "@playwright/test";

/** Exercises Vite's production dist/ output, never the TSX development server. */
export default defineConfig({
  testDir: "./e2e-pages",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{
    name: "pages-chromium",
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: 1440, height: 900 },
      launchOptions: {
        args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      }
    }
  }],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174/3dMc/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  outputDir: "test-results/pages"
});
