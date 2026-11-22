/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": "/src" } },
  server: {
    port: 5173,
    // The design checks keep Chrome profiles and screenshots here; never watch them.
    watch: { ignored: ["**/.taste-skill/**", "**/shots/**"] },
    // Same-origin API in dev: cookies (session + CSRF) and the Google callback live on :5173.
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("highlight.js") || id.includes("react-markdown") || id.includes("remark") || id.includes("rehype") || id.includes("micromark") || id.includes("mdast"))
            return "markdown";
          if (id.includes("node_modules/motion") || id.includes("framer-motion")) return "motion";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
