import { dict } from "../i18n/index.ts";
import type { ClaudeUsage } from "./ipc";

/** A partir destes percentuais o anel troca de cor. */
export const WARN = 70;
export const CRITICAL = 90;

export type Level = "unknown" | "normal" | "warn" | "critical";

export function limitLevel(percent: number | null): Level {
  if (percent === null) return "unknown";
  if (percent >= CRITICAL) return "critical";
  if (percent >= WARN) return "warn";
  return "normal";
}

export interface LimitWindow {
  name: string;
  percent: number | null;
  resetsIn: number | null;
}

export function windows(usage: ClaudeUsage | null): [LimitWindow, LimitWindow] {
  const t = dict().claude;
  return [
    { name: t.session, percent: usage?.sessionPercent ?? null, resetsIn: usage?.sessionResetsIn ?? null },
    { name: t.week, percent: usage?.weeklyPercent ?? null, resetsIn: usage?.weeklyResetsIn ?? null },
  ];
}

/**
 * A janela mais perto do limite, que é a que vai bloquear primeiro — e por isso a que o tile
 * mostra. Janela com percentual desconhecido não concorre; se nenhuma for conhecida, devolve a de
 * 5h com o percentual nulo, para o tile renderizar o estado "sem dado".
 */
export function tightest(usage: ClaudeUsage | null): LimitWindow {
  const [session, weekly] = windows(usage);
  const known = [session, weekly].filter((w) => w.percent !== null);
  if (!known.length) return session;
  return known.reduce((a, b) => ((b.percent ?? 0) > (a.percent ?? 0) ? b : a));
}
