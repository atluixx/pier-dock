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
  const c = (label: string, icon: WeatherIcon, short = label): Condition => ({ label, short, icon });
  if (code === 0) return c("Céu limpo", isDay ? "sun" : "moon", "Limpo");
  if (code === 1) return c("Poucas nuvens", isDay ? "cloud-sun" : "cloud-moon");
  if (code === 2) return c("Parcialmente nublado", isDay ? "cloud-sun" : "cloud-moon", "Parc. nublado");
  if (code === 3) return c("Nublado", "cloud");
  if (code === 45 || code === 48) return c("Neblina", "fog");
  if (code >= 51 && code <= 57) return c("Garoa", "drizzle");
  if (code === 61) return c("Chuva fraca", "rain");
  if (code === 63) return c("Chuva", "rain");
  if (code === 65) return c("Chuva forte", "rain");
  if (code === 66 || code === 67) return c("Chuva congelante", "rain", "Chuva gelada");
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return c("Neve", "snow");
  if (code >= 80 && code <= 82) return c("Pancadas de chuva", "rain", "Pancadas");
  if (code >= 95) return c("Tempestade", "storm");
  return c("Sem dados", "cloud");
}

export function isRain(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

/** `2026-10-16T16:00` → `16h`. */
export function hourLabel(time: string): string {
  return `${Number(time.slice(11, 13))}h`;
}

/**
 * "Chuva às 16h" quando ainda não chove mas a previsão das próximas 2 horas tem chuva (pela
 * condição ou por 60% de chance ou mais).
 */
export function rainSoon(data: Pick<WeatherData, "current" | "hourly">): string | null {
  if (!data.current || isRain(data.current.code)) return null;
  const hour = data.hourly.slice(1, 3).find((h) => isRain(h.code) || h.precipitationProbability >= 60);
  return hour ? `Chuva às ${hourLabel(hour.time)}` : null;
}

export const degrees = (value: number) => `${Math.round(value)}°`;
