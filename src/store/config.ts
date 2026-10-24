import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { ipc, type Config } from "../lib/ipc";
import { resolveLang, setLang, type Lang } from "../i18n";

interface ConfigStore {
  config: Config | null;
  /** Por que a config não carregou; a janela mostra o erro e tenta de novo. */
  loadError: string | null;
  load: () => Promise<void>;
  update: (patch: Partial<Config> | ((c: Config) => Partial<Config>)) => Promise<void>;
}

let systemLang: Lang = "en";
const applyLanguage = (config: Config) => setLang(resolveLang(config.language, systemLang));

export const useConfig = create<ConfigStore>((set, get) => ({
  config: null,
  loadError: null,
  load: async () => {
    systemLang = await ipc.systemLanguage().catch((): Lang => "en");
    try {
      const config = await ipc.getConfig();
      applyLanguage(config);
      set({ config, loadError: null });
    } catch (e) {
      console.error("could not load the config", e);
      setLang(systemLang);
      set({ loadError: String(e) });
    }
  },
  update: async (patch) => {
    const current = get().config;
    if (!current) return;
    const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    applyLanguage(next);
    set({ config: next });
    try {
      await ipc.saveConfig(next);
    } catch (e) {
      // O Rust só troca a config dele depois de gravar: se falhou, a tela volta a mostrar o que vale.
      console.error("could not save the config", e);
      if (get().config === next) {
        applyLanguage(current);
        set({ config: current });
      }
    }
  },
}));

// Todas as janelas (dock, painéis, configurações) ficam em sincronia.
listen<Config>("config-changed", (e) => {
  applyLanguage(e.payload);
  useConfig.setState({ config: e.payload });
});
