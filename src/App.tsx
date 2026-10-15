import { useEffect } from "react";
import { currentView } from "./lib/view";
import { useConfig } from "./store/config";
import { Dock } from "./dock/Dock";
import { Panel } from "./panels/Panel";
import { Settings } from "./settings/Settings";

export function App() {
  const config = useConfig((s) => s.config);
  const load = useConfig((s) => s.load);

  useEffect(() => {
    load();
    document.documentElement.dataset.view = currentView.view;
  }, [load]);

  useEffect(() => {
    // As configurações usam sempre a paleta padrão; o tema vale para a dock e os painéis.
    if (config && currentView.view !== "settings") document.documentElement.dataset.theme = config.theme;
  }, [config?.theme]);

  if (!config) return null;
  if (currentView.view === "panel") return <Panel kind={currentView.kind} />;
  if (currentView.view === "settings") return <Settings />;
  return <Dock config={config} />;
}
