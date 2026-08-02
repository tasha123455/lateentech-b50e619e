import { useEffect, useRef } from "react";

import { CHART_VISIBLE } from "../lib/constants";
import { money, piecesLabel, tlbl } from "../lib/format";
import type { ChartSeries, Metric, Period } from "../lib/types";
import { useChartJs } from "../ui/useChartJs";

type ChartCtor = new (canvas: HTMLCanvasElement, cfg: unknown) => {
  destroy: () => void;
  pan?: (delta: { x: number }, s: unknown, mode: string) => void;
};
type ChartGlobal = ChartCtor & {
  getChart?: (c: HTMLCanvasElement) => { destroy: () => void } | undefined;
  instances?: Record<string, { canvas?: HTMLCanvasElement; destroy: () => void }>;
  registry?: { plugins?: { get?: (n: string) => unknown } };
};

/** Horizontal one-finger drag pans the chart; a vertical drag scrolls the page. */
function bindChartPan(canvas: HTMLCanvasElement, getChart: () => { pan?: (d: { x: number }, s: unknown, m: string) => void } | null) {
  const el = canvas as HTMLCanvasElement & { __panBound?: boolean };
  if (el.__panBound) return;
  el.__panBound = true;
  let sx = 0;
  let sy = 0;
  let lx = 0;
  let decided = 0;
  let active = false;

  const onStart = (e: TouchEvent) => {
    if (!e.touches || e.touches.length !== 1) { active = false; decided = 0; return; }
    const t = e.touches[0];
    sx = lx = t.clientX;
    sy = t.clientY;
    decided = 0;
    active = true;
  };
  const onMove = (e: TouchEvent) => {
    if (!active || !e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
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

  canvas.addEventListener("touchstart", onStart, { passive: true });
  canvas.addEventListener("touchmove", onMove, { passive: false });
  canvas.addEventListener("touchend", onEnd, { passive: true });
  canvas.addEventListener("touchcancel", onEnd, { passive: true });
}

export function MainChart({
  series, metric, period, selSym, walletCur,
}: {
  series: ChartSeries;
  metric: Metric;
  period: Period;
  selSym: string;
  walletCur: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<{ destroy: () => void; pan?: (d: { x: number }, s: unknown, m: string) => void } | null>(null);
  const ready = useChartJs();

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const Chart = (window as unknown as { Chart?: ChartGlobal }).Chart;
    if (!canvas || !Chart) return;

    if (chartRef.current) {
      try { chartRef.current.destroy(); } catch { /* ignore */ }
      chartRef.current = null;
    }
    try {
      const existing = Chart.getChart?.(canvas);
      if (existing) existing.destroy();
    } catch { /* ignore */ }
    try {
      if (Chart.instances) {
        Object.keys(Chart.instances).forEach((k) => {
          const inst = Chart.instances![k];
          if (inst && inst.canvas === canvas) {
            try { inst.destroy(); } catch { /* ignore */ }
          }
        });
      }
    } catch { /* ignore */ }

    const color = metric === "earnings" ? "#8b83e8" : "#2dbd8f";
    const labels = series.labels.map((v) => tlbl(v));
    const subs = series.sub || [];
    const n = series.values.length;
    const vis = Math.min(CHART_VISIBLE[period] || 7, n);
    const maxIdx = n - 1;
    const minIdx = Math.max(0, n - vis);

    const hasZoom = !!(() => {
      try { return Chart.registry?.plugins?.get?.("zoom"); } catch { return false; }
    })();
    const curRange = vis;
    // Zooming out past the default window would show empty space, so snap back.
    const guardZoomOut = ({ chart }: { chart: { scales: { x: { max: number; min: number; options: { min: number; max: number } } }; update: (m: string) => void } }) => {
      const sx = chart.scales.x;
      if (sx.max - sx.min >= curRange) {
        sx.options.min = minIdx;
        sx.options.max = maxIdx;
        chart.update("none");
        return false;
      }
    };
    const zoomOpts = hasZoom
      ? {
          zoom: {
            pan: { enabled: true, mode: "x", threshold: 10 },
            zoom: {
              wheel: { enabled: true, speed: 0.05, modifierKey: null },
              pinch: { enabled: false },
              mode: "x",
              onZoom: guardZoomOut,
              onZoomStart: ({ event }: { event?: { deltaY?: number | null } }) => {
                if (event && event.deltaY != null && event.deltaY > 0) return false;
              },
            },
            limits: { x: { min: -0.5, max: n - 0.5, minRange: 1, maxRange: curRange } },
          },
        }
      : {};

    const ctx2d = canvas.getContext("2d")!;
    const grad = ctx2d.createLinearGradient(0, 0, 0, canvas.height || 220);
    grad.addColorStop(0, color + "66");
    grad.addColorStop(1, color + "00");

    chartRef.current = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: series.values,
          borderColor: color,
          backgroundColor: grad,
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
        plugins: Object.assign(
          {
            legend: { display: false },
            decimation: { enabled: true, algorithm: "lttb", samples: 80 },
            tooltip: {
              animation: false,
              displayColors: false,
              padding: 10,
              titleFont: { size: 12, weight: "600" },
              bodyFont: { size: 12 },
              callbacks: {
                title: (items: Array<{ dataIndex: number }>) => {
                  if (!items || !items[0]) return "";
                  const i = items[0].dataIndex;
                  const lab = tlbl(series.labels[i] || "");
                  const s = subs[i] || "";
                  return s ? lab + " · " + s : lab;
                },
                label: (ctx: { raw: number }) =>
                  metric === "earnings" ? " " + money(ctx.raw, selSym, walletCur) : " " + piecesLabel(ctx.raw),
              },
            },
          },
          zoomOpts,
        ),
        scales: {
          x: {
            min: minIdx,
            max: maxIdx,
            grid: { display: false },
            ticks: { font: { size: 11 }, color: "#5e5c58", maxRotation: 0, autoSkip: true, maxTicksLimit: vis + 1 },
          },
          y: {
            beginAtZero: true,
            grace: "5%",
            grid: { color: "rgba(255,255,255,0.04)" },
            ticks: {
              font: { size: 10 },
              color: "#5e5c58",
              maxTicksLimit: 5,
              callback: (v: number) => (metric === "earnings" ? money(v, selSym, walletCur) : v),
            },
          },
        },
      },
    });

    canvas.style.touchAction = "pan-y";
    if (canvas.parentElement) canvas.parentElement.style.touchAction = "pan-y";
    bindChartPan(canvas, () => chartRef.current);

    return () => {
      if (chartRef.current) {
        try { chartRef.current.destroy(); } catch { /* ignore */ }
        chartRef.current = null;
      }
    };
  }, [ready, series, metric, period, selSym, walletCur]);

  return (
    <div className="chart-wrap">
      <canvas ref={canvasRef} style={{ touchAction: "pan-y" }} />
    </div>
  );
}
