import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { PomodoroConfig } from "../lib/ipc";
import { formatFocus, formatTimer } from "../lib/format";
import { phaseName, toggleLabel, tone } from "../lib/pomodoro";
import { pomodoro, usePomodoro } from "../hooks/usePomodoro";
import { useConfig } from "../store/config";
import { ActionFooter } from "../ui/ActionFooter";
import { Ring } from "../ui/Ring";
import { Segmented } from "../ui/Segmented";

export const CYCLES: { value: PomodoroConfig["preset"]; label: string }[] = [
  { value: "25-5", label: "25 / 5" },
  { value: "50-10", label: "50 / 10" },
  { value: "custom", label: "Personalizado" },
];

export function Pomodoro() {
  const { state, remainingMs } = usePomodoro();
  const config = useConfig((s) => s.config);
  const update = useConfig((s) => s.update);
  if (!state || !config) return null;

  const toggle = pomodoro("toggle");
  const label = toggleLabel(state);
  const ToggleIcon = state.running ? Pause : Play;
  const endsAt = state.running && state.endsAtMs ? new Date(state.endsAtMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  const heading = state.phase === "focus" ? `Foco · sessão ${state.session} de ${state.sessions}` : phaseName(state);
  const done = state.phase === "focus" ? state.session - 1 : state.session;

  return (
    <>
      <div className="pomo-header">
        <span className="eyebrow">{heading}</span>
        <span className="popover-meta">{endsAt ? `Termina às ${endsAt}` : state.started ? "Pausado" : "Pronto para começar"}</span>
      </div>
      <div className={`pomo-dial pomo-${tone(state)}`}>
        <Ring size={168} radius={76} stroke={6} progress={state.totalMs ? remainingMs / state.totalMs : 1} />
        <span className="pomo-dial-time">{formatTimer(remainingMs)}</span>
        <span className="popover-meta">de {formatTimer(state.totalMs)}</span>
      </div>
      <div className="pomo-sessions" role="img" aria-label={`${done} de ${state.sessions} sessões concluídas`}>
        {Array.from({ length: state.sessions }, (_, i) => (
          <span key={i} className={i < done ? "done" : ""} />
        ))}
      </div>
      <div className="np-controls">
        <button className="pomo-round" aria-label="Reiniciar etapa" onClick={pomodoro("reset")}>
          <RotateCcw size={17} />
        </button>
        <button className="pomo-main" onClick={toggle}>
          <ToggleIcon size={14} fill="currentColor" strokeWidth={0} aria-hidden />
          {label}
        </button>
        <button className="pomo-round" aria-label={state.phase === "focus" ? "Pular para a pausa" : "Pular para o foco"} onClick={pomodoro("skip")}>
          <SkipForward size={17} />
        </button>
      </div>
      <div className="pomo-settings">
        <span>Ciclo</span>
        <Segmented
          label="Ciclo"
          value={config.pomodoro.preset}
          onChange={(preset) => update((c) => ({ pomodoro: { ...c.pomodoro, preset } }))}
          options={CYCLES}
        />
      </div>
      <ActionFooter context={`Hoje: ${formatFocus(state.focusTodayMs)} de foco`} actions={[{ label, keys: "Espaço", onClick: toggle }]} />
    </>
  );
}
