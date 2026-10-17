import { Fragment, useEffect, type ReactNode } from "react";
import { os } from "../lib/platform";
import { dict } from "../i18n";
import { Kbd } from "./Kbd";

export interface Action {
  label: string;
  /** Atalho mostrado em chips e atendido pela janela: "↵", espaço (`keys.space`), "Ctrl <tecla>" ou "⌘ <tecla>". */
  keys?: string;
  onClick: () => void;
}

const KEY_NAMES: Record<string, string> = { "⌫": "backspace" };

function matches(keys: string, e: KeyboardEvent): boolean {
  if (keys === "↵") return e.key === "Enter" && !e.ctrlKey && !e.altKey;
  if (keys === dict().keys.space) return e.key === " " && !e.ctrlKey && !e.altKey && !e.metaKey;
  const [mod, key] = keys.split(" ");
  const modifier = mod === "⌘" ? e.metaKey : mod === "Ctrl" && e.ctrlKey;
  return modifier && e.key.toLowerCase() === (KEY_NAMES[key] ?? key.toLowerCase());
}

/**
 * Rodapé de ações no padrão do Raycast: contexto à esquerda, ações à direita (a primeira é a
 * principal).
 */
export function ActionFooter({
  context,
  actions,
  keyboard = os !== "macos",
}: {
  context: ReactNode;
  actions: Action[];
  /** A janela recebe o teclado? Os popovers do macOS não recebem; as configurações, sim. */
  keyboard?: boolean;
}) {
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
