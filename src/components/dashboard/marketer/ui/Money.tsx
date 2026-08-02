import { freeLbl, moneyParts } from "../lib/format";

/** Amount with the currency symbol/code in its own `.cur-sym` span, matching
    the old __moneyH() markup. Arabic puts the symbol after the number. */
export function Money({ n, sym, code, short }: { n: unknown; sym?: string; code?: string; short?: boolean }) {
  const { amount, sym: symbol, code: cc, ar } = moneyParts(n, sym, code, short);
  if (ar) {
    return (
      <>
        {amount}
        <span className="cur-sym">{symbol}</span>
      </>
    );
  }
  if (cc) {
    return (
      <>
        {amount} <span className="cur-sym">{cc}</span>
      </>
    );
  }
  return (
    <>
      <span className="cur-sym">{symbol}</span>
      {amount}
    </>
  );
}

/** Zero renders as a green "Free" label instead of an amount — but only when
 *  zero is an answer.
 *
 *  A draft with no delivery zone picked yet also has a shipping cost of zero,
 *  and that zero means "not worked out", not "costs nothing". Calling it Free
 *  promises the marketer something the order has never been told. Callers that
 *  can tell the difference pass `free={false}` until a zone is chosen, and get
 *  a plain 0. */
export function FreeOrMoney({
  n, sym, code, short, free = true,
}: {
  n: unknown; sym?: string; code?: string; short?: boolean; free?: boolean;
}) {
  if (free && Number(n || 0) === 0) return <b style={{ color: "#34c77b" }}>{freeLbl()}</b>;
  return <Money n={n} sym={sym} code={code} short={short} />;
}
