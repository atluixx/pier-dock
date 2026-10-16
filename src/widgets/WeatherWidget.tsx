import { CloudSun } from "lucide-react";
import { ipc, type WeatherData } from "../lib/ipc";
import { degrees, describe, rainSoon } from "../lib/weather";
import { Tile } from "./Tile";
import { WeatherGlyph } from "./WeatherGlyph";

export function WeatherWidget({ data, wide, configured }: { data: WeatherData | null; wide: boolean; configured: boolean }) {
  const current = data?.current;
  if (!configured || !current) {
    const label = configured ? (data?.error ?? "Clima: carregando…") : "Clima: escolha uma cidade nas configurações";
    return (
      <Tile kind="weather" label={label} className="weather-tile idle" onClick={configured ? undefined : () => ipc.openSettings()} panel={configured}>
        <CloudSun size={wide ? 22 : 18} strokeWidth={1.8} aria-hidden />
      </Tile>
    );
  }

  const condition = describe(current.code, current.isDay);
  const today = data.daily[0];
  const rain = rainSoon(data);
  const range = today ? `↑${degrees(today.max)} ↓${degrees(today.min)}` : "";
  const label = `${data.location}: ${degrees(current.temperature)}, ${condition.label}${today ? `, máxima ${degrees(today.max)}, mínima ${degrees(today.min)}` : ""}${rain ? `. ${rain}` : ""}`;

  if (!wide) {
    return (
      <Tile kind="weather" label={label} className="weather-tile small">
        <WeatherGlyph icon={condition.icon} size={18} strokeWidth={2} />
        <span className="wx-temp">{degrees(current.temperature)}</span>
      </Tile>
    );
  }
  return (
    <Tile kind="weather" label={label} className="weather-tile wide">
      <WeatherGlyph icon={condition.icon} size={24} />
      <span className="wx-temp">{degrees(current.temperature)}</span>
      <span className="wx-text">
        <span className="wx-condition">{condition.short}</span>
        {rain ? <span className="wx-rain-soon">{rain}</span> : <span className="wx-range">{range}</span>}
      </span>
    </Tile>
  );
}
