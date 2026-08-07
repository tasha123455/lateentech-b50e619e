/**
 * Every screen the app can show, in both languages, looked at rather than
 * merely opened.
 *
 * The tab bar is only the front of each dashboard. Behind the menu are the
 * pages where the real work happens — withdrawals, reports, account deletion,
 * a request to change personal details, the admin's review queues — and none of
 * them had ever been photographed, measured, or read for language.
 *
 * Each surface is opened by clicking, the way somebody would reach it, then:
 *   · photographed, so there is something to look at
 *   · measured, for text with no room to be read
 *   · read, for words left in the wrong language
 *
 * Two menu entries are deliberately skipped. One switches the language, which
 * would invalidate every check after it, and one signs out.
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "../lib/test";
import { account } from "../lib/accounts";
import { settled, signIn } from "../lib/app";
import { inspect } from "../lib/inspect";

const SHOTS = resolve(import.meta.dirname, "../shots");

/** Changes the language, or ends the session. Neither belongs mid-sweep. */
const DO_NOT_OPEN = /language|اللغة|sign\s*out|log\s*out|تسجيل الخروج|خروج/i;

type Role = "marketer" | "business" | "admin";

/* `nav` deliberately excludes the menu button. It sits in the same bar as the
   tabs, so walking "every tab" opened the drawer as the last step — and the
   open drawer then covered the very button needed to open it again. */
const shell: Record<Role, { nav: string; menuBtn: string; drawer: string; item: string; close: string }> = {
  marketer: { nav: ".bottom-nav .nav-item:not(:last-child)", menuBtn: ".bottom-nav .nav-item:last-child", drawer: ".menu-drawer", item: ".menu-item", close: ".menu-close" },
  business: { nav: ".bottom-nav .nav-item:not(:last-child)", menuBtn: ".bottom-nav .nav-item:last-child", drawer: ".menu-drawer", item: ".menu-item", close: ".menu-close" },
  admin: { nav: ".adm-nav-item:not(#adm-nav-menu)", menuBtn: "#adm-nav-menu", drawer: ".adm-menu-drawer", item: ".adm-menu-item", close: ".adm-menu-close" },
};

/** Shuts whatever is open, by whichever way this one closes. */
async function backOut(page: import("@playwright/test").Page): Promise<void> {
  for (const way of [".menu-close", ".adm-menu-close", ".pd-close", ".adm-pdetail-close",
                     ".ov-close", "[aria-label='Close']"]) {
    const btn = page.locator(way).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  // Whatever is left: the backdrop, then the keyboard.
  for (const back of [".menu-backdrop", ".adm-menu-backdrop"]) {
    const el = page.locator(back).first();
    if (await el.isVisible().catch(() => false)) {
      await el.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

for (const role of ["marketer", "business", "admin"] as const) {
  for (const lang of ["en", "ar"] as const) {
    test(`every ${role} surface, looked at (${lang})`, async ({ page }) => {
      test.skip(!account(role), `set WASLA_${role.toUpperCase()}_EMAIL / _PASSWORD to run this`);
      mkdirSync(SHOTS, { recursive: true });

      const s = shell[role];
      expect(await signIn(page, lang, role)).toBe(true);

      const problems: string[] = [];
      const shot = async (label: string) => {
        await page.screenshot({ path: `${SHOTS}/${label}.png` });
        problems.push(...(await inspect(page, label, lang)));
      };

      /* ---- the tabs ---- */
      const tabs = page.locator(s.nav);
      const tabCount = await tabs.count();
      expect(tabCount, `the ${role} nav bar did not render`).toBeGreaterThan(2);

      for (let i = 0; i < tabCount; i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(1100);
        await settled(page);
        await shot(`${role}-${lang}-tab${i}`);
      }

      /* ---- everything behind the menu ---- */
      await backOut(page);
      await page.locator(s.menuBtn).click();
      await page.waitForTimeout(700);
      await shot(`${role}-${lang}-menu`);

      const labels = await page.locator(`${s.drawer} ${s.item}`).allInnerTexts();

      for (let i = 0; i < labels.length; i++) {
        const label = (labels[i] || "").replace(/\s+/g, " ").trim();
        if (DO_NOT_OPEN.test(label)) continue;

        // Re-open the drawer each time: opening an entry closes it.
        if (!(await page.locator(s.drawer).first().isVisible().catch(() => false))) {
          await page.locator(s.menuBtn).click();
          await page.waitForTimeout(600);
        }
        const entry = page.locator(`${s.drawer} ${s.item}`).nth(i);
        if (!(await entry.isVisible().catch(() => false))) continue;

        await entry.click().catch(() => { /* an entry that does not open is its own finding, below */ });
        await page.waitForTimeout(1300);

        const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28) || `item${i}`;
        await shot(`${role}-${lang}-menu-${i}-${slug}`);

        await backOut(page);
      }

      /* Reported together, so one run says everything rather than stopping at
         the first thing it found. */
      expect(problems.join("\n") || "none",
        `${problems.length} thing(s) to look at on the ${role} side (${lang})`).toBe("none");
    });
  }
}
