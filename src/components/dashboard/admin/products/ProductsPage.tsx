import { useEffect, useMemo, useState } from "react";

import { ProductCard } from "@/components/dashboard/marketer/browse/ProductCard";
import { dbToBrowse } from "@/components/dashboard/marketer/lib/mappers";

import { useAdminData } from "../AdminDataProvider";
import { ProductDetailOverlay } from "./ProductDetailOverlay";

/** Admins have no favourites, so nothing is ever saved. */
const NO_FAVOURITES: Set<string> = new Set();

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

  const detailProduct = detailId ? products.find((x) => x.id === detailId) : undefined;

  // listAllProducts does a `select("*")`, so the rows are exactly what the
  // marketer's browse grid maps — running them through the same mapper means
  // the tiles cannot drift apart from the marketer's.
  const cards = useMemo(
    () => products.map((p) => ({
      hidden: p.status === "hidden",
      bp: dbToBrowse(p as unknown as Record<string, unknown>, NO_FAVOURITES),
    })),
    [products],
  );

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
    body = cards.map(({ bp, hidden }) => (
      <ProductCard
        key={bp.id}
        p={bp}
        onOpen={setDetailId}
        pill={hidden ? <span className="adm-status-pill">Hidden</span> : null}
      />
    ));
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

      <ProductDetailOverlay
        productId={detailId}
        onClose={() => setDetailId(null)}
        hidden={detailProduct?.status === "hidden"}
        onToggleHidden={(id, next) => void toggleProduct(id, next)}
        onDelete={(id, name) => void deleteProduct(id, name)}
      />
    </>
  );
}
