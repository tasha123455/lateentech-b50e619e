import { moneyParts } from "../lib/format";

/** React equivalent of `__moneyH` in business.script.js.
 *
 *  The original always wrapped the symbol (or the ISO code) in
 *  `<span class="cur-sym">`, and — in the spaced English form — kept the
 *  separating space OUTSIDE that span, as its own text node:
 *
 *    ar        →  12.00<span class="cur-sym">د.ل</span>
 *    en + code →  12.00 <span class="cur-sym">USD</span>
 *    en        →  <span class="cur-sym">$</span>12.00
 *
 *  Several price containers (`.mp-p-price-collapsed`, `.mp-p-price-exp`) are
 *  `display:inline-flex; gap:.22em`, so the span is a real flex item and that
 *  gap is what separates symbol from amount. Dropping the span — or pulling
 *  the space inside it — collapses everything into one anonymous flex item
 *  and the spacing disappears, so this markup has to stay exact.
 */
export function MoneyH({ n, sym, code }: { n: unknown; sym?: string | null; code?: string | null }) {
  const p = moneyParts(n, sym, code);
  if (p.symbolFirst) return <><span className="cur-sym">{p.symbol}</span>{p.amount}</>;
  if (p.spaced) return <>{p.amount} <span className="cur-sym">{p.symbol}</span></>;
  return <>{p.amount}<span className="cur-sym">{p.symbol}</span></>;
}
