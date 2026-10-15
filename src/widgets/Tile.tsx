import { useRef, useState, type ReactNode } from "react";
import { ipc } from "../lib/ipc";

/** Margem transparente da janela em volta do painel, para a sombra (igual a `--panel-inset`). */
export const PANEL_INSET = 12;

/** Tamanho visível (px lógicos) do painel de cada widget, sem a margem da sombra. */
export const PANEL_SIZES: Record<string, [number, number]> = {
  media: [360, 430],
  "github-review": [420, 480],
  "github-mine": [420, 480],
  "github-commits": [420, 480],
  "github-contrib": [800, 216],
};

interface TileProps {
  kind: string;
  wide?: boolean;
  label: string;
  panel?: boolean;
  onClick?: () => void;
  onWheel?: (e: React.WheelEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
  children: ReactNode;
}

export function Tile({ kind, wide, label, panel = true, onClick, onWheel, onContextMenu, className = "", children }: TileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);

  const handleClick = () => {
    if (onClick) return onClick();
    if (!panel || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const [w, h] = PANEL_SIZES[kind] ?? [380, 420];
    ipc.openPanel(kind, rect.left + rect.width / 2, w + 2 * PANEL_INSET, h + 2 * PANEL_INSET).catch(console.error);
  };

  return (
    <div
      ref={ref}
      className={`tile ${wide ? "wide" : ""} ${className}`}
      onClick={handleClick}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && <div className="tooltip">{label}</div>}
      {children}
    </div>
  );
}
