import { expect, test } from "../lib/test";
import { account } from "../lib/accounts";
import { haveAny, signIn, watchForErrors } from "../lib/app";

/* The marketer's side, read-only.
 *
 * Nothing here places an order or changes a balance. It signs in, walks the
 * screens, opens what opens, and asserts the things that have actually been
 * wrong before. */

test.describe("marketer", () => {
  test.skip(!account("marketer"), "set WASLA_MARKETER_EMAIL / _PASSWORD to run this");

  for (const lang of ["en", "ar"] as const) {
    test(`browse, open a product, and read its card (${lang})`, async ({ page }) => {
      const errors = watchForErrors(page);
      expect(await signIn(page, lang, "marketer")).toBe(true);

      // Browse is a tab on the bottom bar; the tiles are the grid.
      await page.locator(".bottom-nav .nav-item").nth(1).click();
      const tiles = page.locator(".c");
      test.skip(!(await haveAny(tiles)), "nothing is listed yet, so there is nothing to browse");

      // A tile is a picture, a name and a price — and nothing else. The
      // fulfilment badge belongs inside the opened card, not on the grid.
      await expect(tiles.first().locator(".fulfil-badge, [class*='fulfil']")).toHaveCount(0);

      await tiles.first().click();
      const sheet = page.locator(".pd-card").first();
      await expect(sheet).toBeVisible({ timeout: 20_000 });

      // Reserve / instant sits beside the product code, when the product has one.
      const codeRow = page.locator(".pd-hd-code").first();
      await expect(codeRow).toBeVisible();

      expect(errors, "console errors while browsing").toEqual([]);
    });

    test(`a long description opens and closes without moving the page (${lang})`, async ({ page }) => {
      expect(await signIn(page, lang, "marketer")).toBe(true);
      await page.locator(".bottom-nav .nav-item").nth(1).click();
      test.skip(!(await haveAny(page.locator(".c"))), "nothing is listed yet, so there is nothing to open");
      await page.locator(".c").first().click();
      await expect(page.locator(".pd-card").first()).toBeVisible({ timeout: 20_000 });

      const more = page.locator(".pd-desc-more").first();
      if (!(await more.count())) test.skip(true, "no product here has a description long enough to clamp");

      await more.click();                       // open it
      await page.waitForTimeout(600);

      /* The one that kept coming back. Collapsing must not move the page: the
         probe that measures the clamp used to be parked off the left edge,
         which in a right-to-left document is scrollable area, and mobile
         Chrome answered by jumping to the top. */
      const before = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => {
        (window as unknown as { __y: number[] }).__y = [];
        const t = () => {
          const w = window as unknown as { __y: number[] };
          w.__y.push(window.scrollY);
          if (w.__y.length < 45) requestAnimationFrame(t);
        };
        requestAnimationFrame(t);
      });
      await more.click();                       // close it
      await page.waitForTimeout(900);
      const seen = await page.evaluate(() => (window as unknown as { __y: number[] }).__y);
      const travel = Math.max(...seen) - Math.min(...seen);
      expect(travel, `the page moved ${travel}px while the description collapsed`).toBeLessThan(8);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(8);
    });

    test(`notifications open and close (${lang})`, async ({ page }) => {
      const errors = watchForErrors(page);
      expect(await signIn(page, lang, "marketer")).toBe(true);
      await page.locator(".notif-btn").first().click();

      const items = page.locator(".notif-item.expandable");
      test.skip(!(await haveAny(items, 8_000)), "this account has no expandable notifications");

      await items.first().locator(".notif-top").click();
      await expect(page.locator(".notif-item.expanded").first()).toBeVisible();
      await page.waitForTimeout(700);
      await page.locator(".notif-item.expanded .notif-detail-body").first().click();
      await page.waitForTimeout(700);
      expect(errors, "console errors in notifications").toEqual([]);
    });
  }
});
