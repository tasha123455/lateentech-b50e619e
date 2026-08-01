import { Money as SharedMoney } from "@/components/dashboard/marketer/ui/Money";

/** Admin totals are always Libyan Dinar. */
const LYD = { sym: "د.ل", code: "LYD" };

/** The same component the marketer and business grids use, so an amount reads
 *  the same everywhere: the symbol leads in Arabic, the ISO code trails in
 *  English ("30.00 LYD"). The admin used to put د.ل in front in both. */
export function Money({ n }: { n: unknown }) {
  return <SharedMoney n={n} sym={LYD.sym} code={LYD.code} />;
}

/** Same, for a product's own currency rather than the platform's. */
export function CurMoney({ sym, n, code }: { sym: string; n: unknown; code?: string }) {
  return <SharedMoney n={n} sym={sym} code={code} />;
}
