import { expect, test } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";

test("per-app volume can be adjusted from the larger slider target", async ({ page }) => {
  await openMock(page, "view=panel&kind=volume");
  const slider = page.getByRole("slider", { name: "Spotify volume" });
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(24);
  await slider.click({ position: { x: box.width / 2, y: 2 } });
  await expectCall(page, "set_app_volume", { id: "1", level: expect.any(Number) });
});
