import { useEffect, useRef, useState } from "react";
import { Activity, GitBranch, LayoutGrid, Menu, Palette } from "lucide-react";
import { ipc, type PlatformInfo } from "../lib/ipc";
import { labels, os } from "../lib/platform";
import { useConfig } from "../store/config";
import { ActionFooter, type Action } from "../ui/ActionFooter";
import { Logo } from "../ui/Logo";
import { PlatformNotice } from "./PlatformNotice";
import type { TabProps } from "./shared";
import { AppsTab } from "./tabs/AppsTab";
import { WidgetsTab } from "./tabs/WidgetsTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { GithubTab } from "./tabs/GithubTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { refreshGithub } from "../popovers/PullRequests";
import { addDivider } from "../dock/order";

const TABS = [
  { id: "apps", label: "Apps", Icon: LayoutGrid, Content: AppsTab },
  { id: "widgets", label: "Widgets", Icon: Activity, Content: WidgetsTab },
  { id: "appearance", label: "Aparência", Icon: Palette, Content: AppearanceTab },
  { id: "github", label: "GitHub", Icon: GitBranch, Content: GithubTab },
  { id: "general", label: "Geral", Icon: Menu, Content: GeneralTab },
] as const;
type TabId = (typeof TABS)[number]["id"];

const OS_NAMES = { windows: "Windows", linux: "Linux", macos: "macOS" };

export function Settings() {
  const config = useConfig((s) => s.config)!;
  const update = useConfig((s) => s.update);
  const [tab, setTab] = useState<TabId>("apps");
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const refreshPlatform = () => void ipc.platformInfo().then(setPlatform).catch(() => {});
  useEffect(refreshPlatform, []);

  // Setas e Home/End andam entre as abas, como num tablist nativo.
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = TABS[(next + TABS.length) % TABS.length];
    setTab(target.id);
    tabRefs.current[target.id]?.focus();
  };

  const props: TabProps = { config, update: (p) => void update(p), platform };
  const { Content } = TABS.find((t) => t.id === tab)!;
  const actions: Record<TabId, Action[]> = {
    apps: [{ label: "Adicionar separador", onClick: () => update((c) => addDivider(c)) }],
    widgets: [],
    appearance: [],
    github: [{ label: "Sincronizar agora", keys: "Ctrl R", onClick: refreshGithub }],
    general: [{ label: labels.quit, onClick: () => ipc.quit() }],
  };

  return (
    <div className="settings" data-glass>
      <header className="settings-header" data-tauri-drag-region>
        {/* No macOS a barra de título é a do app (os semáforos ficam por cima); nos outros, a nativa. */}
        {os === "macos" && (
          <span className="settings-title" data-tauri-drag-region>
            <Logo size={16} />
            WinDock — Configurações
          </span>
        )}
        <div className="settings-tabs" role="tablist" aria-label="Seções" onKeyDown={onTabKey}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              ref={(el) => (tabRefs.current[id] = el)}
              id={`tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls="settings-panel"
              tabIndex={tab === id ? 0 : -1}
              className="settings-tab"
              onClick={() => setTab(id)}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </header>
      <PlatformNotice platform={platform} refresh={refreshPlatform} />
      <main className="settings-main" id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <Content {...props} />
      </main>
      <ActionFooter keyboard context={`WinDock · ${OS_NAMES[os]}`} actions={actions[tab]} />
    </div>
  );
}
