/* Row → UI mappers, ported 1:1 from business.script.js (dbToProduct / dbToOrder). */

import { wrapArSym } from "./format";
import type { Order, OrderUiStatus, Product } from "./types";

type Row = Record<string, any>;

export function dbToProduct(r: Row): Product {
  const cur = r.currency ? { ...r.currency, symbol: wrapArSym(r.currency.symbol, r.currency.code) } : null;
  return {
    id: r.id,
    code: r.code,
    bizName: r.biz_name || "",
    currency: cur,
    photos: r.photos || [],
    coverFocusX: r.cover_focus_x != null && !isNaN(Number(r.cover_focus_x)) ? Number(r.cover_focus_x) : 50,
    coverFocusY: r.cover_focus_y != null && !isNaN(Number(r.cover_focus_y)) ? Number(r.cover_focus_y) : 50,
    name: r.name,
    desc: r.description || "",
    price: Number(r.price) || 0,
    costPrice: Number(r.cost_price) || 0,
    commPct: Number(r.comm_pct) || 0,
    commFixed: Number(r.comm_fixed) || 0,
    commMode: r.comm_mode || "pct",
    platformFee: Number(r.platform_fee) || 0,
    totalFeePerUnit: Number(r.total_fee_per_unit) || 0,
    qty: Number(r.qty) || 0,
    category: r.category || "",
    sizes: r.sizes || [],
    colors: r.colors || [],
    variantGroups: r.variant_groups || [],
    sold: Number(r.sold) || 0,
    revenue: Number(r.revenue) || 0,
    status: r.status || "active",
    delivery: r.delivery || {},
    reqPhone: !!r.require_additional_phone,
  };
}

export function dbStatusToUi(s: string): OrderUiStatus {
  if (s === "confirmed") return "confirmed";
  if (s === "delivered") return "delivered";
  if (s === "cancelled") return "failed";
  if (s === "rejected") return "rejected";
  if (s === "approved") return "approved";
  return "pending";
}

export function dbToOrder(r: Row, products: Product[]): Order {
  const curCode = (r.currency && r.currency.code) || "USD";
  const sym = wrapArSym((r.currency && r.currency.symbol) || "$", curCode);
  const prod = products.find((p) => p.id === r.product_id);
  const snap = r.product_snapshot || null;
  const ph: string[] =
    snap && snap.photos && snap.photos.length
      ? snap.photos
      : prod && prod.photos && prod.photos.length
        ? prod.photos
        : [(prod && prod.currency && prod.currency.flag) || "📦"];
  const dt = new Date(r.created_at);
  const d = dt.getDate() + " " + dt.toLocaleString("en", { month: "short" }) + " " + dt.getFullYear();
  const q = Number(r.qty) || 1;
  const shipping = Number(r.shipping_fee) || 0;
  const delivery = Number(r.delivery_fee) || 0;
  const total = Number(r.unit_price) * q + shipping + delivery;
  const mc = r.marketer_confirmed_at ? new Date(r.marketer_confirmed_at) : null;
  const mcDate = mc ? mc.getDate() + " " + mc.toLocaleString("en", { month: "short" }) + " " + mc.getFullYear() : "";
  return {
    id: "#" + (r.order_number || String(r.id).slice(0, 8).toUpperCase()),
    dbId: r.id,
    marketerId: r.marketer_id || "",
    productId: r.product_id || "",
    source: "affiliate",
    paymentType: "upfront",
    paymentAmount: Number(r.commission) * q + Number(r.platform_fee) * q,
    paymentDate: d,
    photos: ph,
    productEmoji: "📦",
    customerName: r.customer_name || "",
    customerPhone: r.customer_phone || "",
    customerWhatsapp: r.customer_whatsapp || "",
    country: r.customer_country || "",
    city: r.customer_city || "",
    address: r.customer_address || "",
    product: snap && snap.name ? snap.name : prod ? prod.name : "(product)",
    productCode: snap && snap.code ? snap.code : prod ? prod.code : "",
    sym,
    curCode,
    size: r.size || "",
    color: r.color || "",
    selectedVariants: Array.isArray(r.selected_variants) ? r.selected_variants : [],
    qty: q,
    price: Number(r.unit_price) || 0,
    shipping,
    delivery,
    total,
    commission: Number(r.commission) * q,
    platformFee: Number(r.platform_fee) * q,
    status: dbStatusToUi(r.status),
    date: d,
    notes: r.customer_notes || "",
    adminNotes: r.refund_note || r.admin_notes || "",
    refundedAt: r.refunded_at || null,
    receiptUrl: r.receipt_url || "",
    market: (r.market as string) || "LY",
    marketerConfirmed: !!r.marketer_confirmed_at,
    marketerConfirmedDate: mcDate,
    _createdAt: dt,
    _status: r.status,
    _updatedAt: r.updated_at ? new Date(r.updated_at) : dt,
  };
}
