import { expect, type Page } from "@playwright/test";
import { account, backend, type RoleName } from "./accounts";

/** The app decides language from the path, so a spec picks one explicitly
 *  rather than hoping the browser's locale wins. */
export const path = (lang: "en" | "ar", p: string) => `/${lang}${p === "/" ? "" : p}`;

/* The first visit from any browser is met by "Choose your language", on every
 * url and not only on "/". Until it is answered the root element carries
 * `lang-pending` and CSS hides the whole app behind the chooser — so a test
 * that navigates and reads the page straight away reads an empty body and
 * reports that the page rendered nothing. Every Playwright test gets a clean
 * browser, so every test meets that screen. */
const LANG_KEY = "lateen_lang";

/** Answer the language question before the page loads.
 *
 *  The gate itself is worth testing, but only once and deliberately; the rest
 *  of the suite is testing what is behind it, so it arrives with the choice
 *  already made — which is also the state a returning visitor is in. */
export async function rememberLanguage(page: Page, lang: "en" | "ar") {
  await page.addInitScript(
    ([key, value]) => {
      try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
      try { document.cookie = `${key}=${value}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
    },
    [LANG_KEY, lang] as const,
  );
}

/** Go to a page in a given language and wait until it is actually on screen. */
export async function open(page: Page, lang: "en" | "ar", p: string) {
  await rememberLanguage(page, lang);
  await page.goto(path(lang, p));
  await settled(page);
}

/** Waits for the point where a person could start using the page.
 *
 *  `load` is far too early. Pages are rendered on the server and arrive as
 *  finished HTML, so every field and button is on screen and answers nothing
 *  for the half second it takes React to take them over. Typing in that window
 *  is thrown away — React re-renders from a state that never heard the
 *  keystroke — and the test then reports a form that ignores what is typed
 *  into it, which is a lie about the app and a waste of whoever reads it.
 *
 *  The signal is React's own: it hangs its props off the DOM nodes it owns, so
 *  a control carrying them is a control whose handler will run. Merely being
 *  claimed is not enough — that happens earlier, and typing is still lost. */
export async function settled(page: Page) {
  await expect(page.locator("html")).not.toHaveClass(/lang-pending/, { timeout: 20_000 });
  await page.waitForFunction(
    () => {
      const controls = document.querySelectorAll("button, input, a[href], form");
      return (
        controls.length > 0 &&
        Array.from(controls).some((el) =>
          Object.keys(el).some((k) => k.startsWith("__reactProps$")),
        )
      );
    },
    null,
    { timeout: 20_000 },
  );
}

/** Signs in and waits for the dashboard the role should land on.
 *
 *  The app has no password form — the only way in through the interface is
 *  Google, which a robot cannot drive and should not try to. So the session is
 *  obtained the way the app's own client would obtain one, from Supabase, and
 *  put where the app looks for it. That is a sign-in, not a way around one: it
 *  needs a real account with a real password and it leaves no door open behind
 *  it.
 *
 *  Returns false when there are no credentials to use, so the caller can skip
 *  rather than fail. */
export async function signIn(page: Page, lang: "en" | "ar", role: RoleName): Promise<boolean> {
  const who = account(role);
  if (!who) return false;

  const be = backend();
  if (!be) {
    throw new Error(
      "There is an account for " + role + " but no backend to sign it in against. " +
        "Set WASLA_SUPABASE_URL and WASLA_SUPABASE_ANON_KEY, or run from a checkout " +
        "whose .env has VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  const { url, key } = be;

  const res = await page.request.post(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: { email: who.email, password: who.password },
  });
  if (!res.ok()) {
    throw new Error(
      `Supabase refused the ${role} sign-in (${res.status()}). ` +
        `The account needs a password set on it — the site itself only offers Google. ` +
        (await res.text()).slice(0, 300),
    );
  }
  const session = await res.json();

  /* supabase-js keeps the session in localStorage under a key derived from the
     project, and reads it on start-up. Written before any of the app's own
     scripts run, the app comes up already signed in. */
  const ref = new URL(url).hostname.split(".")[0];
  await rememberLanguage(page, lang);
  await page.addInitScript(
    ([k, v]) => {
      try { window.localStorage.setItem(k, v); } catch { /* ignore */ }
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );

  await page.goto(path(lang, "/dashboard"));
  await settled(page);
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
