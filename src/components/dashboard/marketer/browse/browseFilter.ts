import { CATEGORY_DATA } from "../lib/constants";
import { normSearch } from "../lib/format";
import { catSearchText, productHasStock, zoneSearchText } from "../lib/mappers";
import type { BrowseProduct } from "../lib/types";
import type { Filters } from "./FilterOverlay";

export type BrowseFilterState = {
  query: string;
  filters: Filters;
  catGroup: string;
  catSub: string;
};

export const EMPTY_BROWSE_FILTERS: BrowseFilterState = {
  query: "",
  filters: { country: "", cities: [], sort: "" },
  catGroup: "",
  catSub: "",
};

/** True when nothing at all is narrowing the list. */
export const browseFiltersIdle = (s: BrowseFilterState): boolean =>
  !s.query.trim() && !s.filters.country && !s.filters.cities.length && !s.catGroup && !s.catSub && !s.filters.sort;

/** The number shown on the Filters chip. */
export const activeFilterCount = (f: Filters): number =>
  [f.country, f.cities.length ? "1" : "", f.sort].filter(Boolean).length;

/** The browse-grid filter and sort, shared by the marketer's browse page and
 *  the admin's product review page so the two cannot behave differently.
 *
 *  Two options carry the differences the admin needs. `requireStock` is on for
 *  marketers, who only browse what they can actually order, and off for admins,
 *  who have to see out-of-stock and hidden products to moderate them.
 *  `extraText` folds another field into the search — the admin matches on the
 *  shop name as well — and `alsoMatchesQuery` lets a caller count a product as
 *  a text match on grounds this function cannot see, which is how the admin
 *  keeps its server-side search by the owner's current profile name. */
export function applyBrowseFilters(
  products: BrowseProduct[],
  s: BrowseFilterState,
  opts: {
    requireStock?: boolean;
    extraText?: (p: BrowseProduct) => string;
    alsoMatchesQuery?: (p: BrowseProduct) => boolean;
  } = {},
): BrowseProduct[] {
  const { requireStock = true, extraText, alsoMatchesQuery } = opts;
  const q = normSearch(s.query);
  const { country, cities, sort } = s.filters;

  const out = products.filter((p) => {
    if (requireStock && !productHasStock(p)) return false;
    const mq =
      !q ||
      normSearch(p.n).includes(q) ||
      normSearch(p.code || "").includes(q) ||
      catSearchText(p.cat).includes(q) ||
      normSearch(p.desc || "").includes(q) ||
      zoneSearchText(p).includes(q) ||
      (!!extraText && normSearch(extraText(p)).includes(q)) ||
      (!!alsoMatchesQuery && alsoMatchesQuery(p));
    const mc = !country || !!p.d[country];
    const mct =
      !cities.length || (!!country && !!p.d[country] && cities.some((ct) => !!p.d[country].c[ct]));
    const mcat =
      !s.catGroup ||
      (s.catSub
        ? p.cat === s.catSub
        : (CATEGORY_DATA.find((x) => x.group === s.catGroup) || { items: [] as string[] }).items.includes(p.cat));
    return mq && mc && mct && mcat;
  });

  if (sort === "ch") out.sort((a, b) => b.pct - a.pct);
  else if (sort === "cl") out.sort((a, b) => a.pct - b.pct);
  else if (sort === "ph") out.sort((a, b) => b.pr - a.pr);
  else if (sort === "pl") out.sort((a, b) => a.pr - b.pr);
  return out;
}
