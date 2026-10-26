import { test, expect } from "@playwright/test";
import { openMock } from "./fixtures";

// A barra é centrada pelo layout, não por um `translate`: durante a transição do `transform` o
// WebKit mantém a porcentagem calculada com a largura de antes, e a barra saía do centro (e do
// vidro nativo) quando a ampliação a alargava.
for (const edge of ["bottom", "top", "left", "right"]) {
  for (const width of ["fit", "full"]) {
    test(`the ${edge} ${width} dock is centered without a transform`, async ({ page }) => {
      await openMock(page, "view=dock");
      await page.evaluate(async ({ edge, width }) => {
        const { useConfig } = await import("/src/store/config.ts");
        const config = useConfig.getState().config;
        useConfig.setState({ config: { ...config, dockPosition: edge, dockWidth: width } });
      }, { edge, width });
      const bar = page.locator(".dock-bar");
      await expect.poll(() => bar.evaluate((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return [m.e, m.f, m.a, m.d];
      })).toEqual([0, 0, 1, 1]);
      const vertical = edge === "left" || edge === "right";
      const offCenter = () => bar.evaluate((el, vertical) => {
        const r = el.getBoundingClientRect();
        return vertical ? (r.top + r.bottom) / 2 - innerHeight / 2 : (r.left + r.right) / 2 - innerWidth / 2;
      }, vertical);
      await expect.poll(offCenter).toBeCloseTo(0, 0);
      // Alargar a barra (como a ampliação faz) não a tira do centro.
      await bar.evaluate((el) => { el.style.paddingInline = "120px"; });
      if (vertical) await bar.evaluate((el) => { el.style.paddingBlock = "120px"; });
      await expect.poll(offCenter).toBeCloseTo(0, 0);
    });
  }
}
