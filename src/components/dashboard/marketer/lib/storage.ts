import type { MarketerOrder, PageId } from "./types";

/** Every key is namespaced per user so switching accounts never leaks state. */
const sfx = (userId?: string) => "_" + (userId || "anon");

/* ── Order drafts ── */

export const draftKey = (userId?: string) => "lateen_drafts" + sfx(userId);

export function loadDrafts(userId?: string): MarketerOrder[] {
  try {
    const arr = JSON.parse(localStorage.getItem(draftKey(userId)) || "[]") as MarketerOrder[];
    // Dates round-trip through JSON as strings; the analytics/sorting code
    // expects real Date objects.
    return (arr || []).map((o) => ({
      ...o,
      _createdAt: o._createdAt ? new Date(o._createdAt) : undefined,
      _updatedAt: o._updatedAt ? new Date(o._updatedAt) : new Date(0),
      _refundedAt: o._refundedAt ? new Date(o._refundedAt) : null,
    }));
  } catch {
    return [];
  }
}

export function saveDrafts(arr: MarketerOrder[], userId?: string): void {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function upsertDraft(o: MarketerOrder, userId?: string): void {
  const arr = loadDrafts(userId);
  const i = arr.findIndex((x) => x.id === o.id);
  if (i !== -1) arr[i] = o;
  else arr.unshift(o);
  saveDrafts(arr, userId);
}

export function removeDraft(id: string, userId?: string): void {
  saveDrafts(loadDrafts(userId).filter((x) => x.id !== id), userId);
}

/* ── Payout form draft ── */

export type PayoutDraft = Partial<Record<
  "country" | "method" | "bank" | "holder" | "acct" | "phone" | "iban" | "swift" | "notes",
  string
>>;

export const payoutKey = (userId?: string) => "lateen_payout_draft" + sfx(userId);

export function loadPayoutDraft(userId?: string): PayoutDraft {
  try {
    const raw = JSON.parse(localStorage.getItem(payoutKey(userId)) || "{}") || {};
    // Stored with the legacy `pd-` prefixed ids; strip it back off.
    const out: PayoutDraft = {};
    Object.keys(raw).forEach((k) => {
      const key = k.replace(/^pd-/, "") as keyof PayoutDraft;
      if (raw[k]) out[key] = raw[k];
    });
    return out;
  } catch {
    return {};
  }
}

export function savePayoutDraft(d: PayoutDraft, userId?: string): void {
  try {
    const out: Record<string, string> = {};
    Object.entries(d).forEach(([k, v]) => {
      if (v != null) out["pd-" + k] = v;
    });
    localStorage.setItem(payoutKey(userId), JSON.stringify(out));
  } catch {
    /* ignore */
  }
}

/* ── Avatar cache ──
   Painted from cache on first render so the header avatar doesn't pop in
   after the profile request resolves. */

const avatarKey = (userId?: string) => "lateen_avatar_url_m" + sfx(userId);

export function readAvatar(userId?: string): string {
  try {
    return localStorage.getItem(avatarKey(userId)) || "";
  } catch {
    return "";
  }
}

export function cacheAvatar(url: string, userId?: string): void {
  try {
    if (url) localStorage.setItem(avatarKey(userId), url);
    else localStorage.removeItem(avatarKey(userId));
  } catch {
    /* ignore */
  }
}

/* ── Wallet balance cache ──
   Painted on first render so a cold start shows the balance the server last
   reported, instead of a locally-guessed figure that then jumps when the real
   one arrives. Same idea as the avatar cache above. */

const walletKey = (userId?: string) => "lateen_wallet_balance" + sfx(userId);

export function readWalletBalance(userId?: string): number | null {
  try {
    const v = localStorage.getItem(walletKey(userId));
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function cacheWalletBalance(n: number, userId?: string): void {
  try {
    localStorage.setItem(walletKey(userId), String(n));
  } catch {
    /* ignore */
  }
}

/* ── Page + scroll persistence ──
   localStorage (not sessionStorage) so state survives a full reload or an OS
   tab discard, falling back to and migrating the older sessionStorage values. */

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

const pageKey = (userId?: string) => "lateen_mk_page" + sfx(userId);
const scrollKey = (userId?: string) => "lateen_mk_scroll" + sfx(userId);

const PAGE_IDS: PageId[] = ["pg-home", "pg-browse", "pg-saved", "pg-orders", "pg-notif"];

export function readPage(userId?: string): PageId | null {
  const v = PS.get(pageKey(userId));
  return v && (PAGE_IDS as string[]).includes(v) ? (v as PageId) : null;
}

export const writePage = (id: PageId, userId?: string) => PS.set(pageKey(userId), id);
export const readScroll = (userId?: string) => parseInt(PS.get(scrollKey(userId)) || "0", 10);
export const writeScroll = (y: number, userId?: string) => PS.set(scrollKey(userId), String(y));
