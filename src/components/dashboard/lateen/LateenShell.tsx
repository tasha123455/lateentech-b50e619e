import { useEffect, useRef } from "react";
import { useAuth } from "@/auth/AuthContext";
import businessBody from "./business.body.html?raw";
import marketerBody from "./marketer.body.html?raw";
import businessScript from "./business.script.js?raw";
import marketerScript from "./marketer.script.js?raw";
import "@/styles/lateen-business.css";
import "@/styles/lateen-marketer.css";

const CHART_SRC = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";

let chartPromise: Promise<void> | null = null;
function loadChartJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { Chart?: unknown }).Chart) return Promise.resolve();
  if (chartPromise) return chartPromise;
  chartPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHART_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Chart.js failed to load"));
    document.head.appendChild(s);
  });
  return chartPromise;
}

type Role = "business" | "marketer";

function buildScript(src: string): string {
  const names = [...src.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
  const exports = names.length ? `Object.assign(window, { ${names.join(", ")} });` : "";
  return `(function(){\n${src}\n${exports}\n})();`;
}

export function LateenShell({ role }: { role: Role }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { signOut } = useAuth();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let injected: HTMLScriptElement | null = null;

    const onClick = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest('[data-action="sign-out"]');
      if (target) {
        e.preventDefault();
        void signOut();
      }
    };
    el.addEventListener("click", onClick);

    loadChartJs()
      .then(() => {
        if (cancelled) return;
        const script = document.createElement("script");
        script.textContent = buildScript(role === "business" ? businessScript : marketerScript);
        document.body.appendChild(script);
        injected = script;
      })
      .catch((err) => console.error("[Lateen] failed", err));

    return () => {
      cancelled = true;
      el.removeEventListener("click", onClick);
      if (injected && injected.parentNode) injected.parentNode.removeChild(injected);
    };
  }, [role, signOut]);

  const body = role === "business" ? businessBody : marketerBody;

  return (
    <div
      ref={containerRef}
      className={`lateen-${role}`}
      // Trusted, build-time HTML asset bundled with the app.
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
