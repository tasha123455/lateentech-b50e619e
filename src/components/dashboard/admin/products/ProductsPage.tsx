import { useEffect, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { Money } from "../ui/Money";
import { ProductDetailOverlay } from "./ProductDetailOverlay";

const EyeOpen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a21.77 21.77 0 015.06-6.06M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a21.77 21.77 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

/** Warns when hiding/deleting a product that marketers are mid-order on. */
function activeMarketerWarning(n: number, action: string): string {
  const label = n + " active marketer" + (n === 1 ? "" : "s");
  return (
    "Heads-up: this product currently has " + label + " with an in-progress order.\n\n" +
    "It will be " + action + " immediately for every other marketer, but those " +
    label.replace(/^\d+\s/, "") + " keep seeing it until their orders complete — then it disappears for them automatically.\n\nContinue?"
  );
}

export function ProductsPage({ active }: { active: boolean }) {
  const { products, loadProducts, loading, failed, api } = useAdminData();
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  // Search is debounced server-side, exactly like the original 250ms timer.
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => { void loadProducts(search); }, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [active, search, loadProducts]);

  const activeMarketers = async (id: string): Promise<number> => {
    try {
      return await api.admin.activeMarketersCount(id);
    } catch (e) {
      console.error("[admin] active marketers", e);
      return 0;
    }
  };

  const toggleProduct = async (id: string, newStatus: "active" | "hidden") => {
    try {
      if (newStatus === "hidden") {
        const n = await activeMarketers(id);
        if (n > 0 && !confirm(activeMarketerWarning(n, "hidden"))) return;
      }
      await api.admin.setProductStatus(id, newStatus);
      void loadProducts(search);
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  const deleteProduct = async (id: string, name: string) => {
    if (!confirm('Permanently delete "' + name + '"?\n\nIt will disappear from marketer browsing and saved products right away. This cannot be undone.')) return;
    try {
      const n = await activeMarketers(id);
      if (n > 0 && !confirm(activeMarketerWarning(n, "deleted"))) return;
      await api.admin.deleteProduct(id);
      setDetailId(null);
      void loadProducts(search);
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  let body: React.ReactNode;
  if (loading.products) {
    body = <div className="adm-empty" style={{ gridColumn: "1/-1" }}>Loading…</div>;
  } else if (failed.products) {
    body = <div className="adm-empty" style={{ gridColumn: "1/-1" }}>Failed to load.</div>;
  } else if (!products.length) {
    body = (
      <div className="adm-empty" style={{ gridColumn: "1/-1" }}>
        {search ? "No products match your search." : "No products yet."}
      </div>
    );
  } else {
    body = products.map((p) => {
      const photo = Array.isArray(p.photos) && p.photos[0];
      const isHidden = p.status === "hidden";
      return (
        <div className="c" key={p.id} onClick={() => setDetailId(p.id)}>
          <div className="ci2">
            {photo ? (
              <img
                src={photo}
                alt={p.name}
                data-no-i18n
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
              />
            ) : (
              "📦"
            )}
            {isHidden && <span className="adm-status-pill">Hidden</span>}
            <div
              className="adm-prod-del-ov"
              title="Delete"
              onClick={(e) => { e.stopPropagation(); void deleteProduct(p.id, p.name); }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </div>
            <div
              className="adm-prod-hide-ov"
              onClick={(e) => { e.stopPropagation(); void toggleProduct(p.id, isHidden ? "active" : "hidden"); }}
            >
              <div className={"adm-prod-hide-circle" + (isHidden ? " on" : "")}>
                {isHidden ? <EyeOpen /> : <EyeOff />}
              </div>
              <span>{isHidden ? "Unhide" : "Hide"}</span>
            </div>
          </div>
          <div className="cb2">
            <div className="cn" data-no-i18n>{p.name}</div>
            <div className="cr">
              <div className="cpr"><Money n={p.price} /></div>
              <div className="cco">{Number(p.comm_pct || 0)}%</div>
            </div>
          </div>
        </div>
      );
    });
  }

  return (
    <>
      <div className="adm-h1-row">
        <div className="adm-h1" style={{ marginBottom: 0 }}>Product Review</div>
      </div>

      <input
        className="adm-search"
        placeholder="Search by name, code, shop…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="adm-prod-grid">{body}</div>

      <ProductDetailOverlay productId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}
