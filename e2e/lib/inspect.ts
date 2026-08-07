/**
 * What a person notices at a glance, expressed as numbers.
 *
 * The suite spent a long time asserting that elements existed and that the
 * console was quiet, both of which are true of a page that is unreadable. These
 * two checks are the ones that would have caught the bugs found by looking:
 * text with no room to be read, and text in the wrong language.
 */

import type { Page } from "@playwright/test";

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export type Cramped = { text: string; width: number; height: number; cls: string };

/** Text below this width, in a box this much taller, is being broken apart. */
const CRAMPED_PX = 46;

/**
 * Anything holding real text whose box is far taller than it is wide.
 *
 * That shape is what "one letter per line" looks like from the outside. Things
 * that legitimately run narrow — a nav label under an icon, a badge, a single
 * character — hold too little text to qualify.
 */
export async function crampedText(page: Page): Promise<Cramped[]> {
  return page.evaluate((limit) => {
    const out: Array<{ text: string; width: number; height: number; cls: string }> = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent || "").trim())
        .join(" ")
        .trim();
      if (own.length < 6) continue;
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
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

/** How far the page can be pushed sideways. Should be nothing, on a phone. */
export async function sideways(page: Page): Promise<number> {
  return page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/* ------------------------------------------------------------------ *
 * Language
 * ------------------------------------------------------------------ */

export type Stray = { text: string; cls: string };

/**
 * Words left in the wrong language.
 *
 * Reading Arabic, an English sentence is a missing translation. Reading
 * English, an Arabic one is the same fault the other way round.
 *
 * What is deliberately not a fault: anything the app has marked `data-no-i18n`,
 * which is how it says "this is a name, a code, or something somebody typed";
 * the brand; currency and country codes; and anything that is really just
 * numbers and punctuation. Product names are the big one — a shop selling
 * "Versace blanket" to Arabic readers is not a translation bug, and treating it
 * as one would bury the real ones.
 */
export async function strayScript(page: Page, lang: "en" | "ar"): Promise<Stray[]> {
  return page.evaluate((want) => {
    const ARABIC = /[؀-ۿ]/;
    const LATIN_WORD = /[A-Za-z]{3,}/;

    /* Names, codes and units, which belong to nobody's language. */
    const ALLOW = /^(wasla|lateen|lyd|ly|usd|eur|ok|id|pdf|jpg|png|whatsapp|google|e2e|qty|pc|pcs)$/i;

    const out: Array<{ text: string; cls: string }> = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = (n.textContent || "").trim();
      if (text.length < 3) continue;

      const el = n.parentElement;
      if (!el) continue;
      // Marked as not-for-translation, anywhere up the tree.
      if (el.closest("[data-no-i18n]")) continue;
      if (el.closest("script, style, noscript")) continue;
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;

      // Numbers, money and punctuation are not any language.
      const letters = text.replace(/[\d\s\p{P}\p{S}]/gu, "");
      if (!letters) continue;

      if (want === "ar") {
        if (!LATIN_WORD.test(text) || ARABIC.test(text)) continue;
        // A single allowed token — a code, a unit, the brand.
        const words = text.split(/[\s,./|:()-]+/).filter(Boolean);
        if (words.every((w) => ALLOW.test(w) || !/[A-Za-z]{3,}/.test(w))) continue;
        // Anything that looks like data rather than wording.
        if (/@|https?:|^\+?\d/.test(text)) continue;
        if (/^[A-Z0-9-]{4,}$/.test(text)) continue;
      } else {
        if (!ARABIC.test(text)) continue;
      }

      out.push({ text: text.slice(0, 60), cls: el.className?.toString().slice(0, 50) || el.tagName });
    }
    return out;
  }, lang);
}

/** Everything at once, as lines ready to print. */
export async function inspect(page: Page, label: string, lang: "en" | "ar"): Promise<string[]> {
  const problems: string[] = [];

  for (const c of await crampedText(page)) {
    problems.push(`${label}: LAYOUT "${c.text}" is ${c.width}px wide, ${c.height}px tall (.${c.cls})`);
  }
  const over = await sideways(page);
  if (over > 1) problems.push(`${label}: LAYOUT the page scrolls ${over}px sideways`);

  for (const s of await strayScript(page, lang)) {
    problems.push(`${label}: LANGUAGE ${lang === "ar" ? "English" : "Arabic"} text "${s.text}" (.${s.cls})`);
  }
  return problems;
}
