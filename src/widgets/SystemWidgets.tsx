import {
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Globe,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
  WifiHigh,
  WifiLow,
  WifiOff,
} from "lucide-react";
import { ipc, type SystemStatus } from "../lib/ipc";
import { useNow, useVolume } from "../hooks/useSystem";
import { shortDate } from "../lib/format";
import { Tile } from "./Tile";

export function NetworkWidget({ status }: { status: SystemStatus | null }) {
  const net = status?.network;
  let Icon = WifiOff;
  if (net?.connected) {
    const bars = net.signalBars ?? 4;
    Icon = !net.wifi ? Globe : bars >= 4 ? Wifi : bars >= 2 ? WifiHigh : WifiLow;
  }
  const label = !net?.connected ? "Sem conexão" : `${net.name || "Conectado"}${net.internet ? "" : " (sem internet)"}`;
  return (
    <Tile kind="network" label={label} className="sys-tile" onClick={() => ipc.openShell("quick-settings")}>
      <Icon size={17} />
    </Tile>
  );
}

export function VolumeWidget() {
  const [volume, setVolume] = useVolume();
  const level = volume?.level ?? 0;
  const Icon = !volume || volume.muted || level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  const label = volume
    ? `Volume ${Math.round(level * 100)}%${volume.muted ? " (mudo)" : ""} · role para ajustar, botão direito silencia`
    : "Volume";
  return (
    <Tile
      kind="volume"
      label={label}
      className="sys-tile"
      onClick={() => ipc.openShell("quick-settings")}
      onContextMenu={(e) => {
        e.preventDefault();
        if (volume) setVolume({ muted: !volume.muted });
      }}
      onWheel={(e) => volume && setVolume({ level: Math.min(1, Math.max(0, level + (e.deltaY < 0 ? 0.04 : -0.04))) })}
    >
      <Icon size={17} />
    </Tile>
  );
}

export function BatteryWidget({ status }: { status: SystemStatus | null }) {
  const battery = status?.battery;
  if (!battery?.present) return null;
  const Icon = battery.charging
    ? BatteryCharging
    : battery.percent > 70
      ? BatteryFull
      : battery.percent > 30
        ? BatteryMedium
        : BatteryLow;
  return (
    <Tile
      kind="battery"
      label={`Bateria ${battery.percent}%${battery.charging ? " (carregando)" : ""}`}
      className={`battery-tile ${battery.percent <= 15 && !battery.charging ? "low" : ""}`}
      onClick={() => ipc.openShell("quick-settings")}
    >
      <Icon size={20} />
      <span className="sys-text">{battery.percent}%</span>
    </Tile>
  );
}

export function ClockWidget() {
  const now = useNow(1000);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = shortDate(now);
  const full = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <Tile kind="clock" label={full} className="clock-tile" onClick={() => ipc.openShell("notifications")}>
      <span className="clock-time">{time}</span>
      <span className="clock-date">{date}</span>
    </Tile>
  );
}
