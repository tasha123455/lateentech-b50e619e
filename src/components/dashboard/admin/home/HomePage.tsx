import { useMemo, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { CHART_METRICS, getEmployeeSalaryPaid, getFees } from "../lib/analytics";
import { CUR_SYM, DAY_MAP, MONTH_MAP, MON_ABBR, WDAYS, moneyAmount } from "../lib/format";
import type { DateSelection, MetricKey } from "../lib/types";
import { AR_LABELS, DateFilterTabs, HOME_CLASSES, buildYearItems } from "../ui/DateFilterTabs";
import { AnalyticsChart } from "./AnalyticsChart";

const dayItems = WDAYS.map((k) => ({ key: k, label: k }));
const monthItems = MON_ABBR.map((k) => ({ key: k, label: k }));

const StatIcon = ({ children }: { children: React.ReactNode }) => (
  <div className="stat-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  </div>
);

export function HomePage() {
  const { metrics, homeRaw, metricsError } = useAdminData();
  const [selected, setSelected] = useState<DateSelection>({ day: null, month: null, year: null });
  const [profitOpen, setProfitOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState<MetricKey | "all">("all");

  const fees = useMemo(() => getFees(homeRaw, selected), [homeRaw, selected]);
  const salaries = useMemo(() => getEmployeeSalaryPaid(homeRaw, selected), [homeRaw, selected]);
  const profit = Math.round((fees - salaries) * 100) / 100;

  const heroSub = useMemo(() => {
    const parts: string[] = [];
    if (selected.day) parts.push("أيام " + DAY_MAP[selected.day]);
    if (selected.month) parts.push("شهر " + MONTH_MAP[selected.month]);
    if (selected.year) parts.push("عام " + selected.year);
    return parts.length ? "إجمالي أرباح " + parts.join(" · ") : "إجمالي الأرباح من الطلبيات المؤكدة والمسلّمة";
  }, [selected]);

  const chartTitle = useMemo(() => {
    if (selected.year && !selected.month && !selected.day) return "الأداء الشهري لعام " + selected.year;
    if (selected.day || selected.month || selected.year) {
      const parts: string[] = [];
      if (selected.day) parts.push("أيام " + DAY_MAP[selected.day]);
      if (selected.month) parts.push("شهر " + MONTH_MAP[selected.month]);
      if (selected.year) parts.push("عام " + selected.year);
      return "الأداء اليومي · " + parts.join(" · ");
    }
    return "الأداء عبر آخر 14 يوماً";
  }, [selected]);

  const stat = (v: unknown) => (metricsError ? "…" : Number(v || 0).toLocaleString());

  return (
    <div className="adm-home-v2" dir="rtl">
      <h1 className="section-title">تحليلات شاملة</h1>

      <DateFilterTabs
        selected={selected}
        onChange={setSelected}
        classes={HOME_CLASSES}
        labels={AR_LABELS}
        dayItems={dayItems}
        monthItems={monthItems}
        yearItems={buildYearItems()}
      />

      <div className="hero-card">
        <div className="hero-label">إجمالي رسوم المنصة المحصّلة</div>
        <div className="hero-value">
          {metricsError ? (
            <>
              <span className="cur-sym">د.ل</span>—
            </>
          ) : (
            <>
              <span className="cur-sym">د.ل</span>
              {fees.toFixed(2)}
            </>
          )}
        </div>
        <div className="hero-sub">{heroSub}</div>
        {!!metricsError && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--danger)" }}>{metricsError}</div>
        )}

        <button
          className={"hero-profit-toggle" + (profitOpen ? " open" : "")}
          onClick={() => setProfitOpen((v) => !v)}
        >
          <span>صافي الربح (بعد خصم رواتب الموظفين)</span>
          <span className="chev">▾</span>
        </button>
        <div className={"hero-profit-panel" + (profitOpen ? " open" : "")}>
          <div className="hero-profit-value">
            <span className="cur-sym">د.ل</span>
            {profit.toFixed(2)}
          </div>
          <div className="hero-profit-breakdown">
            رسوم المنصة <span className="cur-sym">{CUR_SYM}</span>{moneyAmount(fees)} − رواتب الموظفين المدفوعة{" "}
            <span className="cur-sym">{CUR_SYM}</span>{moneyAmount(salaries)}
          </div>
        </div>
      </div>

      <div className="stats-card">
        <div className="stat-row">
          <div className="stat-left">
            <StatIcon>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
            </StatIcon>
            <div>
              <div className="stat-label">المستخدمون النشطون</div>
              <div className="stat-sub">آخر 30 يوماً</div>
            </div>
          </div>
          <div className="stat-value">{stat(metrics?.activeUsers)}</div>
        </div>

        <div className="stat-row">
          <div className="stat-left">
            <StatIcon>
              <circle cx="9" cy="8" r="4" />
              <path d="M2 21c0-4 3.1-7 7-7s7 3 7 7" />
              <path d="M19 8v6M22 11h-6" />
            </StatIcon>
            <div>
              <div className="stat-label">إجمالي المستخدمين</div>
              <div className="stat-sub">كل الحسابات المسجلة</div>
            </div>
          </div>
          <div className="stat-value">{stat(metrics?.totalUsers)}</div>
        </div>

        <div className="stat-row">
          <div className="stat-left">
            <StatIcon>
              <path d="M21 8l-9-5-9 5 9 5 9-5z" />
              <path d="M3 8v8l9 5 9-5V8" />
              <path d="M12 13v8" />
            </StatIcon>
            <div>
              <div className="stat-label">إجمالي المنتجات</div>
              <div className="stat-sub">في كل المتاجر</div>
            </div>
          </div>
          <div className="stat-value">{stat(metrics?.totalProducts)}</div>
        </div>

        <div className="stat-row">
          <div className="stat-left">
            <StatIcon>
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 12.5l2.5 2.5 5-5" />
            </StatIcon>
            <div>
              <div className="stat-label">Succeeded Upfronts</div>
              <div className="stat-sub">Receipts approved, lifetime</div>
            </div>
          </div>
          <div className="stat-value">{stat(metrics?.succeededUpfronts)}</div>
        </div>

        <div className="stat-row">
          <div className="stat-left">
            <StatIcon>
              <path d="M6 8h12l-1 12H7L6 8z" />
              <path d="M9 8V6a3 3 0 0 1 6 0v2" />
            </StatIcon>
            <div>
              <div className="stat-label">Succeeded Pieces Sold</div>
              <div className="stat-sub">Delivered orders only, lifetime</div>
            </div>
          </div>
          <div className="stat-value">{stat(metrics?.succeededPiecesSold)}</div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-title">{chartTitle}</div>
        <div className="chart-caption">اختر مقياساً لعزله، أو اترك الكل لمقارنتها معاً</div>
        <div className="chart-filters">
          <button
            className={"chip" + (activeMetric === "all" ? " active" : "")}
            onClick={() => setActiveMetric("all")}
          >
            الكل
          </button>
          {CHART_METRICS.map((m) => {
            const on = activeMetric === m.key;
            return (
              <button
                key={m.key}
                className={"chip" + (on ? " active" : "")}
                onClick={() => setActiveMetric(m.key)}
                style={on ? { background: m.color + "22", color: m.color, borderColor: m.color + "55" } : undefined}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <AnalyticsChart raw={homeRaw} selected={selected} activeMetric={activeMetric} />
      </div>
    </div>
  );
}
