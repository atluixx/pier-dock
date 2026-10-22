import { test } from "node:test";
import assert from "node:assert/strict";
import { fitItems, type FitItem } from "./fit.ts";

const icon = (key: string, fixed = false): FitItem => ({ key, length: 48, fixed });
const wide = (key: string): FitItem => ({ key, length: 176, compact: 48 });

test("quando tudo cabe nada muda", () => {
  const fit = fitItems([icon("a"), wide("w")], 400, 4, 48);
  assert.deepEqual([...fit.compact], []);
  assert.deepEqual(fit.overflow, []);
});

test("compacta só os widgets largos necessários, do fim para o começo", () => {
  const items = [wide("w1"), icon("a"), wide("w2")];
  // Natural: 176 + 48 + 176 + 8 = 408. Compactar w2 dá 280.
  const fit = fitItems(items, 300, 4, 48);
  assert.deepEqual([...fit.compact], ["w2"]);
  assert.deepEqual(fit.overflow, []);
});

test("o que sobra depois de compactar vai para o menu, do fim da barra", () => {
  const items = [icon("start", true), icon("a"), icon("b"), icon("c")];
  // 4 itens = 204; com o botão do menu cabem 3 itens + botão = 48 * 4 + 12.
  const fit = fitItems(items, 200, 4, 48);
  assert.deepEqual(fit.overflow, ["b", "c"]);
});

test("itens fixos nunca saem da barra", () => {
  const items = [icon("start", true), icon("launcher", true), icon("a")];
  const fit = fitItems(items, 100, 4, 48);
  assert.deepEqual(fit.overflow, ["a"]);
});

test("um widget compactado que acaba no menu não conta como compactado", () => {
  const items = [icon("start", true), wide("w1"), wide("w2")];
  const fit = fitItems(items, 110, 4, 48);
  assert.deepEqual(fit.overflow, ["w1", "w2"]);
  assert.deepEqual([...fit.compact], []);
});

test("o resultado não depende do estado anterior", () => {
  const items = [wide("w1"), wide("w2")];
  assert.deepEqual(fitItems(items, 230, 4, 48), fitItems(items, 230, 4, 48));
});
