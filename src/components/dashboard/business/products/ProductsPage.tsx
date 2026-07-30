import { useEffect, useMemo, useState } from "react";
import { useBusinessData } from "../BusinessDataProvider";
import { catSearchText, zoneSearchText } from "../lib/constants";
import { isAr, normSearch } from "../lib/format";
import type { Product } from "../lib/types";
import { ProductCard } from "./ProductCard";
import { activeMarketerCount, effectiveQty, LOW_STOCK_THRESHOLD } from "./productHelpers";

type FilterKey = "all" | "active" | "paused" | "lowstock" | "outofstock";

type ReviewEntry = { author: string; rating: number; text: string; photo: string; avatar: string };

function InfoModal({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#1a2030", borderRadius: 16, padding: 18, width: "100%", maxWidth: 380, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#c7ccd6", lineHeight: 1.6 }}>{body}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{ background: "#34c77b", color: "#0f1420", border: 0, borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            {isAr() ? "حسناً" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ body, onCancel, onConfirm }: { body: string; onCancel: () => void; onConfirm: () => void }) {
  const ar = isAr();
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: "#1a2030", borderRadius: 16, padding: 18, width: "100%", maxWidth: 380, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 13, color: "#c7ccd6", lineHeight: 1.6 }}>{body}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button
            onClick={onCancel}
            style={{ background: "transparent", color: "#c7ccd6", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            {ar ? "إلغاء" : "Cancel"}
          </button>
          <button
            onClick={onConfirm}
            style={{ background: "#e24b4a", color: "#fff", border: 0, borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            {ar ? "حذف" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProductsPage({
  onAddProduct,
  onEditProduct,
  onOpenNotifications: _onOpenNotifications,
}: {
  onAddProduct: () => void;
  onEditProduct: (p: Product) => void;
  onOpenNotifications: () => void;
}) {
  const { products, orders, pendingActiveStubs, reviews, frozen, api, reloadProducts } = useBusinessData();
  const ar = isAr();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [pauseBlocked, setPauseBlocked] = useState(false);
  const [adminHidden, setAdminHidden] = useState(false);
  const [deleteBlockedMsg, setDeleteBlockedMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const h = () => { /* re-render on language change is handled by parent via context, no-op here */ };
    window.addEventListener("lateen-lang", h);
    return () => window.removeEventListener("lateen-lang", h);
  }, []);

  const reviewsByProduct = useMemo(() => {
    const map: Record<string, ReviewEntry[]> = {};
    (reviews || []).forEach((r) => {
      const entry: ReviewEntry = {
        author: r.author_name || "Marketer",
        rating: Number(r.rating) || 0,
        text: r.comment || "",
        photo: r.photo_url || "",
        avatar: "",
      };
      (map[r.product_id] = map[r.product_id] || []).push(entry);
    });
    return map;
  }, [reviews]);

  // Resolve avatar signed/public URLs for reviews lazily (avatar_path -> URL).
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paths = Array.from(new Set((reviews || []).map((r) => r.avatar_path).filter(Boolean))) as string[];
      const out: Record<string, string> = {};
      await Promise.all(paths.map(async (p) => {
        try { out[p] = await api.avatarPublicUrl(p); } catch { out[p] = ""; }
      }));
      if (!cancelled) setAvatarMap(out);
    })();
    return () => { cancelled = true; };
  }, [reviews, api]);

  const reviewsByProductResolved = useMemo(() => {
    const map: Record<string, ReviewEntry[]> = {};
    (reviews || []).forEach((r) => {
      const entry: ReviewEntry = {
        author: r.author_name || "Marketer",
        rating: Number(r.rating) || 0,
        text: r.comment || "",
        photo: r.photo_url || "",
        avatar: r.avatar_path ? avatarMap[r.avatar_path] || "" : "",
      };
      (map[r.product_id] = map[r.product_id] || []).push(entry);
    });
    return map;
  }, [reviews, avatarMap]);

  const counts = useMemo(() => {
    const c = { all: products.length, active: 0, paused: 0, lowstock: 0, outofstock: 0 };
    products.forEach((p) => {
      if (p.status === "active") c.active++;
      else c.paused++;
      const eq = effectiveQty(p);
      if (eq > 0 && eq <= LOW_STOCK_THRESHOLD) c.lowstock++;
      if (eq <= 0) c.outofstock++;
    });
    return c;
  }, [products]);

  const filteredList = useMemo(() => {
    let list = products;
    if (filter === "active") list = list.filter((p) => p.status === "active");
    else if (filter === "paused") list = list.filter((p) => p.status !== "active");
    else if (filter === "lowstock") list = list.filter((p) => { const eq = effectiveQty(p); return eq > 0 && eq <= LOW_STOCK_THRESHOLD; });
    else if (filter === "outofstock") list = list.filter((p) => effectiveQty(p) <= 0);

    const q = normSearch(search);
    if (q) {
      list = list.filter((p) =>
        normSearch(p.name).includes(q) ||
        normSearch(p.code || "").includes(q) ||
        catSearchText(p.category).includes(q) ||
        normSearch(p.desc || "").includes(q) ||
        zoneSearchText(p.delivery).includes(q),
      );
    }
    return list;
  }, [products, filter, search]);

  const chips: Array<{ key: FilterKey; label: string }> = [
    { key: "all", label: ar ? "الكل" : "All" },
    { key: "active", label: ar ? "نشط" : "Active" },
    { key: "paused", label: ar ? "متوقف" : "Paused" },
    { key: "lowstock", label: ar ? "كمية منخفضة" : "Low stock" },
    { key: "outofstock", label: ar ? "نفدت الكمية" : "Out of stock" },
  ];

  const handleEdit = (p: Product) => {
    if (frozen) { alert(ar ? "تم تجميد الحساب مؤقتاً" : "Account temporarily frozen"); return; }
    onEditProduct(p);
  };

  const handleToggleStatus = async (p: Product) => {
    if (p.status === "hidden") { setAdminHidden(true); return; }
    const next = p.status === "active" ? "paused" : "active";
    if (next === "paused") {
      const n = activeMarketerCount(p, orders, pendingActiveStubs);
      if (n > 0) {
        try { await api.requestPauseProduct(p.id); } catch (e) { console.error(e); }
        setPauseBlocked(true);
        return;
      }
    }
    try {
      await api.setStatus(p.id, next as "active" | "paused");
      await reloadProducts();
    } catch (e) {
      console.error(e);
      if (String((e as Error)?.message || "").indexOf("ADMIN_HIDDEN") >= 0) { setAdminHidden(true); return; }
      alert(ar ? "فشل تحديث الحالة" : "Failed to update status");
    }
  };

  const handleDelete = (p: Product) => {
    if (frozen) { alert(ar ? "تم تجميد الحساب مؤقتاً" : "Account temporarily frozen"); return; }
    const n = activeMarketerCount(p, orders, pendingActiveStubs);
    if (n > 0) {
      const label = ar
        ? (n === 1 ? "مسوّق نشط واحد" : n === 2 ? "مسوّقين نشطين" : `${n} مسوّقين نشطين`)
        : `${n} active marketer${n === 1 ? "" : "s"}`;
      setDeleteBlockedMsg(
        ar ? `لا يمكن حذف هذا المنتج — لديه ${label} حالياً. انتظر حتى تكتمل طلباتهم.` : `This product can't be deleted — it has ${label} right now. Wait until those orders complete.`,
      );
      return;
    }
    setConfirmDeleteId(p.id);
  };

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    if (!id) return;
    try {
      await api.deleteProduct(id);
      await reloadProducts();
    } catch (e) {
      console.error(e);
      alert(ar ? "فشل الحذف" : "Failed to delete");
    }
  };

  return (
    <div className="page active" id="pg-products">
      <div className="sub-header">
        <div>
          <div className="sub-title">{ar ? "منتجاتي" : "My products"}</div>
        </div>
        <button
          className="add-btn"
          id="add-product-btn"
          disabled={frozen}
          style={frozen ? { opacity: 0.45, pointerEvents: "none", cursor: "not-allowed" } : undefined}
          onClick={onAddProduct}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {ar ? "إضافة منتج" : "Add product"}
        </button>
      </div>

      <div className="mp-search-wrap">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <input
          id="products-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={ar ? "ابحث عن منتجات…" : "Search products…"}
        />
      </div>

      <div className="mp-filter-row" data-no-i18n="">
        {chips.map((c) => (
          <div
            key={c.key}
            className={"mp-filter-chip" + (filter === c.key ? " active" : "")}
            onClick={() => setFilter(c.key)}
          >
            {c.label}{filter === c.key ? ` (${counts[c.key] || 0})` : ""}
          </div>
        ))}
      </div>

      <div id="product-list">
        {!products.length ? (
          <div className="mp-empty-state">{ar ? "لا توجد منتجات بعد." : "No products yet."}</div>
        ) : !filteredList.length ? (
          <div className="mp-empty-state" data-no-i18n="">{ar ? "لا توجد منتجات مطابقة لبحثك" : "No products match your search."}</div>
        ) : (
          filteredList.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              orders={orders}
              pendingActiveStubs={pendingActiveStubs}
              reviews={reviewsByProductResolved[p.id] || []}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {pauseBlocked ? (
        <InfoModal
          title={ar ? "تعذر إيقاف المنتج مؤقتا" : "Unable to Pause Product"}
          body={ar ? "هذا المنتج فيه طلبات نشطة من المسوقين، أول ما تتصفى كل الطلبات تقدر توقف المنتج." : "This product has active marketer orders. You can pause it once all orders have been cleared."}
          onClose={() => setPauseBlocked(false)}
        />
      ) : null}
      {adminHidden ? (
        <InfoModal
          title={ar ? "المنتج مخفي من الإدارة" : "Hidden by the administrator"}
          body={ar ? "هذا المنتج تم إخفاؤه من قبل الإدارة، ولا يمكن إعادة تفعيله إلا من الإدارة." : "This product was hidden by an administrator. Only an administrator can make it active again."}
          onClose={() => setAdminHidden(false)}
        />
      ) : null}
      {deleteBlockedMsg ? (
        <InfoModal
          title={ar ? "تعذر الحذف" : "Unable to delete"}
          body={deleteBlockedMsg}
          onClose={() => setDeleteBlockedMsg(null)}
        />
      ) : null}
      {confirmDeleteId ? (
        <ConfirmModal
          body={ar ? "هل تريد حذف هذا المنتج؟ لن يظهر للمسوّقين بعد الآن." : "Delete this product? Marketers will no longer see it."}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}
