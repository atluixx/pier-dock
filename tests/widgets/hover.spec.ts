import { test, expect } from "@playwright/test";
import { openMock, expectCall } from "./fixtures";

for (const edge of ["bottom", "top", "left", "right"]) {
  for (const width of ["fit", "full"]) {
    test(`magnified hover stays inside ${edge} ${width} dock`, async ({ page }) => {
      await openMock(page, "view=dock");
      for (const [size, height] of [[32, null], [40, 56], [72, 240]]) {
        await page.evaluate(async ({ edge, width, size, height }) => {
          const { useConfig } = await import("/src/store/config.ts");
          const config = useConfig.getState().config;
          useConfig.setState({ config: { ...config, dockPosition: edge, dockWidth: width, iconSize: size, dockHeight: height, magnification: 2, widgets: [], pinnedApps: config.pinnedApps.slice(0, 3), showRunningUnpinned: false } });
        }, { edge, width, size, height });
        const button = page.locator(".app-button").first();
        await button.hover();
        await expect(button).toHaveClass(/hovered/);
        await expect.poll(() => button.locator(".magnify").evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(size! * 1.3);
        // Inspect the actual painted pseudo-element, rather than the intentionally larger hit target.
        await expect.poll(() => button.evaluate((el) => {
          const highlight = getComputedStyle(el, "::before");
          const button = el.getBoundingClientRect();
          const bar = document.querySelector(".dock-bar")!.getBoundingClientRect();
          const w = parseFloat(highlight.width), h = parseFloat(highlight.height);
          const x = highlight.left === "auto" ? button.right - parseFloat(highlight.right) - w : button.left + parseFloat(highlight.left);
          const y = highlight.top === "auto" ? button.bottom - parseFloat(highlight.bottom) - h : button.top + parseFloat(highlight.top);
          return Math.max(bar.x - x, bar.y - y, x + w - bar.right, y + h - bar.bottom);
        })).toBeLessThanOrEqual(0.5);
        await expect(page.locator(".tooltip").first()).toBeVisible();
        await expect(page.locator(".dock-bar")).toHaveCSS("overflow", "visible");
        await page.mouse.move(1400, 500);
      }
      await page.locator(".app-button").first().click();
      await expectCall(page, "toggle_app_windows");
    });
  }
}

test("magnified app still opens and closes window previews", async ({ page }) => {
  await openMock(page, "view=dock", { get_windows: { foreground: 1, windows: [
    { id: 1, title: "Finder one", exe: "/System/Library/CoreServices/Finder.app", minimized: false, pid: 1001 },
    { id: 2, title: "Finder two", exe: "/System/Library/CoreServices/Finder.app", minimized: false, pid: 1001 },
  ] } });
  await page.evaluate(async () => {
    const { useConfig } = await import("/src/store/config.ts");
    useConfig.setState({ config: { ...useConfig.getState().config, widgets: [], magnification: 2 } });
  });
  const multi = page.locator(".app-button").filter({ has: page.locator(".indicators .indicator:nth-child(2)") }).first();
  await multi.hover();
  await expect(page.locator(".preview-card").first()).toBeVisible();
  await page.mouse.move(1400, 500);
  await expect(page.locator(".preview-card")).toHaveCount(0);
});
