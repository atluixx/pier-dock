const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function timeAgo(iso: string | number): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** "qua, 15 out": dia da semana e mês abreviados, sem os pontos que o pt-BR põe. */
export function shortDate(date: Date): string {
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("pt-BR", options).replace(".", "");
  return `${part({ weekday: "short" })}, ${date.getDate()} ${part({ month: "short" })}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "C:\Program Files\Foo\foo-bar.exe", "/usr/bin/foo-bar" ou "/Applications/Foo Bar.app" → "Foo Bar" */
export function prettyExeName(exe: string): string {
  const file = exe.split(/[\\/]/).filter(Boolean).pop() ?? exe;
  const stem = file.replace(/\.(exe|app|desktop)$/i, "");
  return stem.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Nome amigável do app que publica uma sessão de mídia, a partir do id: AUMID no Windows, nome
 * MPRIS (`org.mpris.MediaPlayer2.firefox.instance_1_23`) no Linux, bundle id no macOS.
 */
export function mediaSourceName(id: string): string {
  const lower = id.toLowerCase();
  if (lower.startsWith("org.mpris.mediaplayer2.")) {
    const player = id.slice("org.mpris.MediaPlayer2.".length).replace(/\.instance.*$/i, "");
    return mediaSourceName(player);
  }
  if (lower === "com.apple.music") return "Música";
  if (lower.includes("chromium")) return "Chromium";
  if (lower.includes("brave")) return "Brave";
  if (lower.includes("spotify")) return "Spotify";
  if (lower.includes("music.youtube") || lower.includes("youtube music")) return "YouTube Music";
  if (lower.includes("chrome")) return "Chrome";
  if (lower.includes("msedge") || lower.includes("edge")) return "Edge";
  if (lower.includes("firefox")) return "Firefox";
  if (lower.includes("zunemusic") || lower.includes("media player")) return "Media Player";
  return prettyExeName(id.split("!")[0].split("_")[0]);
}

/** Contagem regressiva do Pomodoro: "18:42", "03:10". Arredonda para cima, como um timer. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Tempo de foco acumulado: "45min", "1h 15min". */
export function formatFocus(ms: number): string {
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  return h ? `${h}h ${total % 60}min` : `${total}min`;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** "10,9 GB", "180 KB": uma casa decimal só abaixo de 100. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 100 && unit > 0 ? 1 : 0;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: digits })} ${UNITS[unit]}`;
}

export const formatRate = (bytesPerSecond: number) => `${formatBytes(bytesPerSecond)}/s`;

/** Contagem de tokens curta: 12400000 → "12,4M", 3100 → "3k". */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/**
 * Tempo até o reset de uma janela de uso: "48min", "4h18", "5d3h". Aguenta a janela semanal.
 * Desconhecido ou já passado vira "--" — uma janela que virou não tem tempo restante.
 */
export function formatResetIn(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return "--";
  if (minutes < 60) return `${minutes}min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(minutes / 1440)}d${Math.floor((minutes % 1440) / 60)}h`;
}

/** Percentual de limite; `null` vira "--", porque admitir que não sabe é melhor que inventar. */
export const formatPercent = (percent: number | null) => (percent === null ? "--" : `${percent}%`);

/** "claude-opus-5" → "opus5": cabe ao lado do número no painel. */
export function shortModel(model: string | null): string {
  if (!model) return "";
  return model.replace("claude-", "").replace(/-/g, "").slice(0, 8);
}
