import { test } from "node:test";
import assert from "node:assert/strict";
import type { DockApp } from "./apps.ts";
import { stableOpenApps } from "./runningOrder.ts";

const running = (key: string): DockApp => ({
  key,
  name: key,
  windows: [],
  iconKey: key,
  launchTarget: key,
  badge: 0,
});

const pinned = (key: string): DockApp => ({
  ...running(key),
  pinned: { id: key, name: key, target: key },
});

const keys = (apps: DockApp[]) => apps.map((app) => app.key);

test("apps abertos ficam na posição em que apareceram, mesmo quando o snapshot muda de ordem", () => {
  const first = stableOpenApps([], [pinned("p"), running("a"), running("b"), running("c")]);
  assert.deepEqual(keys(first), ["p", "a", "b", "c"]);

  const second = stableOpenApps(first, [running("c"), pinned("p"), running("a"), running("b")]);
  assert.deepEqual(keys(second), ["p", "a", "b", "c"]);

  const third = stableOpenApps(second, [running("b"), running("c"), running("a"), pinned("p")]);
  assert.deepEqual(keys(third), ["p", "a", "b", "c"]);
});

test("apps novos entram no fim", () => {
  const before = [pinned("p"), running("a"), running("b")];
  const after = stableOpenApps(before, [running("c"), pinned("p"), running("b"), running("a")]);
  assert.deepEqual(keys(after), ["p", "a", "b", "c"]);
});

test("app fechado sai e, se reabrir, volta para o fim", () => {
  const before = [pinned("p"), running("a"), running("b"), running("c")];
  const withoutB = stableOpenApps(before, [running("c"), pinned("p"), running("a")]);
  assert.deepEqual(keys(withoutB), ["p", "a", "c"]);

  const reopened = stableOpenApps(withoutB, [running("b"), running("a"), pinned("p"), running("c")]);
  assert.deepEqual(keys(reopened), ["p", "a", "c", "b"]);
});

test("fixados mantêm a ordem vinda da configuração e ficam antes dos abertos", () => {
  const ordered = stableOpenApps([], [running("a"), pinned("q"), running("b"), pinned("p")]);
  assert.deepEqual(keys(ordered), ["q", "p", "a", "b"]);
});

test("os objetos são os do snapshot novo e nenhuma lista é alterada", () => {
  const before = [pinned("p"), running("a"), running("b")];
  const next = [running("b"), running("a"), pinned("p")];
  const ordered = stableOpenApps(before, next);
  assert.deepEqual(keys(before), ["p", "a", "b"]);
  assert.deepEqual(keys(next), ["b", "a", "p"]);
  assert.equal(ordered[1], next[1]);
  assert.equal(ordered[2], next[0]);
});
