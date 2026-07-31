import { CUR_SYM, moneyAmount } from "../lib/format";

/** Amount with the dinar symbol in its own `.cur-sym` span, matching the old
    admMoneyH() markup. */
export function Money({ n }: { n: unknown }) {
  return (
    <>
      <span className="cur-sym">{CUR_SYM}</span>
      {moneyAmount(n)}
    </>
  );
}

/** Same, for a product's own currency symbol (product detail sheet). */
export function CurMoney({ sym, n, digits = 2 }: { sym: string; n: unknown; digits?: number }) {
  return (
    <>
      <span className="cur-sym">{sym}</span>
      {Number(n || 0).toFixed(digits)}
    </>
  );
}
