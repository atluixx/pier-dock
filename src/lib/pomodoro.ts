import type { PomodoroState } from "./ipc";

/** Cor do anel: foco no destaque, pausa em verde, parado em cinza. */
export function tone(state: PomodoroState | null): "focus" | "break" | "paused" {
  if (!state?.running) return "paused";
  return state.phase === "focus" ? "focus" : "break";
}

export function phaseName(state: PomodoroState): string {
  if (state.phase === "short-break") return "Pausa curta";
  if (state.phase === "long-break") return "Pausa longa";
  return "Foco";
}

/** Segunda linha do widget largo: "Foco · 2 de 4", "Pausa curta" ou "Pausado". */
export function caption(state: PomodoroState): string {
  if (state.started && !state.running) return "Pausado";
  return state.phase === "focus" ? `Foco · ${state.session} de ${state.sessions}` : phaseName(state);
}

export function toggleLabel(state: PomodoroState | null): string {
  if (!state?.started) return "Iniciar";
  return state.running ? "Pausar" : "Retomar";
}
