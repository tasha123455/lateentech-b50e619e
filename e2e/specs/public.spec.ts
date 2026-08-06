import { expect, test } from "@playwright/test";
import { open, path, settled, watchForErrors } from "../lib/app";

/* Everything reachable without an account.
 *
 * These need no credentials and write nothing, so they run for anybody, on
 * any environment, at any time. They are also where most of the bugs this app
 * has actually had would show: a missing translation, a logo that did not
 * load, a form that accepts nothing, a page that renders but throws. */

const langs = ["en", "ar"] as const;

/* One known defect, let through the console-error checks below so that
 * everything else still fails loudly. It has its own failing test further
 * down, which is where the explanation lives and where the fix will show. */
const KNOWN_AR_HYDRATION = /Hydration failed|hydrat(ed|ion)|Minified React error #(418|42[0-5])/i;
const unexpected = (errors: string[]) => errors.filter((e) => !KNOWN_AR_HYDRATION.test(e));

/* The one screen every visitor meets before anything else. It is deliberately
 * outside the loop below and does not use `open()`, because `open()` answers
 * this question in advance — which is the right thing everywhere except here. */
test.describe("the language question a first visit is met with", () => {
  test("it guards a deep link, not only the front page", async ({ page }) => {
    await page.goto("/en/marketer/signin");
    await expect(page.getByRole("button", { name: "English", exact: true })).toBeVisible();
    // Until it is answered the app is hidden rather than half-shown.
    await expect(page.locator("html")).toHaveClass(/lang-pending/);
  });

  for (const [label, lang] of [["English", "en"], ["العربية", "ar"]] as const) {
    test(`choosing ${label} lands on the ${lang} site and is not asked twice`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: label, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`/${lang}(/|$)`));
      await settled(page);

      // A returning visitor goes straight in.
      await page.goto(path(lang, "/"));
      await settled(page);
      await expect(page.getByRole("button", { name: "English", exact: true })).toHaveCount(0);
    });
  }
});

for (const lang of langs) {
  test.describe(`public surfaces (${lang})`, () => {
    test("landing page draws the brand and offers both roles", async ({ page }) => {
      const errors = watchForErrors(page);
      await open(page, lang, "/");

      /* The mark is inline SVG, so it is there on first paint or not at all.
         `:visible` matters: the page carries more than one copy and the first
         in document order is not necessarily the one on screen — asserting on
         `.first()` tests whichever happened to be written first, which is a
         test of the markup order rather than of the brand being drawn. */
      await expect(page.locator("svg[aria-label='Wasla']:visible").first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText("undefined");
      await expect(page.locator("body")).not.toContainText("NaN");

      // Both doors are on the mat.
      await expect(page.locator(`a[href="/${lang}/marketer/signin"]`).first()).toBeVisible();
      await expect(page.locator(`a[href="/${lang}/business/signin"]`).first()).toBeVisible();

      expect(unexpected(errors), "console errors on the landing page").toEqual([]);
    });

    for (const role of ["marketer", "business"] as const) {
      /* This app has no password. The only way in is Google, and the count
         below says so on purpose: if a password form is ever added, this test
         fails and somebody reads it, rather than the suite quietly passing
         over a second front door nobody meant to open. */
      test(`${role} sign-in offers Google, and only Google`, async ({ page }) => {
        const errors = watchForErrors(page);
        await open(page, lang, `/${role}/signin`);

        // The label is translated with the rest of the page, so the Arabic
        // spelling of the name has to be matched too.
        await expect(page.getByRole("button", { name: /google|جوجل/i }).first()).toBeVisible();
        await expect(page.locator('input[type="password"]')).toHaveCount(0);
        await expect(page.locator('input[type="email"]')).toHaveCount(0);

        // And a way to the other side, for somebody who has no account yet.
        await expect(page.locator(`a[href="/${lang}/${role}/register"]`).first()).toBeVisible();

        expect(unexpected(errors), "console errors on the sign-in page").toEqual([]);
      });

      test(`${role} registration will not submit until it has what it needs`, async ({ page }) => {
        const errors = watchForErrors(page);
        await open(page, lang, `/${role}/register`);

        /* The submit is a Google button wrapped in a guard that switches off
           pointer events; `aria-disabled` on that guard is the state under
           test, and the reason the guard carries the attribute at all. */
        const guard = page.locator("form div[aria-disabled]").first();
        await expect(guard).toHaveAttribute("aria-disabled", "true");

        const text = page.locator('form input.auth-input:not([type="tel"])');
        await text.nth(0).fill("Playwright Tester");
        if (role === "business") await text.nth(1).fill("Playwright Test Shop");

        const phone = page.locator('form input[type="tel"]').first();

        // A Libyan mobile is 10 digits starting 091–094; anything else is
        // told so rather than silently refused.
        await phone.fill("0990000000");
        await expect(page.locator("form")).toContainText(/091|092|093|094/);
        await expect(guard).toHaveAttribute("aria-disabled", "true");

        await phone.fill("0910000000");

        /* The city sheet is the last thing the form needs. The control is a
           button wrapped in its field's label, so its name is the label's —
           "City", not the "Select city" written on its face. Both languages
           are matched because the label is translated and the sheet's own
           text is not. */
        const city = page.getByRole("button", { name: /City|المدينة/ });
        await city.click();

        /* Picked from the list rather than searched for. The sheet clears its
           search box and takes the caret a moment after it opens, so anything
           typed in that window is typed into a box that is about to be reset —
           a race no person can lose but a robot loses most times it tries.
           What is under test here is the form refusing to submit, so the
           steadier of the two routes to a city is the right one to take. The
           search itself deserves a test; it deserves its own. */
        await expect(page.getByPlaceholder(/Search a city|ابحث عن مدينة/)).toBeFocused();

        /* Anchored: the sheet is rendered inside the field's own label, so
           while it is open the closed control's accessible name contains
           every city in the list and matches any of them. Only the option
           itself *begins* with the city's name. */
        await page.getByRole("button", { name: /^(Tripoli|طرابلس)/ }).first().click();
        await expect(city).toContainText(/Tripoli|طرابلس/);

        // Now, and not before, it will go through.
        await expect(guard).toHaveAttribute("aria-disabled", "false");

        expect(unexpected(errors), "console errors on the registration page").toEqual([]);
      });

      /* The second bug this suite found, and the reason for the filter above.
       *
       * The city control decides its own wording by reading the language off
       * the browser, which on the server there is none of — so the server
       * writes "Select city" into the Arabic page and the browser writes
       * "اختر المدينة" over it. React calls that a hydration failure and
       * throws away the whole form to rebuild it, which is why typing into
       * this page in its first half second is thrown away with it. English is
       * unaffected, because there the server's guess happens to be right. */
      test(`${role} registration hydrates without React throwing`, async ({ page }) => {
        test.fail(lang === "ar", "the city control renders English on the server");
        const errors = watchForErrors(page);
        await open(page, lang, `/${role}/register`);
        await expect(page.getByRole("button", { name: /City|المدينة/ })).toBeVisible();
        expect(errors).toEqual([]);
      });

      /* Skipped against the dev server, and only against the dev server.
       *
       * The city sheet is rendered inside the <label> that titles the field.
       * Under `vite dev` picking a city — or pressing Cancel — closes the
       * sheet and instantly reopens it, the label handing a second click to
       * the button that opens it. Against the deployed site it does not
       * happen, in either language, on any of the four forms.
       *
       * So the deployed behaviour is the right one and this test asserts it.
       * What is not worth doing is failing every local run over a difference
       * that no one using the app can reach. The dev server labels its own
       * markup with data-tsd-source and a built site does not, which is how
       * this tells them apart. */
      test(`${role} city picker closes once a city is chosen`, async ({ page }) => {
        await open(page, lang, `/${role}/register`);
        const isDevServer = (await page.locator("[data-tsd-source]").count()) > 0;
        test.skip(isDevServer, "the dev server reopens the sheet; a built site does not");
        await page.getByRole("button", { name: /City|المدينة/ }).click();

        const search = page.getByPlaceholder(/Search a city|ابحث عن مدينة/);
        await expect(search).toBeFocused();
        await page.getByRole("button", { name: /^(Tripoli|طرابلس)/ }).first().click();

        // A short leash: this is a known failure, and waiting the full timeout
        // for it four times over is a minute of every run spent on old news.
        await expect(search, "the sheet should be gone once a city is picked").toHaveCount(0, {
          timeout: 3_000,
        });
      });
    }

    test("no raw translation keys or untranslated placeholders leak through", async ({ page }) => {
      await open(page, lang, "/");
      // The landing shows the mark alone while it works out whether anybody is
      // signed in; the roles appearing is the page having actually arrived.
      await expect(page.locator(`a[href="/${lang}/marketer/signin"]`).first()).toBeVisible();

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
