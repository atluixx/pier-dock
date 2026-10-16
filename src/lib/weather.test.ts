import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, hourLabel, rainSoon } from "./weather.ts";

const hour = (time: string, code: number, precipitationProbability = 0) => ({ time, code, precipitationProbability, temperature: 20, isDay: true });
const current = (code: number) => ({ temperature: 24, apparentTemperature: 25, humidity: 62, code, isDay: true });

test("descreve os códigos WMO", () => {
  assert.equal(describe(2).short, "Parc. nublado");
  assert.equal(describe(2, false).icon, "cloud-moon");
  assert.equal(describe(0, false).icon, "moon");
  assert.equal(describe(81).icon, "rain");
  assert.equal(describe(99).label, "Tempestade");
});

test("avisa da chuva nas próximas 2 horas", () => {
  const hourly = [hour("2026-10-16T15:00", 2), hour("2026-10-16T16:00", 61), hour("2026-10-16T17:00", 61)];
  assert.equal(rainSoon({ current: current(2), hourly }), "Chuva às 16h");
  assert.equal(rainSoon({ current: current(2), hourly: [hour("x", 2), hour("2026-10-16T09:00", 3, 70)] }), "Chuva às 9h");
  // Já chovendo, a condição atual basta.
  assert.equal(rainSoon({ current: current(63), hourly }), null);
  // Chuva só daqui a 3 horas não conta.
  assert.equal(rainSoon({ current: current(2), hourly: [hour("a", 2), hour("b", 2), hour("c", 2), hour("2026-10-16T18:00", 61)] }), null);
});

test("hora curta", () => {
  assert.equal(hourLabel("2026-10-16T09:00"), "9h");
});
