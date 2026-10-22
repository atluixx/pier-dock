import test from "node:test";
import assert from "node:assert/strict";
import { reuseDockApps } from "./appIdentity.ts";
import type { DockApp } from "./apps";

const app = (key: string): DockApp => ({ key, name: key, windows: [{ id: 1, title: key, exe: key, pid: 1, minimized: false }], iconKey: key, launchTarget: key, badge: 0 });

test("unchanged apps retain their identity across fresh window snapshots and reorderings", () => {
  const previous = [app("one"), app("two")];
  const next = reuseDockApps(previous, [app("two"), app("one")]);
  assert.equal(next[0], previous[1]);
  assert.equal(next[1], previous[0]);
});

test("titles, badges, launch targets and window membership remain fresh", () => {
  const old = app("one");
  const updates = [
    { ...app("one"), badge: 2 },
    { ...app("one"), launchTarget: "another" },
    { ...app("one"), windows: [] },
    { ...app("one"), windows: [{ ...old.windows[0], title: "new title" }] },
    { ...app("one"), pinned: { id: "one", name: "Renamed", target: "one" } },
  ];
  for (const update of updates) assert.equal(reuseDockApps([old], [update])[0], update);
});
