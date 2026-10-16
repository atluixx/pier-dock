import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBytes, formatFocus, formatTimer } from "./format.ts";

test("timer do Pomodoro", () => {
  assert.equal(formatTimer(25 * 60_000), "25:00");
  assert.equal(formatTimer(190_000), "03:10");
  assert.equal(formatTimer(1_200), "00:02");
});

test("foco acumulado", () => {
  assert.equal(formatFocus(75 * 60_000), "1h 15min");
  assert.equal(formatFocus(45 * 60_000), "45min");
});

test("tamanhos", () => {
  assert.equal(formatBytes(10.9 * 1024 ** 3), "10,9 GB");
  assert.equal(formatBytes(180 * 1024), "180 KB");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(16 * 1024 ** 3), "16 GB");
  assert.equal(formatBytes(2.4 * 1024 ** 2), "2,4 MB");
});
