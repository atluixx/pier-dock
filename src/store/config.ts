import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { ipc, type Config } from "../lib/ipc";
import { resolveLang, setLang, type Lang } from "../i18n";

interface ConfigStore {
  config: Config | null;
  load: () => Promise<void>;
  update: (patch: Partial<Config> | ((c: Config) => Partial<Config>)) => Promise<void>;
}

let systemLang: Lang = "en";
const applyLanguage = (config: Config) => setLang(resolveLang(config.language, systemLang));

export const useConfig = create<ConfigStore>((set, get) => ({
  config: null,
  load: async () => {
    const [config, system] = await Promise.all([ipc.getConfig(), ipc.systemLanguage().catch((): Lang => "en")]);
    systemLang = system;
    applyLanguage(config);
    set({ config });
  },
  update: async (patch) => {
    const current = get().config;
    if (!current) return;
    const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    applyLanguage(next);
    set({ config: next });
    await ipc.saveConfig(next);
  },
}));

// Todas as janelas (dock, painéis, configurações) ficam em sincronia.
listen<Config>("config-changed", (e) => {
  applyLanguage(e.payload);
  useConfig.setState({ config: e.payload });
});
