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
