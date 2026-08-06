import { useEffect, useRef, useState } from "react";

import { isAr } from "../lib/format";
import { useChartJs } from "../ui/useChartJs";

/** Only what this file calls. Chart.js is loaded from a script tag, so there
 *  are no types to import — `update()` is the part that matters here. */
type RingChartJs = {
  destroy: () => void;
  update: (mode?: string) => void;
  data: { datasets: Array<{ data: number[]; backgroundColor: string[]; hoverBackgroundColor: string[] }> };
};
type ChartCtor = new (canvas: HTMLCanvasElement, cfg: unknown) => RingChartJs;

const ringColours = (total: number) => (total > 0 ? ["#35c98f", "#e2685f"] : ["#2a2a2a", "#2a2a2a"]);
const ringData = (total: number, okPct: number, failPct: number) => (total > 0 ? [okPct, failPct] : [0, 100]);

/** Delivered-vs-failed doughnut. Tapping it flips the centre label between
    the success and the failure percentage.

    Built once and updated in place. It used to be destroyed and constructed
    again whenever the numbers changed, which is what made it stutter while the
    page was still loading: a new chart starts from nothing and sweeps itself
    in over half a second, so every arriving figure restarted that sweep from
    zero. Handing the new numbers to the chart that is already on screen lets
    it animate from where it actually is to where it should be — the same half
    second, but once, and going somewhere. */
export function RingChart({ ok, fail }: { ok: number; fail: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<RingChartJs | null>(null);
  const [showFail, setShowFail] = useState(false);
  const ready = useChartJs();

  const total = ok + fail;
  const okPct = total > 0 ? Math.round((ok / total) * 100) : 0;
  const failPct = total > 0 ? 100 - okPct : 0;

  // A fresh period resets the label back to the success side.
  useEffect(() => { setShowFail(false); }, [ok, fail]);

  /* Created once Chart.js is there, and torn down only when this leaves the
     screen. The figures are deliberately not dependencies — they are read once
     to draw the first frame, and every change after that goes through the
     update below. */
  const latest = useRef({ total, okPct, failPct });
  latest.current = { total, okPct, failPct };

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const Chart = (window as unknown as { Chart?: ChartCtor }).Chart;
    if (!canvas || !Chart) return;

    const { total: t, okPct: o, failPct: f } = latest.current;
    chartRef.current = new Chart(canvas, {
      type: "doughnut",
      data: {
        datasets: [{
          data: ringData(t, o, f),
          backgroundColor: ringColours(t),
          hoverBackgroundColor: ringColours(t),
          borderWidth: 0,
          hoverOffset: 0,
          hoverBorderWidth: 0,
        }],
      },
      options: {
        cutout: "72%",
        responsive: false,
        events: [],
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 500 },
      },
    });

    return () => {
      if (chartRef.current) {
        try { chartRef.current.destroy(); } catch { /* ignore */ }
        chartRef.current = null;
      }
    };
  }, [ready]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ds = chart.data.datasets[0];
    ds.data = ringData(total, okPct, failPct);
    ds.backgroundColor = ringColours(total);
    ds.hoverBackgroundColor = ringColours(total);
    try { chart.update(); } catch { /* ignore */ }
  }, [total, okPct, failPct]);

  const ar = isAr();
  return (
    <div className="ring-wrap" style={{ cursor: "pointer" }} onClick={() => setShowFail((v) => !v)}>
      <canvas ref={canvasRef} width={80} height={80} />
      <div className="ring-center">
        <div className="ring-pct">{(showFail ? failPct : okPct) + "%"}</div>
        <div className="ring-sub">{showFail ? (ar ? "فاشل" : "failed") : ar ? "ناجح" : "success"}</div>
      </div>
    </div>
  );
}
