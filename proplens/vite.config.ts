import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre is most of the report chunk; it is lazy-loaded, so the landing page stays small.
  build: { chunkSizeWarningLimit: 1600 },
  // The alerts API runs in the Cloudflare worker: start it with `npm run dev:api`.
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
