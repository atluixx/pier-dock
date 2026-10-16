import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc, type ClaudeUsage } from "../lib/ipc";

/**
 * Uso do Claude Code. Só a dock faz polling (`pollMinutes`), porque a leitura varre arquivos em
 * disco; o painel lê o cache do Rust e recebe as atualizações pelo evento.
 */
export function useClaudeUsage(pollMinutes?: number): ClaudeUsage | null {
  const [data, setData] = useState<ClaudeUsage | null>(null);
  useEffect(() => {
    ipc.claudeUsageCached().then((d) => d && setData(d));
    const unlisten = listen<ClaudeUsage>("claude-usage-updated", (e) => setData(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
  useEffect(() => {
    if (!pollMinutes) return;
    const fetchNow = () => ipc.claudeUsage().catch(() => {});
    fetchNow();
    const id = setInterval(fetchNow, Math.max(1, pollMinutes) * 60_000);
    return () => clearInterval(id);
  }, [pollMinutes]);
  return data;
}
