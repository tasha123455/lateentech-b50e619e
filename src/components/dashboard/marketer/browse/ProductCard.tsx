import type { BrowseProduct } from "../lib/types";
import { Money } from "../ui/Money";

/** The cover image, or the currency flag / 📦 fallback when there is no photo. */
export function ProductCover({ p }: { p: BrowseProduct }) {
  if (!p.cover) return <>{p.flag}</>;
  return (
    <img
      src={p.cover}
      alt=""
      style={{
        width: "100%", height: "100%", objectFit: "cover",
        objectPosition: `${p.coverFocusX}% ${p.coverFocusY}%`, borderRadius: "inherit",
      }}
    />
  );
}

/** The browse-grid tile. The admin product grid renders this same component so
 *  the two grids cannot drift apart; it passes no onToggleSave (admins have no
 *  favourites) and supplies its own "Hidden" pill. */
export function ProductCard({
  p, onOpen, onToggleSave, pill,
}: {
  p: BrowseProduct;
  onOpen: (id: string) => void;
  /** Omit to leave the save button off the cover. */
  onToggleSave?: (id: string) => void;
  /** Extra badge drawn over the cover. */
  pill?: React.ReactNode;
}) {
  return (
    <div className="c" onClick={() => onOpen(p.id)}>
      <div className="ci2">
        <ProductCover p={p} />
        {pill}
        {onToggleSave && (
        <div
          style={{
            position: "absolute", bottom: 0, right: 0, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 3, padding: "8px 8px 7px", cursor: "pointer", zIndex: 2,
          }}
          onClick={(e) => { e.stopPropagation(); onToggleSave(p.id); }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: p.sv ? "#E24B4A" : "rgba(0,0,0,0.55)",
              border: "1.5px solid " + (p.sv ? "#E24B4A" : "rgba(255,255,255,0.3)"),
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={p.sv ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          </div>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,.8)", fontWeight: 500, fontFamily: "var(--font-sans)" }}>
            {p.sv ? "Saved" : "Save"}
          </span>
        </div>
        )}
      </div>
      <div className="cb2">
        <div className="cn" data-no-i18n>{p.n}</div>
        <div className="cr">
          <div className="cpr"><Money n={p.pr} sym={p.cur.s} code={p.cur.code} /></div>
          <div className="cco">{p.pct}%</div>
        </div>
      </div>
    </div>
  );
}
