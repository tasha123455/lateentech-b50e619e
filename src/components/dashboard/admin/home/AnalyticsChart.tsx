import { useEffect, useRef } from "react";

import { useChartJs } from "@/components/dashboard/marketer/ui/useChartJs";
import { CHART_METRICS, getChartConfig, metricValueAsOf } from "../lib/analytics";
import type { DateSelection, HomeRaw, MetricKey } from "../lib/types";

type ChartInstance = {
  destroy: () => void;
  update: () => void;
  data: { labels: string[]; datasets: Array<Record<string, unknown>> };
};
type ChartCtor = new (ctx: CanvasRenderingContext2D, cfg: unknown) => ChartInstance;

/** Multi-series line chart. Selecting a single metric isolates it and fills
    the area under it; "all" shows every series unfilled for comparison. */
export function AnalyticsChart({
  raw, selected, activeMetric,
}: {
  raw: HomeRaw | null;
  selected: DateSelection;
  activeMetric: MetricKey | "all";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const ready = useChartJs();

  // Build once, then mutate in place — same as the original, so the chart
  // animates between states instead of being torn down and rebuilt.
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const Chart = (window as unknown as { Chart?: ChartCtor }).Chart;
    if (!canvas || !Chart || chartRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    chartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: CHART_METRICS.map((m) => ({
          label: m.label,
          data: [],
          borderColor: m.color,
          backgroundColor: m.color,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointHitRadius: 12,
          pointBackgroundColor: m.color,
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
          borderWidth: 2,
          tension: 0.35,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false, axis: "x" },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            rtl: true,
            displayColors: true,
            backgroundColor: "#1d1d20",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
            padding: 10,
            titleFont: { family: "Cairo", size: 11 },
            bodyFont: { family: "Cairo", size: 11 },
            titleColor: "#9c9c9c",
            bodyColor: "#f3f3f1",
            callbacks: {
              label: (c: { dataset?: { label?: string }; parsed?: { y?: number } }) =>
                " " + (c.dataset?.label || "") + ": " + Number(c.parsed?.y || 0).toLocaleString(),
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.05)", drawTicks: false },
            border: { display: false },
            ticks: { color: "#6b6b6b", font: { family: "Cairo", size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255,255,255,0.05)", drawTicks: false },
            border: { display: false },
            ticks: { color: "#6b6b6b", font: { family: "Cairo", size: 10 }, precision: 0, maxTicksLimit: 5 },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        try { chartRef.current.destroy(); } catch { /* ignore */ }
        chartRef.current = null;
      }
    };
  }, [ready]);

  // Data / labels follow the selection.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const cfg = getChartConfig(selected);
    chart.data.labels = cfg.labels;
    chart.data.datasets.forEach((ds, i) => {
      ds.data = cfg.ends.map((ts) => metricValueAsOf(raw, CHART_METRICS[i].key, ts));
    });
    chart.update();
  }, [raw, selected, ready]);

  // Series isolation follows the chip row.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.datasets.forEach((ds, i) => {
      const m = CHART_METRICS[i];
      if (activeMetric === "all") {
        ds.hidden = false;
        ds.fill = false;
      } else {
        ds.hidden = m.key !== activeMetric;
        ds.fill = m.key === activeMetric ? "origin" : false;
        ds.backgroundColor = m.color + "26";
      }
    });
    chart.update();
  }, [activeMetric, ready]);

  return (
    <div className="chart-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}
