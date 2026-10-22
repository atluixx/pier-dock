import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Pré-visualização no navegador com IPC falso (ver `src/dev/mock.ts`); fica fora do build. */
const devMock: Plugin = {
  name: "dev-mock",
  apply: "serve",
  transformIndexHtml: (_html, ctx) => {
    const scripts = [{ tag: "script", attrs: { type: "module", src: "/src/dev/mock.ts" }, injectTo: "head" as const }];
    if (new URL(ctx.originalUrl ?? "/", "http://localhost").searchParams.has("profile")) {
      scripts.push({ tag: "script", attrs: { type: "module", src: "/scripts/profile-hover.js" }, injectTo: "head" });
    }
    return scripts;
  },
};

export default defineConfig({
  plugins: [react(), devMock],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: { target: "chrome110" },
});
