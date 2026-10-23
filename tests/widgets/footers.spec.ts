import { test, expect } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";
for (const [kind,label,shell] of [["network","Network settings","network"],["volume","Sound settings","sound"],["bluetooth","Bluetooth settings","bluetooth"]]) {
 test(`${kind} footer contains an action, not an unexplained connection/device name`, async ({ page }) => {
  await openMock(page, `view=panel&kind=${kind}`);
  await expect(page.locator('.action-context')).toBeEmpty();
  const action=page.getByRole('button',{name:label,exact:false});await expect(action).toBeVisible();
  await action.click();await expectCall(page,'open_shell',{kind:shell});
 });
}
