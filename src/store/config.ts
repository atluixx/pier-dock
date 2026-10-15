import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { ipc, type Config } from "../lib/ipc";

interface ConfigStore {
  config: Config | null;
  load: () => Promise<void>;
  update: (patch: Partial<Config> | ((c: Config) => Partial<Config>)) => Promise<void>;
}

export const useConfig = create<ConfigStore>((set, get) => ({
  config: null,
  load: async () => {
    set({ config: await ipc.getConfig() });
  },
  update: async (patch) => {
    const current = get().config;
    if (!current) return;
    const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    set({ config: next });
    await ipc.saveConfig(next);
  },
}));

// Todas as janelas (dock, painéis, configurações) ficam em sincronia.
listen<Config>("config-changed", (e) => useConfig.setState({ config: e.payload }));
