/**
 * Things to test against: a product, and an order on it.
 *
 * Made through the accounts' own tokens, so a product created here is a
 * product the business owner could have created, subject to every rule that
 * applies to them. Nothing is inserted past the row-level rules, because
 * anything that needed to be would not be proving much.
 *
 * Everything made carries a marker in its name and its code, so what a run
 * left behind can be found and removed later without guessing.
 */

import type { Session } from "./api.ts";

/** In every product name and product code this file creates. */
export const MARK = "WASLA-E2E";

function suffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export type SeededProduct = {
  id: string;
  price: number;
  commission: number;
  platformFee: number;
  qty: number;
};

/** A plain, orderable product: one city, no variants, instant fulfilment. */
export async function makeProduct(
  biz: Session,
  over: Partial<{
    price: number; qty: number; commPct: number; platformFee: number;
    name: string; status: string; fulfilment: string; description: string;
  }> = {},
): Promise<SeededProduct> {
  const price = over.price ?? 100;
  const commPct = over.commPct ?? 10;
  const platformFee = over.platformFee ?? 5;
  const qty = over.qty ?? 50;

  const r = await biz.insert<Array<{ id: string }>>("products", {
    business_id: biz.userId,
    code: `${MARK}-${suffix()}`,
    name: over.name ?? `${MARK} product`,
    description: over.description ?? "Made by the browser tests. Safe to delete.",
    category: "Home",
    price,
    cost_price: Math.round(price * 0.6),
    qty,
    currency: { s: "LYD", code: "LYD" },
    comm_pct: commPct,
    comm_fixed: 0,
    comm_mode: "pct",
    platform_fee: platformFee,
    total_fee_per_unit: platformFee + (price * commPct) / 100,
    variant_groups: [],
    sizes: [],
    colors: [],
    delivery: { LY: { cities: ["Tripoli"], c: { Tripoli: { s: 10, d: 5 } }, shipping: 10, delivery: 5 } },
    photos: [],
    status: over.status ?? "active",
    fulfilment: over.fulfilment ?? "instant",
  });
  if (!r.ok) throw new Error(`could not create a product: ${r.status} ${r.error}`);
  return { id: r.body[0].id, price, commission: (price * commPct) / 100, platformFee, qty };
}

/* The smallest thing that is honestly a JPEG: a 1×1 grey pixel, 631 bytes as
   base64. A receipt has to be a real file in the bucket, not a made-up path —
   the dashboards ask storage to sign every receipt they show, and a path with
   nothing behind it comes back 400 and fills the console with errors that look
   like the app's fault and are not. */
const ONE_PIXEL_JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

/** Puts a real receipt in the bucket and returns the marker the app stores. */
export async function uploadReceipt(mkt: Session): Promise<string> {
  /* The same shape the app's own uploader writes: the uploader's id first,
     because that is what the bucket's rules check. */
  const path = `${mkt.userId}/${crypto.randomUUID()}.jpg`;
  const bytes = Uint8Array.from(atob(ONE_PIXEL_JPEG), (c) => c.charCodeAt(0));
  const r = await mkt.upload("receipts", path, bytes, "image/jpeg");
  if (!r.ok) throw new Error(`could not upload a receipt: ${r.status} ${r.error}`);
  return `receipts:${path}`;
}

export type SeededOrder = { id: string; commission: number; qty: number; unitPrice: number };

/** An order with a receipt already on it — the state the admin queue sees. */
export async function placeOrder(
  mkt: Session,
  biz: Session,
  p: SeededProduct,
  over: Partial<{ qty: number; withReceipt: boolean }> = {},
): Promise<SeededOrder> {
  const qty = over.qty ?? 2;
  const withReceipt = over.withReceipt ?? true;

  const r = await mkt.insert<Array<{ id: string }>>("orders", {
    product_id: p.id,
    business_id: biz.userId,
    marketer_id: mkt.userId,
    qty,
    unit_price: p.price,
    commission: p.commission,
    platform_fee: p.platformFee,
    currency: { s: "LYD", code: "LYD" },
    customer_name: `${MARK} customer`,
    customer_phone: "+218910000001",
    customer_city: "Tripoli",
    customer_country: "Libya",
    customer_address: "Test address",
    shipping_fee: 10,
    delivery_fee: 5,
    order_number: `E2E${suffix()}`,
    ...(withReceipt
      ? { receipt_url: await uploadReceipt(mkt), receipt_uploaded_at: new Date().toISOString() }
      : {}),
  });
  if (!r.ok) throw new Error(`could not place an order: ${r.status} ${r.error}`);
  return { id: r.body[0].id, commission: p.commission, qty, unitPrice: p.price };
}

/** The marketer's two pots, as the wallet page reads them. */
export async function wallet(mkt: Session): Promise<{ balance: number; pending: number }> {
  const r = await mkt.select<Array<{ balance: number; pending: number }>>(
    "wallets", `user_id=eq.${mkt.userId}&select=balance,pending`);
  const w = r.body?.[0];
  return { balance: Number(w?.balance ?? 0), pending: Number(w?.pending ?? 0) };
}

export type OrderRow = {
  status: string;
  refunded_at: string | null;
  refund_reason: string | null;
  delivered_at: string | null;
  commission_pending: boolean;
  commission_released_at: string | null;
  admin_notes: string | null;
};

export async function order(s: Session, id: string): Promise<OrderRow> {
  const r = await s.select<OrderRow[]>("orders",
    `id=eq.${id}&select=status,refunded_at,refund_reason,delivered_at,commission_pending,commission_released_at,admin_notes`);
  if (!r.ok || !r.body?.[0]) throw new Error(`could not read order ${id}: ${r.error}`);
  return r.body[0];
}

export async function product(s: Session, id: string): Promise<{ sold: number; revenue: number; qty: number; status: string }> {
  const r = await s.select<Array<{ sold: number; revenue: number; qty: number; status: string }>>(
    "products", `id=eq.${id}&select=sold,revenue,qty,status`);
  if (!r.ok || !r.body?.[0]) throw new Error(`could not read product ${id}: ${r.error}`);
  const p = r.body[0];
  return { sold: Number(p.sold ?? 0), revenue: Number(p.revenue ?? 0), qty: Number(p.qty ?? 0), status: p.status };
}

/** Walks an order to `delivered`, the state most of the interesting cases start from. */
export async function deliver(adm: Session, biz: Session, id: string): Promise<void> {
  const steps: Array<[string, Session, string]> = [
    ["admin_approve_order", adm, "approve"],
    ["confirm_order", biz, "confirm"],
    ["mark_delivered", biz, "deliver"],
  ];
  for (const [fn, who, what] of steps) {
    const r = await who.rpc(fn, { _order_id: id });
    if (!r.ok) throw new Error(`could not ${what} order ${id}: ${r.error}`);
  }
}
