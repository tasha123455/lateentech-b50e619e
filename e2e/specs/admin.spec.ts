import { expect, test } from "../lib/test";
import { account } from "../lib/accounts";
import { haveAny, signIn, watchForErrors } from "../lib/app";

test.describe("admin", () => {
  test.skip(!account("admin"), "set WASLA_ADMIN_EMAIL / _PASSWORD to run this");

  test("every admin page opens without an error", async ({ page }) => {
    const errors = watchForErrors(page);
    expect(await signIn(page, "en", "admin")).toBe(true);

    const tabs = page.locator(".adm-nav-item");
    const n = await tabs.count();
    expect(n, "the admin bottom bar did not render").toBeGreaterThan(2);
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(1000);
    }
    expect(errors, "console errors while moving between admin pages").toEqual([]);
  });

  test("the product grid shows no fulfilment badge, and the sheet never shows the wrong product", async ({ page }) => {
    expect(await signIn(page, "en", "admin")).toBe(true);

    // Reach product review through the menu rather than guessing a tab index.
    // By id: matching on the word "menu" also matched the drawer's own backing,
    // which is in the page from the start and merely hidden, so the click waited
    // out its timeout on something that was never going to become visible.
    await page.locator("#adm-nav-menu").click();
    /* Inside the drawer. Every admin page is in the document at once, hidden
       rather than unmounted, so an unscoped search for the words also finds
       the destination page's own heading — which is the thing this click is
       supposed to bring into view, and cannot be clicked to get there. */
    await page.locator(".adm-menu-drawer .adm-menu-item", { hasText: /product review/i }).first().click();

    const tiles = page.locator(".adm-prod-grid .c");
    test.skip(!(await haveAny(tiles)), "no products exist yet, so there is no grid to check");
    await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
    // A tile is a thumbnail, a name and a price.
    await expect(tiles.first().locator("[class*='fulfil']")).toHaveCount(0);

    if ((await tiles.count()) < 2) test.skip(true, "need two products to test the swap");

    /* The one that is open, not the first one written. Four overlays share
       this class — products, employees, employee history, marketer detail —
       and all four are in the document from the start, closed. Taking the
       first meant watching a sheet that was never going to open. */
    const OPEN = ".adm-pdetail.open";

    // Open the first, close it, then open the second and watch every frame.
    await tiles.nth(0).click();
    const card = page.locator(`${OPEN} .adm-pdetail-card`).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const firstName = (await card.innerText()).slice(0, 60);
    await page.locator(`${OPEN} .adm-pdetail-close`).first().click();
    await page.waitForTimeout(500);

    await page.evaluate((open) => {
      (window as unknown as { __f: string[] }).__f = [];
      const t = () => {
        const w = window as unknown as { __f: string[] };
        const el = document.querySelector(`${open} .adm-pdetail-card`);
        w.__f.push(el ? (el as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 60) : "(closed)");
        if (w.__f.length < 50) requestAnimationFrame(t);
      };
      requestAnimationFrame(t);
    }, OPEN);
    await tiles.nth(1).click();
    await page.waitForTimeout(1200);
    const frames = await page.evaluate(() => (window as unknown as { __f: string[] }).__f);

    /* Not one painted frame may come from the product opened before. The
       sheet used to draw its first frame from whatever was left in state. */
    const stale = frames.filter((f) => f !== "(closed)" && f.slice(0, 30) === firstName.slice(0, 30));
    expect(stale.length, "the sheet showed the previous product first").toBe(0);
  });
});
