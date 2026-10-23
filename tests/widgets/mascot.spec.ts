import { test, expect } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";

for (const width of ["fit", "full"]) {
  test(`idle mascot follows all edges immediately in ${width} dock`, async ({ page }) => {
    await openMock(page, "view=dock", { get_agent_sessions: [{ provider: "claude", sessionId: "idle", status: "done", windowId: 1, project: "test", cwd: "/test", updatedAt: Date.now() }] });
    for (const [edge, matrix] of [["bottom", "matrix(1, 0, 0, 1, 0, 0)"], ["top", "matrix(-1, 0, 0, -1, 0, 0)"], ["left", "matrix(0, 1, -1, 0, 0, 0)"], ["right", "matrix(0, -1, 1, 0, 0, 0)"]]) {
      await page.evaluate(async ({ edge, width }) => {
        const { useConfig } = await import("/src/store/config.ts");
        useConfig.setState({ config: { ...useConfig.getState().config, dockPosition: edge, dockWidth: width, widgets: [] } });
      }, { edge, width });
      await expect(page.locator(".dock-root")).toHaveAttribute("data-pos", edge);
      await expect(page.locator(".claude-pet-orientation")).toHaveCSS("transform", matrix);
      await expect.poll(() => page.evaluate(() => {
        const pet = document.querySelector(".claude-pet")!.getBoundingClientRect();
        const calls = (window as unknown as { __PIER_TEST_CALLS__: { command: string; args: {rect: {x: number; y: number; width: number; height: number} | null} }[] }).__PIER_TEST_CALLS__;
        const hit = calls.filter(c => c.command === "set_pet_rect" && c.args.rect).at(-1)?.args.rect;
        return !!hit && pet.x >= hit.x && pet.y >= hit.y && pet.right <= hit.x + hit.width && pet.bottom <= hit.y + hit.height;
      })).toBe(true);
      await expect.poll(async () => {
        const pet = (await page.locator(".claude-pet").boundingBox())!;
        const bar = (await page.locator(".dock-bar").boundingBox())!;
        const overlap = edge === "bottom" ? pet.y + pet.height - bar.y : edge === "top" ? bar.y + bar.height - pet.y : edge === "left" ? bar.x + bar.width - pet.x : pet.x + pet.width - bar.x;
        return Math.abs(overlap - 6);
      }).toBeLessThan(0.5);
    }
    await page.locator(".claude-pet").focus();
    await page.keyboard.press("Enter");
    await expectCall(page, "focus_agent_session", { provider: "claude", sessionId: "idle" });
  });
}

test("waiting mascot jumps away from its rotated edge and opens sessions", async ({ page }) => {
  await openMock(page, "view=dock");
  await page.evaluate(async () => {
    const { useConfig } = await import("/src/store/config.ts");
    useConfig.setState({ config: { ...useConfig.getState().config, dockPosition: "left", widgets: [] } });
  });
  await expect(page.locator(".claude-pet-waiting")).toHaveCSS("animation-name", "claude-pet-jump-y");
  await expect(page.locator(".claude-pet-orientation")).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
  await page.locator(".claude-pet").click();
  await expectCall(page, "open_panel", { kind: "ai-agents" });
});

test("walking mascot changes orientation and facing without waiting for a turnaround", async ({ page }) => {
  await openMock(page, "view=dock", { get_agent_sessions: [{ provider: "claude", sessionId: "walk", status: "running", windowId: 1, project: "test", cwd: "/test", updatedAt: Date.now() }] });
  await expect(page.locator(".claude-pet-sprite")).toHaveClass(/walking/);
  await expect(page.locator(".claude-pet-facing")).toHaveClass(/facing-right/);
  await page.evaluate(async () => {
    const { useConfig } = await import("/src/store/config.ts");
    useConfig.setState({ config: { ...useConfig.getState().config, dockPosition: "top", widgets: [] } });
  });
  await expect(page.locator(".claude-pet-orientation")).toHaveCSS("transform", "matrix(-1, 0, 0, -1, 0, 0)");
  await expect(page.locator(".claude-pet-facing")).toHaveClass(/facing-left/);
});
