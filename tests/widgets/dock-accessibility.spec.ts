import { expect, test } from "@playwright/test";
import { openMock } from "./fixtures";

test("sortable widgets expose one control and dividers have a name", async ({ page }) => {
  await openMock(page, "view=dock");
  await expect(page.locator('.widget-slot[role="button"]')).toHaveCount(0);
  await expect(page.locator('.divider-item[role="button"]')).toHaveCount(0);
  const dividers = page.getByRole("button", { name: "Divider", exact: true });
  await expect(dividers).not.toHaveCount(0);
  await dividers.first().focus();
  await expect(dividers.first()).toBeFocused();
});
