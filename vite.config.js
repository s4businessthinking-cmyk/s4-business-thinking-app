import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

const disablePwa = process.env.DISABLE_PWA === "1";

export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
    "import.meta.env.VITE_GITHUB_OWNER": JSON.stringify("s4businessthinking-cmyk"),
    "import.meta.env.VITE_GITHUB_REPO": JSON.stringify("s4-business-thinking-app"),
  },
  plugins: [
    react(),
    VitePWA({
      disable: disablePwa,
      registerType: "autoUpdate",
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
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