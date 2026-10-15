import { useCallback, useEffect, useState } from "react";
import { ipc, type SystemStatus, type Volume } from "../lib/ipc";

export function useSystemStatus(): SystemStatus | null {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    const refresh = () => ipc.systemStatus().then(setStatus).catch(() => {});
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, []);
  return status;
}

export function useVolume(): [Volume | null, (patch: Partial<Volume>) => void] {
  const [volume, setVolume] = useState<Volume | null>(null);
  useEffect(() => {
    const refresh = () => ipc.getVolume().then(setVolume).catch(() => {});
    refresh();
    const id = setInterval(refresh, 3_000);
    return () => clearInterval(id);
  }, []);
  const update = useCallback((patch: Partial<Volume>) => {
    setVolume((v) => (v ? { ...v, ...patch } : v));
    ipc.setVolume(patch).catch(() => {});
  }, []);
  return [volume, update];
}

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
