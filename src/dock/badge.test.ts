import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBadge, parseTitleCount } from "./badge.ts";

test("lê a contagem no começo do título", () => {
  assert.equal(parseTitleCount("(3) WhatsApp"), 3);
  assert.equal(parseTitleCount("[12] Inbox - Gmail"), 12);
  assert.equal(parseTitleCount("(5+) Slack"), 5);
  assert.equal(parseTitleCount("(7)"), 7);
});

test("ignora números que não são contagem", () => {
  assert.equal(parseTitleCount("WhatsApp (3)"), 0);
  assert.equal(parseTitleCount("(3)WhatsApp"), 0);
  assert.equal(parseTitleCount("(1234) x"), 0);
  assert.equal(parseTitleCount("(0) x"), 0);
  assert.equal(parseTitleCount("Notepad"), 0);
});

test("acima de 99 mostra 99+", () => {
  assert.equal(formatBadge(7), "7");
  assert.equal(formatBadge(100), "99+");
});
