import type { CalendarEvent } from "./ipc";

const MINUTE = 60_000;
/** A partir de quanto tempo antes o botão Entrar aparece. */
export const JOIN_BEFORE_MS = 5 * MINUTE;

export const clock = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Eventos com horário que ainda não terminaram hoje (os de dia inteiro ficam de fora). */
export function remainingToday(events: CalendarEvent[], now: number): CalendarEvent[] {
  const end = endOfDay(now);
  return events.filter((e) => !e.allDay && e.endMs > now && e.startMs < end);
}

/** Eventos com horário de amanhã. */
export function tomorrow(events: CalendarEvent[], now: number): CalendarEvent[] {
  const start = endOfDay(now);
  return events.filter((e) => !e.allDay && e.startMs >= start && e.startMs < endOfDay(start));
}

export function isOngoing(e: CalendarEvent, now: number): boolean {
  return e.startMs <= now && now < e.endMs;
}

export function canJoin(e: CalendarEvent, now: number): boolean {
  return !!e.meetingUrl && now < e.endMs && e.startMs - now <= JOIN_BEFORE_MS;
}

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / MINUTE));

/** "45 min", "1 h", "7 h 17 min". */
export function span(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "em 12 min · 16:00", "às 16:00" (falta mais de uma hora) ou "agora · termina em 7 h 17 min". */
export function countdown(e: CalendarEvent, now: number): string {
  if (isOngoing(e, now)) return `agora · termina em ${span(minutes(e.endMs - now))}`;
  const until = e.startMs - now;
  return until < 60 * MINUTE ? `em ${minutes(until)} min · ${clock(e.startMs)}` : `às ${clock(e.startMs)}`;
}

/** Duração para a lista: "45 min", "1 h", "1 h 30 min". */
export function duration(e: CalendarEvent): string {
  return span(Math.round((e.endMs - e.startMs) / MINUTE));
}

const DOT_COLORS = ["coral", "green", "amber", "lilac"] as const;

/** O iCal não traz a cor do evento: cada título ganha uma cor fixa. */
export function dotColor(title: string): (typeof DOT_COLORS)[number] {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return DOT_COLORS[Math.abs(hash) % DOT_COLORS.length];
}
