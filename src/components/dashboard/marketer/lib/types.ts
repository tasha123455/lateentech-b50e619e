import type { Fulfilment } from "@/lib/fulfilment";
import type { createLateenApi } from "@/lib/lateen-api";

export type LateenApi = ReturnType<typeof createLateenApi>;

export type Currency = { s: string; code: string };

export type VariantItem = { val: string; photo: string; qty: number | null };
export type VariantGroup = { name: string; items: VariantItem[] };

/** Per-city shipping/delivery costs, keyed by city name. */
export type ZoneCity = { s: number; d: number; eta?: ZoneEta };
/** How long delivery takes in that country, in whole days. `max` is null when
 *  the shop gave a single figure rather than a range. Absent when they left it
 *  blank, which is why nothing shows for products that have not set one. */
export type ZoneEta = { min: number; max: number | null };
export type Zone = {
  cities: string[];
  c: Record<string, ZoneCity>;
  shipping: number;
  delivery: number;
  eta?: ZoneEta;
};

/** A product as shown in Browse / My products / the product detail sheet. */
export type BrowseProduct = {
  id: string;
  bid: string;
  biz: string;
  bizPhone?: string;
  /** Cover photo <img> markup in the original; here it is the raw url (or null for the emoji fallback). */
  cover: string | null;
  coverFocusX: number;
  coverFocusY: number;
  flag: string;
  ph: string[];
  n: string;
  cat: string;
  code: string;
  desc: string;
  pr: number;
  cur: Currency;
  /** Market this product is sold into — decides its fee rule. */
  market: string;
  pct: number;
  commUnit: number;
  platformFee: number;
  q: number;
  sv: boolean;
  sz: string[];
  cl: string[];
  vg: VariantGroup[];
  d: Record<string, Zone>;
  reqPhone: boolean;
  /** How it is fulfilled — reserve or instant. NULL before the owner chose. */
  fulfilment: Fulfilment | null;
};

/** The order-form view of a product (the old `PRODUCTS` map). */
export type FormDelivery = {
  cities: string[];
  shipping: number;
  delivery: number;
  _per: Record<string, ZoneCity>;
};

export type FormProduct = {
  id: string;
  bid: string;
  name: string;
  /** Cover photo, so the order form can show what was picked rather than a
   *  parcel emoji. Null when the listing has no photos. */
  cover: string | null;
  coverFocusX: number;
  coverFocusY: number;
  price: number;
  /** Market this product is sold into — decides its fee rule. */
  market?: string | null;
  /** Fractional commission rate (pct/100), matching the original PRODUCTS map. */
  pct: number;
  commUnit: number;
  q: number;
  sizes: string[];
  colors: string[];
  vg: VariantGroup[];
  biz: string;
  bizPhone?: string;
  reqPhone: boolean;
  fulfilment: Fulfilment | null;
  sym: string;
  currency: { symbol: string; code: string };
  delivery: Record<string, FormDelivery>;
};

export type SelectedVariant = { name: string; value: string };

export type CurrentDelivery = {
  cities: string[];
  shipping: number;
  delivery: number;
  _per: Record<string, ZoneCity>;
  city: string;
  country: string;
  countryCode: string;
};

export type OrderStatus =
  | "draft"
  | "pending"
  | "approved"
  | "confirmed"
  | "delivered"
  | "rejected"
  | "cancelled";

export type MarketerOrder = {
  id: string;
  dbId?: string;
  reserveDate: string;
  customerName: string;
  phone: string;
  whatsapp: string;
  countryCode: string;
  country: string;
  city: string;
  address: string;
  productKey: string;
  productName: string;
  price: number;
  pct: number;
  earn: number;
  shipping: number;
  delivery: number;
  size: string;
  color: string;
  selectedVariants: SelectedVariant[];
  qty: number;
  total: number;
  feePerUnit: number;
  totalFee: number;
  commPerUnit: number;
  platformPerUnit: number;
  notes: string;
  bizName: string;
  bizPhone?: string;
  hasReceipt: boolean;
  receiptUrl: string;
  /** Market this order was priced under. */
  market?: string | null;
  depositConfirmed: boolean | null;
  payDate: string | null;
  _status: OrderStatus | string;
  _isDraft?: boolean;
  adminNotes: string;
  businessNotes?: string;
  receiptUploadedAt: string | null;
  reviewedAt: string | null;
  _sym: string;
  _curCode: string;
  _createdAt?: Date;
  _updatedAt: Date;
  /** Set once the business marked it delivered, and never cleared — so it
   *  survives the 'cancelled' status a refund leaves behind. */
  _deliveredAt?: Date | null;
  _refundedAt?: Date | null;
  refundNote?: string;
};

export type MarketerProfile = {
  full_name?: string | null;
  city?: string | null;
  market?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  avatar_signed_url?: string | null;
  frozen_at?: string | null;
  created_at?: string | null;
  payout_method?: string | null;
  payout_bank_name?: string | null;
  payout_account_holder?: string | null;
  payout_account_number?: string | null;
  payout_iban?: string | null;
  payout_swift?: string | null;
  payout_notes?: string | null;
};

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  data: unknown;
  created_at: string;
  read_at: string | null;
};

export type ProductReview = {
  id: string;
  author: string;
  rating: number;
  text: string;
  ts: number;
  photo: string;
  avatar: string;
};

export type ChartSeries = { labels: string[]; sub: string[]; values: number[] };
export type Period = "D" | "M" | "Y";
export type Metric = "earnings" | "pieces";

export type ChartData = Record<Metric, Record<Period, ChartSeries>>;
export type RingData = Record<Period, { ok: number; fail: number; failPct: number }>;

export type EarnByCur = Record<string, { sym: string; amount: number }>;

export type PageId = "pg-home" | "pg-browse" | "pg-saved" | "pg-orders" | "pg-notif";
