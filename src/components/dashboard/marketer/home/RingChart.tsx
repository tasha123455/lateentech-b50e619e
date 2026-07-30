import { useEffect, useRef, useState } from "react";

import { isAr } from "../lib/format";
import { useChartJs } from "../ui/useChartJs";

type ChartCtor = new (canvas: HTMLCanvasElement, cfg: unknown) => { destroy: () => void };

/** Delivered-vs-failed doughnut. Tapping it flips the centre label between
    the success and the failure percentage. */
export function RingChart({ ok, fail }: { ok: number; fail: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<{ destroy: () => void } | null>(null);
  const [showFail, setShowFail] = useState(false);
  const ready = useChartJs();

  const total = ok + fail;
  const okPct = total > 0 ? Math.round((ok / total) * 100) : 0;
  const failPct = total > 0 ? 100 - okPct : 0;

  // A fresh period resets the label back to the success side.
  useEffect(() => { setShowFail(false); }, [ok, fail]);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const Chart = (window as unknown as { Chart?: ChartCtor }).Chart;
    if (!canvas || !Chart) return;

    if (chartRef.current) {
      try { chartRef.current.destroy(); } catch { /* ignore */ }
      chartRef.current = null;
    }

    const colors = total > 0 ? ["#35c98f", "#e2685f"] : ["#2a2a2a", "#2a2a2a"];
    chartRef.current = new Chart(canvas, {
      type: "doughnut",
      data: {
        datasets: [{
          data: total > 0 ? [okPct, failPct] : [0, 100],
          backgroundColor: colors,
          hoverBackgroundColor: colors,
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
  }, [ready, okPct, failPct, total]);

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
