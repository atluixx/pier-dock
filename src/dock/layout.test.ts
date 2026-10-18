import { test } from "node:test";
import assert from "node:assert/strict";
import { dockMetrics } from "./layout.ts";

test("a barra flutuante reserva a altura e as duas margens", () => {
  const metrics = dockMetrics(40, 1.6);
  assert.equal(metrics.barHeight, 64);
  assert.equal(metrics.reservedHeight, 80);
});

test("na largura total a área reservada é a própria barra", () => {
  const metrics = dockMetrics(40, 1.6, true);
  assert.equal(metrics.reservedHeight, metrics.barHeight);
  // A janela da dock ainda cobre a folga da magnificação e das dicas acima da barra.
  assert.equal(metrics.windowHeight, metrics.barHeight + metrics.hoverHeadroom);
});
