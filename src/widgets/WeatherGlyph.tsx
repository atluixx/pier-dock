import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon } from "lucide-react";
import { Sun } from "../ui/DockIcons";
import type { WeatherIcon } from "../lib/weather";

const ICONS = {
  sun: Sun,
  moon: Moon,
  "cloud-sun": CloudSun,
  "cloud-moon": CloudMoon,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

/** Ícone da condição, com a cor dela (o sol em âmbar, a chuva em azul…). */
export function WeatherGlyph({ icon, size, strokeWidth = 1.8 }: { icon: WeatherIcon; size: number; strokeWidth?: number }) {
  const Icon = ICONS[icon];
  return <Icon className={`wx-icon wx-${icon}`} size={size} strokeWidth={strokeWidth} aria-hidden />;
}
