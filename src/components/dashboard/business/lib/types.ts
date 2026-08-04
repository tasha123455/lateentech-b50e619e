/* Domain types for the business dashboard — mirror the in-memory shapes the
   original business.script.js built via dbToProduct / dbToOrder. */

import type { Currency } from "./constants";

export type VariantOption = {
  id?: string | number;
  name?: string;
  price?: number | string;
  qty?: number | string;
  photo?: string;
  photos?: string[];
  [k: string]: unknown;
};

export type VariantGroup = {
  id?: string | number;
  name?: string;
  items?: VariantOption[];
  [k: string]: unknown;
};

export type DeliveryZone = {
  shipping?: number | string;
  cities?: Record<string, { delivery?: number | string; [k: string]: unknown }>;
  /** Delivery time for the country, in whole days. Absent when unset. */
  eta?: { min?: number | string; max?: number | string | null } | null;
  [k: string]: unknown;
};

export type Product = {
  id: string;
  code: string;
  bizName: string;
  currency: Currency | null;
  photos: string[];
  coverFocusX: number;
  coverFocusY: number;
  name: string;
  desc: string;
  price: number;
  costPrice: number;
  commPct: number;
  commFixed: number;
  commMode: string;
  platformFee: number;
  totalFeePerUnit: number;
  qty: number;
  category: string;
  sizes: string[];
  colors: string[];
  variantGroups: VariantGroup[];
  sold: number;
  revenue: number;
  status: string;
  delivery: Record<string, DeliveryZone>;
  reqPhone: boolean;
};

export type OrderUiStatus =
  | "pending" | "approved" | "confirmed" | "delivered" | "failed" | "rejected";

export type Order = {
  id: string;
  dbId: string;
  marketerId: string;
  productId: string;
  source: string;
  paymentType: string;
  paymentAmount: number;
  paymentDate: string;
  photos: string[];
  productEmoji: string;
  customerName: string;
  customerPhone: string;
  customerWhatsapp: string;
  country: string;
  city: string;
  address: string;
  product: string;
  productCode: string;
  sym: string;
  curCode: string;
  size: string;
  color: string;
  selectedVariants: Array<Record<string, unknown>>;
  qty: number;
  price: number;
  shipping: number;
  delivery: number;
  total: number;
  commission: number;
  platformFee: number;
  status: OrderUiStatus;
  date: string;
  notes: string;
  adminNotes: string;
  refundedAt: string | null;
  deliveredAt: string | null;
  receiptUrl: string;
  /** Market this order was priced under. */
  market?: string | null;
  marketerConfirmed: boolean;
  marketerConfirmedDate: string;
  _createdAt: Date;
  _status: string;
  _updatedAt: Date;
};

export type PendingActiveStub = {
  marketerId: string;
  productId: string;
  _status: string;
  _createdAt: Date;
};

export type BusinessProfile = {
  id?: string;
  full_name?: string | null;
  business_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  country?: string | null;
  city?: string | null;
  market?: string | null;
  avatar_url?: string | null;
  avatar_signed_url?: string | null;
  frozen_at?: string | null;
  banned_at?: string | null;
  [k: string]: unknown;
};

export type NotificationRow = {
  id: string;
  title?: string | null;
  body?: string | null;
  created_at: string;
  read_at?: string | null;
  type?: string | null;
  data?: Record<string, unknown> | null;
  [k: string]: unknown;
};
