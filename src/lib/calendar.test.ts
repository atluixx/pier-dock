import { test } from "node:test";
import assert from "node:assert/strict";
import { canJoin, countdown, duration, remainingToday, tomorrow } from "./calendar.ts";

const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 9, 16 + dayOffset, h, m).getTime();
const event = (title: string, start: number, end: number, meetingUrl: string | null = null, allDay = false) => ({
  id: title,
  title,
  startMs: start,
  endMs: end,
  allDay,
  location: "",
  meetingUrl,
  attendees: 0,
});

const daily = event("Daily", at(16), at(16, 30), "https://meet.google.com/x");

test("contagem regressiva", () => {
  assert.equal(countdown(daily, at(15, 48)), `em 12 min · ${new Date(at(16)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  assert.match(countdown(daily, at(14)), /^às /);
  assert.equal(countdown(daily, at(16, 12)), "agora · termina em 18 min");
  assert.equal(countdown(event("Plantão", at(9), at(17, 30)), at(10, 13)), "agora · termina em 7 h 17 min");
  assert.equal(countdown(event("Oficina", at(9), at(12)), at(10)), "agora · termina em 2 h");
});

test("o botão Entrar aparece 5 minutos antes e some no fim", () => {
  assert.equal(canJoin(daily, at(15, 54)), false);
  assert.equal(canJoin(daily, at(15, 55)), true);
  assert.equal(canJoin(daily, at(16, 30)), false);
  assert.equal(canJoin(event("Sem link", at(16), at(17)), at(16, 10)), false);
});

test("separa hoje e amanhã", () => {
  const events = [
    event("Manhã", at(9), at(10)),
    daily,
    event("Feriado", at(0), at(0, 0, 1), null, true),
    event("Planejamento", at(9, 30, 1), at(10, 30, 1)),
  ];
  assert.deepEqual(remainingToday(events, at(12)).map((e) => e.title), ["Daily"]);
  assert.deepEqual(tomorrow(events, at(12)).map((e) => e.title), ["Planejamento"]);
});

test("duração", () => {
  assert.equal(duration(event("a", at(17, 30), at(18, 30))), "1 h");
  assert.equal(duration(event("b", at(19), at(19, 45))), "45 min");
  assert.equal(duration(event("c", at(9), at(10, 30))), "1 h 30 min");
});
