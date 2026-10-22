import test from "node:test";
import assert from "node:assert/strict";
import { latestSender, sameHitRect } from "./hitRect.ts";
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("slow native requests skip intermediate frames and suppress already-applied geometry", async () => {
  const sent: number[] = [];
  let finish: (() => void) | undefined;
  const sender = latestSender((value: number) => { sent.push(value); return new Promise<void>((resolve) => { finish = resolve; }); }, Object.is, assert.fail);
  sender.submit(1);
  sender.submit(2);
  sender.submit(3);
  await tick();
  assert.deepEqual(sent, [1]);
  finish!();
  await tick();
  assert.deepEqual(sent, [1, 3]);
  finish!();
  await tick();
  sender.submit(3);
  await tick();
  assert.deepEqual(sent, [1, 3]);
  sender.dispose();
});

test("a failed update can be retried; disposal drops queued updates", async () => {
  const errors: unknown[] = [];
  const sent: number[] = [];
  const sender = latestSender(async (value: number) => { sent.push(value); if (sent.length === 1) throw new Error("unavailable"); }, Object.is, (e) => errors.push(e));
  sender.submit(1);
  await tick();
  sender.submit(1);
  await tick();
  assert.deepEqual(sent, [1, 1]);
  assert.equal(errors.length, 1);
  sender.dispose();
  sender.submit(2);
  await tick();
  assert.deepEqual(sent, [1, 1]);
});

test("moves, resizes and radius changes all invalidate the cached hit rectangle", () => {
  const rect = { x: 10.5, y: 20, width: 400, height: 64, radius: 16 };
  assert.ok(sameHitRect(rect, { ...rect }));
  for (const field of ["x", "y", "width", "height", "radius"] as const) {
    assert.equal(sameHitRect(rect, { ...rect, [field]: rect[field] + 1 }), false);
  }
});
