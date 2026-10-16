import { useEffect, useState } from "react";
import { ipc } from "./lib/ipc";
import { currentView } from "./lib/view";
import { useConfig } from "./store/config";
import { Dock } from "./dock/Dock";
import { Popover } from "./popovers/Popover";
import { Settings } from "./settings/Settings";

export function App() {
  const config = useConfig((s) => s.config);
  const load = useConfig((s) => s.load);

  useEffect(() => {
    load();
    document.documentElement.dataset.view = currentView.view;
  }, [load]);

  const [glassSupported, setGlassSupported] = useState<boolean | null>(null);
  useEffect(() => {
    ipc.platformInfo().then((p) => setGlassSupported(p.glass)).catch(() => setGlassSupported(false));
  }, []);

  useEffect(() => {
    if (!config) return;
    const root = document.documentElement;
    root.dataset.accent = config.accent;
    root.dataset.material = config.material === "glass" && glassSupported ? "glass" : "solid";
    root.style.setProperty("--dock-opacity", String(config.glassOpacity));
  }, [config?.accent, config?.material, config?.glassOpacity, glassSupported]);

  if (!config) return null;
  if (currentView.view === "panel") return <Popover kind={currentView.kind} />;
  if (currentView.view === "settings") return <Settings />;
  return <Dock config={config} />;
}
