const { test, expect } = require("@playwright/test");

for (const viewport of [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 }
]) {
  test(`camo fills ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/web/index.html");
    const box = await page.locator("#camo").boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
    await expect(page.locator("#tour")).toBeVisible();
    await page.locator("#tour-skip").click();
    await page.locator("#info").click();
    await expect(page.locator("#tour")).toBeVisible();
  });
}
