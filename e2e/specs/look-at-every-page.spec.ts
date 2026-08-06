/**
 * Photograph every page, in both languages, as every role — and check the
 * geometry, not only that things exist.
 *
 * Written because the suite could not see a bug that was plainly visible: a
 * product name squeezed into a column three characters wide, breaking down the
 * side of the card. Every other spec here asserts that an element is present,
 * is visible, or does not log to the console. None of them asked whether text
 * had room to be read, so a page could be unusable and still pass.
 *
 * Two things happen per page. The measurements below run on everything the
 * page draws, so a squeeze anywhere fails the run rather than waiting to be
 * noticed. The screenshots are kept either way, so there is something to look
 * at rather than only a number.
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "../lib/test";
import { account } from "../lib/accounts";
import { settled, signIn } from "../lib/app";

const SHOTS = resolve(import.meta.dirname, "../shots");

/** Text below this in a container this tall is being broken apart, not wrapped. */
const CRAMPED_PX = 46;

type Cramped = { text: string; width: number; height: number; cls: string };

/**
 * Anything whose box is far taller than it is wide while holding real text.
 *
 * That shape is what "one letter per line" looks like from the outside, and it
 * is what nothing here was measuring. Elements that legitimately run vertical —
 * a bottom-nav label under an icon, a single character, a badge — are either
 * too short to qualify or hold too little text.
 */
async function crampedText(page: import("@playwright/test").Page): Promise<Cramped[]> {
  return page.evaluate((limit) => {
    const out: Array<{ text: string; width: number; height: number; cls: string }> = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      // Only the element that owns the text, not every ancestor of it.
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent || "").trim())
        .join(" ")
        .trim();
      if (own.length < 6) continue;
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Narrow, and tall enough that the narrowness is forcing many lines.
      if (r.width < limit && r.height > r.width * 1.8) {
        out.push({
          text: own.slice(0, 40),
          width: Math.round(r.width),
          height: Math.round(r.height),
          cls: el.className?.toString().slice(0, 60) || el.tagName,
        });
      }
    }
    return out;
  }, CRAMPED_PX);
}

/** Nothing may push the page sideways on a phone. */
async function sideways(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

const roles = [
  { role: "business" as const, nav: ".bottom-nav .nav-item", page: ".page.active" },
  { role: "marketer" as const, nav: ".bottom-nav .nav-item", page: ".page.active" },
  { role: "admin" as const, nav: ".adm-nav-item", page: ".adm-page.active" },
];

for (const { role, nav } of roles) {
  for (const lang of ["en", "ar"] as const) {
    test(`look at every ${role} page (${lang})`, async ({ page }) => {
      test.skip(!account(role), `set WASLA_${role.toUpperCase()}_EMAIL / _PASSWORD to run this`);
      mkdirSync(SHOTS, { recursive: true });

      expect(await signIn(page, lang, role)).toBe(true);

      const tabs = page.locator(nav);
      const n = await tabs.count();
      expect(n, `the ${role} nav bar did not render`).toBeGreaterThan(2);

      const problems: string[] = [];

      for (let i = 0; i < n; i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(1200);
        await settled(page);

        const label = `${role}-${lang}-${i}`;
        await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: false });

        for (const c of await crampedText(page)) {
          problems.push(
            `${label}: "${c.text}" is ${c.width}px wide and ${c.height}px tall (.${c.cls}) — ` +
            `text that narrow is being broken apart rather than wrapped`);
        }

        const over = await sideways(page);
        if (over > 1) problems.push(`${label}: the page scrolls ${over}px sideways`);
      }

      expect(problems.join("\n") || "none", "cramped or overflowing text").toBe("none");
    });
  }
}

/* ==================================================================== *
 * The sheets that open over a page
 *
 * Where the squeezed product name actually was, and where the sweep above
 * cannot reach — it only walks the tab bar, and a sheet is not a tab. The
 * gap is the point: a page can be photographed clean and still open onto
 * something broken.
 * ==================================================================== */

const overlays = [
  {
    role: "marketer" as const,
    what: "a product from browse",
    open: async (page: import("@playwright/test").Page) => {
      // Browse is the second tab; the grid does not exist until it is open.
      await page.locator(".bottom-nav .nav-item").nth(1).click();
      await page.locator(".c").first().waitFor({ state: "visible", timeout: 20_000 });
      await page.locator(".c").first().click();
      await page.waitForTimeout(1200);
    },
  },
  {
    role: "admin" as const,
    what: "a product from review",
    open: async (page: import("@playwright/test").Page) => {
      await page.locator("#adm-nav-menu").click();
      /* Both spellings: the page-wide translator rewrites the label, so an
         English-only match finds nothing on the Arabic side — which is how
         this sweep first passed in one language and timed out in the other. */
      await page.locator(".adm-menu-drawer .adm-menu-item",
        { hasText: /product review|مراجعة المنتجات/i }).first().click();
      await page.waitForTimeout(1200);
      await page.locator(".adm-prod-grid .c").first().click();
      await page.waitForTimeout(1200);
    },
  },
  {
    role: "admin" as const,
    what: "the menu drawer",
    open: async (page: import("@playwright/test").Page) => {
      await page.locator("#adm-nav-menu").click();
      await page.waitForTimeout(800);
    },
  },
];

for (const { role, what, open } of overlays) {
  for (const lang of ["en", "ar"] as const) {
    test(`look at ${what}, ${role} (${lang})`, async ({ page }) => {
      test.skip(!account(role), `set WASLA_${role.toUpperCase()}_EMAIL / _PASSWORD to run this`);
      mkdirSync(SHOTS, { recursive: true });

      expect(await signIn(page, lang, role)).toBe(true);
      await open(page);

      const label = `overlay-${role}-${what.replace(/\W+/g, "-")}-${lang}`;
      await page.screenshot({ path: `${SHOTS}/${label}.png` });

      const problems = (await crampedText(page)).map((c) =>
        `${label}: "${c.text}" is ${c.width}px wide and ${c.height}px tall (.${c.cls}) — ` +
        `text that narrow is being broken apart rather than wrapped`);

      const over = await sideways(page);
      if (over > 1) problems.push(`${label}: the page scrolls ${over}px sideways`);

      expect(problems.join("\n") || "none", "cramped or overflowing text").toBe("none");
    });
  }
}
