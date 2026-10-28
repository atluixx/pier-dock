import { expect, test } from "@playwright/test";
import { openMock } from "./fixtures";

test("the panel names the system and application output scopes", async ({ page }) => {
  await openMock(page, "view=panel&kind=volume");
  await expect(page.getByRole("radiogroup", { name: "Default output" })).toBeVisible();
  await expect(page.getByText("App audio", { exact: true })).toBeVisible();
  await expect(page.getByText("Choose a separate output for each app.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Spotify output", exact: true })).toBeVisible();
});
