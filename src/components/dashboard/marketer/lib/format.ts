import { useEffect as useReactEffect, useState as useReactState } from "react";

/* Formatting helpers ported from marketer.script.js.
   Language is still read off <html lang> so these stay usable from plain
   functions (mappers, sorting) as well as from components. */

export const isAr = (): boolean =>
  typeof document !== "undefined" && document.documentElement.lang === "ar";

export const isArLang = (): boolean => {
  try {
    return document.documentElement.getAttribute("dir") === "rtl" || document.documentElement.lang === "ar";
  } catch {
    return false;
  }
};

/** Re-renders the caller whenever the app's language changes.
 *
 *  The page-wide translator walks text nodes and skips anything marked
 *  data-no-i18n. Text a component builds itself — a picker's placeholder, a
 *  label chosen by isAr() — sits inside those, so it needs telling. */
export function useLangTick(): void {
  const [, bump] = useReactState(0);
  useReactEffect(() => {
    const onLang = () => bump((v) => v + 1);
    window.addEventListener("lateen-lang", onLang);
    return () => window.removeEventListener("lateen-lang", onLang);
  }, []);
}

/** Pick the English or Arabic string for the current language. */
export const t = (en: string, ar: string): string => (isArLang() ? ar : en);

const AR_LBL: Record<string, string> = {
  Sun: "الأحد", Mon: "الإثنين", Tue: "الثلاثاء", Wed: "الأربعاء", Thu: "الخميس", Fri: "الجمعة", Sat: "السبت",
  Jan: "يناير", Feb: "فبراير", Mar: "مارس", Apr: "أبريل", May: "مايو", Jun: "يونيو",
  Jul: "يوليو", Aug: "أغسطس", Sep: "سبتمبر", Oct: "أكتوبر", Nov: "نوفمبر", Dec: "ديسمبر",
};

export const tlbl = (v: string): string => (isAr() && AR_LBL[v] ? AR_LBL[v] : v);

export function splitCC(p: unknown): { cc: string; num: string } {
  const s = String(p || "").trim();
  if (!s) return { cc: "", num: "" };
  const m = s.match(/^(\+\d{1,3})[\s-]*(.*)$/);
  if (m) return { cc: "\u200E" + m[1] + "\u200E", num: "\u200E" + m[2].replace(/\s+/g, "") + "\u200E" };
  return { cc: "", num: "\u200E" + s + "\u200E" };
}

export function dispPhone(p: unknown): string {
  const s = splitCC(p);
  return s.cc ? s.cc + " | " + s.num : s.num;
}

/** Strips the country code off a stored phone, for editing in a form field. */
export function stripCC(v: unknown): { cc: string; num: string } {
  const s = String(v || "").replace(/[\u200E\u200F]/g, "").trim();
  if (!s) return { cc: "", num: "" };
  const m = s.match(/^\+(\d{1,3})[\s-]*(.*)$/);
  if (m) return { cc: "+" + m[1], num: m[2].replace(/\D/g, "") };
  return { cc: "", num: s.replace(/\D/g, "") };
}

export function fmtDT(v: unknown): string {
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return "";
  const ar = isAr();
  const datePart = d.getMonth() + 1 + "/" + d.getDate() + "/" + d.getFullYear();
  let h = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const isPM = h >= 12;
  h = h % 12;
  if (h === 0) h = 12;
  const ampm = ar ? (isPM ? "مساءً" : "صباحاً") : isPM ? "PM" : "AM";
  return "\u200E" + datePart + ", " + h + ":" + mins + " " + ampm + "\u200E";
}

/* ── Currency ── */

const SYM2CODE: Record<string, string> = {};

export function stripDirMarks(s: string): string {
  return !s || typeof s !== "string"
    ? s
    : s.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim();
}

function normalizeCurSym(s: string, code?: string): string {
  const r = stripDirMarks(s || "");
  const compact = (r || "").replace(/\s+/g, "");
  const cc = (code || "").toString().trim().toUpperCase();
  if (cc === "LYD" || compact === "ل.د" || compact === "د.ل") return "\u2066د.ل\u2069";
  return r;
}

export const rawSym = (s: string, code?: string): string => normalizeCurSym(s, code);

/** Normalizes a symbol and remembers which currency code it belongs to. */
export function wrapArSym(s: string, code?: string): string {
  const cc = (code || "").toString().toUpperCase();
  const r = rawSym(s, cc);
  if (cc && r) {
    SYM2CODE[r] = cc;
    const old = stripDirMarks(s || "");
    if (old) SYM2CODE[old] = cc;
  }
  return r;
}

/** Arabic renders the symbol after the amount; English uses the ISO code when known. */
export function money(n: unknown, sym?: string, code?: string): string {
  const a = parseFloat(String(n || 0)).toFixed(2);
  const cc = (code || SYM2CODE[stripDirMarks(sym || "")] || "").toString().toUpperCase();
  const r = stripDirMarks(rawSym(sym || "£", cc));
  return isAr() ? a + r : cc ? a + " " + cc : r + a;
}

/** Same as money() but drops a trailing ".00". */
export function moneyS(n: unknown, sym?: string, code?: string): string {
  const num = parseFloat(String(n || 0));
  const a = Math.abs(num - Math.round(num)) < 1e-9 ? String(Math.round(num)) : num.toFixed(2);
  const cc = (code || SYM2CODE[stripDirMarks(sym || "")] || "").toString().toUpperCase();
  const r = stripDirMarks(rawSym(sym || "£", cc));
  return isAr() ? a + r : cc ? a + " " + cc : r + a;
}

/** Parts for rendering an amount with the symbol in its own <span class="cur-sym">. */
export function moneyParts(n: unknown, sym?: string, code?: string, shortZeros = false) {
  const num = parseFloat(String(n || 0));
  const a = shortZeros && Math.abs(num - Math.round(num)) < 1e-9 ? String(Math.round(num)) : num.toFixed(2);
  const cc = (code || SYM2CODE[stripDirMarks(sym || "")] || "").toString().toUpperCase();
  const r = stripDirMarks(rawSym(sym || "£", cc));
  return { amount: a, sym: r, code: cc, ar: isAr() };
}

export const freeLbl = (): string => (isAr() ? "مجاني" : "Free");

export const pctTxt = (v: unknown): string => {
  const n = Number(v) || 0;
  return (Math.round(n * 10) / 10).toString();
};

/* ── "Amount customer pays on delivery" label ──
   The combined COD amount already bakes in delivery/shipping, so instead of a
   separate breakdown line we say so inline: EN appends a suffix after the
   amount, AR folds the qualifier into the label itself (before the colon). */
export function codPaysParts(hasDelivery: boolean, hasShipping: boolean): { label: string; suffix: string } {
  const ar = isAr();
  if (!hasDelivery && !hasShipping)
    return ar
      ? { label: "المبلغ الذي يدفعه الزبون عند الإستلام:", suffix: "" }
      : { label: "Amount customer pays on Delivery:", suffix: "" };
  if (hasShipping) {
    return ar
      ? { label: "المبلغ الذي يدفعه الزبون عند الإستلام بالتوصيل و الشحن:", suffix: "" }
      : { label: "Amount customer pays on Delivery:", suffix: " including shipping and delivery fee" };
  }
  return ar
    ? { label: "المبلغ الذي يدفعه الزبون عند الإستلام بالتوصيل:", suffix: "" }
    : { label: "Amount customer pays on Delivery:", suffix: " including delivery fee" };
}

/* ── Search ── */

/** Folds Arabic orthographic variants so an Arabic query matches either spelling. */
export function normSearch(s: unknown): string {
  if (s == null) return "";
  let v = String(s);
  try {
    v = v.normalize("NFKC");
  } catch {
    /* ignore */
  }
  return v
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // Arabic diacritics
    .replace(/\u0640/g, "") // tatweel
    .replace(/[آأإٱ]/g, "ا") // alef variants -> ا
    .replace(/ى/g, "ي") // alef maqsura -> ي
    .replace(/ئ/g, "ي") // hamza on ya -> ي
    .replace(/ؤ/g, "و") // hamza on waw -> و
    .replace(/ة/g, "ه") // ta marbuta -> ه
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, "") // bidi/zero-width marks
    .trim();
}

/* Anything that is not a letter or a digit separates words. Written with
   Unicode classes so it splits Arabic exactly as it splits English. */
const WORD_BREAK = /[^\p{L}\p{N}]+/u;
const WORD_BREAK_G = /[^\p{L}\p{N}]+/gu;

/** How many typos a word of this length is allowed to carry.
 *
 *  Short words get none: at three letters almost everything is within one edit
 *  of everything else, and the list fills with noise. The allowance grows with
 *  length because a long word is a long chance to slip, and because a long
 *  word matched loosely is still a specific word.
 *
 *  Two edits are held back until eight letters. At seven it was enough to put
 *  "mohamed" within reach of "ahmed", which is not a near miss — it is a
 *  different name. */
const typoBudget = (len: number): number => (len <= 3 ? 0 : len <= 7 ? 1 : 2);

/** Edit distance between `a` and the closest prefix of `b`, capped at `budget`.
 *
 *  Matching a prefix rather than the whole word is what lets a half-typed word
 *  find the full one \u2014 "\u0642\u0645\u064A" reaches \u0642\u0645\u064A\u0635, "delive" reaches delivered \u2014 while
 *  still paying for the letters that are actually wrong.
 *
 *  Swapping two neighbouring letters costs one, not two. It is the typo people
 *  actually make \u2014 "shrit", "recieve" \u2014 and charging it as a deletion plus an
 *  insertion put it out of reach of the budget a word that short is given.
 *
 *  The table is banded: an alignment that strays further than `budget` from the
 *  diagonal has already spent more than the budget, so those cells are left at
 *  the cap. That makes the cost O(len \u00D7 budget) rather than O(len\u00B2). */
function prefixDistance(a: string, b: string, budget: number): number {
  const n = a.length;
  const m = b.length;
  if (!n) return 0;
  const cap = budget + 1;
  if (m + budget < n) return cap;

  // Three rows, because a transposition reaches two back on both axes.
  let two = new Array<number>(m + 1).fill(cap);
  let prev = new Array<number>(m + 1).fill(cap);
  let cur = new Array<number>(m + 1).fill(cap);
  for (let j = 0; j <= m && j <= budget; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    const lo = Math.max(0, i - budget);
    const hi = Math.min(m, i + budget);
    for (let j = lo; j <= hi; j++) cur[j] = cap;
    if (i <= budget) cur[0] = i;
    for (let j = Math.max(1, lo); j <= hi; j++) {
      const same = a.charCodeAt(i - 1) === b.charCodeAt(j - 1);
      let v = Math.min(prev[j - 1] + (same ? 0 : 1), prev[j] + 1, cur[j - 1] + 1);
      if (
        i > 1 && j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        const swapped = two[j - 2] + 1;
        if (swapped < v) v = swapped;
      }
      cur[j] = v < cap ? v : cap;
    }
    const spare = two;
    two = prev;
    prev = cur;
    cur = spare;
  }

  let best = cap;
  for (let j = Math.max(0, n - budget); j <= Math.min(m, n + budget); j++) {
    if (prev[j] < best) best = prev[j];
  }
  return best;
}

/* The Arabic definite article is not a typo \u2014 it is a word wearing a hat, and
   whether the writer put it on is not something a search box should care
   about. Two edits would swallow the whole budget of a short word, so it comes
   off both sides before they are compared. Guarded on length so that words
   which merely begin with those letters survive. */
const bareAr = (s: string): string => (s.length > 4 && s.startsWith("\u0627\u0644") ? s.slice(2) : s);

/** Builds the test one search box runs against every row it is filtering.
 *
 *  Typing is imprecise, so the box is too. Three things make a query land:
 *
 *  - every word of the query has to match, but they may be in any order and
 *    anywhere in the row, so "red shirt" finds "Shirt \u2014 cotton, red";
 *  - a word matches as a substring first, so an exact query behaves exactly as
 *    it always did and costs the same;
 *  - failing that, a word matches a word of the row it is within a typo or two
 *    of, counting a prefix as a whole match, so a half-typed or misspelt word
 *    still finds its row.
 *
 *  The folding in `normSearch` runs on both sides, so all of this holds in
 *  Arabic \u2014 where a query lands whichever way the writer spelled their alefs,
 *  and where a missing \u0627\u0644 is just two edits like any other slip.
 *
 *  An empty query matches everything, which is what a search box that has not
 *  been typed into should do. */
export function searchMatcher(query: unknown): (hay: unknown) => boolean {
  const tokens = normSearch(query).split(WORD_BREAK).filter(Boolean);
  if (!tokens.length) return () => true;

  /* Codes, order numbers and phone numbers get written both with and without
     their punctuation — EMP-002 and EMP002, +218 91 234 and 21891234 — and
     which one somebody types says nothing about what they are looking for. So
     there is a second strict pass with every separator taken out of both
     sides. It is exact, not fuzzy, so it adds reach without adding noise. */
  const tight = tokens.map((t) => t.replace(WORD_BREAK_G, ""));

  return (raw: unknown) => {
    const hay = normSearch(raw);
    if (!hay) return false;
    let words: string[] | null = null;
    let squashed: string | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (hay.includes(token)) continue;
      if (tight[i] !== token || WORD_BREAK.test(hay)) {
        if (squashed === null) squashed = hay.replace(WORD_BREAK_G, "");
        if (tight[i] && squashed.includes(tight[i])) continue;
      }
      const bare = bareAr(token);
      const budget = Math.max(typoBudget(token.length), typoBudget(bare.length));
      if (!budget) return false;
      if (!words) words = hay.split(WORD_BREAK).filter(Boolean);
      let hit = false;
      for (const w of words) {
        if (prefixDistance(token, w, budget) <= budget) { hit = true; break; }
        const bw = bareAr(w);
        if ((bare !== token || bw !== w) && prefixDistance(bare, bw, typoBudget(bare.length)) <= typoBudget(bare.length)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    return true;
  };
}

/** "3 pcs" / "3 قطع".
 *
 *  Arabic counts its pieces differently at one, at two, and above ten, so the
 *  unit is not a word that can be swapped for "pcs" and left there. One rule,
 *  shared by both dashboards' charts and by the product detail sheet. */
export function piecesLabel(n: number): string {
  if (!isAr()) return n + " pcs";
  if (n === 1) return "قطعه واحده";
  if (n === 2) return "قطعتين";
  return n + (n > 10 ? " قطعه" : " قطع");
}

export const pad2 = (n: number): string => (n < 10 ? "0" + n : "" + n);
export const ddmmyyyy = (d: Date): string => pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
export const today2 = (): string => {
  const d = new Date();
  return d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear();
};
export const genCode = (): string => "ORD-" + Math.random().toString(36).substr(2, 6).toUpperCase();

export const firstChar = (s: unknown): string => {
  const v = String(s || "").trim();
  if (!v) return "";
  return [...v][0] || "";
};

/** Relative "3h" / "٣س" style age used by the notifications feed. */
export function ago(ts: unknown): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(ts as string).getTime()) / 1000));
  const ar = isArLang();
  if (s < 60) return ar ? s + "ث" : s + "s";
  if (s < 3600) return ar ? Math.floor(s / 60) + "د" : Math.floor(s / 60) + "m";
  if (s < 86400) return ar ? Math.floor(s / 3600) + "س" : Math.floor(s / 3600) + "h";
  return ar ? Math.floor(s / 86400) + "يوم" : Math.floor(s / 86400) + "d";
}

export const isSafeUrl = (u: unknown): boolean => !!u && /^(https?:|data:|\/)/.test(String(u));

/** Notification payloads arrive as either a JSON string or an object. */
export function parseData(d: unknown): Record<string, unknown> {
  let v = d;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  return (v as Record<string, unknown>) || {};
}
