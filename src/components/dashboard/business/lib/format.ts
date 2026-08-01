/* Formatting helpers ported verbatim (behaviour-identical) from
   src/components/dashboard/lateen/business.script.js */

export function isAr(): boolean {
  return typeof document !== "undefined" && document.documentElement.lang === "ar";
}

const AR_LBL: Record<string, string> = {
  Sun: "الأحد", Mon: "الإثنين", Tue: "الثلاثاء", Wed: "الأربعاء", Thu: "الخميس",
  Fri: "الجمعة", Sat: "السبت", Jan: "يناير", Feb: "فبراير", Mar: "مارس",
  Apr: "أبريل", May: "مايو", Jun: "يونيو", Jul: "يوليو", Aug: "أغسطس",
  Sep: "سبتمبر", Oct: "أكتوبر", Nov: "نوفمبر", Dec: "ديسمبر",
};
export function tlbl(v: string): string {
  return isAr() && AR_LBL[v] ? AR_LBL[v] : v;
}

export function splitCC(p: unknown): { cc: string; num: string } {
  const s = String(p ?? "").trim();
  if (!s) return { cc: "", num: "" };
  const m = s.match(/^(\+\d{1,3})[\s-]*(.*)$/);
  if (m) return { cc: "\u200E" + m[1] + "\u200E", num: "\u200E" + m[2].replace(/\s+/g, "") + "\u200E" };
  return { cc: "", num: "\u200E" + s + "\u200E" };
}

export function stripCC(v: unknown): { cc: string; num: string } {
  const s = String(v ?? "").replace(/[\u200E\u200F]/g, "").trim();
  if (!s) return { cc: "", num: "" };
  const m = s.match(/^\+(\d{1,3})[\s-]*(.*)$/);
  if (m) return { cc: "+" + m[1], num: m[2].replace(/\D/g, "") };
  return { cc: "", num: s.replace(/\D/g, "") };
}

export function dispPhone(p: unknown): string {
  const s = splitCC(p);
  return s.cc ? `${s.cc} | ${s.num}` : s.num;
}

const SYM2CODE: Record<string, string> = {};

export function stripDirMarks(s: string | null | undefined): string {
  if (!s || typeof s !== "string") return (s ?? "") as string;
  return s.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim();
}

export function normalizeCurSym(s?: string | null, code?: string | null): string {
  const r = stripDirMarks(s || "");
  const compact = r.replace(/\s+/g, "");
  const cc = (code || "").toString().trim().toUpperCase();
  if (cc === "LYD" || compact === "ل.د" || compact === "د.ل") return "\u2066د.ل\u2069";
  return r;
}

export function rawSym(s?: string | null, code?: string | null): string {
  return normalizeCurSym(s, code);
}

export function wrapArSym(s?: string | null, code?: string | null): string {
  const cc = (code || "").toString().toUpperCase();
  const r = rawSym(s, cc);
  if (cc && r) {
    SYM2CODE[r] = cc;
    const old = stripDirMarks(s || "");
    if (old) SYM2CODE[old] = cc;
  }
  return r;
}

export function escH(s: unknown): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

/** Plain-text money string. */
export function money(n: unknown, sym?: string | null, code?: string | null): string {
  const a = (parseFloat(String(n ?? 0)) || 0).toFixed(2);
  const cc = (code || SYM2CODE[stripDirMarks(sym || "")] || "").toString().toUpperCase();
  const r = stripDirMarks(rawSym(sym || "£", cc));
  return isAr() ? a + r : cc ? `${a} ${cc}` : r + a;
}

/** Money split into value + symbol parts so React can render the symbol span. */
export function moneyParts(
  n: unknown,
  sym?: string | null,
  code?: string | null,
): { amount: string; symbol: string; symbolFirst: boolean; spaced: boolean } {
  const a = (parseFloat(String(n ?? 0)) || 0).toFixed(2);
  const cc = (code || SYM2CODE[stripDirMarks(sym || "")] || "").toString().toUpperCase();
  const r = stripDirMarks(rawSym(sym || "£", cc));
  if (isAr()) return { amount: a, symbol: r, symbolFirst: false, spaced: false };
  if (cc) return { amount: a, symbol: cc, symbolFirst: false, spaced: true };
  return { amount: a, symbol: r, symbolFirst: true, spaced: false };
}

export function priceSym(cur?: { code?: string; symbol?: string } | null): string {
  if (!cur) return "—";
  return cur.code === "LYD" ? (isAr() ? "د.ل" : "LYD") : cur.symbol || "";
}

export function pad(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}
export function ddmmyyyy(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function freeLbl(): string {
  return isAr() ? "مجاني" : "Free";
}
export function isFreeVal(v: unknown): boolean {
  return v !== "" && v != null && Number(v) === 0;
}

export function ordFrac(n: number): string {
  if (n === 1) return "طلبيه واحده";
  if (n === 2) return "طلبيتين";
  return n + " طلبيات";
}

/* Platform fee: 5% of unit price above 100, else flat 5 — identical to source. */
export const PLATFORM_FEE_RATE = 0.05;
export const PLATFORM_FEE_FIXED = 5;
export const PLATFORM_FEE_THRESHOLD = 100;
export function platformFeeForPrice(price: unknown): number {
  const pr = Number(price) || 0;
  return pr > PLATFORM_FEE_THRESHOLD ? parseFloat((pr * PLATFORM_FEE_RATE).toFixed(2)) : PLATFORM_FEE_FIXED;
}
export const pctOf = (price: number, pct: number): number => parseFloat((price * (pct / 100)).toFixed(2));

export const genCode = (len?: number): string => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const n = len || 6;
  let s = "LT-";
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
};
export const genId = (): string => "p" + Math.random().toString(36).slice(2, 7);

/* Search behaviour is one rule for the whole app, so there is one copy of it.
   This file used to carry its own character-for-character duplicate of
   normSearch, which was fine while the two only folded letters and would not
   have survived one of them learning to forgive a typo. */
export { normSearch, searchMatcher } from "@/components/dashboard/marketer/lib/format";
