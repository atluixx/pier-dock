import { dict } from "../i18n/index.ts";
import type { WeatherData } from "./ipc";

export type WeatherIcon = "sun" | "moon" | "cloud-sun" | "cloud-moon" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

interface Condition {
  label: string;
  /** Versão curta para o widget largo. */
  short: string;
  icon: WeatherIcon;
}

/** Condição a partir do código WMO que o Open-Meteo devolve. */
export function describe(code: number, isDay = true): Condition {
  const t = dict().weather;
  const c = (label: string, icon: WeatherIcon, short = label): Condition => ({ label, short, icon });
  if (code === 0) return c(t.clear, isDay ? "sun" : "moon", t.clearShort);
  if (code === 1) return c(t.fewClouds, isDay ? "cloud-sun" : "cloud-moon");
  if (code === 2) return c(t.partlyCloudy, isDay ? "cloud-sun" : "cloud-moon", t.partlyCloudyShort);
  if (code === 3) return c(t.cloudy, "cloud");
  if (code === 45 || code === 48) return c(t.fog, "fog");
  if (code >= 51 && code <= 57) return c(t.drizzle, "drizzle");
  if (code === 61) return c(t.lightRain, "rain");
  if (code === 63) return c(t.rain, "rain");
  if (code === 65) return c(t.heavyRain, "rain");
  if (code === 66 || code === 67) return c(t.freezingRain, "rain", t.freezingRainShort);
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return c(t.snow, "snow");
  if (code >= 80 && code <= 82) return c(t.showers, "rain", t.showersShort);
  if (code >= 95) return c(t.storm, "storm");
  return c(t.noData, "cloud");
}

export function isRain(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

/** `2026-10-16T16:00` → `16h` (`4PM` em inglês). */
export function hourLabel(time: string): string {
  return dict().format.hour(Number(time.slice(11, 13)));
}

/**
 * "Chuva às 16h" quando ainda não chove mas a previsão das próximas 2 horas tem chuva (pela
 * condição ou por 60% de chance ou mais).
 */
export function rainSoon(data: Pick<WeatherData, "current" | "hourly">): string | null {
  if (!data.current || isRain(data.current.code)) return null;
  const hour = data.hourly.slice(1, 3).find((h) => isRain(h.code) || h.precipitationProbability >= 60);
  return hour ? dict().weather.rainAt(hourLabel(hour.time)) : null;
}

export const degrees = (value: number) => `${Math.round(value)}°`;
