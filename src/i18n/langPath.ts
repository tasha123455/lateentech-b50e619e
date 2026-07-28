// Shared helpers for the language-prefixed route trees.
//
// Every user-facing page lives under either `/en/...` or `/ar/...`. These
// helpers convert between a "logical" path (like "/dashboard") and its
// language-prefixed form, and let us swap the prefix without duplicating
// content.

export type Lang = "en" | "ar";

export const LANGS: readonly Lang[] = ["en", "ar"] as const;

const STORAGE_KEY = "lateen_lang";

export function isLang(x: unknown): x is Lang {
  return x === "en" || x === "ar";
}

/** Extract the language from a URL pathname, or null if it isn't prefixed. */
export function langFromPath(pathname: string): Lang | null {
  const m = /^\/(en|ar)(?:\/|$)/.exec(pathname);
  return m ? (m[1] as Lang) : null;
}

/** Remove the leading `/en` or `/ar` prefix if present. Returns "" for bare root. */
export function stripLang(pathname: string): string {
  return pathname.replace(/^\/(en|ar)(?=\/|$)/, "");
}

/** Prepend the language prefix. `path` may be "", "/", "/dashboard", etc. */
export function withLang(lang: Lang, path: string): string {
  const rest = path && path !== "/" ? (path.startsWith("/") ? path : "/" + path) : "";
  return `/${lang}${rest}`;
}

/** Swap the language prefix on a full pathname; preserves the suffix. */
export function swapLang(pathname: string, lang: Lang): string {
  const suffix = stripLang(pathname);
  return `/${lang}${suffix}`;
}

/** Best-effort language detection for a first-time visitor. */
export function detectLang(): Lang {
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (isLang(stored)) return stored;
  } catch { /* ignore */ }
  try {
    const nav = typeof navigator !== "undefined" ? (navigator.language || (navigator.languages && navigator.languages[0]) || "") : "";
    if (nav && nav.toLowerCase().startsWith("ar")) return "ar";
  } catch { /* ignore */ }
  return "en";
}

/** Persist the user's language choice for the next visit. */
export function rememberLang(lang: Lang): void {
  try { window.localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  // Also store it in a cookie so server-side rendering can read the preference.
  try {
    document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch { /* ignore */ }
}

