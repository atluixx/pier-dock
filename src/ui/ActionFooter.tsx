import { Fragment, useEffect, type ReactNode } from "react";
import { os } from "../lib/platform";
import { Kbd } from "./Kbd";

export interface Action {
  label: string;
  /** Atalho mostrado em chips e atendido pela janela: "↵" ou "Ctrl <tecla>". */
  keys?: string;
  onClick: () => void;
}

function matches(keys: string, e: KeyboardEvent): boolean {
  if (keys === "↵") return e.key === "Enter" && !e.ctrlKey && !e.altKey;
  const [mod, key] = keys.split(" ");
  return mod === "Ctrl" && e.ctrlKey && e.key.toLowerCase() === key.toLowerCase();
}

/**
 * Rodapé de ações no padrão do Raycast: contexto à esquerda, ações à direita (a primeira é a
 * principal). No macOS os popovers nunca recebem o teclado, então os atalhos não aparecem.
 */
export function ActionFooter({ context, actions }: { context: ReactNode; actions: Action[] }) {
  const keyboard = os !== "macos";
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest("input, textarea")) return;
      const action = actions.find((a) => a.keys && matches(a.keys, e));
      if (!action) return;
      e.preventDefault();
      action.onClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, keyboard]);

  return (
    <footer className="action-footer">
      <span className="action-context">{context}</span>
      <span className="action-list">
        {actions.map((a, i) => (
          <Fragment key={a.label}>
            {i > 0 && <span className="action-sep" aria-hidden />}
            <button className={`action ${i === 0 ? "primary" : ""}`} onClick={a.onClick}>
              {a.label}
              {keyboard && a.keys && <Kbd keys={a.keys} />}
            </button>
          </Fragment>
        ))}
      </span>
    </footer>
  );
}
