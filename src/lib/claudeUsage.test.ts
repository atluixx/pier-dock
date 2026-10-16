import { test } from "node:test";
import assert from "node:assert/strict";
import type { ClaudeUsage } from "./ipc.ts";
import { CRITICAL, limitLevel, tightest, WARN } from "./claudeUsage.ts";

function usage(patch: Partial<ClaudeUsage>): ClaudeUsage {
  return {
    sessionPercent: null,
    sessionResetsIn: null,
    weeklyPercent: null,
    weeklyResetsIn: null,
    ageMin: null,
    stale: false,
    todayTokens: 0,
    todayMessages: 0,
    blockTokens: 0,
    topModel: null,
    fetchedAt: 0,
    ...patch,
  };
}

test("faixas de cor do anel", () => {
  assert.equal(limitLevel(null), "unknown");
  assert.equal(limitLevel(0), "normal");
  assert.equal(limitLevel(WARN - 1), "normal");
  assert.equal(limitLevel(WARN), "warn");
  assert.equal(limitLevel(CRITICAL), "critical");
  assert.equal(limitLevel(100), "critical");
});

test("o tile mostra a janela mais perto do limite", () => {
  const semana = tightest(usage({ sessionPercent: 12, weeklyPercent: 78, weeklyResetsIn: 3000 }));
  assert.equal(semana.name, "Semana");
  assert.equal(semana.percent, 78);
  assert.equal(semana.resetsIn, 3000);

  const sessao = tightest(usage({ sessionPercent: 90, weeklyPercent: 40 }));
  assert.equal(sessao.name, "Sessão 5h");
});

test("janela desconhecida não concorre", () => {
  // A semana virou (percentual desconhecido): o tile mostra a de 5h, mesmo com percentual menor.
  const only = tightest(usage({ sessionPercent: 5, weeklyPercent: null }));
  assert.equal(only.name, "Sessão 5h");
  assert.equal(only.percent, 5);
});

test("sem dado nenhum, o tile fica no estado desconhecido", () => {
  for (const data of [usage({}), null]) {
    const nothing = tightest(data);
    assert.equal(nothing.percent, null);
    assert.equal(limitLevel(nothing.percent), "unknown");
  }
});
