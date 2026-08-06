import { useEffect, useRef, useState } from "react";

import { isArLang, useLangTick } from "../../marketer/lib/format";
import { useAdminData } from "../AdminDataProvider";

/**
 * Which country's numbers the Analytics page is showing.
 *
 * A dropdown rather than a row of chips, and built from the same classes as
 * the date tabs beside it, so the two read as one bar of filters instead of
 * two designs that happen to sit together. A row of chips is fine for four
 * fixed options; countries are a list that grows, and a list that grows wants
 * a list that scrolls.
 *
 * It offers only the countries this admin is allowed. That is a convenience
 * and not a permission: the database answers for the caller's countries
 * whatever this sends, refuses a country that is not theirs, and reads "no
 * country in particular" as "all of theirs" rather than as "the platform". So
 * the worst a tampered-with console can do here is ask a question it gets an
 * error to.
 *
 * The all-option is worded for whoever is reading it. To a master it offers
 * the platform; to an admin holding two countries out of five it offers their
 * two, and says so, because an option that said "All countries" and returned a
 * fifth of them would be a lie in the one place figures have to be trusted.
 *
 * An admin with a single country gets no picker: there is nothing to choose,
 * and their figures are that country's either way.
 */
export function MarketFilter() {
  useLangTick();
  const { api, access, metricsMarket, setMetricsMarket, loadMetrics, metrics, metricsError } = useAdminData();
  const [markets, setMarkets] = useState<Array<{ code: string; en: string; ar: string }>>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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

  // A tap anywhere else closes it, the way the date tabs close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  const scoped = !!access.markets && !access.isMaster;
  if (scoped && markets.length < 2) return null;
  if (markets.length === 0) return null;

  const allLabel = scoped
    ? (ar ? "كل دولي" : "All my countries")
    : (ar ? "كل الدول" : "All countries");

  const chosen = markets.find((m) => m.code === metricsMarket);
  const chosenLabel = chosen ? (ar ? chosen.ar : chosen.en) : allLabel;

  /* How many accounts the chosen country holds.
   *
   * Named, not bare. It used to read "All countries (5)", which anybody would
   * take for five countries — it was five people. The unit was obvious to the
   * page that shows the same total under "Total Users" and to nobody else.
   * "Users: 5" cannot be read as anything but what it is, and putting the word
   * first sidesteps Arabic number agreement, where five takes one plural and
   * eleven takes another.
   *
   * It is that same total, from the same answer rather than counted again, so
   * the two can never disagree — and it costs no request, because the figures
   * for the chosen country are already here. Nothing at all while they are
   * arriving, or if they failed to: a nought would read as an empty country
   * rather than as a question still being asked. */
  const count = metricsError ? null : metrics?.totalUsers;
  const countText =
    typeof count === "number"
      ? (ar ? "المستخدمون: " : "Users: ") + count.toLocaleString()
      : null;

  const pick = (code: string | null) => {
    setMetricsMarket(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="adm-market-filter" data-no-i18n>
      <div className="bd-range-tabs">
        <div
          className={"bd-range-tab" + (metricsMarket ? " active" : "") + (open ? " open" : "")}
          role="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ar ? "الدولة" : "Country"}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        >
          {chosenLabel} <span className="bd-chev">▾</span>
        </div>
        {countText && <span className="adm-market-count">{countText}</span>}
      </div>

      <div className={"bd-dropdown-list" + (open ? " open" : "")} role="listbox">
        <div
          className={"bd-dd-item" + (metricsMarket === null ? " on" : "")}
          role="option"
          aria-selected={metricsMarket === null}
          onClick={(e) => { e.stopPropagation(); pick(null); }}
        >
          {allLabel}
        </div>
        {markets.map((m) => (
          <div
            key={m.code}
            className={"bd-dd-item" + (metricsMarket === m.code ? " on" : "")}
            role="option"
            aria-selected={metricsMarket === m.code}
            onClick={(e) => { e.stopPropagation(); pick(m.code); }}
          >
            {ar ? m.ar : m.en}
          </div>
        ))}
      </div>
    </div>
  );
}
