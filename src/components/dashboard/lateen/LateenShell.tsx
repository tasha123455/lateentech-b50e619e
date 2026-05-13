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

export function LateenShell({ role }: { role: Role }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { signOut } = useAuth();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    const cleanup: Array<() => void> = [];

    loadChartJs().then(() => {
      if (cancelled || !el) return;
      // Execute the original script in an isolated function scope
      try {
        const fn = new Function(role === "business" ? businessScript : marketerScript);
        fn();
      } catch (err) {
        console.error("[Lateen] script error", err);
      }
      // Hook sign out
      const onClick = (e: Event) => {
        const target = (e.target as HTMLElement | null)?.closest('[data-action="sign-out"]');
        if (target) {
          e.preventDefault();
          void signOut();
        }
      };
      el.addEventListener("click", onClick);
      cleanup.push(() => el.removeEventListener("click", onClick));
    });

    return () => {
      cancelled = true;
      cleanup.forEach((fn) => fn());
    };
  }, [role, signOut]);

  const body = role === "business" ? businessBody : marketerBody;

  return (
    <div
      ref={containerRef}
      className={`lateen-${role}`}
      // The body markup is a trusted, build-time asset shipped with the app.
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
