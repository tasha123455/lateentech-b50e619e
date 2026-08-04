import { useMemo, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { isAr } from "../lib/format";
import type { BrowseProduct } from "../lib/types";
import { BrowseFilters } from "./BrowseFilters";
import { ProductCard } from "./ProductCard";
import { applyBrowseFilters, browseFiltersIdle, EMPTY_BROWSE_FILTERS, type BrowseFilterState } from "./browseFilter";
import { recommendProducts } from "./recommend";

export function BrowsePage({
  onOpenProduct, onOpenSoon,
}: {
  onOpenProduct: (id: string) => void;
  onOpenSoon: () => void;
}) {
  const { products, orders, toggleFavorite } = useMarketerData();

  const [state, setState] = useState<BrowseFilterState>(EMPTY_BROWSE_FILTERS);

  const ar = isAr();

  const list = useMemo(() => applyBrowseFilters(products, state), [products, state]);

  /* Ranked on what this marketer has sold and saved, what it pays, what their
     customers spend, and what is still in stock — see recommend.ts. Hidden
     while a filter is active: they have told us what they are looking for, and
     a second opinion in the way is just noise. */
  const recommended = useMemo(
    () => (browseFiltersIdle(state) ? recommendProducts(products, orders) : { list: [], personal: false }),
    [products, orders, state],
  );

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

      {recommended.list.length > 0 && (
        <div>
          {/* Two headings, because with no orders and no saves the ranking
              falls back to what pays well and is in stock — a good list, but
              the same list for everyone, and not "for you". */}
          <div className="sl">
            <div className="sd" />
            {recommended.personal ? "Recommended for you" : "Good places to start"}
          </div>
          <div className="g">{recommended.list.map(card)}</div>
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
