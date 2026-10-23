import { test, expect } from "@playwright/test";
import { expectCall } from "./fixtures";

async function openUpdate(page: import("@playwright/test").Page, errors: Record<string, string> = {}) {
  // Settings uses the same dev-only IPC fixtures as the dock/panels.
  await page.addInitScript(({ errors }) => {
    Object.assign(window, { __PIER_TEST_CALLS__: [], __PIER_TEST_RESPONSES__: { check_update: { version: "99.0.0", notes: null } }, __PIER_TEST_ERRORS__: errors });
  }, { errors });
  await page.goto("/?view=settings");
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.getByRole("button", { name: "Install and restart", exact: true }).waitFor();
}

test("Install and restart invokes the native install/relaunch flow once and stays busy", async ({ page }) => {
  await openUpdate(page);
  await page.getByRole("button", { name: "Install and restart", exact: true }).click();
  await expectCall(page, "install_update");
  await expect(page.getByRole("button", { name: "Install and restart", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check for updates", exact: true })).toBeDisabled();
});

test("an install/relaunch preparation failure remains visible and permits checking again", async ({ page }) => {
  await openUpdate(page, { install_update: "AppImage is not executable" });
  await page.getByRole("button", { name: "Install and restart", exact: true }).click();
  await expectCall(page, "install_update");
  await expect(page.getByText("The update failed. Try again.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check for updates", exact: true })).toBeEnabled();
});
