import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/// Resolve the public app URL at build time. Set VITE_APP_URL explicitly, or
/// rely on the host's env (Vercel / Netlify). Empty in plain local builds.
function resolveAppUrl(): string {
  const raw =
    process.env.VITE_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    process.env.URL || // Netlify production
    process.env.DEPLOY_PRIME_URL || // Netlify deploy preview
    "";
  return raw.replace(/\/+$/, "");
}

/// Inject the deployed domain into the Mini App embed meta (index.html) and the
/// Farcaster manifest (dist/.well-known/farcaster.json), replacing __APP_URL__.
/// No-op when the URL is unknown (local builds keep the placeholder).
function miniAppHost(): Plugin {
  const appUrl = resolveAppUrl();
  return {
    name: "diamond-hands:miniapp-host",
    transformIndexHtml(html) {
      return appUrl ? html.replaceAll("__APP_URL__", appUrl) : html;
    },
    closeBundle() {
      if (!appUrl) {
        console.warn("[miniapp-host] VITE_APP_URL not set — manifest/meta keep __APP_URL__ placeholders.");
        return;
      }
      const manifest = resolve(process.cwd(), "dist/.well-known/farcaster.json");
      if (existsSync(manifest)) {
        writeFileSync(manifest, readFileSync(manifest, "utf8").replaceAll("__APP_URL__", appUrl));
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), miniAppHost()],
  server: {
    host: true,
    port: 5173,
  },
});
