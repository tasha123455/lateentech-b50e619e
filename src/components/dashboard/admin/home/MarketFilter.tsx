import { useEffect, useState } from "react";

import { useAdminData } from "../AdminDataProvider";

/**
 * Which country's numbers the Analytics page is showing.
 *
 * Absent while there is one market, because a filter with a single option is
 * a control that cannot do anything. It appears by itself the moment a second
 * country exists.
 *
 * An admin scoped to one market does not get the row either: they have no
 * choice to make, and offering "All" to somebody who is not allowed all of it
 * would be a button that returns less than it promises.
 */
export function MarketFilter() {
  const { api, access, metricsMarket, setMetricsMarket, loadMetrics } = useAdminData();
  const [markets, setMarkets] = useState<Array<{ code: string; name_en: string }>>([]);

  useEffect(() => {
    let alive = true;
    api.admin.listMarkets()
      .then((rows) => {
        if (!alive) return;
        // Only the markets this admin may actually see.
        const mine = access.markets
          ? rows.filter((r) => access.markets!.includes(r.code))
          : rows;
        setMarkets(mine.map((r) => ({ code: r.code, name_en: r.name_en })));
      })
      .catch(() => { if (alive) setMarkets([]); });
    return () => { alive = false; };
  }, [api, access.markets]);

  // Re-pull the numbers whenever the country changes.
  useEffect(() => { void loadMetrics(); }, [metricsMarket, loadMetrics]);

  if (markets.length < 2) return null;

  const pick = (code: string | null) => setMetricsMarket(code);

  return (
    <div className="adm-market-filter">
      <button
        className={"adm-filter-chip" + (metricsMarket === null ? " on" : "")}
        onClick={() => pick(null)}
      >
        All countries
      </button>
      {markets.map((m) => (
        <button
          key={m.code}
          className={"adm-filter-chip" + (metricsMarket === m.code ? " on" : "")}
          onClick={() => pick(m.code)}
          data-no-i18n
        >
          {m.name_en}
        </button>
      ))}
    </div>
  );
}
