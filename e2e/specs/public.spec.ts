import { expect, test } from "@playwright/test";
import { path } from "../lib/app";
import { watchForErrors } from "../lib/app";

/* Everything reachable without an account.
 *
 * These need no credentials and write nothing, so they run for anybody, on
 * any environment, at any time. They are also where most of the bugs this app
 * has actually had would show: a missing translation, a logo that did not
 * load, a form that accepts nothing, a page that renders but throws. */

const langs = ["en", "ar"] as const;

for (const lang of langs) {
  test.describe(`public surfaces (${lang})`, () => {
    test("landing page draws the brand and offers both roles", async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto(path(lang, "/"));

      /* The mark is inline SVG, so it is there on first paint or not at all.
         `:visible` matters: the page carries more than one copy and the first
         in document order is not necessarily the one on screen — asserting on
         `.first()` tests whichever happened to be written first, which is a
         test of the markup order rather than of the brand being drawn. */
      await expect(page.locator("svg[aria-label='Wasla']:visible").first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText("undefined");
      await expect(page.locator("body")).not.toContainText("NaN");

      expect(errors, "console errors on the landing page").toEqual([]);
    });

    for (const role of ["marketer", "business"] as const) {
      test(`${role} sign-in form refuses an empty submit`, async ({ page }) => {
        const errors = watchForErrors(page);
        await page.goto(path(lang, `/${role}/signin`));

        const email = page.locator('input[type="email"]').first();
        const pass = page.locator('input[type="password"]').first();
        await expect(email).toBeVisible();
        await expect(pass).toBeVisible();

        // Submitting nothing must not navigate anywhere.
        const before = page.url();
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(1200);
        expect(page.url(), "an empty sign-in should not go through").toBe(before);

        expect(errors, "console errors on the sign-in page").toEqual([]);
      });

      test(`${role} registration form shows its fields`, async ({ page }) => {
        await page.goto(path(lang, `/${role}/register`));
        await expect(page.locator('input[type="email"]').first()).toBeVisible();
        await expect(page.locator('input[type="password"]').first()).toBeVisible();
        // A form nobody can submit is the failure worth catching here.
        await expect(page.locator('button[type="submit"]').first()).toBeVisible();
      });
    }

    test("no raw translation keys or untranslated placeholders leak through", async ({ page }) => {
      await page.goto(path(lang, "/"));
      const body = (await page.locator("body").innerText()).trim();
      expect(body.length, "the landing page rendered nothing").toBeGreaterThan(20);
      // Signs of a dictionary miss rather than a deliberate string.
      expect(body).not.toMatch(/\{\{|\}\}|__[A-Z_]+__/);
    });
  });
}

test("the offline page is served and carries the mark", async ({ page }) => {
  await page.goto("/offline.html");
  await expect(page.locator("svg[aria-label='Wasla']").first()).toBeVisible();
});

test("the app manifest lists the icons a phone installs", async ({ request }) => {
  const res = await request.get("/manifest.json");
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBeTruthy();
  expect(Array.isArray(m.icons) && m.icons.length).toBeTruthy();
  // Every icon it promises must actually be there.
  for (const icon of m.icons) {
    const r = await request.get(icon.src);
    expect(r.ok(), `${icon.src} is listed in the manifest but missing`).toBeTruthy();
  }
});
