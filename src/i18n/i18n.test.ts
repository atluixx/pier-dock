import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLang, setLang } from "./index.ts";
import { formatBytes, shortDate } from "../lib/format.ts";
import { describe, hourLabel } from "../lib/weather.ts";

test("idioma do sistema só vale com a opção Sistema", () => {
  assert.equal(resolveLang("system", "en"), "en");
  assert.equal(resolveLang("system", "pt"), "pt");
  assert.equal(resolveLang("pt", "en"), "pt");
  assert.equal(resolveLang("en", "pt"), "en");
});

test("textos e formatos em inglês", () => {
  setLang("en");
  try {
    assert.equal(describe(0).label, "Clear sky");
    assert.equal(hourLabel("2026-10-16T16:00"), "4PM");
    assert.equal(hourLabel("2026-10-16T00:00"), "12AM");
    assert.equal(formatBytes(10.9 * 1024 ** 3), "10.9 GB");
    assert.equal(shortDate(new Date(2026, 9, 14)), "Wed, Oct 14");
  } finally {
    setLang("pt");
  }
  assert.equal(describe(0).label, "Céu limpo");
  assert.equal(shortDate(new Date(2026, 9, 14)), "qua, 14 out");
});
