import { useEffect, useMemo, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { productHasStock } from "../lib/mappers";
import type { BrowseProduct } from "../lib/types";
import { ProductCover } from "../browse/ProductCard";
import { pkT } from "../browse/pdText";

/** Saved products, ordered the way the marketer favourited them. */
export function useFavSorted(): BrowseProduct[] {
  const { products, favOrder } = useMarketerData();
  return useMemo(() => {
    const idx = new Map(favOrder.map((id, i) => [id, i]));
    return products
      .filter((p) => p.sv)
      .sort((a, b) => (idx.has(a.id) ? idx.get(a.id)! : 1e9) - (idx.has(b.id) ? idx.get(b.id)! : 1e9));
  }, [products, favOrder]);
}

export function ProductPickerOverlay({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const favs = useFavSorted();
  const [query, setQuery] = useState("");
  const t = pkT();

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const inStock = favs.filter(productHasStock);
  const qq = query.trim().toLowerCase();
  const filtered = qq
    ? inStock.filter(
        (p) =>
          p.n.toLowerCase().includes(qq) ||
          (p.cat || "").toLowerCase().includes(qq) ||
          (p.biz || "").toLowerCase().includes(qq) ||
          (p.code || "").toLowerCase().includes(qq),
      )
    : inStock;

  return (
    <div className={"overlay" + (open ? " open" : "")} style={{ zIndex: 1000, position: "fixed", inset: 0 }}>
      <div className="overlay-bg" onClick={onClose} />
      <div
        style={{
          position: "relative", zIndex: 1, width: "100%", maxWidth: 520, background: "#1e1e1e",
          borderRadius: "20px 20px 0 0", maxHeight: "88vh", display: "flex", flexDirection: "column",
          borderTop: "0.5px solid #333",
        }}
      >
        <div style={{ width: 36, height: 4, background: "#333", borderRadius: 2, margin: "10px auto 12px", flexShrink: 0 }} />
        <div style={{ padding: "0 1.25rem 12px", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 10 }}>
            {t.title}
          </div>
          <div style={{ position: "relative" }}>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)"
              strokeWidth="2" strokeLinecap="round"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%", background: "#2a2a2a", border: "0.5px solid #3a3a3a", borderRadius: 10,
                padding: "10px 12px 10px 34px", color: "var(--color-text-primary)", fontSize: 13,
                fontFamily: "var(--font-sans)", outline: "none",
              }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 1.25rem 1.25rem", display: "flex", flexDirection: "column", gap: 10 }}>
          {!filtered.length ? (
            <div style={{ padding: "30px 12px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
              {inStock.length ? t.noMatch : t.empty}
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className="product-card-saved"
                onClick={() => onPick(p.id)}
                style={{
                  cursor: "pointer", textAlign: "start", fontFamily: "var(--font-sans)", width: "100%",
                  WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                }}
              >
                <div className="product-thumb" style={{ pointerEvents: "none" }}>
                  <ProductCover p={p} />
                </div>
                <div style={{ flex: 1, minWidth: 0, pointerEvents: "none" }}>
                  <div className="product-name" data-no-i18n>{p.n}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
