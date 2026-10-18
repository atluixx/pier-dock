import { test } from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_GAP, PREVIEW_HEIGHT, dockMetrics, previewLeft } from "./layout.ts";

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

test("a faixa de prévias aumenta a folga e a altura da janela", () => {
  const base = dockMetrics(40, 1.6);
  const previewSpace = PREVIEW_HEIGHT + PREVIEW_GAP;
  const withPreview = dockMetrics(40, 1.6, false, previewSpace);
  assert.equal(base.hoverHeadroom, 72);
  assert.equal(withPreview.hoverHeadroom, previewSpace);
  assert.equal(withPreview.windowHeight, withPreview.reservedHeight + previewSpace);
  // Uma folga menor que a da magnificação não pode encolher a janela.
  assert.equal(dockMetrics(40, 2.6, false, 0).hoverHeadroom, dockMetrics(40, 2.6, false, 10).hoverHeadroom);
});

test("a faixa de prévias fica centrada no ícone", () => {
  assert.equal(previewLeft(500, 1000, 200), 400);
});

test("a faixa é presa às bordas da tela", () => {
  assert.equal(previewLeft(50, 1000, 200), 8);
  assert.equal(previewLeft(990, 1000, 200), 792);
});

test("faixa mais larga que a janela encosta na esquerda", () => {
  assert.equal(previewLeft(500, 400, 500), 8);
  // Também quando sobra menos que as duas folgas, senão a faixa sairia pela direita.
  assert.equal(previewLeft(500, 400, 390), 8);
});
