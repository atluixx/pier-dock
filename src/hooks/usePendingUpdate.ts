import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc, type UpdateInfo } from "../lib/ipc";

export function usePendingUpdate(): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    ipc.pendingUpdate().then((pending) => setInfo((current) => current ?? pending)).catch(() => {});
    const unlisten = listen<UpdateInfo>("update-available", (e) => setInfo(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
  return info;
}
