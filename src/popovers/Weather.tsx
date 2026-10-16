import { CloudSun } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc } from "../lib/ipc";
import { degrees, describe, hourLabel } from "../lib/weather";
import { useWeather } from "../hooks/useWeather";
import { ActionFooter } from "../ui/ActionFooter";
import { WeatherGlyph } from "../widgets/WeatherGlyph";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const dayName = (date: string, i: number) => (i === 0 ? "Hoje" : WEEKDAYS[new Date(`${date}T12:00`).getDay()]);

export function Weather() {
  const data = useWeather();
  const current = data?.current;

  if (!data || !current) {
    return (
      <div className="popover-empty">
        <span className="empty-icon">
          <CloudSun size={22} strokeWidth={1.8} />
        </span>
        <span className="empty-title">{data?.error ?? "Carregando a previsão…"}</span>
        <button className="action primary" onClick={() => ipc.openSettings()}>
          Abrir configurações
        </button>
      </div>
    );
  }

  const condition = describe(current.code, current.isDay);
  // Uma escala só para as barras dos 5 dias, como no app Tempo.
  const low = Math.min(...data.daily.map((d) => d.min));
  const high = Math.max(...data.daily.map((d) => d.max));
  const pct = (v: number) => ((v - low) / Math.max(1, high - low)) * 100;
  const updated = new Date(data.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const fullForecast = () => openUrl(`https://www.google.com/search?q=${encodeURIComponent(`previsão do tempo ${data.location}`)}`);

  return (
    <>
      <div className="wx-header">
        <span className="wx-city">{data.location}</span>
        <span className="popover-meta">Atualizado às {updated}</span>
      </div>
      <div className="wx-now">
        <WeatherGlyph icon={condition.icon} size={44} strokeWidth={1.5} />
        <span className="wx-now-temp">{degrees(current.temperature)}</span>
        <span className="wx-now-text">
          <span>{condition.label}</span>
          <span className="popover-meta">
            Sensação {degrees(current.apparentTemperature)} · Umidade {Math.round(current.humidity)}%
          </span>
        </span>
      </div>
      {data.error && <div className="error-box">{data.error}</div>}
      <ul className="wx-hours" aria-label="Próximas horas">
        {data.hourly.map((h, i) => (
          <li key={h.time}>
            <span className="popover-meta">{i === 0 ? "Agora" : hourLabel(h.time)}</span>
            <WeatherGlyph icon={describe(h.code, h.isDay).icon} size={18} />
            <span className="wx-hour-temp">{degrees(h.temperature)}</span>
          </li>
        ))}
      </ul>
      <ul className="wx-days" aria-label="Próximos dias">
        {data.daily.map((d, i) => (
          <li key={d.date}>
            <span className="wx-day">{dayName(d.date, i)}</span>
            <WeatherGlyph icon={describe(d.code).icon} size={16} />
            <span className="wx-low">{degrees(d.min)}</span>
            <span className="wx-bar" aria-label={`Mínima ${degrees(d.min)}, máxima ${degrees(d.max)}`}>
              <span style={{ left: `${pct(d.min)}%`, width: `${pct(d.max) - pct(d.min)}%` }} />
            </span>
            <span className="wx-high">{degrees(d.max)}</span>
          </li>
        ))}
      </ul>
      <ActionFooter context="Clima" actions={[{ label: "Previsão completa", keys: "↵", onClick: fullForecast }]} />
    </>
  );
}
