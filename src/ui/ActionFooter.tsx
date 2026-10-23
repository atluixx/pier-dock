import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { os } from "../lib/platform";
import { dict } from "../i18n";
import { Kbd } from "./Kbd";

export interface Action {
  label: string;
  /** Atalho mostrado em chips e atendido pela janela: "↵", espaço (`keys.space`), "Ctrl <tecla>" ou "⌘ <tecla>". */
  keys?: string;
  onClick: () => void | Promise<unknown>;
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
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);
  const run = useCallback(async (action: Action) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    try { await action.onClick(); }
    catch (error) { console.error(error); setFailed(true); }
    finally { running.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest("input, textarea, select, button, a, [role=slider]")) return;
      const action = actions.find((a) => a.keys && matches(a.keys, e));
      if (!action) return;
      e.preventDefault();
      void run(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, keyboard, run]);

  return (
    <footer className="action-footer">
      <span className="action-context">{failed ? <span role="alert">{dict().system.actionFailed}</span> : context}</span>
      <span className="action-list">
        {actions.map((a, i) => (
          <Fragment key={a.label}>
            {i > 0 && <span className="action-sep" aria-hidden />}
            <button className={`action ${i === 0 ? "primary" : ""}`} disabled={busy} onClick={() => void run(a)}>
              {a.label}
              {keyboard && a.keys && <Kbd keys={a.keys} />}
            </button>
          </Fragment>
        ))}
      </span>
    </footer>
  );
}
