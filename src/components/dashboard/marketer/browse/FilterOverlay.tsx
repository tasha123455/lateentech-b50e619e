import { useEffect, useState } from "react";
import { useScrollLock } from "@/lib/useScrollLock";

import { LIBYA_CITIES } from "../lib/constants";
import { isAr } from "../lib/format";
import { cityLabel } from "../lib/mappers";
import type { BrowseProduct } from "../lib/types";

export type Filters = { country: string; cities: string[]; sort: string };

export function FilterOverlay({
  open, onClose, filters, onApply, products,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onApply: (f: Filters) => void;
  products: BrowseProduct[];
}) {
  // Pending state: edits only take effect when "Apply" is tapped.
  const [country, setCountry] = useState(filters.country);
  const [cities, setCities] = useState<string[]>(filters.cities);
  const [sort, setSort] = useState(filters.sort);

  useEffect(() => {
    if (!open) return;
    setCountry(filters.country);
    setCities([...filters.cities]);
    setSort(filters.sort);
  }, [open, filters]);

  // The sheet is modal, so lock the page behind it.
  useScrollLock(open);

  const ar = isAr();
  const citiesFor = (c: string): string[] => {
    if (c === "LY") return LIBYA_CITIES.map((x) => x.en);
    const s = new Set<string>();
    products.forEach((p) => {
      if (p.d[c]) Object.keys(p.d[c].c).forEach((x) => s.add(x));
    });
    return [...s];
  };

  const toggleCity = (c: string) =>
    setCities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const pickSort = (k: string) => setSort((prev) => (prev === k ? "" : k));

  const reset = () => {
    setCountry("");
    setCities([]);
    setSort("");
    onApply({ country: "", cities: [], sort: "" });
    onClose();
  };

  const cityList = country ? citiesFor(country) : [];
  const hint = cities.length ? (ar ? `${cities.length} مدينة مختارة` : `${cities.length} cities selected`) : "";

  const sortRow = (key: string, label: string) => (
    <div className={"so" + (sort === key ? " s" : "")} onClick={() => pickSort(key)}>
      {label}
      <div className="sr2" />
    </div>
  );

  return (
    <div className={"ov" + (open ? " open" : "")}>
      <div className="ob" onClick={onClose} />
      <div className="sh">
        <div className="shh" />
        <div className="sht">Filter &amp; sort</div>

        <div className="shs">Country</div>
        <div className="ol">
          <select
            className="country-select"
            dir={ar ? "rtl" : "ltr"}
            value={country}
            onChange={(e) => { setCountry(e.target.value); setCities([]); }}
          >
            <option value="">{ar ? "اختر الدولة" : "Select country"}</option>
            <option value="LY">{ar ? "ليبيا" : "Libya"}</option>
            <option value="" disabled className="opt-soon">
              {ar ? "دول أخرى — قريباً" : "More countries — Soon"}
            </option>
          </select>
        </div>

        {!!country && (
          <div>
            <div className="shs">City</div>
            <div className="oa">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, width: "100%" }}>
                <div className={"oo" + (!cities.length ? " s" : "")} onClick={() => setCities([])}>
                  {ar ? "كل المدن" : "All cities"}
                </div>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{hint}</span>
              </div>
              <div
                style={{
                  maxHeight: 230, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6,
                  border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, padding: 8,
                  background: "var(--color-background-secondary)", width: "100%",
                }}
              >
                {cityList.map((c) => {
                  const sel = cities.includes(c);
                  const lbl = country === "LY" ? cityLabel(c) : c;
                  return (
                    <label
                      key={c}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
                        background: sel ? "#2d2b4e" : "transparent", cursor: "pointer", fontSize: 13,
                        color: sel ? "#a89ee8" : "var(--color-text-primary)",
                      }}
                      onClick={(e) => { e.preventDefault(); toggleCity(c); }}
                    >
                      <span
                        style={{
                          width: 16, height: 16, borderRadius: 4,
                          border: "1.5px solid " + (sel ? "#7f77dd" : "var(--color-border-secondary)"),
                          background: sel ? "#7f77dd" : "transparent", display: "flex",
                          alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}
                      >
                        {sel && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      {lbl}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="shs">Commission</div>
        <div className="sa">
          {sortRow("ch", "Highest commission first")}
          {sortRow("cl", "Lowest commission first")}
        </div>

        <div className="shs">Price</div>
        <div className="sa">
          {sortRow("ph", "Highest price first")}
          {sortRow("pl", "Lowest price first")}
        </div>

        <button className="ab" onClick={() => { onApply({ country, cities: [...cities], sort }); onClose(); }}>
          Apply
        </button>
        <button className="rb" onClick={reset}>Reset all</button>
      </div>
    </div>
  );
}
