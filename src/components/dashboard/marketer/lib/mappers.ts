import {
  CATEGORY_DATA, CATEGORY_GROUP_AR, CATEGORY_ITEM_AR, COLOR_GROUP_NAMES, COUNTRY_NAMES,
  COUNTRY_NAMES_AR, LIBYA_CITIES, SIZE_GROUP_NAMES, platformFeeForPrice,
} from "./constants";
import { asFulfilment } from "@/lib/fulfilment";
import { isAr, normSearch, wrapArSym } from "./format";
import type {
  BrowseProduct, CurrentDelivery, FormProduct, MarketerOrder, SelectedVariant, VariantGroup, VariantItem, Zone,
} from "./types";

export const cityLabel = (en: string): string => {
  if (!isAr()) return en;
  const m = LIBYA_CITIES.find((c) => c.en === en);
  return m ? m.ar : en;
};

export const countryName = (code: string): string => {
  if (code === "LY") return isAr() ? "ليبيا" : "Libya";
  return COUNTRY_NAMES[code] || code;
};

const hasQty = (v: unknown): boolean => {
  const o = v as { qty?: unknown };
  return !!o && typeof o === "object" && o.qty !== undefined && o.qty !== null && o.qty !== "" && Number.isFinite(Number(o.qty));
};

const rsvOf = (v: unknown): number => {
  const o = v as { rsv?: unknown };
  return o && typeof o === "object" && Number.isFinite(Number(o.rsv)) ? Math.max(0, Number(o.rsv)) : 0;
};

/** Normalizes a variant entry, which may be a bare string or a full object. */
const toItem = (v: unknown): VariantItem => {
  if (typeof v === "string") return { val: v, photo: "", qty: null };
  const o = (v || {}) as { val?: string; photo?: string; qty?: unknown };
  return {
    val: o.val || "",
    photo: o.photo || "",
    qty: hasQty(v) ? Math.max(0, Number(o.qty) - rsvOf(v)) : null,
  };
};

/** Variant entry without the reserved-qty subtraction (order form view). */
const toItemRaw = (v: unknown): VariantItem => {
  if (typeof v === "string") return { val: v, photo: "", qty: null };
  const o = (v || {}) as { val?: string; photo?: string; qty?: unknown };
  return { val: o.val || "", photo: o.photo || "", qty: hasQty(v) ? Math.max(0, Number(o.qty)) : null };
};

/** True remaining stock: when a product tracks per-variant quantities, trust
    their sum over the top-level qty column, which can drift out of sync. */
export function vgStockTotal(vg: VariantGroup[], rawQty: unknown): number {
  const groupTotals: number[] = [];
  (vg || []).forEach((g) => {
    let gTotal = 0;
    let gTracked = false;
    ((g && g.items) || []).forEach((it) => {
      const q = it && it.qty;
      if (q !== null && q !== undefined && Number.isFinite(Number(q))) {
        gTracked = true;
        gTotal += Math.max(0, Number(q));
      }
    });
    if (gTracked) groupTotals.push(gTotal);
  });
  return groupTotals.length ? Math.min(...groupTotals) : Number(rawQty) || 0;
}

export function dbToBrowse(r: Record<string, unknown>, favIds: Set<string>): BrowseProduct {
  const curRaw = (r.currency as { symbol?: string; code?: string; flag?: string }) || { symbol: "$", code: "USD" };
  const symbol = wrapArSym(curRaw.symbol || "$", curRaw.code);
  const photos = (r.photos as string[]) || [];
  const photo = photos[0] || null;
  const cfx = r.cover_focus_x != null && !isNaN(Number(r.cover_focus_x)) ? Number(r.cover_focus_x) : 50;
  const cfy = r.cover_focus_y != null && !isNaN(Number(r.cover_focus_y)) ? Number(r.cover_focus_y) : 50;

  const d: Record<string, Zone> = {};
  type DbZone = {
    cities?: Record<string, { shipping?: number; delivery?: number }>;
    eta?: { min?: unknown; max?: unknown } | null;
  };
  Object.entries((r.delivery as Record<string, DbZone>) || {}).forEach(([code, z]) => {
    d[code] = { cities: [], c: {}, shipping: 0, delivery: 0 };
    Object.entries(z.cities || {}).forEach(([city, v]) => {
      d[code].c[city] = { s: Number(v.shipping) || 0, d: Number(v.delivery) || 0 };
      d[code].cities.push(city);
      d[code].shipping = Number(v.shipping) || 0;
      d[code].delivery = Number(v.delivery) || 0;
    });
    /* Older products were saved before delivery times existed, so a zone
       without one is normal — it just carries no eta. */
    const min = z.eta && z.eta.min != null ? Number(z.eta.min) : NaN;
    if (!isNaN(min)) {
      const max = z.eta && z.eta.max != null ? Number(z.eta.max) : NaN;
      d[code].eta = { min, max: !isNaN(max) && max > min ? max : null };
    }
  });

  const rawGroups = (r.variant_groups as Array<{ name?: string; items?: unknown[] }>) || [];
  const sizes = (r.sizes as string[]) || [];
  const colors = (r.colors as string[]) || [];
  const vg: VariantGroup[] = rawGroups.length
    ? rawGroups
        .map((g) => ({ name: g.name || "", items: (g.items || []).map(toItem).filter((x) => x.val) }))
        .filter((g) => g.items.length)
    : [
        ...(sizes.length ? [{ name: "Size", items: sizes.map(toItem) }] : []),
        ...(colors.length ? [{ name: "Colour", items: colors.map(toItem) }] : []),
      ];

  return {
    id: r.id as string,
    bid: r.business_id as string,
    biz: (r.biz_name as string) || "",
    cover: photo,
    coverFocusX: cfx,
    coverFocusY: cfy,
    flag: curRaw.flag || "📦",
    ph: photos,
    n: r.name as string,
    cat: (r.category as string) || "",
    code: (r.code as string) || "",
    desc: (r.description as string) || "",
    pr: Number(r.price) || 0,
    cur: { s: symbol || "$", code: curRaw.code || "USD" },
    market: (r.market as string) || "LY",
    pct: Number(r.comm_pct) || 0,
    commUnit: Number(r.comm_fixed) || 0,
    platformFee: Number(r.platform_fee) || 0,
    q: vgStockTotal(vg, Math.max(0, (Number(r.qty) || 0) - (Number(r.reserved_qty) || 0))),
    sv: favIds.has(r.id as string),
    sz: sizes,
    cl: colors,
    vg,
    d,
    reqPhone: !!r.require_additional_phone,
    fulfilment: asFulfilment(r.fulfilment),
  };
}

/** The order-form view of the browse list (the old `PRODUCTS` map). */
export function buildProductsMap(list: BrowseProduct[]): Record<string, FormProduct> {
  const out: Record<string, FormProduct> = {};
  list.forEach((p) => {
    const delivery: FormProduct["delivery"] = {};
    Object.entries(p.d).forEach(([code, z]) => {
      delivery[code] = {
        cities: z.cities || Object.keys(z.c || {}),
        shipping: z.shipping || 0,
        delivery: z.delivery || 0,
        _per: z.c || {},
      };
    });
    out[p.id] = {
      id: p.id,
      bid: p.bid,
      name: p.n,
      price: p.pr,
      market: p.market,
      pct: p.pct / 100,
      commUnit: Number(p.commUnit) || 0,
      q: Number(p.q) || 0,
      sizes: p.sz,
      colors: p.cl,
      vg: p.vg || [],
      biz: p.biz,
      bizPhone: p.bizPhone,
      reqPhone: !!p.reqPhone,
      fulfilment: p.fulfilment ?? null,
      sym: p.cur.s,
      currency: { symbol: p.cur.s, code: p.cur.code },
      delivery,
    };
  });
  return out;
}

export function productHasStock(p: BrowseProduct | null | undefined): boolean {
  if (!p) return false;
  const vg = p.vg || [];
  if (vg.length) {
    for (const g of vg) {
      const items = (g && g.items) || [];
      const groupHasStock = items.some((it) => {
        const q = it && typeof it.qty === "number" && Number.isFinite(it.qty) ? it.qty : null;
        return q === null || q > 0;
      });
      if (!groupHasStock) return false;
    }
    return true;
  }
  return (Number(p.q) || 0) > 0;
}

/** Variant groups for the order form, falling back to legacy sizes/colours. */
export function formVariantGroups(p: FormProduct | null): VariantGroup[] {
  if (!p) return [];
  if (p.vg && p.vg.length) return p.vg.map((g) => ({ name: g.name, items: g.items.map(toItemRaw) }));
  return [
    ...(p.sizes && p.sizes.length ? [{ name: isAr() ? "المقاس" : "Size", items: p.sizes.map(toItemRaw) }] : []),
    ...(p.colors && p.colors.length ? [{ name: isAr() ? "اللون" : "Colour", items: p.colors.map(toItemRaw) }] : []),
  ];
}

/** Variant groups for the product-detail sheet. */
export function detailVariantGroups(p: BrowseProduct): VariantGroup[] {
  if (p.vg && p.vg.length) return p.vg;
  return [
    ...(p.sz && p.sz.length ? [{ name: isAr() ? "المقاس" : "Size", items: p.sz.map(toItemRaw) }] : []),
    ...(p.cl && p.cl.length ? [{ name: isAr() ? "اللون" : "Colour", items: p.cl.map(toItemRaw) }] : []),
  ];
}

const normGName = (n: unknown): string => String(n || "").trim().toLowerCase();
export const isSizeGroup = (n: unknown): boolean => SIZE_GROUP_NAMES.indexOf(normGName(n)) !== -1;
export const isColorGroup = (n: unknown): boolean => COLOR_GROUP_NAMES.indexOf(normGName(n)) !== -1;

/** Legacy size/colour fields derived from whichever group carries that name. */
export function syncLegacyVariants(selected: Record<string, string>): { size: string; color: string } {
  let size = "";
  let color = "";
  Object.keys(selected || {}).forEach((n) => {
    const v = selected[n] || "";
    if (!v) return;
    if (isSizeGroup(n)) size = v;
    else if (isColorGroup(n)) color = v;
  });
  return { size, color };
}

export function buildSelectedVariantsPayload(
  p: FormProduct | null,
  selected: Record<string, string>,
): SelectedVariant[] {
  if (!p) return [];
  const vgl = p.vg && p.vg.length
    ? p.vg
    : [
        ...(p.sizes && p.sizes.length ? [{ name: isAr() ? "المقاس" : "Size" }] : []),
        ...(p.colors && p.colors.length ? [{ name: isAr() ? "اللون" : "Colour" }] : []),
      ];
  return vgl.map((g) => ({ name: g.name, value: selected[g.name] || "" })).filter((v) => v.value);
}

export function calcFee(prod: FormProduct, qty: number) {
  const commPerUnit = parseFloat(
    (Number(prod.commUnit) > 0 ? Number(prod.commUnit) : prod.price * prod.pct).toFixed(2),
  );
  // The product's market, not the reader's: a marketer in one country
  // selling into another is charged that country's rule.
  const platformPerUnit = platformFeeForPrice(prod.price, prod.market);
  const feePerUnit = parseFloat((commPerUnit + platformPerUnit).toFixed(2));
  const totalFee = parseFloat((feePerUnit * qty).toFixed(2));
  return { commPerUnit, platformPerUnit, feePerUnit, totalFee };
}

/** Lowest stock across the variant groups the user has actually picked. */
export function maxQtyForSelection(p: FormProduct | null, selected: Record<string, string>): number {
  if (!p) return Infinity;
  let m = Number(p.q) || 0;
  const vg = p.vg || [];
  for (const g of vg) {
    const v = selected[g.name];
    if (!v) continue;
    const it = (g.items || []).find((x) => x && x.val === v);
    if (it && typeof it.qty === "number" && Number.isFinite(it.qty)) m = Math.min(m, it.qty);
  }
  return m;
}

/* ── Search haystacks ── */

export function catSearchText(cat: string): string {
  if (!cat) return "";
  const sec = CATEGORY_DATA.find((s) => s.items.includes(cat));
  const parts = [cat, CATEGORY_ITEM_AR[cat] || ""];
  if (sec) parts.push(sec.group, CATEGORY_GROUP_AR[sec.group] || "");
  return normSearch(parts.filter(Boolean).join(" "));
}

export function zoneSearchText(p: BrowseProduct): string {
  if (!p || !p.d || typeof p.d !== "object") return "";
  const parts: string[] = [];
  Object.keys(p.d).forEach((code) => {
    parts.push(code);
    if (COUNTRY_NAMES[code]) parts.push(COUNTRY_NAMES[code]);
    if (COUNTRY_NAMES_AR[code]) parts.push(COUNTRY_NAMES_AR[code]);
    const z = p.d[code] || ({} as Zone);
    const cities: string[] = [];
    if (z.c && typeof z.c === "object") cities.push(...Object.keys(z.c));
    if (Array.isArray(z.cities)) cities.push(...z.cities);
    cities.forEach((cn) => {
      if (!cn) return;
      parts.push(cn);
      const m = LIBYA_CITIES.find((x) => x.en === cn || x.ar === cn);
      if (m) parts.push(m.en, m.ar);
    });
  });
  return normSearch(parts.filter(Boolean).join(" "));
}

/** Bilingual haystack for an order's city/country (stored in English) so an
    Arabic query matches too, and vice-versa. */
export function locSearchText(city?: string, country?: string, countryCode?: string): string {
  const parts: string[] = [];
  [city, country, countryCode].forEach((v) => {
    if (v) parts.push(String(v));
  });
  if (city) {
    const m = LIBYA_CITIES.find((x) => x.en === city || x.ar === city);
    if (m) parts.push(m.en, m.ar);
  }
  const codes = new Set<string>();
  if (countryCode) codes.add(String(countryCode).toUpperCase());
  if (country) {
    Object.keys(COUNTRY_NAMES).forEach((c) => {
      if (String(COUNTRY_NAMES[c]).toLowerCase() === String(country).toLowerCase()) codes.add(c);
    });
    Object.keys(COUNTRY_NAMES_AR).forEach((c) => {
      if (COUNTRY_NAMES_AR[c] === country) codes.add(c);
    });
  }
  codes.forEach((c) => {
    if (COUNTRY_NAMES[c]) parts.push(COUNTRY_NAMES[c]);
    if (COUNTRY_NAMES_AR[c]) parts.push(COUNTRY_NAMES_AR[c]);
  });
  return parts.filter(Boolean).join(" ");
}

/* ── Orders ── */

export function dbToOrder(r: Record<string, unknown>, products: Record<string, FormProduct>): MarketerOrder {
  const p = products[r.product_id as string] || ({} as FormProduct);
  const curRaw = (r.currency as { symbol?: string; code?: string }) || p.currency || { symbol: "$", code: "USD" };
  const curCode = curRaw.code || "USD";
  const sym = wrapArSym(curRaw.symbol || "$", curCode);
  const snap = (r.product_snapshot as { name?: string }) || null;
  const name = snap && snap.name ? snap.name : p.name || "Product";
  const price = Number(r.unit_price) || 0;
  const pct = p.pct || (price > 0 ? Number(r.commission) / price : 0);
  const q = Number(r.qty) || 1;
  const commPerUnit = Number(r.commission) || 0;
  const platformPerUnit = Number(r.platform_fee) || 0;
  const feePerUnit = parseFloat((commPerUnit + platformPerUnit).toFixed(2));
  const totalFee = parseFloat((feePerUnit * q).toFixed(2));

  const zoneKey = (r.customer_country_code as string) || (r.customer_country as string);
  const di = p.delivery && p.delivery[zoneKey] ? p.delivery[zoneKey] : null;
  const per =
    Number(r.shipping_fee) || Number(r.delivery_fee)
      ? { shipping: Number(r.shipping_fee) || 0, delivery: Number(r.delivery_fee) || 0 }
      : di && di._per && di._per[r.customer_city as string]
        ? { shipping: di._per[r.customer_city as string].s, delivery: di._per[r.customer_city as string].d }
        : { shipping: di ? di.shipping : 0, delivery: di ? di.delivery : 0 };

  const created = r.created_at ? new Date(r.created_at as string) : new Date();
  const reserveDate = created.getDate() + "/" + (created.getMonth() + 1) + "/" + created.getFullYear();
  const confirmed = !!r.marketer_confirmed_at;
  const mc = r.marketer_confirmed_at ? new Date(r.marketer_confirmed_at as string) : null;

  return {
    id: "#" + ((r.order_number as string) || String(r.id).slice(0, 8).toUpperCase()),
    dbId: r.id as string,
    reserveDate,
    customerName: (r.customer_name as string) || "",
    phone: (r.customer_phone as string) || "",
    whatsapp: (r.customer_whatsapp as string) || "",
    countryCode: (r.customer_country_code as string) || "",
    country: (r.customer_country as string) || "",
    city: (r.customer_city as string) || "",
    address: (r.customer_address as string) || "",
    productKey: r.product_id as string,
    productName: name,
    price,
    pct,
    earn: commPerUnit,
    shipping: per.shipping,
    delivery: per.delivery,
    size: (r.size as string) || "",
    color: (r.color as string) || "",
    selectedVariants: Array.isArray(r.selected_variants) ? (r.selected_variants as SelectedVariant[]) : [],
    qty: q,
    total: parseFloat((price * q + per.shipping + per.delivery).toFixed(2)),
    feePerUnit,
    totalFee,
    commPerUnit,
    platformPerUnit,
    notes: (r.customer_notes as string) || "",
    bizName: p.biz || "",
    bizPhone: p.bizPhone || "",
    hasReceipt: !!r.receipt_url,
    receiptUrl: (r.receipt_url as string) || "",
    market: (r.market as string) || "LY",
    depositConfirmed: confirmed ? true : null,
    payDate: mc ? mc.getDate() + "/" + (mc.getMonth() + 1) + "/" + mc.getFullYear() : null,
    _status: r.status as string,
    _sym: sym,
    _curCode: curCode,
    _createdAt: created,
    adminNotes: ((r.refund_note as string) || (r.admin_notes as string) || ""),
    businessNotes: (r.business_notes as string) || "",
    receiptUploadedAt: (r.receipt_uploaded_at as string) || null,
    reviewedAt: (r.reviewed_at as string) || null,
    _updatedAt: r.updated_at ? new Date(r.updated_at as string) : created,
    /* A refund flips the status to 'cancelled', which a failed delivery also
       uses. delivered_at is what tells them apart: mark_failed refuses to run
       on a delivered order, and nothing ever clears delivered_at, so a row
       carrying both dates was delivered and then refunded. The analytics need
       that to date the reversal instead of erasing the sale. */
    _deliveredAt: r.delivered_at ? new Date(r.delivered_at as string) : null,
    _refundedAt: r.refunded_at ? new Date(r.refunded_at as string) : null,
    refundNote: (r.refund_note as string) || "",
  };
}

/** The variant chips shown on an order card, with their swatch photos. */
export function orderVariants(o: MarketerOrder, p: BrowseProduct | null) {
  if (Array.isArray(o.selectedVariants) && o.selectedVariants.length) {
    const vgl = (p && p.vg) || [];
    return o.selectedVariants.map((sv) => {
      let photo = "";
      const g = vgl.find((x) => x.name === sv.name);
      if (g) {
        const item = (g.items || []).find((x) => x.val === sv.value);
        if (item) photo = item.photo || "";
      }
      return { group: sv.name || "", val: sv.value, photo };
    });
  }
  const out: Array<{ group: string; val: string; photo: string }> = [];
  if (!p || !p.vg || !p.vg.length) {
    if (o.size) out.push({ group: "Size", val: o.size, photo: "" });
    if (o.color) out.push({ group: "Colour", val: o.color, photo: "" });
    return out;
  }
  p.vg.forEach((g, gi) => {
    const chosen = gi === 0 ? o.size : gi === 1 ? o.color : "";
    if (!chosen) return;
    const item = (g.items || []).find((x) => x.val === chosen);
    out.push({ group: g.name || "", val: chosen, photo: (item && item.photo) || "" });
  });
  return out;
}

export function orderMatchesFilter(o: MarketerOrder, f: string): boolean {
  if (f === "all") return true;
  if (f === "failed") return o._status === "cancelled";
  if (f === "approved") return o._status === "approved" || o._status === "confirmed" || o._status === "delivered";
  return o._status === f;
}

export function currentDeliveryFor(p: FormProduct, cc: string, city: string): CurrentDelivery | null {
  const di = p.delivery[cc];
  if (!di) return null;
  const per = di._per && di._per[city] ? { shipping: di._per[city].s, delivery: di._per[city].d } : { shipping: di.shipping, delivery: di.delivery };
  return { ...di, ...per, city, country: COUNTRY_NAMES[cc] || cc, countryCode: cc };
}
