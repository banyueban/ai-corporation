import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: "dist/renderer",
  },
  plugins: [react()],
});
