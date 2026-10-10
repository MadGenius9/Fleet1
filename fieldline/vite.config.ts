import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve(import.meta.dirname),
  envDir: resolve(import.meta.dirname),
  plugins: [react()],
  server: { host: "0.0.0.0", port: 3100 },
  build: { outDir: "dist", emptyOutDir: true },
});
