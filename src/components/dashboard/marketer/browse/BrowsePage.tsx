import { useMemo, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { CATEGORY_DATA, CATEGORY_GROUP_AR, CATEGORY_ITEM_AR } from "../lib/constants";
import { isAr, normSearch } from "../lib/format";
import { catSearchText, productHasStock, zoneSearchText } from "../lib/mappers";
import type { BrowseProduct } from "../lib/types";
import { FilterOverlay, type Filters } from "./FilterOverlay";
import { ProductCard } from "./ProductCard";

export function BrowsePage({
  onOpenProduct, onOpenSoon,
}: {
  onOpenProduct: (id: string) => void;
  onOpenSoon: () => void;
}) {
  const { products, toggleFavorite } = useMarketerData();

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({ country: "", cities: [], sort: "" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [catGroup, setCatGroup] = useState("");
  const [catSub, setCatSub] = useState("");
  const [openCatGroup, setOpenCatGroup] = useState<string | null>(null);

  const ar = isAr();
  const q = normSearch(query);

  const list = useMemo(() => {
    const out = products.filter((p) => {
      if (!productHasStock(p)) return false;
      const mq =
        !q ||
        normSearch(p.n).includes(q) ||
        normSearch(p.code || "").includes(q) ||
        catSearchText(p.cat).includes(q) ||
        normSearch(p.desc || "").includes(q) ||
        zoneSearchText(p).includes(q);
      const mc = !filters.country || !!p.d[filters.country];
      const mct =
        !filters.cities.length ||
        (!!filters.country && !!p.d[filters.country] && filters.cities.some((ct) => !!p.d[filters.country].c[ct]));
      const mcat =
        !catGroup ||
        (catSub
          ? p.cat === catSub
          : (CATEGORY_DATA.find((s) => s.group === catGroup) || { items: [] as string[] }).items.includes(p.cat));
      return mq && mc && mct && mcat;
    });
    if (filters.sort === "ch") out.sort((a, b) => b.pct - a.pct);
    else if (filters.sort === "cl") out.sort((a, b) => a.pct - b.pct);
    else if (filters.sort === "ph") out.sort((a, b) => b.pr - a.pr);
    else if (filters.sort === "pl") out.sort((a, b) => a.pr - b.pr);
    return out;
  }, [products, q, filters, catGroup, catSub]);

  /* "Recommended for you": unsaved, in-stock products sharing a category with
     something the marketer already saved. Hidden while any filter is active. */
  const recommended = useMemo(() => {
    const filtering = !!query.trim() || !!filters.country || !!filters.cities.length || !!catGroup || !!catSub || !!filters.sort;
    if (filtering) return [];
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
  }, [products, query, filters, catGroup, catSub]);

  const activeFilterCount = [filters.country, filters.cities.length ? "1" : "", filters.sort].filter(Boolean).length;

  const onCatGroupTap = (group: string) => {
    if (catGroup === group) {
      setOpenCatGroup((cur) => (cur === group ? null : group));
    } else {
      setCatGroup(group);
      setCatSub("");
      setOpenCatGroup(group);
    }
  };

  const selectCatSub = (group: string, sub: string) => {
    setCatGroup(group);
    setCatSub(sub);
    setOpenCatGroup(null);
  };

  const clearCatFilter = () => {
    setCatGroup("");
    setCatSub("");
    setOpenCatGroup(null);
  };

  const openSection = openCatGroup ? CATEGORY_DATA.find((s) => s.group === openCatGroup) : null;

  const card = (p: BrowseProduct) => (
    <ProductCard key={p.id} p={p} onOpen={onOpenProduct} onToggleSave={(id) => void toggleFavorite(id)} />
  );

  return (
    <>
      <div className="pt">Browse products</div>

      <div className="sr">
        <div className="sb">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search products…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="cbtn cbtn-disabled" onClick={onOpenSoon}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.8" strokeLinecap="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>
      </div>

      <div className="fc-row">
        <div className={"chip-btn" + (activeFilterCount > 0 ? " on" : "")} onClick={() => setFilterOpen(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>{" "}
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </div>
        <div className="fc-divider" />
        <div className={"chip-btn" + (!catGroup ? " on" : "")} onClick={clearCatFilter}>All</div>
        {CATEGORY_DATA.map((sec) => {
          const lbl = ar ? CATEGORY_GROUP_AR[sec.group] || sec.group : sec.group;
          const isOn = catGroup === sec.group;
          const isOpen = openCatGroup === sec.group;
          return (
            <div
              key={sec.group}
              className={"cat-grp-chip" + (isOn ? " on" : "")}
              data-no-i18n
              onClick={() => onCatGroupTap(sec.group)}
            >
              {lbl}{" "}
              <svg className={"cat-chev" + (isOpen ? " open" : "")} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          );
        })}
      </div>

      <div className="cat-sub-panel" style={{ display: openSection ? "flex" : "none" }}>
        {openSection && (
          <>
            <div
              className={"cat-sub-chip" + (!catSub ? " on" : "")}
              data-no-i18n
              onClick={() => selectCatSub(openSection.group, "")}
            >
              {ar ? "الكل" : "All"}
            </div>
            {openSection.items.map((it) => (
              <div
                key={it}
                className={"cat-sub-chip" + (catSub === it ? " on" : "")}
                data-no-i18n
                onClick={() => selectCatSub(openSection.group, it)}
              >
                {ar ? CATEGORY_ITEM_AR[it] || it : it}
              </div>
            ))}
          </>
        )}
      </div>

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

      <FilterOverlay
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={setFilters}
        products={products}
      />
    </>
  );
}
