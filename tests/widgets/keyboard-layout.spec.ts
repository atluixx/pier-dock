import { test, expect } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";

test("lists the installed layouts and marks the active one", async ({ page }) => {
  await openMock(page, "view=panel&kind=keyboard-layout");
  await expect(page.getByRole("radio")).toHaveCount(3);
  await expect(page.getByRole("radio", { name: /English/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /Portuguese/ })).toHaveAttribute("aria-checked", "false");
});

test("choosing a layout switches to it and closes the panel", async ({ page }) => {
  await openMock(page, "view=panel&kind=keyboard-layout");
  await page.getByRole("radio", { name: /Portuguese/ }).click();
  await expectCall(page, "set_keyboard_layout", { id: "04160416" });
  await expectCall(page, "close_panel");
});

test("a failed switch shows an error and keeps the real active layout", async ({ page }) => {
  await openMock(page, "view=panel&kind=keyboard-layout", {}, { set_keyboard_layout: "blocked" });
  await page.getByRole("radio", { name: /Portuguese/ }).click();
  await expect(page.getByRole("alert")).toContainText("Could not switch");
  await expect(page.getByRole("radio", { name: /English/ })).toHaveAttribute("aria-checked", "true");
});
