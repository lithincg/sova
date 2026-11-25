import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/jobs": "http://127.0.0.1:8080",
      "/actuator": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080",
      "/api": "http://127.0.0.1:8080",
    },
  },
});
