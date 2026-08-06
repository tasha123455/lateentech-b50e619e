import { expect, test } from "@playwright/test";
import { account } from "../lib/accounts";
import { haveAny, signIn, watchForErrors } from "../lib/app";

test.describe("business", () => {
  test.skip(!account("business"), "set WASLA_BUSINESS_EMAIL / _PASSWORD to run this");

  for (const lang of ["en", "ar"] as const) {
    test(`every tab opens without an error (${lang})`, async ({ page }) => {
      const errors = watchForErrors(page);
      expect(await signIn(page, lang, "business")).toBe(true);

      const tabs = page.locator(".bottom-nav .nav-item");
      const n = await tabs.count();
      expect(n).toBeGreaterThan(2);
      for (let i = 0; i < n; i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(900);
        await expect(page.locator(".page.active").first()).toBeVisible();
      }
      expect(errors, "console errors while moving between tabs").toEqual([]);
    });

    test(`a product card expands, and "less" does not move the page (${lang})`, async ({ page }) => {
      expect(await signIn(page, lang, "business")).toBe(true);
      await page.locator(".bottom-nav .nav-item").nth(2).click();

      const cards = page.locator(".mp-product-card");
      test.skip(!(await haveAny(cards)), "this shop has listed nothing yet");
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });
      await cards.first().locator(".mp-p-head").click();
      await expect(page.locator(".mp-product-card.expanded").first()).toBeVisible();

      const more = page.locator(".mp-p-desc-exp .pd-desc-more").first();
      if (!(await more.count())) test.skip(true, "no product here has a description long enough to clamp");

      await more.click();                        // open
      await page.waitForTimeout(700);
      // put the description mid-screen, away from the bottom, where the jump was
      await page.evaluate(() => {
        const el = document.querySelector(".mp-p-desc-exp");
        if (el) window.scrollTo(0, Math.round(el.getBoundingClientRect().top + window.scrollY - 160));
      });
      await page.waitForTimeout(400);

      await page.evaluate(() => {
        (window as unknown as { __y: number[] }).__y = [];
        const t = () => {
          const w = window as unknown as { __y: number[] };
          w.__y.push(window.scrollY);
          if (w.__y.length < 45) requestAnimationFrame(t);
        };
        requestAnimationFrame(t);
      });
      await more.click();                        // close
      await page.waitForTimeout(900);
      const seen = await page.evaluate(() => (window as unknown as { __y: number[] }).__y);
      const travel = Math.max(...seen) - Math.min(...seen);
      expect(travel, `the page moved ${travel}px while the description collapsed`).toBeLessThan(8);
    });
  }
});
