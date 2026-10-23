import { test, expect } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";

test("saved devices remain visible with radio off, then reconnect and disconnect", async ({ page }) => {
  await openMock(page, "view=panel&kind=bluetooth");
  await page.getByRole("switch", { name: "Bluetooth" }).click();
  await expectCall(page, "set_bluetooth", { powered: false });
  await expect(page.getByRole("button", { name: /Keychron K2/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Keychron K2/ })).toBeDisabled();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch").click();
  await expect(page.getByRole("button", { name: /Keychron K2/ })).toBeEnabled();
  await page.getByRole("button", { name: /Keychron K2/ }).click();
  await expectCall(page, "bluetooth_connect", { id: "a3" });
  const row = page.locator(".bt-item").filter({ hasText: "Keychron K2" });
  await row.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expectCall(page, "bluetooth_disconnect", { id: "a3" });
});

test("failed connect reports failure and allows retry", async ({ page }) => {
  await openMock(page, "view=panel&kind=bluetooth", {}, { bluetooth_connect: "Device unavailable" });
  await page.getByRole("button", { name: /Keychron K2/ }).click();
  await expect(page.locator(".bt-item").filter({ hasText: "Keychron K2" })).toContainText("Try again");
  await page.evaluate(() => { (window as unknown as { __PIER_TEST_ERRORS__: object }).__PIER_TEST_ERRORS__ = {}; });
  await page.getByRole("button", { name: /Keychron K2/ }).click();
  await expect(page.locator(".bt-item").filter({ hasText: "Keychron K2" }).getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
});

test("failed power change keeps actual radio state and saved inventory", async ({ page }) => {
  await openMock(page, "view=panel&kind=bluetooth", {}, { set_bluetooth: "Permission denied" });
  await page.getByRole("switch").click();
  await expect(page.getByRole("alert")).toContainText("Try again");
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: /Keychron K2/ })).toBeVisible();
});

test("platform without direct connection opens Bluetooth settings", async ({ page }) => {
  await openMock(page, "view=panel&kind=bluetooth", { bluetooth_status: { available: true, powered: true, canToggle: false, canConnect: false, devices: [{ id: "paired", name: "Saved mouse", kind: "mouse", battery: null, connected: false }] } });
  await page.getByRole("button", { name: /Saved mouse/ }).click();
  await expectCall(page, "open_shell", { kind: "bluetooth" });
});
