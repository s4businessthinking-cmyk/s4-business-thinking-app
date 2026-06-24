import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "S4 Business Thinking",
        short_name: "S4 Business",
        start_url: ".",
        display: "standalone",
        background_color: "#071427",
        theme_color: "#071427",
        icons: []
      }
    })
  ]
});