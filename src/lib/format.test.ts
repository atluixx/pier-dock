import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBytes, formatFocus, formatPercent, formatResetIn, formatTimer, formatTokens, shortModel } from "./format.ts";

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

test("contagem de tokens", () => {
  assert.equal(formatTokens(12_400_000), "12,4M");
  assert.equal(formatTokens(3_100), "3k");
  assert.equal(formatTokens(1_000_000), "1M");
  assert.equal(formatTokens(950), "950");
  assert.equal(formatTokens(0), "0");
});

test("tempo até o reset", () => {
  assert.equal(formatResetIn(48), "48min");
  assert.equal(formatResetIn(258), "4h18");
  assert.equal(formatResetIn(7_200), "5d0h");
  assert.equal(formatResetIn(60), "1h00");
  // Janela que já virou ou sem dado não tem tempo restante.
  assert.equal(formatResetIn(null), "--");
  assert.equal(formatResetIn(-60), "--");
});

test("percentual de limite", () => {
  assert.equal(formatPercent(78), "78%");
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(null), "--");
});

test("nome curto do modelo", () => {
  assert.equal(shortModel("claude-opus-5"), "opus5");
  assert.equal(shortModel("claude-sonnet-5-5"), "sonnet55");
  assert.equal(shortModel(null), "");
});
