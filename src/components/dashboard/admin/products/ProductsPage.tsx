import { useEffect, useMemo, useState } from "react";

import { BrowseFilters } from "@/components/dashboard/marketer/browse/BrowseFilters";
import { ProductCard } from "@/components/dashboard/marketer/browse/ProductCard";
import {
  applyBrowseFilters, EMPTY_BROWSE_FILTERS, type BrowseFilterState,
} from "@/components/dashboard/marketer/browse/browseFilter";
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
  const [state, setState] = useState<BrowseFilterState>(EMPTY_BROWSE_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);
  /* Products the *server* matched for the current term. The client-side filter
     below cannot see the owner's current profile name — only the biz_name
     snapshot stored on the row — so searching by a shop that has since renamed
     itself still needs the server. These ids widen the client result. */
  const [serverHits, setServerHits] = useState<Set<string> | null>(null);

  const query = state.query;

  // The whole catalogue, newest first, loaded once. Filtering happens in the
  // browser from here on, the way the marketer's browse page does it.
  useEffect(() => {
    if (active) void loadProducts("");
  }, [active, loadProducts]);

  useEffect(() => {
    if (!active || !query.trim()) { setServerHits(null); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const rows = (await api.admin.listAllProducts(query)) as Array<{ id: string }>;
        if (!cancelled) setServerHits(new Set(rows.map((r) => r.id)));
      } catch (e) {
        console.error("[admin] product search", e);
        if (!cancelled) setServerHits(null);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [active, query, api]);

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
      void loadProducts("");
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
      void loadProducts("");
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  const detailProduct = detailId ? products.find((x) => x.id === detailId) : undefined;

  /* listAllProducts does a `select("*")`, so the rows are exactly what the
     marketer's browse grid maps — running them through the same mapper means
     the tiles cannot drift apart from the marketer's. Newest first, so the
     oldest products sit at the bottom; a sort picked in the Filters sheet
     overrides it, same as for marketers. */
  const all = useMemo(() => {
    const rows = products.map((p) => p as unknown as Record<string, unknown>);
    rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return rows.map((r) => {
      const bp = dbToBrowse(r, NO_FAVOURITES);
      return {
        hidden: r.status === "hidden",
        paused: r.status === "paused",
        // dbToBrowse already nets off reserved stock and takes the smallest
        // variant group, so this is the same count the tile would sell from.
        outOfStock: bp.q <= 0,
        shop: String(r.biz_name || ""),
        bp,
      };
    });
  }, [products]);

  const shown = useMemo(() => {
    const byId = new Map(all.map((c) => [c.bp.id, c]));
    // requireStock off: an admin has to see out-of-stock and hidden products in
    // order to act on them.
    return applyBrowseFilters(all.map((c) => c.bp), state, {
      requireStock: false,
      extraText: (p) => byId.get(p.id)?.shop || "",
      alsoMatchesQuery: (p) => !!serverHits?.has(p.id),
    }).map((p) => byId.get(p.id)!);
  }, [all, state, serverHits]);

  let body: React.ReactNode;
  if (loading.products) {
    body = <div className="adm-empty" style={{ gridColumn: "1/-1" }}>Loading…</div>;
  } else if (failed.products) {
    body = <div className="adm-empty" style={{ gridColumn: "1/-1" }}>Failed to load.</div>;
  } else if (!shown.length) {
    body = (
      <div className="adm-empty" style={{ gridColumn: "1/-1" }}>
        {products.length ? "No products match your search." : "No products yet."}
      </div>
    );
  } else {
    /* Marketers never see a hidden, paused or out-of-stock product, so the
       browse tile has nothing to say about them. The admin is the one place
       they all have to surface, and where more than one applies they all show. */
    body = shown.map(({ bp, hidden, paused, outOfStock }) => (
      <ProductCard
        key={bp.id}
        p={bp}
        onOpen={setDetailId}
        pill={
          hidden || paused || outOfStock ? (
            <div className="adm-pill-stack">
              {hidden && <span className="adm-status-pill">Hidden</span>}
              {paused && <span className="adm-status-pill paused">Paused</span>}
              {outOfStock && <span className="adm-status-pill oos">Out of stock</span>}
            </div>
          ) : null
        }
      />
    ));
  }

  return (
    <>
      <div className="adm-h1-row">
        <div className="adm-h1" style={{ marginBottom: 0 }}>Product Review</div>
      </div>

      <BrowseFilters
        products={all.map((c) => c.bp)}
        state={state}
        onChange={setState}
        placeholder="Search by name, code, shop…"
      />

      <div className="adm-prod-grid">{body}</div>

      <ProductDetailOverlay
        productId={detailId}
        onClose={() => setDetailId(null)}
        status={detailProduct?.status}
        onToggleHidden={(id, next) => void toggleProduct(id, next)}
        onDelete={(id, name) => void deleteProduct(id, name)}
      />
    </>
  );
}
