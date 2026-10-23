import test from "node:test";
import assert from "node:assert/strict";
import { createHoverOwner } from "./hoverOwner.ts";

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
