import { useState } from "react";
import { Check } from "lucide-react";
import { ipc } from "../lib/ipc";
import { useKeyboardLayouts } from "../hooks/useSystem";
import { useT } from "../i18n";
import "./KeyboardLayout.css";

export function KeyboardLayoutPanel() {
  const t = useT().keyboard;
  const { keyboard, refresh, setActive } = useKeyboardLayouts();
  const [failed, setFailed] = useState(false);
  const choose = async (id: string) => {
    if (id === keyboard?.active) return;
    setFailed(false);
    setActive(id);
    try {
      await ipc.setKeyboardLayout(id);
      ipc.closePanel();
    } catch {
      setFailed(true);
      refresh();
    }
  };
  return (
    <>
      <div className="popover-header"><span className="popover-heading">{t.title}</span></div>
      <div className="kl-body">
        {keyboard ? (
          keyboard.layouts.length ? (
            <ul className="list" role="radiogroup" aria-label={t.title}>
              {keyboard.layouts.map((layout) => (
                <li key={layout.id}>
                  <button className="list-row kl-row" role="radio" aria-checked={keyboard.active === layout.id} onClick={() => void choose(layout.id)}>
                    <span className="kl-code">{layout.code}</span>
                    <span className="kl-name">{layout.name}</span>
                    {keyboard.active === layout.id && <Check size={16} aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="kl-message">{t.empty}</p>
          )
        ) : (
          <span className="popover-loading">…</span>
        )}
        {failed && <p className="kl-message error" role="alert">{t.failed}</p>}
      </div>
    </>
  );
}
