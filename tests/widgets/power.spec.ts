import { test, expect } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";

test("battery opens power mode controls", async ({ page }) => {
 await openMock(page, "view=dock"); await page.locator('.battery-tile').click(); await expectCall(page, "open_panel", { kind: "battery" });
});
test("all three advertised modes can be selected", async ({ page }) => {
 await openMock(page, "view=panel&kind=battery");
 for (const [name,profile] of [["Power save","power-saver"],["Performance","performance"],["Balanced","balanced"]]) {
  await page.getByRole("radio", { name, exact: true }).click();
  await expectCall(page, "set_power_profile", { profile });
  await expect(page.getByRole("radio", { name, exact: true })).toHaveAttribute("aria-checked", "true");
 }
});
test("unsupported modes are disabled and failures keep the real active mode", async ({ page }) => {
 await openMock(page, "view=panel&kind=battery", { power_profiles: { profiles: ["power-saver","balanced"], active: "balanced", canSet: true } }, { set_power_profile: "not authorized" });
 await expect(page.getByRole("radio", { name: "Performance", exact: true })).toBeDisabled();
 await page.getByRole("radio", { name: "Power save", exact: true }).click();
 await expect(page.getByRole("alert")).toContainText("Could not change");
 await expect(page.getByRole("radio", { name: "Balanced", exact: true })).toHaveAttribute("aria-checked", "true");
});
