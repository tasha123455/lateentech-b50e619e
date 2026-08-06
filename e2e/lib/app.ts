import { expect, type Page } from "@playwright/test";
import { account, type RoleName } from "./accounts";

/** The app decides language from the path, so a spec picks one explicitly
 *  rather than hoping the browser's locale wins. */
export const path = (lang: "en" | "ar", p: string) => `/${lang}${p === "/" ? "" : p}`;

/** Signs in and waits for the dashboard the role should land on.
 *
 *  Roles share one form: which dashboard appears is decided from the roles
 *  the account holds, not from the page it signed in on. So this asserts on
 *  something only the right dashboard draws, which is what makes it a test of
 *  the routing rather than of the form. */
export async function signIn(page: Page, lang: "en" | "ar", role: RoleName): Promise<boolean> {
  const who = account(role);
  if (!who) return false;

  const form = role === "marketer" ? "/marketer/signin" : "/business/signin";
  await page.goto(path(lang, form));

  await page.locator('input[type="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await page.locator('button[type="submit"]').first().click();

  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
  await expect(page.locator(".bottom-nav, .adm-nav, nav").first()).toBeVisible({ timeout: 30_000 });
  return true;
}

/** Fails the test if the browser logged an error while the page was used.
 *  Attach early; a page that renders but throws is not a page that works. */
export function watchForErrors(page: Page): string[] {
  const seen: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") seen.push(m.text()); });
  page.on("pageerror", (e) => seen.push("pageerror: " + e.message));
  return seen;
}
