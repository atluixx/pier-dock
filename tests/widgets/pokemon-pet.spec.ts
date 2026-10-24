import { test, expect } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";

test("pokemon pet shows the chosen party sprite and walks the dock", async ({ page }) => {
  await openMock(page, "view=dock");
  await page.evaluate(async () => {
    const { useConfig } = await import("/src/store/config.ts");
    useConfig.setState({ config: { ...useConfig.getState().config, pokemonPetEnabled: true, pokemonPetId: 6, widgets: [] } });
  });
  await expectCall(page, "pokemon_sprite", { id: 6 });
  await expect(page.locator(".pokemon-pet-sprite")).toBeVisible();
  const first = (await page.locator(".pokemon-pet").boundingBox())!.x;
  await expect.poll(async () => (await page.locator(".pokemon-pet").boundingBox())!.x).not.toBe(first);
});

test("pokemon pet is off by default", async ({ page }) => {
  await openMock(page, "view=dock");
  await expect(page.locator(".pokemon-pet")).toHaveCount(0);
});
