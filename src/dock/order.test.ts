import { test } from "node:test";
import assert from "node:assert/strict";
import { addDivider, applyOrder, removeItem, resolveOrder } from "./order.ts";

const app = (id: string) => ({ id, name: id, target: `/Applications/${id}.app` });
const widget = (kind: string, enabled = true) => ({ kind, enabled, size: "small" }) as const;

const base = {
  dockOrder: [] as string[],
  pinnedApps: [app("finder"), app("safari")],
  widgets: [widget("media"), widget("clock"), widget("battery", false)],
  showStartButton: true,
};

test("config antiga vira botão de apps, apps, separador e widgets", () => {
  assert.deepEqual(resolveOrder(base), ["start", "app:finder", "app:safari", "divider:default", "widget:media", "widget:clock"]);
});

test("ordem salva mistura apps e widgets e é respeitada", () => {
  const dockOrder = ["widget:clock", "app:safari", "start", "divider:x", "app:finder", "widget:media"];
  assert.deepEqual(resolveOrder({ ...base, dockOrder }), dockOrder);
});

test("itens que sumiram saem e os novos entram no fim", () => {
  const config = {
    ...base,
    pinnedApps: [app("safari"), app("music")],
    dockOrder: ["widget:clock", "app:finder", "app:safari", "app:safari", "start", "widget:media"],
  };
  assert.deepEqual(resolveOrder(config), ["widget:clock", "app:safari", "start", "widget:media", "app:music"]);
});

test("botão de apps escondido não aparece", () => {
  const config = { ...base, showStartButton: false, dockOrder: ["start", "app:finder", "app:safari"] };
  assert.deepEqual(resolveOrder(config), ["app:finder", "app:safari", "widget:media", "widget:clock"]);
});

test("applyOrder reordena apps e widgets e deixa os desligados no fim", () => {
  const keys = ["widget:clock", "app:safari", "app:finder", "widget:media"];
  const result = applyOrder(base, keys);
  assert.deepEqual(result.dockOrder, keys);
  assert.deepEqual(result.pinnedApps.map((p) => p.id), ["safari", "finder"]);
  assert.deepEqual(result.widgets.map((w) => w.kind), ["clock", "media", "battery"]);
});

test("removeItem desafixa, desliga, esconde ou apaga conforme o item", () => {
  const dockOrder = ["start", "app:finder", "divider:a", "widget:media", "app:safari", "widget:clock"];
  const config = { ...base, dockOrder };
  assert.deepEqual(removeItem(config, "app:finder").pinnedApps?.map((p) => p.id), ["safari"]);
  assert.equal(removeItem(config, "widget:media").widgets?.find((w) => w.kind === "media")?.enabled, false);
  assert.equal(removeItem(config, "start").showStartButton, false);
  assert.deepEqual(removeItem(config, "divider:a").dockOrder, ["start", "app:finder", "widget:media", "app:safari", "widget:clock"]);
});

test("addDivider põe um separador novo no fim", () => {
  const order = addDivider(base).dockOrder!;
  assert.equal(order.length, 7);
  assert.match(order[6], /^divider:/);
});
