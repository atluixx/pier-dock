import test from "node:test";
import assert from "node:assert/strict";
import { createHoverOwner } from "./hoverOwner.ts";
import { HOVER_SPRING } from "./hoverSpring.ts";
import { spring } from "framer-motion";

test("crossing items resets only the previous owner and reentering is a no-op", () => {
  const state = createHoverOwner();
  const resets: number[] = [];
  const items = Array.from({ length: 100 }, (_, i) => () => resets.push(i));
  state.claim(items[0]);
  state.claim(items[1]);
  state.claim(items[1]);
  assert.deepEqual(resets, [0]);
  state.reset();
  state.reset();
  assert.deepEqual(resets, [0, 1]);
});

test("unmounting another item cannot clear the current hover", () => {
  const state = createHoverOwner();
  let resets = 0;
  const current = () => resets++;
  state.claim(current);
  state.release(() => {});
  state.reset(current);
  assert.equal(resets, 0);
  state.reset();
  assert.equal(resets, 1);
  state.claim(current);
  state.release(current);
  state.reset();
  assert.equal(resets, 1);
});

test("the hover spring reaches 95% by 120ms without overshooting", () => {
  const animation = spring({ ...HOVER_SPRING, keyframes: [40, 64] });
  for (let time = 0; time <= 600; time += 10) {
    const { value } = animation.next(time);
    assert.ok(value >= 40 && value <= 64);
    if (time === 120) assert.ok(value >= 62.8);
  }
});
