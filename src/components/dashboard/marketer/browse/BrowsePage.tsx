import { useMemo, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { CATEGORY_DATA } from "../lib/constants";
import { isAr } from "../lib/format";
import { productHasStock } from "../lib/mappers";
import type { BrowseProduct } from "../lib/types";
import { BrowseFilters } from "./BrowseFilters";
import { ProductCard } from "./ProductCard";
import { applyBrowseFilters, browseFiltersIdle, EMPTY_BROWSE_FILTERS, type BrowseFilterState } from "./browseFilter";

export function BrowsePage({
  onOpenProduct, onOpenSoon,
}: {
  onOpenProduct: (id: string) => void;
  onOpenSoon: () => void;
}) {
  const { products, toggleFavorite } = useMarketerData();

  const [state, setState] = useState<BrowseFilterState>(EMPTY_BROWSE_FILTERS);

  const ar = isAr();

  const list = useMemo(() => applyBrowseFilters(products, state), [products, state]);

  /* "Recommended for you": unsaved, in-stock products sharing a category with
     something the marketer already saved. Hidden while any filter is active. */
  const recommended = useMemo(() => {
    if (!browseFiltersIdle(state)) return [];
    const saved = products.filter((p) => p.sv);
    if (!saved.length) return [];
    const cats = new Set<string>();
    saved.forEach((p) => {
      if (!p.cat) return;
      cats.add(p.cat);
      const sec = CATEGORY_DATA.find((s) => s.items.includes(p.cat));
      if (sec) sec.items.forEach((it) => cats.add(it));
    });
    return products.filter((p) => !p.sv && productHasStock(p) && cats.has(p.cat)).slice(0, 4);
  }, [products, state]);

  const card = (p: BrowseProduct) => (
    <ProductCard key={p.id} p={p} onOpen={onOpenProduct} onToggleSave={(id) => void toggleFavorite(id)} />
  );

  return (
    <>
      <div className="pt">Browse products</div>

      <BrowseFilters
        products={products}
        state={state}
        onChange={setState}
        trailing={
          <div className="cbtn cbtn-disabled" onClick={onOpenSoon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.8" strokeLinecap="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
        }
      />

      {recommended.length > 0 && (
        <div>
          <div className="sl">
            <div className="sd" />
            Recommended for you
          </div>
          <div className="g">{recommended.map(card)}</div>
          <div className="divider" />
          <div className="sl" style={{ marginBottom: 10 }}>All products</div>
        </div>
      )}

      <div className="g">
        {list.length ? (
          list.map(card)
        ) : (
          <div className="em" data-no-i18n>
            {ar ? "لا توجد منتجات مطابقة لبحثك" : "No products match your search."}
          </div>
        )}
      </div>

    </>
  );
}
