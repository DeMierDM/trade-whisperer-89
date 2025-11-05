import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "development" ? "./" : "/", // Use relative paths for Electron builds
  server: {
    host: "0.0.0.0",
    port: 8080,
    watch: {
      usePolling: true,
    },
    hmr: {
      port: 8080,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Enable environment detection
    'process.env.CODESPACE_NAME': JSON.stringify(process.env.CODESPACE_NAME || ''),
    'process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN': JSON.stringify(process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || ''),
  },
}));
