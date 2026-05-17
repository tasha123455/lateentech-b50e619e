import { useEffect, useLayoutEffect, useRef } from "react";

import { useAuth } from "@/auth/AuthContext";
import { useLanguage, translateDOM } from "@/i18n/LanguageContext";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";
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
  const { lang } = useLanguage();
  const userId = overrideUserId ?? user?.id;
  // Keep signOut in a ref so the script-injection effect doesn't re-run
  // every time AuthProvider re-renders (e.g. when LanguageProvider above
  // re-renders on a language switch, which would otherwise tear down and
  // re-inject the embedded dashboard script and momentarily wipe its data).
  const signOutRef = useRef(signOut);
  useEffect(() => { signOutRef.current = signOut; }, [signOut]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !userId) return;
    // Install Supabase-backed API on window so the embedded scripts can call it.
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
        script.textContent = buildScript(role === "business" ? businessScript : role === "admin" ? adminScript : marketerScript);
        document.body.appendChild(script);
        injected = script;
        // Translate after the embedded script has populated dynamic content
        requestAnimationFrame(() => {
          if (containerRef.current)
            translateDOM(
              containerRef.current,
              (window as unknown as { __lang?: string }).__lang ?? "en",
            );
        });
      })
      .catch((err) => console.error("[Lateen] failed", err));

    return () => {
      cancelled = true;
      el.removeEventListener("click", onClick);
      const w = window as unknown as { __lateenUnsubs?: Array<() => void> };
      if (w.__lateenUnsubs) {
        for (const fn of w.__lateenUnsubs) {
          try {
            fn();
          } catch {
            /* ignore */
          }
        }
        w.__lateenUnsubs = [];
      }
      if (injected && injected.parentNode) injected.parentNode.removeChild(injected);
      delete (window as unknown as { LateenAPI?: unknown }).LateenAPI;
    };
  }, [role, signOut, userId]);

  // When lang state changes (re-render), translate before paint to avoid flicker
  useLayoutEffect(() => {
    if (containerRef.current) translateDOM(containerRef.current, lang);
  }, [lang]);

  const body = role === "business" ? businessBody : role === "admin" ? adminBody : marketerBody;

  return (
    <div className={`lateen-${role} relative`}>
      <div className="absolute end-3 top-3 z-50">
        <LanguageSwitcher />
      </div>
      <div
        ref={containerRef}
        // Trusted, build-time HTML asset bundled with the app.
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  );
}
