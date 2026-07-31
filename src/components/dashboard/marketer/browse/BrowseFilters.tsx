import { useState } from "react";

import { CATEGORY_DATA, CATEGORY_GROUP_AR, CATEGORY_ITEM_AR } from "../lib/constants";
import { isAr } from "../lib/format";
import type { BrowseProduct } from "../lib/types";
import { FilterOverlay } from "./FilterOverlay";
import { activeFilterCount, type BrowseFilterState } from "./browseFilter";

/** Search bar, category chips and the Filter & sort sheet.
 *
 *  The marketer's browse page and the admin's product review page both render
 *  this, so the filtering controls stay in step. The caller owns the state and
 *  feeds it to applyBrowseFilters(); only the open/closed bits of chrome are
 *  kept in here. */
export function BrowseFilters({
  products, state, onChange, placeholder = "Search products…", trailing,
}: {
  products: BrowseProduct[];
  state: BrowseFilterState;
  onChange: (s: BrowseFilterState) => void;
  placeholder?: string;
  /** Button rendered beside the search box, e.g. the marketer's camera. */
  trailing?: React.ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [openCatGroup, setOpenCatGroup] = useState<string | null>(null);

  const ar = isAr();
  const { query, filters, catGroup, catSub } = state;
  const activeCount = activeFilterCount(filters);

  const onCatGroupTap = (group: string) => {
    if (catGroup === group) {
      setOpenCatGroup((cur) => (cur === group ? null : group));
    } else {
      onChange({ ...state, catGroup: group, catSub: "" });
      setOpenCatGroup(group);
    }
  };

  const selectCatSub = (group: string, sub: string) => {
    onChange({ ...state, catGroup: group, catSub: sub });
    setOpenCatGroup(null);
  };

  const clearCatFilter = () => {
    onChange({ ...state, catGroup: "", catSub: "" });
    setOpenCatGroup(null);
  };

  const openSection = openCatGroup ? CATEGORY_DATA.find((s) => s.group === openCatGroup) : null;

  return (
    <>
      <div className="sr">
        <div className="sb">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => onChange({ ...state, query: e.target.value })}
          />
        </div>
        {trailing}
      </div>

      <div className="fc-row">
        <div className={"chip-btn" + (activeCount > 0 ? " on" : "")} onClick={() => setFilterOpen(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>{" "}
          Filters{activeCount ? ` (${activeCount})` : ""}
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

      <FilterOverlay
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={(f) => onChange({ ...state, filters: f })}
        products={products}
      />
    </>
  );
}
