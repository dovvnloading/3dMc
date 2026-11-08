import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Local development stays at /; GitHub Pages hosts repository projects at
 * /3dMc/. Only the Pages build uses Vite --mode github-pages.
 */
export default defineConfig(({ mode }) => ({
  base: mode === "github-pages" ? "/3dMc/" : "/",
  plugins: [react()],
  test: { environment: "node", include: ["src/**/*.test.ts"] }
}));
