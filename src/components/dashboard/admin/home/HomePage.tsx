import { useEffect, useMemo, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { CHART_METRICS, getFees } from "../lib/analytics";
import { MON_ABBR, WDAYS } from "../lib/format";
import type { DateSelection, MetricKey } from "../lib/types";
import { DateFilterTabs, EN_LABELS, USERS_CLASSES, buildYearItems } from "../ui/DateFilterTabs";
import { Money } from "../ui/Money";
import { AnalyticsChart } from "./AnalyticsChart";

const dayItems = WDAYS.map((k) => ({ key: k, label: k }));
const monthItems = MON_ABBR.map((k) => ({ key: k, label: k }));

/** The calendar day a selection points at, or null when it is not one single
 *  day — the presence peak is stored per day, so anything wider has no answer. */
function selectedDay(sel: DateSelection): string | null {
  if (!sel.year || !sel.month || !sel.day) return null;
  const year = parseInt(sel.year, 10);
  const month = MON_ABBR.indexOf(sel.month);
  if (!Number.isFinite(year) || month < 0) return null;
  // Most recent date in that month falling on the chosen weekday.
  const last = new Date(year, month + 1, 0);
  for (let d = last.getDate(); d >= 1; d--) {
    const dt = new Date(year, month, d);
    if (WDAYS[dt.getDay()] === sel.day) {
      const mm = String(month + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    }
  }
  return null;
}

export function HomePage() {
  const { metrics, homeRaw, metricsError, api } = useAdminData();
  const [selected, setSelected] = useState<DateSelection>({ day: null, month: null, year: null });
  const [activeMetric, setActiveMetric] = useState<MetricKey | "all">("all");
  const [live, setLive] = useState<number | null>(null);

  const fees = useMemo(() => getFees(homeRaw, selected), [homeRaw, selected]);
  const day = useMemo(() => selectedDay(selected), [selected]);

  /* No filter: the live count, refreshed on a timer so it stays live. A single
     day: that day's peak, which is a fixed number and needs fetching once. */
  useEffect(() => {
    let cancelled = false;
    const pull = () => {
      api.admin.presenceStats(day)
        .then((n) => { if (!cancelled) setLive(n); })
        .catch(() => { if (!cancelled) setLive(null); });
    };
    pull();
    if (day) return () => { cancelled = true; };
    const iv = setInterval(pull, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [api, day]);

  const anySel = !!(selected.day || selected.month || selected.year);
  const stat = (v: unknown) => (metricsError ? "…" : Number(v || 0).toLocaleString());

  return (
    <>
      <div className="adm-h1-row">
        <div className="adm-h1" style={{ marginBottom: 0 }}>Global Analytics</div>
      </div>

      <DateFilterTabs
        selected={selected}
        onChange={setSelected}
        classes={USERS_CLASSES}
        labels={EN_LABELS}
        dayItems={dayItems}
        monthItems={monthItems}
        yearItems={buildYearItems()}
      />

      <div className="adm-stat-grid adm-stat-stack">
        <div className="adm-stat full">
          <div className="adm-stat-label">Total Platform Fees Collected</div>
          <div className="adm-stat-value">
            {metricsError ? "—" : <Money n={fees} />}
          </div>
          {!!metricsError && (
            <div className="adm-stat-sub" style={{ color: "var(--danger)" }}>{metricsError}</div>
          )}
        </div>

        {/* Live means live: people signed in and inside their account right
            now. Pick a single day instead and it becomes that day's peak. */}
        <div className="adm-stat">
          <div className="adm-stat-label">{day ? "Peak Live Users" : "Live Users"}</div>
          <div className="adm-stat-value">
            {live == null ? "…" : live.toLocaleString()}
            {!day && live != null && <span className="adm-live-dot" />}
          </div>
        </div>

        <div className="adm-stat">
          <div className="adm-stat-label">Total Users</div>
          <div className="adm-stat-value">{stat(metrics?.totalUsers)}</div>
        </div>

        <div className="adm-stat">
          <div className="adm-stat-label">Total Products</div>
          <div className="adm-stat-value">{stat(metrics?.totalProducts)}</div>
        </div>

        <div className="adm-stat">
          <div className="adm-stat-label">Succeeded Upfronts</div>
          <div className="adm-stat-value">{stat(metrics?.succeededUpfronts)}</div>
        </div>

        <div className="adm-stat">
          <div className="adm-stat-label">Succeeded Pieces Sold</div>
          <div className="adm-stat-value">{stat(metrics?.succeededPiecesSold)}</div>
        </div>
      </div>

      <div className="adm-section adm-chart-card">
        <div className="adm-chart-head">
          <div className="adm-chart-title">{anySel ? "Performance" : "Performance over all time"}</div>
        </div>
        <div className="adm-chart-chips">
          <button
            className={"adm-filter-chip" + (activeMetric === "all" ? " on" : "")}
            onClick={() => setActiveMetric("all")}
          >
            All
          </button>
          {CHART_METRICS.map((m) => {
            const on = activeMetric === m.key;
            return (
              <button
                key={m.key}
                className={"adm-filter-chip" + (on ? " on" : "")}
                onClick={() => setActiveMetric(m.key)}
                style={on ? { background: m.color + "22", color: m.color, borderColor: m.color + "55" } : undefined}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <div className="adm-chart-body">
          <AnalyticsChart raw={homeRaw} selected={selected} activeMetric={activeMetric} />
        </div>
      </div>
    </>
  );
}
