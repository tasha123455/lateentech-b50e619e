import { freeLbl, moneyParts } from "../lib/format";

/** Amount with the currency symbol/code in its own `.cur-sym` span, matching
    the old __moneyH() markup. Arabic puts the symbol after the number.

    The number sits in a <bdi> so a refund reads as a refund. On an Arabic page
    the paragraph runs right to left, and a bare "-30.00" gets reordered to
    "30.00-" — measured in Chromium, the minus lands on the far side of the
    digits and looks like punctuation rather than a negative. <bdi> isolates
    the number so it keeps its own direction. Positive amounts are unaffected,
    in either language. */
export function Money({ n, sym, code, short }: { n: unknown; sym?: string; code?: string; short?: boolean }) {
  const { amount, sym: symbol, code: cc, ar } = moneyParts(n, sym, code, short);
  if (ar) {
    return (
      <>
        <bdi>{amount}</bdi>
        <span className="cur-sym">{symbol}</span>
      </>
    );
  }
  if (cc) {
    return (
      <>
        <bdi>{amount}</bdi> <span className="cur-sym">{cc}</span>
      </>
    );
  }
  return (
    <>
      <span className="cur-sym">{symbol}</span>
      <bdi>{amount}</bdi>
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
