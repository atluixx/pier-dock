import test from "node:test";
import { spring } from "framer-motion";
import { HOVER_SPRING } from "./hoverSpring.ts";
import assert from "node:assert/strict";
import { magnifiedSize, measureCenters, projectedCenters } from "./magnifyGeometry.ts";

test("magnification is bounded, symmetric, and resets when the pointer leaves", () => {
  assert.equal(magnifiedSize(100, 100, 40, 1.6), 64);
  assert.equal(magnifiedSize(Infinity, 100, 40, 1.6), 40);
  assert.equal(magnifiedSize(100, Infinity, 40, 1.6), 40);
  assert.equal(magnifiedSize(100, 100, 40, 1), 40);
  assert.equal(magnifiedSize(204, 100, 40, 1.6), 40);
  assert.equal(magnifiedSize(74, 100, 40, 1.6), magnifiedSize(126, 100, 40, 1.6));
});

test("all geometry reads complete before subscribers can write layout", () => {
  const events: string[] = [];
  measureCenters([1, 2, 3], (item) => { events.push(`read ${item}`); return item * 10; },
    (item, center) => { events.push(`publish ${item}:${center}`); });
  assert.deepEqual(events, ["read 1", "read 2", "read 3", "publish 1:10", "publish 2:20", "publish 3:30"]);
});

test("projected centers preserve mixed widget gaps and centered packing on either axis", () => {
  const items = [{ center: 100, initial: 40, current: 60 }, { center: 260, initial: 40, current: 50 }];
  assert.deepEqual(projectedCenters(items), [95, 270]);
  assert.deepEqual(projectedCenters(items.map((item) => ({ ...item, current: 40 }))), [100, 260]);
  assert.deepEqual(projectedCenters([]), []);
});

test("the hover spring reaches 95% by 120ms without overshooting", () => {
  const animation = spring({ ...HOVER_SPRING, keyframes: [40, 64] });
  for (let time = 0; time <= 600; time += 10) {
    const { value } = animation.next(time);
    assert.ok(value >= 40 && value <= 64);
    if (time === 120) assert.ok(value >= 62.8);
  }
});
