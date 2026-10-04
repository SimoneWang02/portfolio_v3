import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api is served by server.py (keeps the DeepSeek key off the browser)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8000" },
  },
});
