import { test, expect } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";

test("clock opens its own month calendar", async ({ page }) => {
 await openMock(page, "view=dock");
 await page.locator('.clock-tile').click();
 await expectCall(page, "open_panel", { kind: "clock" });
});
test("calendar navigation and Today work without an iCal account", async ({ page }) => {
 await page.clock.setFixedTime(new Date("2026-12-23T12:00:00Z"));
 await openMock(page, "view=panel&kind=clock");
 await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();
 await page.getByRole("button", { name: "Next month" }).click();
 await expect(page.getByRole("heading", { name: "January 2027" })).toBeVisible();
 await page.getByRole("button", { name: "Previous month" }).click();
 await page.getByRole("button", { name: "Previous month" }).click();
 await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
 await page.getByRole("button", { name: "Today", exact: true }).click();
 await expect(page.locator('time[aria-current="date"]')).toHaveAttribute("datetime", "2026-12-23");
 await expect(page.locator("tbody td")).toHaveCount(42);
});
