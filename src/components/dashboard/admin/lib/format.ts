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

/** Absolute stamp: "5 Mar 2024, 3:07 PM". */
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
  return `${day} ${month} ${year}, ${h}:${mins} ${ampm}`;
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
