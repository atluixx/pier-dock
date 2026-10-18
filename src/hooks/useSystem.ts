import { useCallback, useEffect, useState } from "react";
import { ipc, type BluetoothState, type SystemStatus, type Volume } from "../lib/ipc";

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

/** Só consulta com `enabled`: no macOS a primeira leitura pede a permissão de Bluetooth. */
export function useBluetooth(enabled = true, intervalMs = 10_000): [BluetoothState | null, (powered: boolean) => void] {
  const [state, setState] = useState<BluetoothState | null>(null);
  const refresh = useCallback(() => ipc.bluetoothStatus().then(setState).catch(() => {}), []);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, refresh]);
  const setPowered = useCallback(
    (powered: boolean) => {
      setState((s) => (s ? { ...s, powered, devices: powered ? s.devices : [] } : s));
      ipc.setBluetooth(powered).catch(console.error).finally(refresh);
    },
    [refresh],
  );
  return [state, setPowered];
}

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
