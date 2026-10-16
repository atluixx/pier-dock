import { useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Menu } from "@tauri-apps/api/menu";
import { ipc } from "../lib/ipc";
import { keys } from "../lib/platform";
import { useIcon } from "../hooks/useIcon";
import { useConfig } from "../store/config";
import { Tooltip } from "../ui/Tooltip";
import { Magnify } from "./Magnify";
import { toPinned, type DockApp } from "./apps";

interface Props {
  app: DockApp;
  active: boolean;
  sortable: boolean;
  /** Posição para o atalho Ctrl+Alt+N (⌃⌥N no macOS, 1 a 9), se o app tiver um. */
  shortcut?: number;
}

export function AppIcon({ app, active, sortable, shortcut }: Props) {
  const src = useIcon(app.iconKey);
  const bounce = useAnimationControls();
  const [hover, setHover] = useState(false);
  const update = useConfig((s) => s.update);
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: app.key,
    disabled: !sortable,
  });

  const launch = () => {
    bounce.start({ y: [0, -14, 0, -6, 0], transition: { duration: 0.7 } });
    ipc.launchApp(app.launchTarget).catch(console.error);
  };

  const onClick = (e: React.MouseEvent) => {
    if (e.shiftKey || app.windows.length === 0) launch();
    else ipc.toggleAppWindows(app.windows.map((w) => w.id));
  };

  const onContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const windowItems = app.windows.slice(0, 10).map((w) => ({
      id: `win-${w.id}`,
      text: w.title.length > 60 ? `${w.title.slice(0, 57)}…` : w.title,
      action: () => ipc.activateWindow(w.id),
    }));
    const pinItem = app.pinned
      ? {
          id: "unpin",
          text: "Desafixar da dock",
          action: () => update((c) => ({ pinnedApps: c.pinnedApps.filter((p) => p.id !== app.pinned!.id) })),
        }
      : { id: "pin", text: "Fixar na dock", action: () => update((c) => ({ pinnedApps: [...c.pinnedApps, toPinned(app)] })) };
    const menu = await Menu.new({
      items: [
        ...windowItems,
        ...(windowItems.length ? [{ item: "Separator" as const }] : []),
        { id: "new", text: app.windows.length ? "Abrir nova janela" : `Abrir ${app.name}`, action: launch },
        pinItem,
        ...(app.windows.length
          ? [
              {
                id: "close",
                text: app.windows.length > 1 ? `Fechar ${app.windows.length} janelas` : "Fechar janela",
                action: () => ipc.closeWindows(app.windows.map((w) => w.id)),
              },
            ]
          : []),
      ],
    });
    await menu.popup();
  };

  const windows = app.windows.length;
  const state = active ? "em foco" : windows > 1 ? `${windows} janelas` : windows ? "aberto" : "";
  return (
    <div
      ref={setNodeRef}
      className={`dock-item ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && !isDragging && <Tooltip label={app.name} keys={shortcut ? `${keys.appShortcut} ${shortcut}` : undefined} />}
      <button
        className="app-button"
        aria-label={state ? `${app.name} (${state})` : app.name}
        onClick={onClick}
        onContextMenu={onContextMenu}
        {...listeners}
      >
        <Magnify>
          <motion.span className="app-icon" animate={bounce}>
            {src ? <img src={src} alt="" draggable={false} /> : <span className="app-icon-fallback">{app.name[0]}</span>}
          </motion.span>
        </Magnify>
        <span className="indicators" aria-hidden>
          <span className={`indicator ${active ? "active" : windows ? "on" : ""}`} />
          {windows > 1 && <span className="indicator on" />}
        </span>
      </button>
    </div>
  );
}
