import { useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Menu } from "@tauri-apps/api/menu";
import { ipc } from "../lib/ipc";
import { useIcon } from "../hooks/useIcon";
import { useConfig } from "../store/config";
import { Magnify } from "./Magnify";
import { toPinned, type DockApp } from "./apps";

interface Props {
  app: DockApp;
  active: boolean;
  sortable: boolean;
}

export function AppIcon({ app, active, sortable }: Props) {
  const src = useIcon(app.iconKey);
  const bounce = useAnimationControls();
  const [hover, setHover] = useState(false);
  const update = useConfig((s) => s.update);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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

  const running = app.windows.length > 0;
  return (
    <div
      ref={setNodeRef}
      className={`dock-item ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...attributes}
      {...listeners}
    >
      {hover && !isDragging && <div className="tooltip">{app.name}</div>}
      <Magnify>
        <motion.button className="app-icon" animate={bounce} onClick={onClick} onContextMenu={onContextMenu}>
          {src ? <img src={src} alt="" draggable={false} /> : <div className="app-icon-fallback">{app.name[0]}</div>}
        </motion.button>
      </Magnify>
      <div className={`indicator ${running ? "on" : ""} ${active ? "active" : ""}`}>
        {app.windows.length > 1 && <span className="indicator-dot" />}
      </div>
    </div>
  );
}
