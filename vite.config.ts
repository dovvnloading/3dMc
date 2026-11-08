import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Local development stays at /; GitHub Pages hosts repository projects at
 * /3dMc/. Only the Pages build sets DEPLOY_TARGET=github-pages.
 */
const githubPages = process.env.DEPLOY_TARGET === "github-pages";

export default defineConfig({
  base: githubPages ? "/3dMc/" : "/",
  plugins: [react()],
  test: { environment: "node", include: ["src/**/*.test.ts"] }
});
