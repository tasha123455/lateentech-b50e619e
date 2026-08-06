import { useEffect, useState } from "react";

import { isArLang, useLangTick } from "../../marketer/lib/format";
import { useAdminData } from "../AdminDataProvider";

/**
 * Which country's numbers the Analytics page is showing.
 *
 * It lists only the countries this admin is allowed. That is a convenience and
 * not a permission: the database answers for the caller's countries whatever
 * this sends, refuses a country that is not theirs, and reads "no country in
 * particular" as "all of theirs" rather than as "the platform". So the worst a
 * tampered-with console can do here is ask a question it gets an error to.
 *
 * The all-chip is worded for whoever is reading it. To a master it offers the
 * platform; to an admin holding two countries out of five it offers their two,
 * and says so, because a chip that said "All countries" and returned a fifth
 * of them would be a lie in the one place figures have to be trusted.
 *
 * An admin with a single country gets no row at all: there is nothing to
 * choose, their figures are that country's either way, and a control with one
 * option is a control that cannot do anything.
 */
export function MarketFilter() {
  useLangTick();
  const { api, access, metricsMarket, setMetricsMarket, loadMetrics, metrics, metricsError } = useAdminData();
  const [markets, setMarkets] = useState<Array<{ code: string; en: string; ar: string }>>([]);
  const ar = isArLang();

  useEffect(() => {
    let alive = true;
    api.admin.listMarkets()
      .then((rows) => {
        if (!alive) return;
        const mine = access.markets
          ? rows.filter((r) => access.markets!.includes(r.code))
          : rows;
        setMarkets(mine.map((r) => ({ code: r.code, en: r.name_en, ar: r.name_ar })));
      })
      .catch(() => { if (alive) setMarkets([]); });
    return () => { alive = false; };
  }, [api, access.markets]);

  // Re-pull the numbers whenever the country changes.
  useEffect(() => { void loadMetrics(); }, [metricsMarket, loadMetrics]);

  /* Scoped to exactly one country: nothing to choose. Scoped to none — a
     master, or an admin left unrestricted — always gets the row, because the
     platform-wide view is a choice they hold even while there is one country
     to hold it over. */
  const scoped = !!access.markets && !access.isMaster;
  if (scoped && markets.length < 2) return null;
  if (markets.length === 0) return null;

  const allLabel = scoped
    ? (ar ? "كل دولي" : "All my countries")
    : (ar ? "كل الدول" : "All countries");

  /* How many accounts the chosen country holds, on the chip that chose it.
   *
   * Only on that one, the way the Users page badges the role it is filtered by:
   * a number on every chip would be a number for a country whose figures are
   * not the ones on screen, which reads as a second opinion about the page.
   *
   * It is the same total the "Total Users" stat shows below, taken from the
   * same answer rather than counted again, so the two can never disagree — and
   * it costs no request, because the numbers for the chosen country are already
   * here. While they are still arriving, or if they failed to, there is simply
   * no count rather than a nought that would read as an empty country. */
  const count = metricsError ? null : metrics?.totalUsers;
  const withCount = (on: boolean, label: string) =>
    on && typeof count === "number" ? (
      <>
        {label}{" "}
        {/* <bdi> so an Arabic chip does not reorder "(12)" into "12)(" */}
        <bdi>({count.toLocaleString()})</bdi>
      </>
    ) : (
      label
    );

  return (
    <div className="adm-market-filter" role="group" aria-label={ar ? "الدولة" : "Country"}>
      <button
        className={"adm-filter-chip" + (metricsMarket === null ? " on" : "")}
        onClick={() => setMetricsMarket(null)}
        data-no-i18n
      >
        {withCount(metricsMarket === null, allLabel)}
      </button>
      {markets.map((m) => (
        <button
          key={m.code}
          className={"adm-filter-chip" + (metricsMarket === m.code ? " on" : "")}
          onClick={() => setMetricsMarket(m.code)}
          data-no-i18n
        >
          {withCount(metricsMarket === m.code, ar ? m.ar : m.en)}
        </button>
      ))}
    </div>
  );
}
