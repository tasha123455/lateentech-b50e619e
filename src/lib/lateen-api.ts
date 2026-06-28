// Bridge between the embedded vanilla-JS dashboard scripts and Supabase.
// Installed onto window.LateenAPI by LateenShell so the scripts can call
// real backend operations instead of mutating in-memory arrays.
import { supabase } from "@/integrations/supabase/client";

export type LateenProduct = {
  id: string;
  business_id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  qty: number;
  currency: { code: string; name: string; symbol: string; flag: string } | null;
  comm_pct: number;
  comm_fixed: number;
  comm_mode: string;
  platform_fee: number;
  total_fee_per_unit: number;
  variant_groups: { name: string; items: string[] }[];
  sizes: string[];
  colors: string[];
  delivery: Record<string, { cities: Record<string, { shipping: number; delivery: number }> }>;
  photos: string[];
  status: "active" | "paused";
  sold: number;
  revenue: number;
  biz_name: string | null;
  biz_phone: string | null;
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
        status: p.status ?? "active",
        biz_name: p.biz_name ?? null,
        biz_phone: p.biz_phone ?? null,
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
      const { error } = await supabase
        .from("products")
        .update({ status })
        .eq("id", id);
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
        .from("products")
        .select("*")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LateenProduct[];
    },

    async listFavorites(): Promise<LateenProduct[]> {
      const { data, error } = await supabase
        .from("favorites")
        .select("product:products(*)")
        .eq("marketer_id", userId);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { product: LateenProduct | null }[];
      return rows
        .map((r) => r.product)
        .filter((p): p is LateenProduct =>
          !!p && p.status === "active" && !p.deleted_at,
        );
    },

    async listFavoriteIds(): Promise<Set<string>> {
      const { data, error } = await supabase
        .from("favorites")
        .select("product_id")
        .eq("marketer_id", userId);
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
      const { error } = await supabase
        .from("favorites")
        .insert({ marketer_id: userId, product_id: productId });
      if (error && error.code !== "23505") throw error;
    },

    async removeFavorite(productId: string) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("marketer_id", userId)
        .eq("product_id", productId);
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
      const { data, error } = await supabase
        .from("orders")
        .insert(payload as never)
        .select()
        .single();
      if (error) throw error;
      return data;
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
      if (error) throw error;
    },

    async uploadReceipt(file: File): Promise<string> {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/receipts/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-photos")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
      return data.publicUrl;
    },

    async listMyOrders() {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .or(`marketer_id.eq.${userId},business_id.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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

    async markFailed(id: string) {
      const { data, error } = await supabase.rpc("mark_failed", { _order_id: id });
      if (error) throw error;
      return data;
    },

    async getProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, business_name, phone, created_at, payout_method, payout_bank_name, payout_account_holder, payout_account_number, payout_iban, payout_swift, payout_notes")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async updateProfile(patch: Record<string, unknown>) {
      const { error } = await supabase
        .from("profiles")
        .update(patch as never)
        .eq("id", userId);
      if (error) throw error;
    },

    async getWallet() {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async requestPayout(amount: number) {
      const { data: existing, error: existingError } = await supabase
        .from("payouts")
        .select("id,status")
        .eq("user_id", userId)
        .eq("status", "requested")
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.id) return existing;
      const { data, error } = await supabase
        .from("payouts")
        .insert({ user_id: userId, amount })
        .select("*")
        .single();
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
      key: "my-products" | "browse-products" | "favorites" | "orders" | "wallet" | "payouts" | "notifications",
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
      for (const f of filters) {
        (ch as unknown as {
          on: (
            ev: string,
            cfg: { event: string; schema: string; table: string; filter?: string },
            cb: () => void,
          ) => void;
        }).on(
          "postgres_changes",
          { event: "*", schema: "public", table: f.table, filter: f.filter },
          () => onChange(),
        );
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
        const list = (orders ?? []) as Array<Record<string, unknown> & { marketer_id: string; product_id: string }>;
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
        const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
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
        const { error } = await supabase.rpc("admin_reject_order_with_notes", { _order_id: id, _notes: (notes ?? "") as string });
        if (error) throw error;
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
          ? await supabase.from("profiles").select("id, full_name, phone, business_name, payout_method, payout_bank_name, payout_account_holder, payout_account_number, payout_iban, payout_swift, payout_notes").in("id", ids)
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
        let q = supabase
          .from("profiles")
          .select("id, full_name, phone, business_name, created_at");
        if (search && search.trim()) {
          const s = `%${search.trim()}%`;
          q = q.or(`full_name.ilike.${s},phone.ilike.${s},business_name.ilike.${s}`);
        }
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) throw error;
        const profiles = (data ?? []) as Array<{ id: string; full_name: string | null; phone: string | null; business_name: string | null; created_at: string }>;
        if (!profiles.length) return [];
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", profiles.map((p) => p.id));
        const rmap = new Map((roles ?? []).map((r: { user_id: string; role: string }) => [r.user_id, r.role]));
        return profiles.map((p) => ({ ...p, role: rmap.get(p.id) ?? "marketer" }));
      },
      async deleteUser(userId: string) {
        const { adminDeleteUserFn } = await import("./admin-users.functions");
        await adminDeleteUserFn({ data: { userId } });
      },
      async banUser(userId: string, reason?: string | null) {
        const { adminBanUserFn } = await import("./admin-users.functions");
        await adminBanUserFn({ data: { userId, reason: reason ?? null } });
      },
      async listAllProducts() {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      },
      async setProductStatus(id: string, status: "active" | "hidden") {
        const { error } = await supabase.rpc("admin_set_product_status", { _product_id: id, _status: status });
        if (error) throw error;
      },
      async getProductDetail(id: string) {
        const { data: product, error } = await supabase
          .from("products")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!product) return null;
        const { data: owner } = await supabase
          .from("profiles")
          .select("id, full_name, business_name, phone, created_at")
          .eq("id", (product as { business_id: string }).business_id)
          .maybeSingle();
        return { product, owner };
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
          .in("employee_id", emps.map((e) => e.id))
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
      async payEmployee(input: { employee_id: string; period_year: number; period_month: number; amount: number; notes?: string | null }) {
        const { data, error } = await supabase
          .from("employee_payments")
          .insert(input as never)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      async getMetrics() {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const yearStart = new Date(monthStart.getFullYear(), 0, 1);

        const [feesRes, todayRes, activeRes, profilesRes, productsRes] = await Promise.all([
          supabase.from("orders").select("platform_fee, qty, status, created_at").in("status", ["approved", "confirmed", "delivered", "cancelled"]),
          supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
          supabase.from("orders").select("marketer_id, business_id, created_at").gte("created_at", monthAgo),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("products").select("id", { count: "exact", head: true }).is("deleted_at", null),
        ]);

        const feeRows = (feesRes.data ?? []) as Array<{ platform_fee: number; qty: number; created_at: string }>;
        const calc = (rows: typeof feeRows) => rows.reduce((sum, r) => sum + Number(r.platform_fee || 0) * Number(r.qty || 0), 0);
        const fees = calc(feeRows);
        const monthMs = monthStart.getTime();
        const yearMs = yearStart.getTime();
        const feesThisMonth = calc(feeRows.filter((r) => new Date(r.created_at).getTime() >= monthMs));
        const feesThisYear = calc(feeRows.filter((r) => new Date(r.created_at).getTime() >= yearMs));
        const activeUsers = new Set<string>();
        for (const r of (activeRes.data ?? []) as Array<{ marketer_id: string; business_id: string }>) {
          activeUsers.add(r.marketer_id);
          activeUsers.add(r.business_id);
        }
        return {
          totalFees: fees,
          feesThisMonth,
          feesThisYear,
          feeRows: feeRows.map((r) => ({
            ts: new Date(r.created_at).getTime(),
            amount: Number(r.platform_fee || 0) * Number(r.qty || 0),
          })),
          activeUsers: activeUsers.size,
          leadsToday: todayRes.count ?? 0,
          totalUsers: profilesRes.count ?? 0,
          totalProducts: productsRes.count ?? 0,
        };
      },
    },
  };
}

