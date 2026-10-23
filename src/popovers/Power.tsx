import { useEffect, useState } from "react";
import { Check, Gauge, Leaf, Scale } from "lucide-react";
import { ipc, type PowerProfiles } from "../lib/ipc";
import { useT } from "../i18n";
import "./Power.css";

const MODES = ["power-saver", "balanced", "performance"] as const;
const ICONS = { "power-saver": Leaf, balanced: Scale, performance: Gauge };
export function PowerPanel() {
  const [state, setState] = useState<PowerProfiles | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = useT().power;
  const refresh = () => ipc.powerProfiles().then(setState);
  useEffect(() => {
    let alive = true;
    const read = () => ipc.powerProfiles().then((s) => alive && setState(s)).catch(() => alive && setFailed(true));
    read();
    const timer = setInterval(read, 5_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const choose = async (profile: string) => {
    if (busy || profile === state?.active) return;
    setBusy(true); setFailed(false);
    try { await ipc.setPowerProfile(profile); await refresh(); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div className="popover-header"><span className="popover-heading">{t.title}</span></div>
      <div className="power-body" aria-busy={busy}>
        {state ? <ul className="list" role="radiogroup" aria-label={t.title}>{MODES.map((mode) => {
          const Icon = ICONS[mode];
          return <li key={mode}><button className="list-row power-mode" role="radio" aria-checked={state.active === mode}
            disabled={busy || !state.canSet || !state.profiles.includes(mode)} onClick={() => void choose(mode)}>
            <Icon size={18} aria-hidden /><span>{t.modes[mode]}</span>{state.active === mode && <Check size={16} aria-hidden />}
          </button></li>;
        })}</ul> : !failed && <span className="popover-loading">…</span>}
        {state && !state.canSet && <p className="power-message">{t.unavailable}</p>}
        {failed && <p className="power-message error" role="alert">{t.failed}</p>}
      </div>
    </>
  );
}
