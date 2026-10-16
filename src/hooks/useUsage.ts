import { useEffect, useState } from "react";
import { ipc, type AppUsage, type SystemUsage } from "../lib/ipc";

function usePolling<T>(read: () => Promise<T>, intervalMs: number): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    const refresh = () => read().then(setValue).catch(() => {});
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [read, intervalMs]);
  return value;
}

/** CPU, memória, disco e rede. O Rust só amostra enquanto alguém lê. */
export const useSystemUsage = () => usePolling(ipc.systemUsage, 1000) as SystemUsage | null;

export const useTopApps = () => usePolling(ipc.topApps, 2000) as AppUsage[] | null;
