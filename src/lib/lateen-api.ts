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
      size?: string;
      color?: string;
    }) {
      const { data, error } = await supabase
        .from("orders")
        .insert({ ...input, marketer_id: userId } as never)
        .select()
        .single();
      if (error) throw error;
      return data;
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
      const { error } = await supabase
        .from("payouts")
        .insert({ user_id: userId, amount });
      if (error) throw error;
    },

    subscribe(
      key: "my-products" | "browse-products" | "favorites" | "orders" | "wallet",
      onChange: () => void,
    ) {
      const ch = supabase.channel(`lateen-${key}-${userId}-${crypto.randomUUID()}`);
      const filters: { table: string; filter?: string }[] = [];
      if (key === "my-products") filters.push({ table: "products", filter: `business_id=eq.${userId}` });
      if (key === "browse-products") filters.push({ table: "products" });
      if (key === "favorites") filters.push({ table: "favorites", filter: `marketer_id=eq.${userId}` });
      if (key === "orders") filters.push({ table: "orders" });
      if (key === "wallet") filters.push({ table: "wallets", filter: `user_id=eq.${userId}` });
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
  };
}
