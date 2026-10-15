import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc, type WindowsSnapshot } from "../lib/ipc";

export function useWindows(): WindowsSnapshot {
  const [snapshot, setSnapshot] = useState<WindowsSnapshot>({ windows: [], foreground: 0 });
  useEffect(() => {
    ipc.getWindows().then(setSnapshot);
    const unlisten = listen<WindowsSnapshot>("windows-changed", (e) => setSnapshot(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
  return snapshot;
}
