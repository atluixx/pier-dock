import { test, expect } from "@playwright/test";
import { expectCall } from "./fixtures";

async function openSettings(page: import("@playwright/test").Page, responses: Record<string, unknown>) {
  await page.addInitScript(({ responses }) => {
    Object.assign(window, { __PIER_TEST_CALLS__: [], __PIER_TEST_RESPONSES__: responses, __PIER_TEST_ERRORS__: {} });
  }, { responses });
  await page.goto("/?view=settings");
  await page.getByRole("tablist").waitFor();
}

test("first run asks before replacing the system bar", async ({ page }) => {
  await openSettings(page, { first_run: true });
  const welcome = page.getByRole("region", { name: "Welcome to Pier" });
  await expect(welcome).toContainText("Pier can take the place of the");
  await welcome.getByRole("button", { name: "Replace it", exact: true }).click();
  await expectCall(page, "save_config", { config: expect.objectContaining({ hideTaskbar: true }) });
  await expect(welcome).toHaveCount(0);
});

test("keeping both saves the choice without hiding the system bar", async ({ page }) => {
  await openSettings(page, { first_run: true });
  await page.getByRole("button", { name: "Keep both", exact: true }).click();
  await expectCall(page, "save_config", { config: expect.objectContaining({ hideTaskbar: false }) });
});

test("no welcome after the first run", async ({ page }) => {
  await openSettings(page, { first_run: false });
  await expect(page.getByRole("region", { name: "Welcome to Pier" })).toHaveCount(0);
});
