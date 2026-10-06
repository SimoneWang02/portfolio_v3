import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api is served by the Laravel backend (backend/, php artisan serve on :8000), which keeps the DeepSeek key off the browser
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    proxy: { "/api": "http://localhost:8000" },
  },
});
