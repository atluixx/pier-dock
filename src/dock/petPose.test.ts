import { test } from "node:test";
import assert from "node:assert/strict";
import { petPose } from "./petPose.ts";

const bar = { x: 100, y: 200, width: 300, height: 64 };
test("mascot anchors and rotates its feet onto each dock edge", () => {
  for (const [edge, x, y, angle] of [["bottom",120,180,0], ["top",120,258,180], ["left",394,220,90], ["right",80,220,-90]] as const) {
    assert.deepEqual(Object.values(petPose(edge, bar, 10, 1)).slice(0, 3), [x, y, angle]);
  }
});
test("changing edges immediately derives facing from direction and clamps a shorter bar", () => {
  assert.equal(petPose("bottom", bar, 10, 1).mirror, false);
  assert.equal(petPose("top", bar, 10, 1).mirror, true);
  assert.equal(petPose("left", bar, 1000, -1).y, 228);
  assert.equal(petPose("right", bar, 10, -1).mirror, false);
  assert.equal(petPose("bottom", { ...bar, width: 20 }, -10, 1).x, 110);
});
