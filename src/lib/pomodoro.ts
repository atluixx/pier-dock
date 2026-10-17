import { dict } from "../i18n/index.ts";
import type { PomodoroState } from "./ipc";

/** Cor do anel: foco no destaque, pausa em verde, parado em cinza. */
export function tone(state: PomodoroState | null): "focus" | "break" | "paused" {
  if (!state?.running) return "paused";
  return state.phase === "focus" ? "focus" : "break";
}

export function phaseName(state: PomodoroState): string {
  const t = dict().pomodoro;
  if (state.phase === "short-break") return t.shortBreak;
  if (state.phase === "long-break") return t.longBreak;
  return t.focus;
}

/** Segunda linha do widget largo: "Foco · 2 de 4", "Pausa curta" ou "Pausado". */
export function caption(state: PomodoroState): string {
  if (state.started && !state.running) return dict().pomodoro.paused;
  return state.phase === "focus" ? dict().pomodoro.focusCaption(state.session, state.sessions) : phaseName(state);
}

export function toggleLabel(state: PomodoroState | null): string {
  const t = dict();
  if (!state?.started) return t.pomodoro.start;
  return state.running ? t.common.pause : t.pomodoro.resume;
}
