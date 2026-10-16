import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc, type CalendarData } from "../lib/ipc";

/** Eventos de hoje e amanhã. Só a dock faz polling (`poll`); os outros leem o cache do Rust. */
export function useCalendar(poll = false): CalendarData | null {
  const [data, setData] = useState<CalendarData | null>(null);
  useEffect(() => {
    ipc.calendarCached().then((d) => d && setData(d));
    const unlisten = listen<CalendarData>("calendar-updated", (e) => setData(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
  useEffect(() => {
    if (!poll) return;
    const fetchNow = () => ipc.calendarFetch().catch(() => {});
    fetchNow();
    const id = setInterval(fetchNow, 5 * 60_000);
    return () => clearInterval(id);
  }, [poll]);
  return data;
}

export const refreshCalendar = () => ipc.calendarFetch().catch(() => {});
