/* Formatting helpers ported from admin.script.js. */

export const freeLbl = (): string =>
  typeof document !== "undefined" && document.documentElement.lang === "ar" ? "مجاني" : "Free";

/** Admin totals are always Libyan Dinar, isolated so RTL digits stay put. */
export function money(n: unknown): string {
  const v = Number(n || 0);
  return "⁦د.ل⁩" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** The numeric half of money(), for rendering next to a <span class="cur-sym">. */
export function moneyAmount(n: unknown): string {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const CUR_SYM = "⁦د.ل⁩";

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/** Relative age: "just now" / "5m ago" / "3h ago" / "2d ago". */
export function when(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

/** Absolute stamp: "Mar 5, 2024, 3:07 PM". */
export function whenFull(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  let h = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  // Day sits between month and year: a leading digit gets pulled to the end of
  // the line by the bidi algorithm in RTL, which rendered "13 May 2026, 5:20 PM"
  // as "May 2026, 5:20 PM 13".
  return `${month} ${day}, ${year}, ${h}:${mins} ${ampm}`;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export const WDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const MON_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const DAY_MAP: Record<string, string> = Object.fromEntries(WDAYS.map((k, i) => [k, WDAYS_AR[i]]));
export const MONTH_MAP: Record<string, string> = Object.fromEntries(MON_ABBR.map((k, i) => [k, AR_MONTHS[i]]));

/** Country codes shown on a product's delivery zones. */
export const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria", GH: "Ghana", EG: "Egypt", KE: "Kenya", ZA: "South Africa", MA: "Morocco",
};

/** Splits a stored phone into dial code and the rest, wrapped in LRM marks so
    the digits keep their order inside Arabic text. Mirrors __splitCC from the
    business dashboard. */
export function splitPhone(p?: string | null): { cc: string; num: string } {
  const s = String(p ?? "").trim();
  if (!s) return { cc: "", num: "" };
  const m = s.match(/^(\+\d{1,3})[\s-]*(.*)$/);
  if (m) return { cc: "\u200E" + m[1] + "\u200E", num: "\u200E" + m[2].replace(/\s+/g, "") + "\u200E" };
  return { cc: "", num: "\u200E" + s + "\u200E" };
}

/** "+218 | 0928174312", or just the number when there is no dial code. */
export function dispPhone(p?: string | null): string {
  const s = splitPhone(p);
  if (!s.cc && !s.num) return "";
  return s.cc ? `${s.cc} | ${s.num}` : s.num;
}
