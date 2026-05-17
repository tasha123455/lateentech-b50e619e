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

// Render-function names across the three dashboards. After any of these runs,
// we re-translate the container so freshly-injected English strings flip to
// Arabic immediately. Unknown names are silently skipped per script.
const RENDER_HOOKS = [
  // shared / business
  "renderProducts", "renderPhotoGrid", "applyFilters", "updateSummary", "goTo",
  "buildMainChart", "buildRingChart",
  // marketer
  "go", "rg2", "rr", "renderSaved", "onProductChange", "updateFeeCard", "openD", "openF",
  // admin
  "admGo", "admLoadMetrics", "admLoadVerify", "admLoadPayouts", "admRenderUsers",
  "admLoadProducts", "admLoadEmployees", "admOpenProduct",
];

function buildScript(src: string): string {
  const names = [...src.matchAll(/^(?:async\s+)?function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(
    (m) => m[1],
  );
  const exports = names.length ? `Object.assign(window, { ${names.join(", ")} });` : "";
  const hookNames = JSON.stringify(RENDER_HOOKS);
  // After the script defines its functions, wrap each render function to call
  // window.__retranslate(). This is the "patch render tails" strategy from the
  // approved plan — no MutationObserver, no AI, no network.
  const wrap = `
;(function(){
  var hooks = ${hookNames};
  hooks.forEach(function(name){
    var fn = window[name];
    if (typeof fn !== 'function' || fn.__lateenWrapped) return;
    var wrapped = function(){
      var r = fn.apply(this, arguments);
      if (window.__retranslate) {
        if (r && typeof r.then === 'function') {
          r.then(function(){ window.__retranslate(); }, function(){});
        } else {
          window.__retranslate();
        }
      }
      return r;
    };
    wrapped.__lateenWrapped = true;
    window[name] = wrapped;
  });
})();`;
  return `(function(){\n${src}\n${exports}\n${wrap}\n})();`;
}

export function LateenShell({ role, overrideUserId }: { role: Role; overrideUserId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { signOut, user } = useAuth();
  const { lang } = useLanguage();
  const userId = overrideUserId ?? user?.id;

  const signOutRef = useRef(signOut);
  useEffect(() => { signOutRef.current = signOut; }, [signOut]);

  // Track what's currently mounted so we never re-inject for the same role+user.
  const mountedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !userId) return;
    const key = `${role}:${userId}`;
    // Idempotency: if already mounted for this role+user, skip the whole
    // tear-down/re-inject cycle — preserves balance, analytics, products, orders.
    if (mountedKeyRef.current === key) return;
    mountedKeyRef.current = key;

    (window as unknown as { LateenAPI?: unknown }).LateenAPI = createLateenApi(userId);

    // Expose the retranslate bridge for the embedded script's wrapped renderers.
    (window as unknown as { __retranslate?: () => void }).__retranslate = () => {
      if (!containerRef.current) return;
      const currentLang = (window as unknown as { __lang?: string }).__lang ?? "en";
      translateDOM(containerRef.current, currentLang);
      // Translate any Chart.js instances (canvas labels can't be reached by DOM walker).
      try {
        const Chart = (window as unknown as { Chart?: { instances?: Record<string, { data?: { labels?: unknown[] }; _i18nOriginalLabels?: string[]; update?: (mode?: string) => void } > } }).Chart;
        const instances = Chart?.instances ?? {};
        for (const id of Object.keys(instances)) {
          const inst = instances[id];
          if (!inst?.data) continue;
          const labels = inst.data.labels;
          if (!Array.isArray(labels)) continue;
          if (!inst._i18nOriginalLabels) inst._i18nOriginalLabels = labels.map(String);
          const orig = inst._i18nOriginalLabels;
          const translated = orig.map((k) => {
            if (currentLang === "en") return k;
            const v = (window as unknown as { __T?: Record<string, { ar?: string }> }).__T?.[k]?.ar;
            return v ?? k;
          });
          inst.data.labels = translated;
          inst.update?.("none");
        }
      } catch { /* ignore */ }
    };

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
      const w = window as unknown as { __lateenUnsubs?: Array<() => void>; __retranslate?: () => void };
      if (w.__lateenUnsubs) {
        for (const fn of w.__lateenUnsubs) {
          try { fn(); } catch { /* ignore */ }
        }
        w.__lateenUnsubs = [];
      }
      if (injected && injected.parentNode) injected.parentNode.removeChild(injected);
      delete (window as unknown as { LateenAPI?: unknown }).LateenAPI;
      delete w.__retranslate;
      mountedKeyRef.current = null;
    };
  }, [role, userId]);

  // Language toggle: translate in place before paint. No script re-injection.
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
