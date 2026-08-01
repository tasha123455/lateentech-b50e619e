import { useMemo, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { isAr, searchMatcher } from "../lib/format";
import { catSearchText, productHasStock, zoneSearchText } from "../lib/mappers";
import { ProductCover } from "../browse/ProductCard";
import { pkT } from "../browse/pdText";
import { Money } from "../ui/Money";

export function SavedPage({ onOpenProduct }: { onOpenProduct: (id: string) => void }) {
  const { products, toggleFavorite } = useMarketerData();
  const [query, setQuery] = useState("");

  const q = query.trim();
  const saved = useMemo(() => {
    const match = searchMatcher(q);
    let list = products.filter((p) => p.sv);
    if (q) {
      list = list.filter((p) =>
        match([p.n, p.code, catSearchText(p.cat), p.desc, zoneSearchText(p)].filter(Boolean).join(" ")));
    }
    return list;
  }, [products, q]);

  const t = pkT();
  const ar = isAr();

  return (
    <>
      <div className="page-header">My products</div>
      <div style={{ marginBottom: 12, position: "relative" }}>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)"
          strokeWidth="1.8" strokeLinecap="round"
          style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", insetInlineStart: 12, pointerEvents: "none" }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your favorite products"
          data-i18n-ph="Search your favorite products"
          style={{
            width: "100%", padding: "10px 14px 10px 36px", background: "var(--color-background-primary)",
            border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12,
            color: "var(--color-text-primary)", fontSize: 14, outline: "none",
            paddingInlineStart: 36, paddingInlineEnd: 14,
          }}
        />
      </div>

      <div>
        {!saved.length ? (
          <div className="saved-empty">
            <div className="saved-empty-icon">🤍</div>
            {q ? (
              ar ? "لا توجد منتجات مطابقة لبحثك" : "No products match your search."
            ) : ar ? (
              <>لا توجد منتجات محفوظة بعد.<br />تصفح واضغط على القلب لحفظ المنتجات.</>
            ) : (
              <>No saved products yet.<br />Browse and tap the heart to save products you want to market.</>
            )}
          </div>
        ) : (
          <div className="products-list">
            {saved.map((p) => {
              const oos = !productHasStock(p);
              return (
                <div
                  key={p.id}
                  className={"product-card-saved" + (oos ? " oos" : "")}
                  onClick={() => onOpenProduct(p.id)}
                  style={{ cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                >
                  <div className="product-thumb" style={{ pointerEvents: "none" }}>
                    <ProductCover p={p} />
                  </div>
                  <div style={{ flex: 1, pointerEvents: "none" }}>
                    <div className="product-name">{p.n}</div>
                    <div className="product-meta">
                      <Money n={p.pr} sym={p.cur.s} code={p.cur.code} /> ·{" "}
                      <span className="pct-inline" dir="ltr" data-no-i18n>{p.pct}%</span> {t.commission}
                    </div>
                    {oos && <span className="oos-badge">{ar ? "نفذت الكميه" : "Out of stock"}</span>}
                  </div>
                  <button className="save-btn" onClick={(e) => { e.stopPropagation(); void toggleFavorite(p.id); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#E24B4A" stroke="#E24B4A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
