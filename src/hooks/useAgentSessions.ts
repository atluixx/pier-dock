import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc, type AgentSession } from "../lib/ipc";

/** Sessões dos CLIs de IA ao vivo, lidas dos hooks/plugins e dos eventos locais do Codex. */
export function useAgentSessions(): AgentSession[] {
  const [agents, setAgents] = useState<AgentSession[]>([]);
  useEffect(() => {
    ipc.getAgentSessions().then(setAgents).catch(() => {});
    const unlisten = listen<AgentSession[]>("agent-sessions-changed", (e) => setAgents(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
  return agents;
}
