import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
export default defineConfig({
  testDir: ".", testMatch: "hardware-device.spec.ts", workers: 1, retries: 0,
  timeout: 360_000, expect: { timeout: 10_000 },
  use: { baseURL: "http://127.0.0.1:4182", headless: false, viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--enable-webgl"] },
    trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4182 --strictPort", cwd: repoRoot, url: "http://127.0.0.1:4182", reuseExistingServer: false, timeout: 60_000 }
});
