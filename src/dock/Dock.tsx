import { useEffect, useMemo, useRef, useState } from "react";
import { useMotionValue } from "framer-motion";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Menu } from "@tauri-apps/api/menu";
import { ipc, type AppEntry, type Config, type WidgetConfig } from "../lib/ipc";
import { useConfig } from "../store/config";
import { useWindows } from "../hooks/useWindows";
import { useMedia } from "../hooks/useMedia";
import { useGithub } from "../hooks/useGithub";
import { useSystemStatus } from "../hooks/useSystem";
import { buildDockApps, type DockApp } from "./apps";
import { dockMetrics } from "./layout";
import { MagnifyCtx, Magnify } from "./Magnify";
import { AppIcon } from "./AppIcon";
import { MediaWidget } from "../widgets/MediaWidget";
import { ContributionsWidget, GithubCommitsWidget, GithubMineWidget, GithubReviewWidget } from "../widgets/GithubWidgets";
import { BatteryWidget, ClockWidget, NetworkWidget, VolumeWidget } from "../widgets/SystemWidgets";

function StartButton() {
  return (
    <div className="dock-item">
      <Magnify>
        <button className="app-icon start-button" onClick={() => ipc.openShell("start")} title="Iniciar">
          <svg viewBox="0 0 24 24" aria-hidden>
            <rect x="2" y="2" width="9.5" height="9.5" rx="1.2" />
            <rect x="12.5" y="2" width="9.5" height="9.5" rx="1.2" />
            <rect x="2" y="12.5" width="9.5" height="9.5" rx="1.2" />
            <rect x="12.5" y="12.5" width="9.5" height="9.5" rx="1.2" />
          </svg>
        </button>
      </Magnify>
      <div className="indicator" />
    </div>
  );
}

/** Clique num app da dock (também usado pelos atalhos Ctrl+Alt+N). */
function clickApp(app: DockApp) {
  if (app.windows.length) ipc.toggleAppWindows(app.windows.map((w) => w.hwnd));
  else ipc.launchApp(app.launchTarget).catch(console.error);
}

const GITHUB_WIDGETS = ["github-review", "github-mine", "github-commits", "github-contrib"];

export function Dock({ config }: { config: Config }) {
  const update = useConfig((s) => s.update);
  const snapshot = useWindows();
  const media = useMedia();
  const usesGithub = config.widgets.some((w) => w.enabled && GITHUB_WIDGETS.includes(w.kind));
  const github = useGithub(usesGithub ? config.githubPollMinutes : undefined);
  const system = useSystemStatus();
  const mouseX = useMotionValue(Infinity);
  const barRef = useRef<HTMLDivElement>(null);

  const [installed, setInstalled] = useState<AppEntry[]>([]);
  useEffect(() => {
    const refresh = () => ipc.listInstalledApps().then(setInstalled).catch(() => {});
    refresh();
    const id = setInterval(refresh, 10 * 60_000);
    return () => clearInterval(id);
  }, []);

  const metrics = dockMetrics(config.iconSize, config.magnification);
  const apps = useMemo(
    () => buildDockApps(config.pinnedApps, snapshot.windows, config.showRunningUnpinned, installed),
    [config.pinnedApps, snapshot.windows, config.showRunningUnpinned, installed],
  );
  const appsRef = useRef(apps);
  appsRef.current = apps;

  // Reserva de tela + tamanho da janela no Rust.
  useEffect(() => {
    ipc.setDockLayout({
      reservedHeight: metrics.reservedHeight,
      windowHeight: metrics.windowHeight,
      hoverHeadroom: metrics.hoverHeadroom,
    });
  }, [metrics.reservedHeight, metrics.windowHeight, metrics.hoverHeadroom]);

  // Área clicável: fora dela a janela vira click-through.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // Pelo layout, não pelo getBoundingClientRect: o transform da animação de ocultar não pode
    // deslocar a área clicável.
    const report = () => {
      const width = bar.offsetWidth;
      const height = bar.offsetHeight;
      const bottom = parseFloat(getComputedStyle(bar).bottom) || 0;
      ipc.setHitRect({ x: (window.innerWidth - width) / 2, y: window.innerHeight - bottom - height, width, height });
    };
    const observer = new ResizeObserver(report);
    observer.observe(bar);
    window.addEventListener("resize", report);
    report();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, []);

  // Ocultar automaticamente: o Rust decide quando a dock aparece; aqui só anima.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    ipc.dockVisible().then(setVisible);
    const unlisten = listen<boolean>("dock-visibility", (e) => setVisible(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const subs = [
      // Quando o Rust liga o click-through, o WebView não recebe mouseleave.
      listen("dock-pointer-left", () => mouseX.set(Infinity)),
      listen<number>("shortcut-app", (e) => {
        const app = appsRef.current[e.payload];
        if (app) clickApp(app);
      }),
      // Arrastar um .exe/.lnk/pasta do Explorer para a dock fixa o item.
      getCurrentWebview().onDragDropEvent(async (e) => {
        if (e.payload.type !== "drop") return;
        const entries = await Promise.all(e.payload.paths.map((p) => ipc.resolveAppPath(p)));
        update((c) => ({
          pinnedApps: [...c.pinnedApps, ...entries.filter((n) => !c.pinnedApps.some((p) => p.id === n.id))],
        }));
      }),
    ];
    return () => subs.forEach((s) => s.then((unlisten) => unlisten()));
  }, [mouseX, update]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const pinnedKeys = apps.filter((a) => a.pinned).map((a) => a.key);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    update((c) => {
      const ids = c.pinnedApps.map((p) => `pin:${p.id}`);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return {};
      return { pinnedApps: arrayMove(c.pinnedApps, from, to) };
    });
  };

  const onBackgroundMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const menu = await Menu.new({
      items: [
        { id: "settings", text: "Configurações da dock", action: () => ipc.openSettings() },
        { id: "reload", text: "Recarregar", action: () => location.reload() },
        { item: "Separator" },
        { id: "quit", text: "Sair da dock (restaura a taskbar)", action: () => ipc.quit() },
      ],
    });
    await menu.popup();
  };

  const renderWidget = (w: WidgetConfig) => {
    const wide = w.size === "wide";
    switch (w.kind) {
      case "media":
        return <MediaWidget media={media} wide={wide} />;
      case "github-review":
        return <GithubReviewWidget data={github} />;
      case "github-mine":
        return <GithubMineWidget data={github} />;
      case "github-commits":
        return <GithubCommitsWidget data={github} />;
      case "github-contrib":
        return <ContributionsWidget data={github} wide={wide} />;
      case "network":
        return <NetworkWidget status={system} />;
      case "volume":
        return <VolumeWidget />;
      case "battery":
        return <BatteryWidget status={system} />;
      case "clock":
        return <ClockWidget />;
    }
  };

  const widgets = config.widgets.filter((w) => w.enabled);
  const activeKey = apps.find((a) => a.windows.some((w) => w.hwnd === snapshot.foreground))?.key;

  return (
    <div className="dock-root" style={{ ["--icon" as string]: `${config.iconSize}px` }}>
      <div
        ref={barRef}
        className={`dock-bar ${visible ? "" : "dock-hidden"}`}
        style={{ bottom: metrics.margin, height: metrics.barHeight, padding: `0 ${metrics.padding}px` }}
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        onContextMenu={onBackgroundMenu}
      >
        <MagnifyCtx.Provider value={{ mouseX, base: config.iconSize, scale: Math.max(1, config.magnification) }}>
          <StartButton />
          <DndContext sensors={sensors} onDragStart={() => mouseX.set(Infinity)} onDragEnd={onDragEnd}>
            <SortableContext items={pinnedKeys} strategy={horizontalListSortingStrategy}>
              {apps.map((app) => (
                <AppIcon key={app.key} app={app} active={app.key === activeKey} sortable={!!app.pinned} />
              ))}
            </SortableContext>
          </DndContext>
        </MagnifyCtx.Provider>
        {widgets.length > 0 && <div className="divider" />}
        {widgets.map((w) => (
          <div key={w.kind} className="widget-slot">
            {renderWidget(w)}
          </div>
        ))}
      </div>
    </div>
  );
}
