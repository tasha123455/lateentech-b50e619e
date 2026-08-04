/* What to put in front of a marketer on the Browse page.
 *
 * The first version matched on category alone: take everything they had
 * saved, collect those categories and their siblings, and show the first four
 * unsaved products that landed in the set. That has two problems. It is not
 * really a ranking — the first four in database order win, so a product with a
 * 3% commission and one left in stock outranks a 25% product with fifty, and a
 * marketer who saves one shirt is shown four more shirts forever. And it says
 * nothing at all to a marketer who has not saved anything yet, which is every
 * marketer on their first day.
 *
 * So it scores instead. Five signals, each normalised to 0–1 so that no single
 * one can run away with the result, then weighted by how much it actually
 * tells us about whether this marketer will sell this product:
 *
 *   taste (×3)    they engage with this kind of thing
 *   shop  (×2)    they have worked with this business before
 *   rate  (×2)    it pays better than the rest of the catalogue
 *   band  (×1)    it costs what their customers pay
 *   stock (×1)    it will still be there next week
 *
 * Taste leads because it is the only signal about *them*; the rest describe
 * the product and would otherwise recommend the same four products to
 * everybody. But taste cannot be the whole answer either — that is the shirts
 * problem — so a product in a category they have never touched can still win
 * on the strength of the other four.
 *
 * Everything here is computed from data the page already holds. No new query,
 * no round trip, and it re-ranks the moment an order or a save changes. */

import { CATEGORY_DATA } from "../lib/constants";
import { productHasStock } from "../lib/mappers";
import type { BrowseProduct, MarketerOrder } from "../lib/types";

/** Five or fewer left is "low stock" everywhere else in the app; above it,
 *  stock stops being a reason to prefer one product over another. */
const HEALTHY_STOCK = 5;

/** An order is worth more than a save. Saving is a bookmark — it costs
 *  nothing and means "maybe". Ordering means they put their name to it in
 *  front of a customer, and a delivered order means the customer actually
 *  paid, which is the only signal here that has been tested against reality. */
const W_DELIVERED = 4;
const W_LIVE = 2;
const W_FAILED = 1;
const W_SAVED = 1;

/** A sibling category is a hint, not a match. Someone selling phone cases is
 *  plausibly interested in chargers; they are not equally interested. */
const SIBLING = 1 / 3;

const LIVE = new Set(["pending", "approved", "confirmed"]);

/** The section a category belongs to, so siblings can be found. Built once —
 *  CATEGORY_DATA is static, and the old code walked it per saved product. */
const SECTION_OF: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  CATEGORY_DATA.forEach((s) => s.items.forEach((it) => { m[it] = s.group; }));
  return m;
})();

/** What one unit earns, by the same rule the order form uses: a fixed
 *  commission when the shop set one, otherwise the percentage of the price. */
const unitEarn = (p: BrowseProduct): number =>
  Number(p.commUnit) > 0 ? Number(p.commUnit) : (Number(p.pr) || 0) * (Number(p.pct) || 0) / 100;

/** Earnings as a share of the price rather than as money.
 *
 *  A rate compares across currencies and across price ranges; the money does
 *  not. Ranking on the money alone would just sort the catalogue by price and
 *  call the expensive end a recommendation. */
const earnRate = (p: BrowseProduct): number => {
  const pr = Number(p.pr) || 0;
  return pr > 0 ? unitEarn(p) / pr : 0;
};

/** 1 when the product costs about what this marketer's customers pay, falling
 *  away smoothly in both directions.
 *
 *  Measured on a log scale because the gap that matters is proportional: 40 to
 *  80 is the same stretch as 400 to 800, and half the price is as far off as
 *  twice it. A linear distance would call every cheap product a near-perfect
 *  match simply because the numbers are close together. */
const bandFit = (price: number, typical: number): number => {
  if (!(price > 0) || !(typical > 0)) return 0;
  return 1 / (1 + Math.abs(Math.log(price / typical)));
};

/** Weight per product, from this marketer's own history. Repeat business
 *  counts, but under a square root: someone who sold thirty of one thing has a
 *  stronger preference than someone who sold three, not ten times stronger,
 *  and without the damping a single product would decide the whole page. */
function engagement(products: BrowseProduct[], orders: MarketerOrder[]): Map<string, number> {
  const raw = new Map<string, number>();
  const add = (key: string, w: number) => { if (key) raw.set(key, (raw.get(key) || 0) + w); };

  orders.forEach((o) => {
    if (o._isDraft) return;                       // never sent to anyone
    const w = o._deliveredAt ? W_DELIVERED : LIVE.has(String(o._status)) ? W_LIVE : W_FAILED;
    add(o.productKey, w * Math.max(1, Number(o.qty) || 1));
  });
  products.forEach((p) => { if (p.sv) add(p.id, W_SAVED); });

  const out = new Map<string, number>();
  raw.forEach((v, k) => out.set(k, Math.sqrt(v)));
  return out;
}

export type Recommendation = { list: BrowseProduct[]; personal: boolean };

/** The four products to show, and whether they are actually personal.
 *
 *  The flag is not decoration. With no history the taste and shop signals are
 *  zero for every candidate and the ranking falls back to "pays well, plenty
 *  in stock" — which is a good list, but it is the same good list for
 *  everybody, and calling it "recommended for you" would be a small lie. */
export function recommendProducts(
  products: BrowseProduct[],
  orders: MarketerOrder[],
  limit = 4,
): Recommendation {
  const weight = engagement(products, orders);

  /* Taste, gathered per category and per section. A product contributes to
     its own category at full weight and to its section at a fraction, so a
     marketer who has only ever sold shirts still ranks trousers above tyres. */
  const catW: Record<string, number> = {};
  const secW: Record<string, number> = {};
  const shopW: Record<string, number> = {};
  /** Products they have saved or ordered — anything at all we can learn from.
   *  A save is a weak signal for ranking but it is still their own choice, so
   *  it is enough to make the list personal. */
  let engaged = 0;

  products.forEach((p) => {
    const w = weight.get(p.id);
    if (!w) return;
    engaged += 1;
    if (p.cat) {
      catW[p.cat] = (catW[p.cat] || 0) + w;
      const sec = SECTION_OF[p.cat];
      if (sec) secW[sec] = (secW[sec] || 0) + w;
    }
    if (p.bid) shopW[p.bid] = (shopW[p.bid] || 0) + w;
  });

  /* Only what they could actually pick up: in stock, and not already theirs.
     A product they have saved or ordered needs no recommending — they found
     it. It stays in the scoring above as a signal, just not in the output. */
  const pool = products.filter((p) => !p.sv && !weight.has(p.id) && productHasStock(p));
  if (!pool.length) return { list: [], personal: false };

  /* What their customers actually pay, taken as a median so that one unusual
     order cannot drag the band with it, and only over products priced in the
     same currency as the candidate being scored. */
  const pricesByCur = new Map<string, number[]>();
  products.forEach((p) => {
    if (!weight.has(p.id) || !(Number(p.pr) > 0)) return;
    const key = p.cur?.code || "";
    const arr = pricesByCur.get(key) || [];
    arr.push(Number(p.pr));
    pricesByCur.set(key, arr);
  });
  const typicalPrice = new Map<string, number>();
  pricesByCur.forEach((arr, key) => {
    arr.sort((a, b) => a - b);
    typicalPrice.set(key, arr[Math.floor(arr.length / 2)]);
  });

  /* Normalised against the candidates themselves rather than against a fixed
     scale, so "pays well" means well for this catalogue on this day. */
  const rawTaste = pool.map((p) => (catW[p.cat] || 0) + SIBLING * (secW[SECTION_OF[p.cat]] || 0));
  const rawShop = pool.map((p) => shopW[p.bid] || 0);
  const rawRate = pool.map(earnRate);
  const maxOf = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0);
  const [mTaste, mShop, mRate] = [maxOf(rawTaste), maxOf(rawShop), maxOf(rawRate)];
  const over = (v: number, m: number) => (m > 0 ? v / m : 0);

  const scored = pool.map((p, i) => {
    const taste = over(rawTaste[i], mTaste);
    const shop = over(rawShop[i], mShop);
    const rate = over(rawRate[i], mRate);
    const band = bandFit(Number(p.pr) || 0, typicalPrice.get(p.cur?.code || "") || 0);
    const stock = Math.min(1, (Number(p.q) || 0) / HEALTHY_STOCK);
    return { p, score: 3 * taste + 2 * shop + 2 * rate + band + stock };
  });

  /* Ties broken by id so the order is stable between renders — a list that
     reshuffles itself on every keystroke is not a recommendation. */
  scored.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));

  return { list: scored.slice(0, limit).map((s) => s.p), personal: engaged > 0 };
}
