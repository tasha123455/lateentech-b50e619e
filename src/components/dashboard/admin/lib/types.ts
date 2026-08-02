import type { createLateenApi } from "@/lib/lateen-api";

export type LateenApi = ReturnType<typeof createLateenApi>;
export type AdminApi = LateenApi["admin"];

export type AdminPageId =
  | "adm-home" | "adm-money" | "adm-users" | "adm-products"
  // reached from the menu rather than the nav bar
  | "adm-employees" | "adm-requests" | "adm-notify"
  // Master admin only. Not in admin_pages, because it is not a permission
  // that can be handed out — being master is the permission.
  | "adm-admins";

/** A person attached to an order / report / request. */
export type Person = {
  id?: string;
  full_name?: string | null;
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  /** Signed URL for the profile photo — avatars sit in a private bucket. */
  avatar_signed_url?: string | null;
};

export type ReceiptOrder = {
  id: string;
  order_number?: string | null;
  marketer_id: string;
  business_id?: string | null;
  marketer?: Person | null;
  product?: { name?: string | null; photos?: string[] | null } | null;
  qty?: number | null;
  unit_price?: number | null;
  commission?: number | null;
  platform_fee?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  receipt_url?: string | null;
  receipt_uploaded_at?: string | null;
  status?: string | null;
  admin_notes?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
  refunded_at?: string | null;
  updated_at?: string | null;
};

/** Receipts grouped under the marketer who submitted them. */
export type VerifyMarketer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** Signed URL for the marketer's photo, resolved with their profile. */
  avatar_signed_url?: string | null;
  pending: ReceiptOrder[];
  history: ReceiptOrder[];
};

export type PayoutRequest = {
  id: string;
  amount?: number | null;
  requested_at?: string | null;
  user?: (Person & {
    payout_method?: string | null;
    payout_bank_name?: string | null;
    payout_account_holder?: string | null;
    payout_account_number?: string | null;
    payout_iban?: string | null;
    payout_swift?: string | null;
    payout_notes?: string | null;
  }) | null;
  wallet?: { balance?: number | null; currency?: { symbol?: string; code?: string } | null } | null;
};

export type AdminUser = Person & {
  id: string;
  role?: string | null;
  banned_at?: string | null;
  frozen_at?: string | null;
  /** Signed URL for the profile photo, resolved by listAllUsers. */
  avatar_signed_url?: string | null;
};

export type AdminProduct = {
  id: string;
  name: string;
  code?: string | null;
  price?: number | null;
  comm_pct?: number | null;
  status?: string | null;
  photos?: string[] | null;
};

export type VariantItem = { val: string; photo: string; qty: number | null };
export type VariantGroup = { name: string; items: VariantItem[] };

export type ProductDetail = {
  product: {
    id: string;
    business_id: string;
    name: string;
    code?: string | null;
    description?: string | null;
    price?: number | null;
    qty?: number | null;
    sold?: number | null;
    revenue?: number | null;
    comm_mode?: string | null;
    comm_pct?: number | null;
    comm_fixed?: number | null;
    platform_fee?: number | null;
    currency?: { symbol?: string; code?: string } | null;
    photos?: string[] | null;
    sizes?: string[] | null;
    colors?: string[] | null;
    variant_groups?: Array<{ name?: string; items?: unknown[] }> | null;
    delivery?: Record<string, { cities?: Record<string, { shipping?: number; delivery?: number }> }> | null;
    biz_name?: string | null;
  } | null;
  owner?: Person | null;
};

export type AdminReport = {
  id: string;
  report_type?: string | null;
  status?: string | null;
  message?: string | null;
  admin_comment?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  reporter_id?: string | null;
  business_id?: string | null;
  product_id?: string | null;
  reporter?: Person | null;
  business?: Person | null;
  product?: { name?: string | null; price?: number | null; code?: string | null; photos?: string[] | null } | null;
};

export type DeletionRequest = {
  id: string;
  user_id: string;
  role?: string | null;
  status?: string | null;
  admin_comment?: string | null;
  requested_at?: string | null;
  resolved_at?: string | null;
  scheduled_for?: string | null;
  wallet_balance?: number | null;
  wallet_pending?: number | null;
  live_wallet?: { balance?: number | null; pending?: number | null } | null;
  person?: Person | null;
};

/** Somebody asking for details they cannot edit themselves to be changed. */
export type ChangeRequest = {
  id: string;
  user_id: string;
  role?: string | null;
  /** Any of "phone", "email", "country". */
  fields: string[];
  note?: string | null;
  status?: string | null;
  created_at?: string | null;
  person?: Person | null;
};

export type EmployeePayment = {
  period_year: number;
  period_month: number;
  amount?: number | null;
  paid_at?: string | null;
};

export type Employee = {
  id: string;
  full_name: string;
  employee_number: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Second contact number. Always a different number from `phone`. */
  phone2?: string | null;
  monthly_salary?: number | null;
  hired_at?: string | null;
  notes?: string | null;
  payments?: EmployeePayment[] | null;
};

/** Raw rows behind the Home analytics page. */
export type HomeRaw = {
  orders: Array<{
    marketer_id?: string;
    business_id?: string;
    created_at?: string;
    reviewed_at?: string | null;
    delivered_at?: string | null;
    refunded_at?: string | null;
    fee?: number | null;
    qty?: number | null;
  }>;
  profiles: Array<{ created_at?: string }>;
  products: Array<{ created_at?: string }>;
  employeePayments: Array<{ paid_at?: string; amount?: number | null }>;
};

export type AdminMetrics = {
  activeUsers?: number;
  totalUsers?: number;
  totalProducts?: number;
  succeededUpfronts?: number;
  succeededPiecesSold?: number;
} & Partial<HomeRaw>;

export type DateSelection = { day: string | null; month: string | null; year: string | null };

export type MetricKey =
  | "activeUsers" | "totalUsers" | "totalProducts" | "platformFee" | "succeeded" | "succeededPieces";
