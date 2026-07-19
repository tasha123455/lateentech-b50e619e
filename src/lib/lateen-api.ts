// Bridge between the embedded vanilla-JS dashboard scripts and Supabase.
// Installed onto window.LateenAPI by LateenShell so the scripts can call
// real backend operations instead of mutating in-memory arrays.
import { supabase } from "@/integrations/supabase/client";

// Same charset as product codes (no ambiguous 0/O or 1/I), but with no
// prefix -- product codes are shown as "LT-XXXXXX" while order numbers are
// shown as "#XXXXXXXX", so the two can never be confused for one another.
const ORDER_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genOrderCode(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ORDER_CODE_CHARS[Math.floor(Math.random() * ORDER_CODE_CHARS.length)];
  return s;
}

function mapStockError(err: unknown): unknown {
  const msg = (err && typeof err === "object" && "message" in err) ? String((err as { message?: unknown }).message ?? "") : "";
  if (/OUT_OF_STOCK/i.test(msg)) {
    const variantMatch = msg.match(/variant "([^"]+)" has only (\d+) left/i);
    const isAr = typeof document !== "undefined" && document.documentElement.getAttribute("dir") === "rtl";
    if (variantMatch) {
      const name = variantMatch[1];
      const left = variantMatch[2];
      const friendly = isAr
        ? `عذراً، لم يعد المتغير "${name}" متوفراً بالكمية المطلوبة (المتاح: ${left}). يرجى تحديث الطلب.`
        : `Sorry, variant "${name}" no longer has enough stock (${left} left). Please update the order.`;
      return new Error(friendly);
    }
    const friendly = isAr
      ? "عذراً، لم يعد هذا المنتج متوفراً بالكمية المطلوبة. لقد قام مسوق آخر بحجز آخر قطعة."
      : "Sorry, this product no longer has enough stock — another marketer may have just reserved the last unit.";
    return new Error(friendly);
  }
  return err;
}

export type LateenProduct = {
  id: string;
  business_id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  cost_price: number;
  qty: number;
  currency: { code: string; name: string; symbol: string; flag: string } | null;
  comm_pct: number;
  comm_fixed: number;
  comm_mode: string;
  platform_fee: number;
  total_fee_per_unit: number;
  variant_groups: { name: string; items: { val: string; qty?: number; photo?: string }[] }[];
  sizes: string[];
  colors: string[];
  delivery: Record<string, { cities: Record<string, { shipping: number; delivery: number }> }>;
  photos: string[];
  cover_focus_x: number;
  cover_focus_y: number;
  status: "active" | "paused";
  sold: number;
  revenue: number;
  biz_name: string | null;
  require_additional_phone: boolean;
  deleted_at: string | null;
};

export type LateenAPI = ReturnType<typeof createLateenApi>;

export function createLateenApi(userId: string) {
  return {
    userId,

    async listMyProducts(): Promise<LateenProduct[]> {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("business_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LateenProduct[];
    },

    async upsertProduct(p: Partial<LateenProduct> & { id?: string }) {
      const row = {
        ...(p.id ? { id: p.id } : {}),
        business_id: userId,
        code: p.code,
        name: p.name,
        description: p.description ?? null,
        category: p.category ?? null,
        price: p.price ?? 0,
        cost_price: p.cost_price ?? 0,
        qty: p.qty ?? 0,
        currency: p.currency ?? null,
        comm_pct: p.comm_pct ?? 0,
        comm_fixed: p.comm_fixed ?? 0,
        comm_mode: p.comm_mode ?? "pct",
        platform_fee: p.platform_fee ?? 0,
        total_fee_per_unit: p.total_fee_per_unit ?? 0,
        variant_groups: p.variant_groups ?? [],
        sizes: p.sizes ?? [],
        colors: p.colors ?? [],
        delivery: p.delivery ?? {},
        photos: p.photos ?? [],
        cover_focus_x: p.cover_focus_x ?? 50,
        cover_focus_y: p.cover_focus_y ?? 50,
        status: p.status ?? "active",
        biz_name: p.biz_name ?? null,
        require_additional_phone: p.require_additional_phone ?? false,
      };
      const { data, error } = await supabase
        .from("products")
        .upsert(row as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LateenProduct;
    },

    async setStatus(id: string, status: "active" | "paused") {
      const { error } = await supabase.from("products").update({ status }).eq("id", id);
      if (error) throw error;
    },

    async deleteProduct(id: string) {
      // Soft delete so favorites and historical orders survive
      const { error } = await supabase
        .from("products")
        .update({ deleted_at: new Date().toISOString(), status: "paused" })
        .eq("id", id);
      if (error) throw error;
    },

    async uploadPhoto(file: File): Promise<string> {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-photos")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
      return data.publicUrl;
    },

    async listBrowse(): Promise<LateenProduct[]> {
      const { data, error } = await supabase
        .from("products_marketer_view" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LateenProduct[];
    },

    async listFavorites(): Promise<LateenProduct[]> {
      const { data: favs, error } = await supabase.from("favorites").select("product_id").eq("marketer_id", userId);
      if (error) throw error;
      const ids = (favs ?? []).map((r: { product_id: string }) => r.product_id);
      if (!ids.length) return [];
      const { data: prods, error: pErr } = await supabase
        .from("products_marketer_view" as never)
        .select("*")
        .in("id", ids);
      if (pErr) throw pErr;
      return (prods ?? []) as unknown as LateenProduct[];
    },

    async listFavoriteIds(): Promise<Set<string>> {
      const { data, error } = await supabase.from("favorites").select("product_id").eq("marketer_id", userId);
      if (error) throw error;
      return new Set((data ?? []).map((r: { product_id: string }) => r.product_id));
    },

    async listFavoriteIdsOrdered(): Promise<string[]> {
      const { data, error } = await supabase
        .from("favorites")
        .select("product_id, created_at")
        .eq("marketer_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: { product_id: string }) => r.product_id);
    },

    async addFavorite(productId: string) {
      const { error } = await supabase.from("favorites").insert({ marketer_id: userId, product_id: productId });
      if (error && error.code !== "23505") throw error;
    },

    async notifyProductReview(productId: string, rating: number, text: string) {
      const { error } = await supabase.rpc(
        "notify_product_review" as never,
        {
          _product_id: productId,
          _rating: rating,
          _text: text,
        } as never,
      );
      if (error) throw error;
    },

    async removeFavorite(productId: string) {
      const { error } = await supabase.from("favorites").delete().eq("marketer_id", userId).eq("product_id", productId);
      if (error) throw error;
    },

    async createOrder(input: {
      product_id: string;
      business_id: string;
      qty: number;
      unit_price: number;
      commission: number;
      platform_fee: number;
      currency: unknown;
      customer_name?: string;
      customer_phone?: string;
      customer_city?: string;
      customer_country?: string;
      customer_whatsapp?: string;
      customer_address?: string;
      customer_notes?: string;
      customer_country_code?: string;
      shipping_fee?: number;
      delivery_fee?: number;
      size?: string;
      color?: string;
      receipt_url?: string;
      marketer_confirmed_at?: string;
    }) {
      const payload: Record<string, unknown> = { ...input, marketer_id: userId };
      if (input.receipt_url) payload.receipt_uploaded_at = new Date().toISOString();
      let codeLen = 8;
      for (let attempt = 0; ; attempt++) {
        payload.order_number = genOrderCode(codeLen);
        const { data, error } = await supabase
          .from("orders")
          .insert(payload as never)
          .select()
          .single();
        if (!error) return data;
        const isDupOrderNumber =
          error.code === "23505" && /order_number/i.test(error.message || "");
        if (isDupOrderNumber && attempt < 8) {
          if (attempt >= 3) codeLen = 10;
          continue;
        }
        throw mapStockError(error);
      }
    },

    async updateOrder(id: string, patch: Record<string, unknown>) {
      const next: Record<string, unknown> = { ...patch };
      if (patch.receipt_url && !patch.receipt_uploaded_at) {
        next.receipt_uploaded_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("orders")
        .update(next as never)
        .eq("id", id);
      if (error) throw mapStockError(error);
    },

    async reuploadReceipt(orderId: string, receiptUrl: string, oldReceiptUrl?: string | null) {
      const { error } = await supabase.rpc("marketer_reupload_receipt" as never, {
        _order_id: orderId,
        _receipt_url: receiptUrl,
      } as never);
      if (error) throw mapStockError(error);
      // Best-effort delete of the previous (rejected) receipt file.
      try {
        if (typeof oldReceiptUrl === "string" && oldReceiptUrl.startsWith("receipts:")) {
          const oldPath = oldReceiptUrl.slice("receipts:".length);
          if (oldPath && oldPath !== receiptUrl.replace(/^receipts:/, "")) {
            await supabase.storage.from("receipts").remove([oldPath]);
          }
        }
      } catch { /* ignore cleanup errors */ }
    },

    async uploadReceipt(file: File): Promise<string> {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("receipts")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      // Store an opaque marker; consumers resolve to a short-lived signed URL at read time.
      return `receipts:${path}`;
    },

    async resolveReceiptUrl(url: string | null | undefined): Promise<string> {
      if (!url) return "";
      if (typeof url !== "string") return "";
      if (!url.startsWith("receipts:")) return url; // legacy public URL
      const path = url.slice("receipts:".length);
      const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 60);
      if (error || !data?.signedUrl) return "";
      return data.signedUrl;
    },

    // Live "Active Marketers" count per product: distinct marketers with a
    // pending/approved (not yet delivered) order for that product. Shared by
    // the product breakdown view and the analytics section so both always
    // show the same, always-current number.
    async activeMarketersCounts(productIds: string[]): Promise<Record<string, number>> {
      if (!productIds.length) return {};
      const { data, error } = await supabase.rpc("active_marketers_counts" as never, {
        _product_ids: productIds,
      } as never);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const row of (data as { product_id: string; active_marketers: number }[]) || []) {
        out[row.product_id] = row.active_marketers;
      }
      return out;
    },

    // Minimal stubs for the caller's own pending orders (marketer_id,
    // product_id, created_at only). The "Businesses view orders" RLS policy
    // deliberately hides pending orders from the business (unverified
    // receipts), so this narrow RPC is how the business dashboard's "Active
    // marketers" figures can still count marketers who have a pending order,
    // matching the same live logic the marketer app uses, without exposing
    // full order/customer detail.
    async pendingActiveOrdersForBusiness(): Promise<
      { marketer_id: string; product_id: string; created_at: string }[]
    > {
      const { data, error } = await supabase.rpc("pending_active_orders_for_business" as never);
      if (error) throw error;
      return (data as { marketer_id: string; product_id: string; created_at: string }[]) || [];
    },

    async listMyOrders() {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .or(`marketer_id.eq.${userId},business_id.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<{ receipt_url?: string | null } & Record<string, unknown>>;
      // Resolve private receipt paths to short-lived signed URLs for the caller.
      await Promise.all(
        rows.map(async (r) => {
          if (typeof r.receipt_url === "string" && r.receipt_url.startsWith("receipts:")) {
            const path = r.receipt_url.slice("receipts:".length);
            const { data: s } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 60);
            r.receipt_url = s?.signedUrl ?? "";
          }
        }),
      );
      return rows;
    },

    async confirmOrder(id: string) {
      const { data, error } = await supabase.rpc("confirm_order", { _order_id: id });
      if (error) throw error;
      return data;
    },

    async markDelivered(id: string) {
      const { data, error } = await supabase.rpc("mark_delivered", { _order_id: id });
      if (error) throw error;
      return data;
    },

    async markFailed(id: string, note?: string | null) {
      const { data, error } = await supabase.rpc("mark_failed", { _order_id: id, _note: (note ?? null) as never });
      if (error) throw error;
      return data;
    },

    async getProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "full_name, business_name, phone, whatsapp, avatar_url, created_at, country, payout_method, payout_bank_name, payout_account_holder, payout_account_number, payout_iban, payout_swift, payout_notes, banned_at, frozen_at, require_additional_phone",
        )
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      let email: string | null = null;
      try {
        const { data: u } = await supabase.auth.getUser();
        if (u?.user?.id === userId) {
          email = u?.user?.email ?? null;
        } else {
          // Viewing someone else's profile (admin impersonation) — the auth
          // session still belongs to the admin, so fetch the real target
          // user's email instead of silently showing the admin's own.
          const { data: adminEmail } = await supabase.rpc("admin_get_user_email", { _user_id: userId });
          email = (adminEmail as string | null) ?? null;
        }
      } catch {
        /* ignore */
      }
      let avatarSignedUrl: string | null = null;
      const path = (data as { avatar_url?: string } | null)?.avatar_url;
      if (path) {
        try {
          const { data: s } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 7);
          avatarSignedUrl = s?.signedUrl ?? null;
        } catch {
          /* ignore */
        }
      }
      return { ...(data ?? {}), email, avatar_signed_url: avatarSignedUrl } as Record<string, unknown>;
    },

    async updateProfile(patch: Record<string, unknown>) {
      const { error } = await supabase
        .from("profiles")
        .update(patch as never)
        .eq("id", userId);
      if (error) throw error;
    },

    async setRequireAdditionalPhone(value: boolean) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ require_additional_phone: value } as never)
        .eq("id", userId);
      if (profileError) throw profileError;
      // Denormalized copy on every product owned by this business, so
      // products_marketer_view (security_invoker) can expose it to
      // marketers without needing to read this business's profiles row.
      const { error: productsError } = await supabase
        .from("products")
        .update({ require_additional_phone: value } as never)
        .eq("business_id", userId);
      if (productsError) throw productsError;
    },

    async uploadAvatar(file: File): Promise<string> {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type || "image/jpeg",
      });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: path } as never)
        .eq("id", userId);
      if (updErr) throw updErr;
      const { data: s } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 7);
      return s?.signedUrl ?? "";
    },

    async getWallet() {
      const { data, error } = await supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },

    async getPayoutState() {
      const { data, error } = await (supabase.rpc as any)("get_payout_state");
      if (error) throw error;
      return Array.isArray(data) ? (data[0] ?? null) : data;
    },

    async requestPayout(amount: number) {
      const { data, error } = await supabase.rpc("request_payout", { _amount: amount });
      if (error) throw error;
      return data;
    },

    async getLatestPayout() {
      const { data, error } = await supabase
        .from("payouts")
        .select("*")
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async getLastPaidPayout() {
      const { data, error } = await supabase
        .from("payouts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async listNotifications() {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },

    async markNotificationsRead() {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
    },

    subscribe(
      key:
        | "my-products"
        | "browse-products"
        | "favorites"
        | "orders"
        | "wallet"
        | "payouts"
        | "notifications"
        | "admin-wallets"
        | "admin-payouts",
      onChange: () => void,
    ) {
      const ch = supabase.channel(`lateen-${key}-${userId}-${crypto.randomUUID()}`);
      const filters: { table: string; filter?: string }[] = [];
      if (key === "my-products") filters.push({ table: "products", filter: `business_id=eq.${userId}` });
      if (key === "browse-products") filters.push({ table: "products" });
      if (key === "favorites") filters.push({ table: "favorites", filter: `marketer_id=eq.${userId}` });
      if (key === "orders") filters.push({ table: "orders" });
      if (key === "wallet") filters.push({ table: "wallets", filter: `user_id=eq.${userId}` });
      if (key === "payouts") filters.push({ table: "payouts", filter: `user_id=eq.${userId}` });
      if (key === "notifications") filters.push({ table: "notifications", filter: `user_id=eq.${userId}` });
      if (key === "admin-wallets") filters.push({ table: "wallets" });
      if (key === "admin-payouts") filters.push({ table: "payouts" });
      for (const f of filters) {
        (
          ch as unknown as {
            on: (
              ev: string,
              cfg: { event: string; schema: string; table: string; filter?: string },
              cb: () => void,
            ) => void;
          }
        ).on("postgres_changes", { event: "*", schema: "public", table: f.table, filter: f.filter }, () => onChange());
      }
      ch.subscribe();
      return () => {
        supabase.removeChannel(ch);
      };
    },

    admin: {
      async listPendingReceipts() {
        const { data: orders, error } = await supabase
          .from("orders")
          .select("*")
          .eq("status", "pending")
          .not("receipt_url", "is", null)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const list = (orders ?? []) as Array<
          Record<string, unknown> & { marketer_id: string; product_id: string; receipt_url?: string | null }
        >;
        // Resolve private receipt paths to short-lived signed URLs.
        await Promise.all(
          list.map(async (o) => {
            if (typeof o.receipt_url === "string" && o.receipt_url.startsWith("receipts:")) {
              const path = o.receipt_url.slice("receipts:".length);
              const { data: s } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 60);
              o.receipt_url = s?.signedUrl ?? "";
            }
          }),
        );
        const marketerIds = [...new Set(list.map((o) => o.marketer_id))];
        const productIds = [...new Set(list.map((o) => o.product_id))];
        const [{ data: profs }, { data: prods }] = await Promise.all([
          marketerIds.length
            ? supabase.from("profiles").select("id, full_name, phone").in("id", marketerIds)
            : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; phone: string | null }> }),
          productIds.length
            ? supabase.from("products").select("id, name, photos").in("id", productIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name: string; photos: string[] }> }),
        ]);
        let emap = new Map<string, string | null>();
        try {
          const { data: emailRows } = await supabase.rpc("admin_list_user_emails", {
            _user_ids: marketerIds,
          });
          emap = new Map(
            ((emailRows ?? []) as Array<{ id: string; email: string | null }>).map((r) => [r.id, r.email]),
          );
        } catch {
          /* ignore — email just won't be shown */
        }
        const pmap = new Map(
          (profs ?? []).map((p) => [p.id, { ...p, email: emap.get(p.id) ?? null }]),
        );
        const prodmap = new Map((prods ?? []).map((p) => [p.id, p]));
        return list.map((o) => ({
          ...o,
          marketer: pmap.get(o.marketer_id) ?? null,
          product: prodmap.get(o.product_id) ?? null,
        }));
      },
      async approveOrder(id: string) {
        const { error } = await supabase.rpc("admin_approve_order", { _order_id: id });
        if (error) throw error;
      },
      async rejectOrder(id: string, notes?: string) {
        const { error } = await supabase.rpc("admin_reject_order_with_notes", {
          _order_id: id,
          _notes: (notes ?? "") as string,
        });
        if (error) throw error;
      },
      // Marks an already-approved order as refunded. Does not touch status,
      // wallets, or stock — it only stamps refunded_at, which getMetrics()
      // uses to stop counting that order's platform fee from that point on.
      async refundOrder(id: string) {
        const { error } = await supabase.rpc("admin_refund_order", { _order_id: id });
        if (error) throw error;
      },
      // Receipts the admin has already reviewed (approved or rejected).
      // Mirrors listPendingReceipts's enrichment (signed URLs + marketer/product
      // join) but filtered to reviewed orders and sorted by review time.
      async listReceiptHistory() {
        const { data: orders, error } = await supabase
          .from("orders")
          .select("*")
          .in("status", ["approved", "rejected"])
          .not("receipt_url", "is", null)
          .order("reviewed_at", { ascending: false });
        if (error) throw error;
        const list = (orders ?? []) as Array<
          Record<string, unknown> & { marketer_id: string; product_id: string; receipt_url?: string | null }
        >;
        await Promise.all(
          list.map(async (o) => {
            if (typeof o.receipt_url === "string" && o.receipt_url.startsWith("receipts:")) {
              const path = o.receipt_url.slice("receipts:".length);
              const { data: s } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 60);
              o.receipt_url = s?.signedUrl ?? "";
            }
          }),
        );
        const marketerIds = [...new Set(list.map((o) => o.marketer_id))];
        const productIds = [...new Set(list.map((o) => o.product_id))];
        const [{ data: profs }, { data: prods }] = await Promise.all([
          marketerIds.length
            ? supabase.from("profiles").select("id, full_name, phone").in("id", marketerIds)
            : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; phone: string | null }> }),
          productIds.length
            ? supabase.from("products").select("id, name, photos").in("id", productIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name: string; photos: string[] }> }),
        ]);
        let emap = new Map<string, string | null>();
        try {
          const { data: emailRows } = await supabase.rpc("admin_list_user_emails", {
            _user_ids: marketerIds,
          });
          emap = new Map(
            ((emailRows ?? []) as Array<{ id: string; email: string | null }>).map((r) => [r.id, r.email]),
          );
        } catch {
          /* ignore — email just won't be shown */
        }
        const pmap = new Map(
          (profs ?? []).map((p) => [p.id, { ...p, email: emap.get(p.id) ?? null }]),
        );
        const prodmap = new Map((prods ?? []).map((p) => [p.id, p]));
        return list.map((o) => ({
          ...o,
          marketer: pmap.get(o.marketer_id) ?? null,
          product: prodmap.get(o.product_id) ?? null,
        }));
      },
      async listPayoutRequests() {
        const { data, error } = await supabase
          .from("payouts")
          .select("*")
          .eq("status", "requested")
          .order("requested_at", { ascending: false });
        if (error) throw error;
        const rows = (data ?? []) as Array<Record<string, unknown> & { user_id: string }>;
        const ids = [...new Set(rows.map((r) => r.user_id))];
        const { data: profs } = ids.length
          ? await supabase
              .from("profiles")
              .select(
                "id, full_name, phone, business_name, payout_method, payout_bank_name, payout_account_holder, payout_account_number, payout_iban, payout_swift, payout_notes",
              )
              .in("id", ids)
          : { data: [] as Array<Record<string, unknown> & { id: string }> };
        const { data: wallets } = ids.length
          ? await supabase.from("wallets").select("user_id, balance, pending, currency").in("user_id", ids)
          : { data: [] as Array<Record<string, unknown> & { user_id: string }> };
        const m = new Map((profs ?? []).map((p) => [p.id as string, p]));
        const w = new Map((wallets ?? []).map((row) => [row.user_id as string, row]));
        return rows.map((r) => ({ ...r, user: m.get(r.user_id) ?? null, wallet: w.get(r.user_id) ?? null }));
      },
      async markPayoutPaid(id: string) {
        const { error } = await supabase.rpc("admin_mark_payout_paid", { _payout_id: id });
        if (error) throw error;
      },
      async notePayout(id: string, note: string) {
        const { error } = await supabase.rpc("admin_note_payout", { _payout_id: id, _note: note });
        if (error) throw error;
      },
      async listAllUsers(search?: string) {
        let q = supabase.from("profiles").select("id, full_name, phone, business_name, created_at, banned_at, frozen_at");
        if (search && search.trim()) {
          const s = `%${search.trim()}%`;
          q = q.or(`full_name.ilike.${s},phone.ilike.${s},business_name.ilike.${s}`);
        }
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) throw error;
        const profiles = (data ?? []) as Array<{
          id: string;
          full_name: string | null;
          phone: string | null;
          business_name: string | null;
          created_at: string;
          banned_at: string | null;
          frozen_at: string | null;
        }>;
        if (!profiles.length) return [];
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in(
            "user_id",
            profiles.map((p) => p.id),
          );
        const rmap = new Map((roles ?? []).map((r: { user_id: string; role: string }) => [r.user_id, r.role]));
        let emap = new Map<string, string | null>();
        try {
          const { data: emailRows } = await supabase.rpc("admin_list_user_emails", {
            _user_ids: profiles.map((p) => p.id),
          });
          emap = new Map(
            ((emailRows ?? []) as Array<{ id: string; email: string | null }>).map((r) => [r.id, r.email]),
          );
        } catch {
          /* ignore — email column just won't be shown */
        }
        return profiles.map((p) => ({ ...p, role: rmap.get(p.id) ?? "marketer", email: emap.get(p.id) ?? null }));
      },
      async deleteUser(userId: string) {
        const { adminDeleteUserFn } = await import("./admin-users.functions");
        await adminDeleteUserFn({ data: { userId } });
      },
      async banUser(userId: string) {
        const { error } = await supabase.rpc("admin_set_user_banned", { _user_id: userId, _banned: true });
        if (error) throw error;
      },
      async unbanUser(userId: string) {
        const { error } = await supabase.rpc("admin_set_user_banned", { _user_id: userId, _banned: false });
        if (error) throw error;
      },
      async freezeUser(userId: string) {
        const { error } = await supabase.rpc("admin_set_user_frozen", { _user_id: userId, _frozen: true });
        if (error) throw error;
      },
      async unfreezeUser(userId: string) {
        const { error } = await supabase.rpc("admin_set_user_frozen", { _user_id: userId, _frozen: false });
        if (error) throw error;
      },
      async listAllProducts(search?: string) {
        const term = search && search.trim();
        let q = supabase.from("products").select("*").is("deleted_at", null);
        if (term) {
          const s = `%${term}%`;
          const filters = [`name.ilike.${s}`, `code.ilike.${s}`, `biz_name.ilike.${s}`];
          // products.biz_name is only a snapshot taken when the product was
          // saved — it can be missing or out of date if the shop renamed
          // itself since. Also match against the owner's *current* profile
          // name so searching by today's shop name always works.
          const { data: owners } = await supabase
            .from("profiles")
            .select("id")
            .or(`business_name.ilike.${s},full_name.ilike.${s}`);
          const ownerIds = (owners ?? []).map((o) => o.id).filter(Boolean);
          if (ownerIds.length) filters.push(`business_id.in.(${ownerIds.join(",")})`);
          q = q.or(filters.join(","));
        }
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      },
      async setProductStatus(id: string, status: "active" | "hidden") {
        const { error } = await supabase.rpc("admin_set_product_status", { _product_id: id, _status: status });
        if (error) throw error;
      },
      async deleteProduct(id: string) {
        // Soft delete, same as a business owner deleting their own product —
        // keeps historical orders/favorites intact, just removes it from
        // every listing (admin's Product Review list already filters on
        // deleted_at IS NULL). Relies on the "Admins update all products"
        // RLS policy.
        const { error } = await supabase
          .from("products")
          .update({ deleted_at: new Date().toISOString(), status: "paused" })
          .eq("id", id);
        if (error) throw error;
      },
      async getProductDetail(id: string) {
        const { data: product, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!product) return null;
        const { data: owner } = await supabase
          .from("profiles")
          .select("id, full_name, business_name, phone, created_at")
          .eq("id", (product as { business_id: string }).business_id)
          .maybeSingle();
        let ownerEmail: string | null = null;
        if (owner) {
          try {
            const { data: emailRows } = await supabase.rpc("admin_list_user_emails", {
              _user_ids: [(owner as { id: string }).id],
            });
            ownerEmail = ((emailRows ?? []) as Array<{ id: string; email: string | null }>)[0]?.email ?? null;
          } catch {
            /* ignore — email just won't be shown */
          }
        }
        return { product, owner: owner ? { ...owner, email: ownerEmail } : owner };
      },
      async listEmployees(search?: string) {
        let q = supabase.from("employees").select("*");
        if (search && search.trim()) {
          const s = `%${search.trim()}%`;
          q = q.or(`full_name.ilike.${s},employee_number.ilike.${s},job_title.ilike.${s},email.ilike.${s}`);
        }
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) throw error;
        const emps = (data ?? []) as Array<Record<string, unknown> & { id: string }>;
        if (!emps.length) return [];
        const { data: pays } = await supabase
          .from("employee_payments")
          .select("*")
          .in(
            "employee_id",
            emps.map((e) => e.id),
          )
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false });
        const map = new Map<string, Array<Record<string, unknown>>>();
        for (const p of (pays ?? []) as Array<Record<string, unknown> & { employee_id: string }>) {
          const arr = map.get(p.employee_id) ?? [];
          arr.push(p);
          map.set(p.employee_id, arr);
        }
        return emps.map((e) => ({ ...e, payments: map.get(e.id) ?? [] }));
      },
      async upsertEmployee(input: {
        id?: string;
        employee_number: string;
        full_name: string;
        job_title?: string | null;
        email?: string | null;
        monthly_salary: number;
        hired_at: string;
        notes?: string | null;
      }) {
        const { data, error } = await supabase
          .from("employees")
          .upsert(input as never)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      async deleteEmployee(id: string) {
        const { error } = await supabase.from("employees").delete().eq("id", id);
        if (error) throw error;
      },
      async payEmployee(input: {
        employee_id: string;
        period_year: number;
        period_month: number;
        amount: number;
        notes?: string | null;
      }) {
        const { data, error } = await supabase
          .from("employee_payments")
          .insert(input as never)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      async getMetrics() {
        const [ordersRes, profilesRes, productsRes] = await Promise.all([
          supabase
            .from("orders")
            .select(
              "qty, platform_fee, status, marketer_id, business_id, created_at, confirmed_at, reviewed_at, refunded_at",
            ),
          supabase.from("profiles").select("id, created_at"),
          supabase.from("products").select("id, created_at").is("deleted_at", null),
        ]);

        const feeEligibleStatuses = new Set(["approved", "confirmed", "delivered", "cancelled"]);
        const orders = (ordersRes.data ?? []) as Array<{
          qty: number;
          platform_fee: number;
          status: string;
          marketer_id: string;
          business_id: string;
          created_at: string;
          confirmed_at: string | null;
          reviewed_at: string | null;
          refunded_at: string | null;
        }>;
        const profiles = (profilesRes.data ?? []) as Array<{ id: string; created_at: string }>;
        const products = (productsRes.data ?? []) as Array<{ id: string; created_at: string }>;

        // A refunded order's platform fee is no longer counted as revenue,
        // even though the order itself keeps whatever status it already had
        // (approved orders stay "approved" everywhere else in the app).
        const feeEligible = (o: { status: string; refunded_at: string | null }) =>
          feeEligibleStatuses.has(o.status) && !o.refunded_at;

        const totalFees = orders.reduce(
          (sum, o) => (feeEligible(o) ? sum + Number(o.platform_fee || 0) * Number(o.qty || 0) : sum),
          0,
        );
        // "Pieces Sold" = units on orders that actually reached the confirmed stage (or later).
        const piecesSold = orders.reduce((sum, o) => (o.confirmed_at ? sum + Number(o.qty || 0) : sum), 0);
        // "Succeeded Upfronts" = orders whose payment receipt was approved by an admin
        // (reviewed_at is only ever set by admin_approve_order), regardless of what
        // happened to the order afterward.
        const succeededUpfronts = orders.filter((o) => !!o.reviewed_at).length;

        const monthAgo = Date.now() - 30 * 86400000;
        const activeUsers = new Set<string>();
        for (const o of orders) {
          if (new Date(o.created_at).getTime() >= monthAgo) {
            activeUsers.add(o.marketer_id);
            activeUsers.add(o.business_id);
          }
        }

        return {
          totalFees,
          activeUsers: activeUsers.size,
          totalUsers: profiles.length,
          totalProducts: products.length,
          piecesSold,
          succeededUpfronts,
          // Raw, lightweight rows so the Home dashboard can compute accurate
          // historical breakdowns for every date filter (day / month / year /
          // all-time) client-side, without extra round-trips per filter click.
          orders: orders.map((o) => ({
            qty: Number(o.qty || 0),
            fee: feeEligible(o) ? Number(o.platform_fee || 0) * Number(o.qty || 0) : 0,
            marketer_id: o.marketer_id,
            business_id: o.business_id,
            created_at: o.created_at,
            confirmed_at: o.confirmed_at,
            reviewed_at: o.reviewed_at,
          })),
          profiles: profiles.map((p) => ({ created_at: p.created_at })),
          products: products.map((p) => ({ created_at: p.created_at })),
        };
      },
    },
  };
}
