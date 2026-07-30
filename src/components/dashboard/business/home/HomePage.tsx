import { useEffect, useMemo, useRef, useState } from "react";

import { useBusinessData } from "../BusinessDataProvider";
import { isAr, tlbl, money, moneyParts, ddmmyyyy } from "../lib/format";
import type { Order, PendingActiveStub } from "../lib/types";
import { computeEarnByCur, pickWalletCur } from "./currency";

/* ── Chart.js loading (same CDN URLs as LateenShell.tsx) ───────────────── */

const CHART_SRC = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
const ZOOM_SRC = "https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChart = any;

function loadScriptOnce(src: string, isReady: () => boolean): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isReady()) return Promise.resolve();
  const w = window as unknown as { __lateenScriptPromises?: Record<string, Promise<void>> };
  w.__lateenScriptPromises = w.__lateenScriptPromises || {};
  const existing = w.__lateenScriptPromises[src];
  if (existing) return existing;
  w.__lateenScriptPromises[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
  return w.__lateenScriptPromises[src];
}

async function loadChartJs(): Promise<void> {
  await loadScriptOnce(CHART_SRC, () => !!(window as unknown as { Chart?: unknown }).Chart);
  await loadScriptOnce(ZOOM_SRC, () => {
    const C = (window as unknown as { Chart?: { registry?: { plugins?: { get?: (n: string) => unknown } } } }).Chart;
    try { return !!C?.registry?.plugins?.get?.("zoom"); } catch { return false; }
  }).catch((err) => console.warn("[Lateen] chart zoom unavailable", err));
}

function bindChartPan(canvas: HTMLCanvasElement, getChart: () => AnyChart | null) {
  const c = canvas as HTMLCanvasElement & { __panBound?: boolean };
  if (!c || c.__panBound) return;
  c.__panBound = true;
  let sx = 0, sy = 0, lx = 0, decided = 0, active = false;
  const onStart = (e: TouchEvent) => {
    if (!e.touches || e.touches.length !== 1) { active = false; decided = 0; return; }
    const t = e.touches[0];
    sx = lx = t.clientX; sy = t.clientY; decided = 0; active = true;
  };
  const onMove = (e: TouchEvent) => {
    if (!active || !e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (!decided) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) decided = 1;
      else if (Math.abs(dy) > 8) { decided = 2; active = false; return; }
      else return;
    }
    if (decided === 1) {
      e.preventDefault();
      const ch = getChart();
      if (ch && typeof ch.pan === "function") {
        const d = t.clientX - lx;
        if (d) ch.pan({ x: d }, undefined, "none");
      }
      lx = t.clientX;
    }
  };
  const onEnd = () => { active = false; decided = 0; };
  c.addEventListener("touchstart", onStart, { passive: true });
  c.addEventListener("touchmove", onMove, { passive: false });
  c.addEventListener("touchend", onEnd, { passive: true });
  c.addEventListener("touchcancel", onEnd, { passive: true });
}

/* ── Series / analytics building — ported from __buildSeries / recomputeAnalytics ── */

type Metric = "revenue" | "pieces";
type Period = "D" | "M" | "Y";

type Series = { labels: string[]; sub: string[]; values: number[] };
type ChartData = Record<Metric, Record<Period, Series>>;
type AnalyticsData = Record<Period, { ok: number; fail: number }>;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const VIS: Record<Period, number> = { D: 7, M: 6, Y: 6 };
const ACTIVE_MKT_STATUSES = new Set(["pending", "approved", "confirmed"]);

type AnalyticsResult = { chartData: ChartData; analyticsData: AnalyticsData };

function buildAnalytics(orders: Order[], stubs: PendingActiveStub[]): AnalyticsResult {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let earliest: Date | null = null;
  orders.forEach((o) => { const c = o._createdAt; if (c && (!earliest || c < earliest)) earliest = c; });
  const minDayStart = new Date(today); minDayStart.setDate(today.getDate() - 29);
  let dayStart = earliest ? new Date((earliest as Date).getFullYear(), (earliest as Date).getMonth(), (earliest as Date).getDate()) : new Date(today);
  if (dayStart > minDayStart) dayStart = minDayStart;
  const dayCount = Math.floor((today.getTime() - dayStart.getTime()) / 86400000) + 1;
  const minYear = now.getFullYear() - 5;
  const startYear = earliest ? Math.min((earliest as Date).getFullYear(), minYear) : minYear;
  const endYear = now.getFullYear();
  const yearCount = endYear - startYear + 1;
  const monthsStart = new Date(startYear, 0, 1);
  const monthCount = (endYear - startYear) * 12 + now.getMonth() + 1;

  const dayLabels: string[] = [], daySub: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(dayStart); d.setDate(dayStart.getDate() + i);
    dayLabels.push(DOW[d.getDay()]); daySub.push(ddmmyyyy(d));
  }
  const monLabels: string[] = [], monSub: string[] = [];
  for (let i = 0; i < monthCount; i++) {
    const m = new Date(monthsStart); m.setMonth(monthsStart.getMonth() + i);
    monLabels.push(MON[m.getMonth()]); monSub.push(String(m.getFullYear()));
  }
  const yrLabels: string[] = [], yrSub: string[] = [];
  for (let i = 0; i < yearCount; i++) { yrLabels.push(String(startYear + i)); yrSub.push(""); }

  const revD = Array(dayCount).fill(0), revM = Array(monthCount).fill(0), revY = Array(yearCount).fill(0);
  const pcsD = Array(dayCount).fill(0), pcsM = Array(monthCount).fill(0), pcsY = Array(yearCount).fill(0);
  const ringD = { ok: 0, fail: 0 }, ringM = { ok: 0, fail: 0 }, ringY = { ok: 0, fail: 0 };

  const all: Array<Order | PendingActiveStub> = [...orders, ...stubs];
  all.forEach((o) => {
    const st = o._status;
    const c = o._createdAt;
    if (!c) return;
    const full = o as Order;
    const price = Number(full.price) || 0;
    const qty = Number(full.qty) || 0;
    const commission = Number(full.commission) || 0;
    const platformFee = Number(full.platformFee) || 0;
    const net = price * qty - commission - platformFee;
    const isOk = st === "delivered";
    const isFail = st === "cancelled";
    const di = Math.floor((new Date(c.getFullYear(), c.getMonth(), c.getDate()).getTime() - dayStart.getTime()) / 86400000);
    if (di >= 0 && di < dayCount) { if (isOk) { revD[di] += net; pcsD[di] += qty; ringD.ok++; } if (isFail) ringD.fail++; }
    const mi = (c.getFullYear() - startYear) * 12 + c.getMonth();
    if (mi >= 0 && mi < monthCount) { if (isOk) { revM[mi] += net; pcsM[mi] += qty; ringM.ok++; } if (isFail) ringM.fail++; }
    const yi = c.getFullYear() - startYear;
    if (yi >= 0 && yi < yearCount) { if (isOk) { revY[yi] += net; pcsY[yi] += qty; ringY.ok++; } if (isFail) ringY.fail++; }
  });

  const chartData: ChartData = {
    revenue: {
      D: { labels: dayLabels, sub: daySub, values: revD.map((v: number) => +v.toFixed(2)) },
      M: { labels: monLabels, sub: monSub, values: revM.map((v: number) => +v.toFixed(2)) },
      Y: { labels: yrLabels, sub: yrSub, values: revY.map((v: number) => +v.toFixed(2)) },
    },
    pieces: {
      D: { labels: dayLabels, sub: daySub, values: pcsD },
      M: { labels: monLabels, sub: monSub, values: pcsM },
      Y: { labels: yrLabels, sub: yrSub, values: pcsY },
    },
  };
  const analyticsData: AnalyticsData = { D: ringD, M: ringM, Y: ringY };
  return { chartData, analyticsData };
}

/* ── Marketer avatar helper (inline, DOM-imperative like the original) ── */

function Avatar({ url }: { url?: string | null }) {
  return (
    <div className="avatar" id="user-avatar" style={{ cursor: "default", background: "#0A3C2A" }}>
      {url ? <img src={url} alt="" loading="eager" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block", borderRadius: "inherit" }} /> : null}
    </div>
  );
}

export function HomePage({ onOpenNotifications, onOpenPayout, onOpenSupport }: { onOpenNotifications: () => void; onOpenPayout: () => void; onOpenSupport: () => void }) {
  const { profile, orders, pendingActiveStubs, products, notifications, frozen } = useBusinessData();
  const ar = isAr();

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const name = profile?.full_name || "";
  const biz = profile?.business_name || "";
  const first = name ? name.split(/\s+/)[0] : ar ? "يا هلا" : "there";
  const bizFallback = ar ? "تاجر" : "Business";

  /* ── currency / wallet ── */
  const byCur = useMemo(() => computeEarnByCur(orders), [orders]);
  const [walletCurState, setWalletCurState] = useState<string | null>(null);
  const walletCur = pickWalletCur(byCur, walletCurState);
  useEffect(() => { if (walletCurState !== walletCur) setWalletCurState(walletCur); }, [walletCur, walletCurState]);
  const sel = byCur[walletCur] || { sym: "د.ل", gross: 0, comm: 0, plat: 0, net: 0 };
  const walletParts = moneyParts(sel.net, sel.sym, walletCur);

  /* ── analytics / chart data ── */
  const { chartData, analyticsData } = useMemo(
    () => buildAnalytics(orders, pendingActiveStubs),
    [orders, pendingActiveStubs],
  );

  const [currentMetric, setCurrentMetric] = useState<Metric>("revenue");
  const [currentPeriod, setCurrentPeriod] = useState<Period>("D");
  const [ringShowFail, setRingShowFail] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ringRef = useRef<HTMLCanvasElement | null>(null);
  const mainChartRef = useRef<AnyChart | null>(null);
  const ringChartRef = useRef<AnyChart | null>(null);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadChartJs().then(() => { if (!cancelled) setChartReady(true); }).catch(() => { /* charts stay hidden */ });
    return () => { cancelled = true; };
  }, []);

  // Build the main line chart whenever metric/period/data changes.
  useEffect(() => {
    if (!chartReady) return;
    const Chart = (window as unknown as { Chart?: AnyChart }).Chart;
    const canvas = canvasRef.current;
    if (!Chart || !canvas) return;

    if (mainChartRef.current) { try { mainChartRef.current.destroy(); } catch { /* ignore */ } mainChartRef.current = null; }
    try { const existing = Chart.getChart(canvas); if (existing) existing.destroy(); } catch { /* ignore */ }

    const d = chartData[currentMetric][currentPeriod];
    const labels = d.labels.map((v) => tlbl(v));
    const subs = d.sub || [];
    const n = d.values.length;
    const vis = Math.min(VIS[currentPeriod] || 7, n);
    const maxIdx = n - 1;
    const minIdx = Math.max(0, n - vis);
    let hasZoom = false;
    try { hasZoom = !!(Chart.registry && Chart.registry.plugins && Chart.registry.plugins.get("zoom")); } catch { hasZoom = false; }
    const curRange = vis;
    const guardZoomOut = ({ chart }: AnyChart) => {
      const sx = chart.scales.x;
      if (sx.max - sx.min >= curRange) { sx.options.min = minIdx; sx.options.max = maxIdx; chart.update("none"); return false; }
    };
    const zoomOpts = hasZoom ? {
      zoom: {
        pan: { enabled: true, mode: "x", threshold: 10 },
        zoom: {
          wheel: { enabled: true, speed: 0.05, modifierKey: null },
          pinch: { enabled: false },
          mode: "x",
          onZoom: guardZoomOut,
          onZoomStart: ({ event }: AnyChart) => { if (event && event.deltaY != null && event.deltaY > 0) return false; },
        },
        limits: { x: { min: -0.5, max: n - 0.5, minRange: 1, maxRange: curRange } },
      },
    } : {};
    const color = "#34c77b";
    const ctx2d = canvas.getContext("2d");
    const grad = ctx2d ? ctx2d.createLinearGradient(0, 0, 0, canvas.height || 220) : null;
    if (grad) { grad.addColorStop(0, color + "66"); grad.addColorStop(1, color + "00"); }

    mainChartRef.current = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: d.values,
          borderColor: color,
          backgroundColor: grad || color,
          fill: true,
          tension: 0.4,
          cubicInterpolationMode: "monotone",
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointHitRadius: 8,
          pointBackgroundColor: color,
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        animation: false,
        transitions: {
          zoom: { animation: { duration: 0 } },
          pan: { animation: { duration: 0 } },
          active: { animation: { duration: 0 } },
          show: { animation: { duration: 0 } },
          hide: { animation: { duration: 0 } },
        },
        interaction: { mode: "point", intersect: true },
        plugins: Object.assign({
          legend: { display: false },
          decimation: { enabled: true, algorithm: "lttb", samples: 80 },
          tooltip: {
            animation: false,
            displayColors: false,
            padding: 10,
            titleFont: { size: 12, weight: "600" },
            bodyFont: { size: 12 },
            callbacks: {
              title: (items: AnyChart[]) => {
                if (!items || !items[0]) return "";
                const i = items[0].dataIndex;
                const lab = tlbl(d.labels[i] || "");
                const s = subs[i] || "";
                return s ? lab + " · " + s : lab;
              },
              label: (ctx: AnyChart) => currentMetric === "revenue" ? " " + money(ctx.raw, sel.sym || "£", walletCur) : " " + ctx.raw + " pcs",
            },
          },
        }, zoomOpts),
        scales: {
          x: {
            min: minIdx, max: maxIdx,
            grid: { display: false },
            ticks: { font: { size: 11 }, color: "#5e5c58", maxRotation: 0, autoSkip: true, maxTicksLimit: vis + 1 },
          },
          y: {
            beginAtZero: true, grace: "5%",
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: {
              font: { size: 10 }, color: "#5e5c58", maxTicksLimit: 5,
              callback: (v: number) => currentMetric === "revenue" ? money(v, sel.sym || "£", walletCur) : v,
            },
          },
        },
      },
    });
    canvas.style.touchAction = "pan-y";
    if (canvas.parentElement) (canvas.parentElement as HTMLElement).style.touchAction = "pan-y";
    bindChartPan(canvas, () => mainChartRef.current);
  }, [chartReady, chartData, currentMetric, currentPeriod, sel.sym, walletCur]);

  // Build/rebuild the ring (doughnut) chart whenever period/data changes.
  useEffect(() => {
    setRingShowFail(false);
  }, [currentPeriod]);

  useEffect(() => {
    if (!chartReady) return;
    const Chart = (window as unknown as { Chart?: AnyChart }).Chart;
    const canvas = ringRef.current;
    if (!Chart || !canvas) return;
    if (ringChartRef.current) { try { ringChartRef.current.destroy(); } catch { /* ignore */ } ringChartRef.current = null; }
    const a = analyticsData[currentPeriod];
    const total = a.ok + a.fail;
    const okPct = total > 0 ? Math.round((a.ok / total) * 100) : 0;
    const failPct = total > 0 ? 100 - okPct : 0;
    const ringColors = total > 0 ? ["#35c98f", "#e2685f"] : ["#2a2a2a", "#2a2a2a"];
    ringChartRef.current = new Chart(canvas, {
      type: "doughnut",
      data: { datasets: [{ data: total > 0 ? [okPct, failPct] : [0, 100], backgroundColor: ringColors, hoverBackgroundColor: ringColors, borderWidth: 0, hoverOffset: 0, hoverBorderWidth: 0 }] },
      options: { cutout: "72%", responsive: false, events: [], plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 500 } },
    });
  }, [chartReady, analyticsData, currentPeriod]);

  const a = analyticsData[currentPeriod];
  const total = a.ok + a.fail;
  const okPct = total > 0 ? Math.round((a.ok / total) * 100) : 0;
  const failPct = total > 0 ? 100 - okPct : 0;
  const ringPct = ringShowFail ? failPct : okPct;
  const ringSub = ringShowFail ? (ar ? "فاشل" : "failed") : (ar ? "ناجح" : "success");

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <Avatar url={profile?.avatar_signed_url} />
          <div>
            <div className="greet" id="user-greet" data-no-i18n>{(ar ? "هلا، " : "Hey, ") + first}</div>
            <div className="greet-sub" id="user-sub" data-no-i18n>{biz || bizFallback}</div>
            {frozen ? (
              <div
                id="frozen-chip"
                data-no-i18n
                style={{ display: "block", marginTop: 4, padding: "2px 8px", borderRadius: 999, background: "rgba(234,179,8,0.14)", border: "0.5px solid rgba(234,179,8,0.45)", color: "#eab308", fontSize: 11, fontWeight: 700, width: "fit-content" }}
              >
                {ar ? "الحساب مجمّد" : "Account frozen"}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={onOpenSupport}
            aria-label="Support"
            style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "0.5px solid rgba(224,112,112,0.35)", background: "rgba(58,26,26,0.9)", color: "var(--color-text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span>{ar ? "الدعم" : "Support"}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e07070" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
          </button>
          <div className="notif-btn" onClick={onOpenNotifications}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            <div className="notif-dot" id="notif-dot" style={{ display: unreadCount > 0 ? "block" : "none" }} />
          </div>
        </div>
      </div>

      <div className="balance-card">
        <div className="bal-label">{ar ? "صافي الأرباح" : "NET EARNINGS"}</div>
        <div className="bal-amount wallet-amount">
          {walletParts.symbolFirst ? <span className="cur-sym">{walletParts.symbol}</span> : null}
          {walletParts.amount}
          {!walletParts.symbolFirst ? <span className="cur-sym">{(walletParts.spaced ? " " : "") + walletParts.symbol}</span> : null}
        </div>
        <div className="bal-sub">{ar ? "بعد العمولات ورسوم المنصة" : "After commissions & platform fees"}</div>
        <div className="bal-row">
          <button className="payout-btn" onClick={onOpenPayout}>{ar ? "عرض التفاصيل" : "View breakdown"}</button>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-top">
          <div className="chart-toggle">
            <button className={"ctoggle" + (currentMetric === "revenue" ? " active" : "")} onClick={() => setCurrentMetric("revenue")}>{ar ? "الإيرادات" : "Revenue"}</button>
            <button className={"ctoggle" + (currentMetric === "pieces" ? " active" : "")} onClick={() => setCurrentMetric("pieces")}>{ar ? "القطع" : "Pieces"}</button>
          </div>
          <div className="period-tabs">
            <button className={"ptab" + (currentPeriod === "D" ? " active" : "")} onClick={() => setCurrentPeriod("D")}>{ar ? "ي" : "D"}</button>
            <button className={"ptab" + (currentPeriod === "M" ? " active" : "")} onClick={() => setCurrentPeriod("M")}>{ar ? "ش" : "M"}</button>
            <button className={"ptab" + (currentPeriod === "Y" ? " active" : "")} onClick={() => setCurrentPeriod("Y")}>{ar ? "س" : "Y"}</button>
          </div>
        </div>
        <div className="chart-wrap"><canvas id="mainChart" ref={canvasRef} style={{ touchAction: "pan-y" }} /></div>
        <div className="analytics-row">
          <div className="ring-wrap" id="ringWrap" onClick={() => setRingShowFail((v) => !v)}>
            <canvas id="ringChart" ref={ringRef} width={80} height={80} />
            <div className="ring-center">
              <div className="ring-pct" id="ring-pct">{ringPct}%</div>
              <div className="ring-sub" id="ring-sub">{ringSub}</div>
            </div>
          </div>
          <div className="analytics-legend">
            <div className="leg-row" id="leg-row-ok" onClick={(e) => { e.stopPropagation(); setRingShowFail(false); }}>
              <div className="leg-left"><div className="leg-dot" style={{ background: "#35c98f" }} />{ar ? "تم التسليم" : "Delivered"}</div>
              <div className="leg-val" style={{ color: "#35c98f" }} id="leg-ok">{a.ok.toLocaleString()}</div>
            </div>
            <div className="leg-row" id="leg-row-fail" onClick={(e) => { e.stopPropagation(); setRingShowFail(true); }}>
              <div className="leg-left"><div className="leg-dot" style={{ background: "#e2685f" }} />{ar ? "فشل (عند الاستلام)" : "Failed (COD)"}</div>
              <div className="leg-val" style={{ color: "#e2685f" }} id="leg-fail">{a.fail.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
