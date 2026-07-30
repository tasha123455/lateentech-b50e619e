import { useEffect, useState } from "react";

const CHART_SRC = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
const ZOOM_SRC = "https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js";

type Win = Window & {
  Chart?: unknown;
  __lateenScriptPromises?: Record<string, Promise<void>>;
};

function loadScriptOnce(src: string, isReady: () => boolean): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isReady()) return Promise.resolve();
  const w = window as Win;
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

let chartReady: Promise<void> | null = null;

function ensureChartJs(): Promise<void> {
  if (chartReady) return chartReady;
  chartReady = loadScriptOnce(CHART_SRC, () => !!(window as Win).Chart).then(() =>
    // The zoom plugin is optional: if its CDN is unavailable the charts still
    // render, just without horizontal pan/zoom.
    loadScriptOnce(ZOOM_SRC, () => {
      const C = (window as Win).Chart as
        | { registry?: { plugins?: { get?: (n: string) => unknown } } }
        | undefined;
      try {
        return !!C?.registry?.plugins?.get?.("zoom");
      } catch {
        return false;
      }
    }).catch((err) => console.warn("[Lateen] chart zoom unavailable", err)),
  );
  return chartReady;
}

/** Resolves once Chart.js is on the page. Charts never block the dashboard
    from painting — the surrounding cards render immediately either way. */
export function useChartJs(): boolean {
  const [ready, setReady] = useState(() => !!(window as Win).Chart);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    ensureChartJs()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((err) => console.error("[Lateen] chart library unavailable", err));
    return () => { cancelled = true; };
  }, [ready]);
  return ready;
}
