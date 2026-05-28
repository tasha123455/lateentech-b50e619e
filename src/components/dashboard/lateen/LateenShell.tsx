import { useEffect, useRef } from "react";

import { useAuth } from "@/auth/AuthContext";
import { createLateenApi } from "@/lib/lateen-api";
import businessBody from "./business.body.html?raw";
import marketerBody from "./marketer.body.html?raw";
import adminBody from "./admin.body.html?raw";
import businessScript from "./business.script.js?raw";
import marketerScript from "./marketer.script.js?raw";
import adminScript from "./admin.script.js?raw";
import "@/styles/lateen-business.css";
import "@/styles/lateen-marketer.css";
import "@/styles/lateen-admin.css";

const CHART_SRC = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
const HAMMER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js";
const ZOOM_SRC = "https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js";

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
  await loadScriptOnce(HAMMER_SRC, () => !!(window as unknown as { Hammer?: unknown }).Hammer);
  await loadScriptOnce(ZOOM_SRC, () => {
    const C = (window as unknown as { Chart?: { registry?: { plugins?: { get?: (n: string) => unknown } } } }).Chart;
    try { return !!C?.registry?.plugins?.get?.("zoom"); } catch { return false; }
  });
}

type Role = "business" | "marketer" | "admin";

function buildScript(src: string): string {
  const names = [...src.matchAll(/^(?:async\s+)?function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(
    (m) => m[1],
  );
  const exports = names.length ? `Object.assign(window, { ${names.join(", ")} });` : "";
  return `(function(){\n${src}\n${exports}\n})();`;
}

export function LateenShell({ role, overrideUserId }: { role: Role; overrideUserId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { signOut, user } = useAuth();
  const userId = overrideUserId ?? user?.id;

  const signOutRef = useRef(signOut);
  useEffect(() => { signOutRef.current = signOut; }, [signOut]);

  const mountedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !userId) return;
    const key = `${role}:${userId}`;
    if (mountedKeyRef.current === key) return;
    mountedKeyRef.current = key;

    (window as unknown as { LateenAPI?: unknown }).LateenAPI = createLateenApi(userId);

    let cancelled = false;
    let injected: HTMLScriptElement | null = null;

    const onClick = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest('[data-action="sign-out"]');
      if (target) {
        e.preventDefault();
        void signOutRef.current();
      }
    };
    el.addEventListener("click", onClick);

    loadChartJs()
      .then(() => {
        if (cancelled) return;
        const script = document.createElement("script");
        script.textContent = buildScript(
          role === "business" ? businessScript : role === "admin" ? adminScript : marketerScript,
        );
        document.body.appendChild(script);
        injected = script;
      })
      .catch((err) => console.error("[Lateen] failed", err));

    return () => {
      cancelled = true;
      el.removeEventListener("click", onClick);
      const w = window as unknown as { __lateenUnsubs?: Array<() => void> };
      if (w.__lateenUnsubs) {
        for (const fn of w.__lateenUnsubs) {
          try { fn(); } catch { /* ignore */ }
        }
        w.__lateenUnsubs = [];
      }
      if (injected && injected.parentNode) injected.parentNode.removeChild(injected);
      delete (window as unknown as { LateenAPI?: unknown }).LateenAPI;
      mountedKeyRef.current = null;
    };
  }, [role, userId]);

  const body = role === "business" ? businessBody : role === "admin" ? adminBody : marketerBody;

  return (
    <div className={`lateen-${role} relative`}>
      <div
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  );
}
