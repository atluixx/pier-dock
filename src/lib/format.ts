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
