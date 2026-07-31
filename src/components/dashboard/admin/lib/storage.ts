import type { AdminPageId } from "./types";

/* Page + scroll persistence, so returning to a backgrounded admin tab lands
   back on the same section instead of resetting to Home. localStorage (not
   sessionStorage) so it survives a full reload or an OS tab discard, falling
   back to and migrating the older sessionStorage values once. */
const PS = {
  get(k: string): string | null {
    try {
      const v = localStorage.getItem(k);
      if (v != null) return v;
      const s = sessionStorage.getItem(k);
      if (s != null) localStorage.setItem(k, s);
      return s;
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

const sfx = (userId?: string) => "_" + (userId || "anon");
const pageKey = (userId?: string) => "lateen_adm_page" + sfx(userId);
const scrollKey = (userId?: string) => "lateen_adm_scroll" + sfx(userId);

const PAGE_IDS: AdminPageId[] = [
  "adm-home", "adm-verify", "adm-payouts", "adm-users", "adm-products", "adm-employees",
];

export function readPage(userId?: string): AdminPageId | null {
  const v = PS.get(pageKey(userId));
  return v && (PAGE_IDS as string[]).includes(v) ? (v as AdminPageId) : null;
}

export const writePage = (id: AdminPageId, userId?: string) => PS.set(pageKey(userId), id);
export const readScroll = (userId?: string) => parseInt(PS.get(scrollKey(userId)) || "0", 10);
export const writeScroll = (y: number, userId?: string) => PS.set(scrollKey(userId), String(y));
